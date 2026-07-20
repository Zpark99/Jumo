// =============================================================================
// execute_order 동시성 증명 테스트 (이슈 #23 남은 DoD)
// -----------------------------------------------------------------------------
// FOR UPDATE 락(P1, 77fa1ba)이 실제 동시 요청에서 이중 체결을 막는지 증명한다.
// 기존 20260623_execute_order_edge_cases.sql은 단일 세션 순차 실행이라 이걸
// 증명할 수 없어서, 테스트 프레임워크 도입 없이 순수 Node 스크립트로 작성했다.
//
// 실행: node --env-file=.env.local supabase/tests/concurrency_execute_order.mjs
//
// 원격(linked) Supabase 프로젝트에 실제로 auth 유저/종목/시세/보유를 생성하고
// execute_order RPC를 Promise.all로 동시 2건 호출한 뒤, 응답과 최종 DB 상태를
// 검증하고 생성한 데이터를 전부 정리한다(성공/실패 무관하게 finally에서 정리).
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`환경변수 누락: ${name} (.env.local 확인, --env-file=.env.local로 실행했는지 확인)`);
  }
  return value;
}

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const ANON_KEY = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const RUN_ID = crypto.randomUUID().slice(0, 8);

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${name}${detail ? " - " + detail : ""}`);
}

// holdings/orders/transactions -> stocks FK에는 CASCADE가 없어서, 반드시
// "유저(계좌) 먼저 삭제 -> 종목 나중 삭제" 순서를 지켜야 FK 위반이 안 난다.
const userIdsToDelete = [];
const stockIdsToDelete = [];

async function createTestUser(label) {
  const email = `conc-${label}-${RUN_ID}@concurrency.test`;
  const password = crypto.randomUUID();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) throw new Error(`[${label}] 테스트 유저 생성 실패: ${createError.message}`);
  const userId = created.user.id;
  userIdsToDelete.push(userId);

  const { data: account, error: accountError } = await admin
    .from("accounts")
    .select("id")
    .eq("user_id", userId)
    .single();
  if (accountError) throw new Error(`[${label}] 계좌 조회 실패(handle_new_user 트리거 확인): ${accountError.message}`);

  // auth.uid()가 정상 동작하도록 실제 로그인으로 유저 명의 JWT를 발급받는다
  // (service_role 키로는 auth.uid()가 채워지지 않아 execute_order가 AUTH_REQUIRED로 거부함)
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`[${label}] 로그인 실패: ${signInError.message}`);

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
  });

  return { accountId: account.id, client };
}

async function createTestStock(label, price) {
  const stockId = `CONC_${label}_${RUN_ID}`;
  const { error: stockError } = await admin.from("stocks").insert({
    id: stockId,
    ticker: stockId,
    market: "KR",
    currency: "KRW",
    name_ko: `동시성테스트_${label}`,
  });
  if (stockError) throw new Error(`[${label}] 종목 생성 실패: ${stockError.message}`);
  stockIdsToDelete.push(stockId);

  const { error: quoteError } = await admin.from("price_quotes").insert({
    stock_id: stockId,
    price,
    fetched_at: new Date().toISOString(),
  });
  if (quoteError) throw new Error(`[${label}] 시세 생성 실패: ${quoteError.message}`);

  return stockId;
}

async function setCash(accountId, cashKrw) {
  const { error } = await admin.from("accounts").update({ cash_krw: cashKrw }).eq("id", accountId);
  if (error) throw new Error(`계좌 현금 설정 실패: ${error.message}`);
}

async function seedHolding(accountId, stockId, quantity, avgPrice) {
  const { error } = await admin.from("holdings").insert({
    account_id: accountId,
    stock_id: stockId,
    quantity,
    avg_price: avgPrice,
    currency: "KRW",
  });
  if (error) throw new Error(`보유 시딩 실패: ${error.message}`);
}

function classifyRpcResult(r) {
  if (r.error) return { status: "ERROR", reject_reason: r.error.message };
  const row = r.data?.[0];
  return { status: row?.status ?? "UNKNOWN", reject_reason: row?.reject_reason ?? null };
}

// 이중 체결 여부를 판정하는 핵심 로직. 두 시나리오가 반드시 동일한 기준으로
// 검증해야 하므로 별도 함수로 뺐다. 이중 체결(둘 다 filled)이 실제로 관측되면
// "테스트 결함"이 아니라 "RPC 락 결함"이므로 여기서 고치지 않고 FAIL로만 보고한다.
function checkNoDoubleFill(label, c1, c2, expectedRejectReason) {
  const filledCount = [c1.status, c2.status].filter((s) => s === "filled").length;

  if (filledCount === 2) {
    record(
      label,
      false,
      `CRITICAL: 이중 체결 발생(RPC 락 결함 의심, 테스트 문제 아님) - 응답1=${JSON.stringify(c1)}, 응답2=${JSON.stringify(c2)}`
    );
    return;
  }

  const oneRejectedCorrectly =
    filledCount === 1 &&
    [c1, c2].some((c) => c.status === "rejected" && c.reject_reason === expectedRejectReason);

  record(label, oneRejectedCorrectly, `응답1=${JSON.stringify(c1)}, 응답2=${JSON.stringify(c2)}`);
}

async function scenarioBuyRace() {
  console.log("\n=== 시나리오 1: 매수 이중체결 방지 ===");
  const { accountId, client } = await createTestUser("buy");
  const stockId = await createTestStock("buy", 10000);
  await setCash(accountId, 10000); // 정확히 1주치만 보유

  const [r1, r2] = await Promise.all([
    client.rpc("execute_order", { p_stock_id: stockId, p_side: "buy", p_quantity: 1, p_order_type: "market" }),
    client.rpc("execute_order", { p_stock_id: stockId, p_side: "buy", p_quantity: 1, p_order_type: "market" }),
  ]);
  const c1 = classifyRpcResult(r1);
  const c2 = classifyRpcResult(r2);

  checkNoDoubleFill(
    "매수 동시 2건 중 정확히 1건만 체결(나머지는 V5_INSUFFICIENT_CASH로 거부)",
    c1,
    c2,
    "V5_INSUFFICIENT_CASH"
  );

  const { data: account } = await admin.from("accounts").select("cash_krw").eq("id", accountId).single();
  record("최종 cash_krw가 음수가 아님", account.cash_krw >= 0, `cash_krw=${account.cash_krw}`);

  const { data: holding } = await admin
    .from("holdings")
    .select("quantity")
    .eq("account_id", accountId)
    .eq("stock_id", stockId)
    .maybeSingle();
  record("보유수량이 정확히 1주(중복 체결로 2주가 되지 않음)", holding?.quantity === 1, `quantity=${holding?.quantity}`);

  const { count: txCount } = await admin
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("stock_id", stockId);
  record("transactions 건수가 filled 건수(1)와 일치", txCount === 1, `transactions=${txCount}`);
}

async function scenarioSellRace() {
  console.log("\n=== 시나리오 2: 매도 이중체결 방지 ===");
  const { accountId, client } = await createTestUser("sell");
  const stockId = await createTestStock("sell", 10000);
  await seedHolding(accountId, stockId, 1, 10000); // 보유 1주 시딩

  const [r1, r2] = await Promise.all([
    client.rpc("execute_order", { p_stock_id: stockId, p_side: "sell", p_quantity: 1, p_order_type: "market" }),
    client.rpc("execute_order", { p_stock_id: stockId, p_side: "sell", p_quantity: 1, p_order_type: "market" }),
  ]);
  const c1 = classifyRpcResult(r1);
  const c2 = classifyRpcResult(r2);

  checkNoDoubleFill(
    "매도 동시 2건 중 정확히 1건만 체결(나머지는 V6_INSUFFICIENT_HOLDINGS로 거부)",
    c1,
    c2,
    "V6_INSUFFICIENT_HOLDINGS"
  );

  const { data: holding } = await admin
    .from("holdings")
    .select("quantity")
    .eq("account_id", accountId)
    .eq("stock_id", stockId)
    .maybeSingle();
  record("전량 매도 후 holdings 행이 삭제됨(음수 보유 없음)", !holding, `holdings 잔존=${JSON.stringify(holding)}`);

  const { data: account } = await admin.from("accounts").select("cash_krw").eq("id", accountId).single();
  const expectedCash = 10_000_000 + 10000; // 시드머니 + 체결 1건분
  record("cash_krw가 정확히 체결 1건분만큼만 증가", account.cash_krw === expectedCash, `cash_krw=${account.cash_krw}`);

  const { count: txCount } = await admin
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("stock_id", stockId);
  record("transactions 건수가 filled 건수(1)와 일치", txCount === 1, `transactions=${txCount}`);
}

async function runScenario(label, fn) {
  try {
    await fn();
  } catch (err) {
    record(label, false, `예외 발생: ${err.message}`);
  }
}

async function teardown() {
  console.log("\n=== 정리 ===");
  for (const userId of userIdsToDelete) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.error(`[정리 실패] auth user ${userId}: ${error.message}`);
  }
  for (const stockId of stockIdsToDelete) {
    const { error } = await admin.from("stocks").delete().eq("id", stockId);
    if (error) console.error(`[정리 실패] stock ${stockId}: ${error.message}`);
  }
}

async function main() {
  try {
    await runScenario("시나리오1 실행", scenarioBuyRace);
    await runScenario("시나리오2 실행", scenarioSellRace);
  } finally {
    await teardown();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== 결과: ${results.length - failed.length}/${results.length} PASS ===`);
  if (failed.length > 0) {
    console.log("실패 항목:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("치명적 오류:", err.message);
  process.exitCode = 1;
});
