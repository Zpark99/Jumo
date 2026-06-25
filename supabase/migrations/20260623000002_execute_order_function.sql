-- =============================================================================
-- 거래엔진 v0.0 - execute_order RPC
-- -----------------------------------------------------------------------------
-- 원격 프로젝트(ywtsqgxtngwnmegsrohg)의 실제 스키마를 information_schema /
-- pg_constraint로 조회해서 맞춘 버전입니다(처음 작성했던 가정 스키마와는
-- 컬럼 구성이 다름에 주의):
--   accounts(id, user_id, cash_krw, cash_usd, initial_seed_krw, initial_seed_usd,
--            created_at, updated_at)              -- status 컬럼 없음
--   stocks(id text pk, ticker, market, currency, name_ko, name_en, created_at)
--   price_quotes(stock_id text pk, price, prev_close, change_rate, fetched_at)
--   holdings(id, account_id, stock_id, quantity, avg_price, currency, updated_at)
--   orders(id, account_id, stock_id, side, order_type, quantity, limit_price,
--          status, created_at, filled_at)          -- filled_price/reject_reason 없음
--   transactions(id, account_id, stock_id, side, quantity, price, fee, currency,
--                executed_at)                      -- order_id/amount 없음
--
-- 검증 항목 (V1~V7)
--   V1 수량 검증            : quantity > 0 (orders.quantity 제약과 동일)
--   V2 종목 존재 검증        : stocks.id 존재 (orders.stock_id FK와 동일)
--   V3 시세 신선도 검증      : price_quotes.fetched_at 가 임계치(60s) 이내
--   V4 주문유형/가격 검증    : limit 주문은 limit_price > 0 필수 (orders_check와 동일 기준)
--   V5 매수 현금충분 검증    : 종목 통화 기준 cash_krw/cash_usd >= 체결금액
--   V6 매도 보유충분 검증    : holdings.quantity >= 매도수량
--   V7 계좌 행 잠금          : SELECT ... FOR UPDATE 로 동시주문 음수 방지
--
-- 설계 노트
--   - V1/V2/V4는 orders 테이블의 CHECK/FK 제약과 그대로 맞부딫히는 항목이라,
--     orders 행을 insert하기 전에 먼저 검증한다(그래야 제약 위반 예외 대신
--     깔끔한 rejected 응답을 돌려줄 수 있다). V3/V5/V6는 insert 이후 상태를
--     'rejected'로 갱신하며, 이 경우 orders 행 자체는 감사 추적용으로 남는다.
--   - orders 테이블에 reject_reason 컬럼이 없어 거부 사유는 DB에 영속화하지
--     않고, 이 함수의 리턴값으로만 호출자에게 전달한다.
--   - 체결가는 항상 price_quotes.price(서버 기준가)를 사용한다(클라이언트가
--     보낸 가격은 신뢰하지 않음). limit_price는 v0.0에서 체결에 쓰지 않고
--     주문을 'pending'으로 등록하는 데까지만 사용한다(시장가 우선 구현이라
--     limit 주문은 시세 신선도/현금/보유 검증 없이 등록만 한다).
--   - accounts 행을 FOR UPDATE로 잠근 뒤 검증/체결을 수행하므로, 동시에 들어오는
--     주문들이 같은 계좌의 현금/보유를 동시에 깎아 음수로 만드는 상황을 막는다.
--   - 전량 매도 시 holdings 행은 삭제한다(0 수량 행을 남기지 않음).
--   - v0.0은 무수수료(fee=0)이며, float을 쓰지 않고 전부 numeric으로 계산한다.
-- =============================================================================

create or replace function public.execute_order(
  p_stock_id text,
  p_side text,
  p_quantity numeric,
  p_order_type text,
  p_limit_price numeric default null
)
returns table (
  order_id uuid,
  status text,
  executed_price numeric,
  executed_quantity numeric,
  reject_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote_max_age constant interval := interval '60 seconds';

  v_user_id uuid := auth.uid();
  v_account public.accounts%rowtype;
  v_stock public.stocks%rowtype;
  v_quote public.price_quotes%rowtype;
  v_holding public.holdings%rowtype;

  v_order_id uuid;
  v_exec_price numeric;
  v_amount numeric;
  v_new_qty numeric;
  v_new_avg numeric;
begin
  p_side := lower(p_side);
  p_order_type := lower(p_order_type);

  if v_user_id is null then
    raise exception 'AUTH_REQUIRED: 로그인이 필요합니다';
  end if;

  if p_side not in ('buy', 'sell') then
    raise exception 'INVALID_SIDE: side는 buy 또는 sell 이어야 합니다';
  end if;

  if p_order_type not in ('market', 'limit') then
    raise exception 'INVALID_ORDER_TYPE: order_type은 market 또는 limit 이어야 합니다';
  end if;

  -- V7: 계좌 행 잠금 (동시 주문으로 인한 음수 잔고/보유 방지)
  select * into v_account
  from public.accounts
  where user_id = v_user_id
  for update;

  if not found then
    raise exception 'ACCOUNT_NOT_FOUND: 계좌를 찾을 수 없습니다';
  end if;

  -- V1: 수량 검증 (orders 행 insert 전에 선검증 - CHECK 제약과 동일 기준)
  if p_quantity is null or p_quantity <= 0 then
    return query select null::uuid, 'rejected'::text, null::numeric, null::numeric,
      'V1_INVALID_QUANTITY'::text;
    return;
  end if;

  -- V2: 종목 존재 검증 (orders 행 insert 전에 선검증 - FK 제약과 동일 기준)
  select * into v_stock from public.stocks where id = p_stock_id;
  if not found then
    return query select null::uuid, 'rejected'::text, null::numeric, null::numeric,
      'V2_STOCK_NOT_FOUND'::text;
    return;
  end if;

  -- V4: 주문유형/가격 검증 (orders 행 insert 전에 선검증 - orders_check 제약과 동일 기준)
  if p_order_type = 'limit' and (p_limit_price is null or p_limit_price <= 0) then
    return query select null::uuid, 'rejected'::text, null::numeric, null::numeric,
      'V4_INVALID_LIMIT_PRICE'::text;
    return;
  end if;

  -- 여기까지 통과한 주문만 orders 테이블에 기록한다(완전히 잘못된 입력까지
  -- 감사 로그에 남길 필요는 없다고 보았음)
  insert into public.orders (account_id, stock_id, side, order_type, quantity, limit_price, status)
  values (v_account.id, p_stock_id, p_side, p_order_type, p_quantity, p_limit_price, 'pending')
  returning id into v_order_id;

  -- v0.0: limit 주문은 체결하지 않고 pending 등록까지만 수행
  if p_order_type = 'limit' then
    return query select v_order_id, 'pending'::text, null::numeric, null::numeric, null::text;
    return;
  end if;

  -- V3: 시세 신선도 검증 (market 주문 체결 직전에만 확인)
  select * into v_quote from public.price_quotes where stock_id = p_stock_id;
  if not found then
    update public.orders set status = 'rejected' where id = v_order_id;
    return query select v_order_id, 'rejected'::text, null::numeric, null::numeric, 'V3_NO_QUOTE'::text;
    return;
  elsif now() - v_quote.fetched_at > v_quote_max_age then
    update public.orders set status = 'rejected' where id = v_order_id;
    return query select v_order_id, 'rejected'::text, null::numeric, null::numeric, 'V3_STALE_QUOTE'::text;
    return;
  end if;

  -- 체결가는 서버 기준가(price_quotes.price)만 사용 (클라이언트 가격 불신)
  v_exec_price := v_quote.price;
  v_amount := v_exec_price * p_quantity; -- v0.0: 무수수료(fee=0)

  if p_side = 'buy' then
    -- V5: 매수 시 현금충분 검증 (종목 통화 기준)
    if v_stock.currency = 'KRW' then
      if v_account.cash_krw < v_amount then
        update public.orders set status = 'rejected' where id = v_order_id;
        return query select v_order_id, 'rejected'::text, null::numeric, null::numeric,
          'V5_INSUFFICIENT_CASH'::text;
        return;
      end if;
    else
      if v_account.cash_usd < v_amount then
        update public.orders set status = 'rejected' where id = v_order_id;
        return query select v_order_id, 'rejected'::text, null::numeric, null::numeric,
          'V5_INSUFFICIENT_CASH'::text;
        return;
      end if;
    end if;
  else
    -- V6: 매도 시 보유충분 검증 (holdings 행도 같이 잠금)
    select * into v_holding
    from public.holdings
    where account_id = v_account.id and stock_id = p_stock_id
    for update;

    if not found or v_holding.quantity < p_quantity then
      update public.orders set status = 'rejected' where id = v_order_id;
      return query select v_order_id, 'rejected'::text, null::numeric, null::numeric,
        'V6_INSUFFICIENT_HOLDINGS'::text;
      return;
    end if;
  end if;

  -- ---- 여기서부터는 모든 검증 통과: 단일 트랜잭션으로 체결 처리 ----
  if p_side = 'buy' then
    if v_stock.currency = 'KRW' then
      update public.accounts set cash_krw = cash_krw - v_amount where id = v_account.id;
    else
      update public.accounts set cash_usd = cash_usd - v_amount where id = v_account.id;
    end if;

    select * into v_holding
    from public.holdings
    where account_id = v_account.id and stock_id = p_stock_id
    for update;

    if found then
      v_new_qty := v_holding.quantity + p_quantity;
      v_new_avg := ((v_holding.quantity * v_holding.avg_price) + (p_quantity * v_exec_price)) / v_new_qty;
      update public.holdings
        set quantity = v_new_qty, avg_price = v_new_avg
        where account_id = v_account.id and stock_id = p_stock_id;
    else
      insert into public.holdings (account_id, stock_id, quantity, avg_price, currency)
      values (v_account.id, p_stock_id, p_quantity, v_exec_price, v_stock.currency);
    end if;
  else
    -- v_holding 은 V6 단계에서 이미 FOR UPDATE로 잠궈서 조회해둔 값
    v_new_qty := v_holding.quantity - p_quantity;
    if v_new_qty = 0 then
      delete from public.holdings where account_id = v_account.id and stock_id = p_stock_id;
    else
      update public.holdings set quantity = v_new_qty where account_id = v_account.id and stock_id = p_stock_id;
      -- 매도는 평균단가를 변경하지 않음
    end if;

    if v_stock.currency = 'KRW' then
      update public.accounts set cash_krw = cash_krw + v_amount where id = v_account.id;
    else
      update public.accounts set cash_usd = cash_usd + v_amount where id = v_account.id;
    end if;
  end if;

  insert into public.transactions (account_id, stock_id, side, quantity, price, fee, currency)
  values (v_account.id, p_stock_id, p_side, p_quantity, v_exec_price, 0, v_stock.currency);

  update public.orders set status = 'filled', filled_at = now() where id = v_order_id;

  return query select v_order_id, 'filled'::text, v_exec_price, p_quantity, null::text;
end;
$$;

revoke all on function public.execute_order(text, text, numeric, text, numeric) from public;
grant execute on function public.execute_order(text, text, numeric, text, numeric) to authenticated;
