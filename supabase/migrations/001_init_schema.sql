



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";



CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";



CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";



CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, nickname, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'user_' || left(new.id::text, 8)),
    new.raw_user_meta_data->>'avatar_url'
  );

  insert into public.accounts (user_id, cash_krw, cash_usd)
  values (new.id, 10000000, 10000);  -- 기본 시드머니

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_my_account"("acc" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.accounts a
    where a.id = acc and a.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_my_account"("acc" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_price_quote"("p_stock_id" "text", "p_price" numeric, "p_prev_close" numeric, "p_change_rate" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.price_quotes (stock_id, price, prev_close, change_rate, fetched_at)
  values (p_stock_id, p_price, p_prev_close, p_change_rate, now())
  on conflict (stock_id) do update set
    price        = excluded.price,
    prev_close   = excluded.prev_close,
    change_rate  = excluded.change_rate,
    fetched_at   = now();
end;
$$;


ALTER FUNCTION "public"."upsert_price_quote"("p_stock_id" "text", "p_price" numeric, "p_prev_close" numeric, "p_change_rate" numeric) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cash_krw" numeric(20,2) DEFAULT 0 NOT NULL,
    "cash_usd" numeric(20,2) DEFAULT 0 NOT NULL,
    "initial_seed_krw" numeric(20,2) DEFAULT 10000000 NOT NULL,
    "initial_seed_usd" numeric(20,2) DEFAULT 10000 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."asset_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "snapshot_date" "date" NOT NULL,
    "total_value_krw" numeric(20,2) NOT NULL,
    "pnl_krw" numeric(20,2) NOT NULL,
    "return_rate" numeric(10,4) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."asset_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fx_rates" (
    "rate_date" "date" NOT NULL,
    "pair" "text" NOT NULL,
    "rate" numeric(20,6) NOT NULL
);


ALTER TABLE "public"."fx_rates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."holdings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "stock_id" "text" NOT NULL,
    "quantity" numeric(20,6) NOT NULL,
    "avg_price" numeric(20,4) NOT NULL,
    "currency" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "holdings_avg_price_check" CHECK (("avg_price" >= (0)::numeric)),
    CONSTRAINT "holdings_currency_check" CHECK (("currency" = ANY (ARRAY['KRW'::"text", 'USD'::"text"]))),
    CONSTRAINT "holdings_quantity_check" CHECK (("quantity" >= (0)::numeric))
);


ALTER TABLE "public"."holdings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "stock_id" "text" NOT NULL,
    "side" "text" NOT NULL,
    "order_type" "text" NOT NULL,
    "quantity" numeric(20,6) NOT NULL,
    "limit_price" numeric(20,4),
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "filled_at" timestamp with time zone,
    CONSTRAINT "orders_check" CHECK ((("order_type" <> 'limit'::"text") OR ("limit_price" IS NOT NULL))),
    CONSTRAINT "orders_order_type_check" CHECK (("order_type" = ANY (ARRAY['market'::"text", 'limit'::"text"]))),
    CONSTRAINT "orders_quantity_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "orders_side_check" CHECK (("side" = ANY (ARRAY['buy'::"text", 'sell'::"text"]))),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'filled'::"text", 'cancelled'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."price_quotes" (
    "stock_id" "text" NOT NULL,
    "price" numeric(20,4) NOT NULL,
    "prev_close" numeric(20,4),
    "change_rate" numeric(10,4),
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."price_quotes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "nickname" "text" NOT NULL,
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rankings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "season_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "return_rate" numeric(10,4) NOT NULL,
    "rank" integer,
    "score" integer,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rankings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seasons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL
);


ALTER TABLE "public"."seasons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stocks" (
    "id" "text" NOT NULL,
    "ticker" "text" NOT NULL,
    "market" "text" NOT NULL,
    "currency" "text" NOT NULL,
    "name_ko" "text",
    "name_en" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stocks_currency_check" CHECK (("currency" = ANY (ARRAY['KRW'::"text", 'USD'::"text"]))),
    CONSTRAINT "stocks_market_check" CHECK (("market" = ANY (ARRAY['KR'::"text", 'US'::"text"])))
);


ALTER TABLE "public"."stocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "stock_id" "text" NOT NULL,
    "side" "text" NOT NULL,
    "quantity" numeric(20,6) NOT NULL,
    "price" numeric(20,4) NOT NULL,
    "fee" numeric(20,4) DEFAULT 0 NOT NULL,
    "currency" "text" NOT NULL,
    "executed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transactions_currency_check" CHECK (("currency" = ANY (ARRAY['KRW'::"text", 'USD'::"text"]))),
    CONSTRAINT "transactions_price_check" CHECK (("price" >= (0)::numeric)),
    CONSTRAINT "transactions_quantity_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "transactions_side_check" CHECK (("side" = ANY (ARRAY['buy'::"text", 'sell'::"text"])))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."watchlist_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "stock_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."watchlist_items" OWNER TO "postgres";


ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."asset_snapshots"
    ADD CONSTRAINT "asset_snapshots_account_id_snapshot_date_key" UNIQUE ("account_id", "snapshot_date");



ALTER TABLE ONLY "public"."asset_snapshots"
    ADD CONSTRAINT "asset_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fx_rates"
    ADD CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("rate_date", "pair");



ALTER TABLE ONLY "public"."holdings"
    ADD CONSTRAINT "holdings_account_id_stock_id_key" UNIQUE ("account_id", "stock_id");



ALTER TABLE ONLY "public"."holdings"
    ADD CONSTRAINT "holdings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."price_quotes"
    ADD CONSTRAINT "price_quotes_pkey" PRIMARY KEY ("stock_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rankings"
    ADD CONSTRAINT "rankings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rankings"
    ADD CONSTRAINT "rankings_season_id_account_id_key" UNIQUE ("season_id", "account_id");



ALTER TABLE ONLY "public"."seasons"
    ADD CONSTRAINT "seasons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stocks"
    ADD CONSTRAINT "stocks_market_ticker_key" UNIQUE ("market", "ticker");



ALTER TABLE ONLY "public"."stocks"
    ADD CONSTRAINT "stocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."watchlist_items"
    ADD CONSTRAINT "watchlist_items_account_id_stock_id_key" UNIQUE ("account_id", "stock_id");



ALTER TABLE ONLY "public"."watchlist_items"
    ADD CONSTRAINT "watchlist_items_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_holdings_account" ON "public"."holdings" USING "btree" ("account_id");



CREATE INDEX "idx_orders_account_status" ON "public"."orders" USING "btree" ("account_id", "status");



CREATE INDEX "idx_orders_pending" ON "public"."orders" USING "btree" ("status") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_quotes_fetched" ON "public"."price_quotes" USING "btree" ("fetched_at");



CREATE INDEX "idx_rankings_season_rank" ON "public"."rankings" USING "btree" ("season_id", "rank");



CREATE INDEX "idx_snapshots_account_date" ON "public"."asset_snapshots" USING "btree" ("account_id", "snapshot_date" DESC);



CREATE INDEX "idx_tx_account_time" ON "public"."transactions" USING "btree" ("account_id", "executed_at" DESC);



CREATE OR REPLACE TRIGGER "trg_accounts_updated" BEFORE UPDATE ON "public"."accounts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_holdings_updated" BEFORE UPDATE ON "public"."holdings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset_snapshots"
    ADD CONSTRAINT "asset_snapshots_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."holdings"
    ADD CONSTRAINT "holdings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."holdings"
    ADD CONSTRAINT "holdings_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id");



ALTER TABLE ONLY "public"."price_quotes"
    ADD CONSTRAINT "price_quotes_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rankings"
    ADD CONSTRAINT "rankings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rankings"
    ADD CONSTRAINT "rankings_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id");



ALTER TABLE ONLY "public"."watchlist_items"
    ADD CONSTRAINT "watchlist_items_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."watchlist_items"
    ADD CONSTRAINT "watchlist_items_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id");



ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "accounts_select_own" ON "public"."accounts" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "accounts_update_own" ON "public"."accounts" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."asset_snapshots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "snap_select_own" ON "public"."asset_snapshots" FOR SELECT USING ("public"."is_my_account"("account_id"));



ALTER TABLE "public"."fx_rates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fx_read_all" ON "public"."fx_rates" FOR SELECT USING (true);



ALTER TABLE "public"."holdings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "holdings_select_own" ON "public"."holdings" FOR SELECT USING ("public"."is_my_account"("account_id"));



ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders_insert_own" ON "public"."orders" FOR INSERT WITH CHECK ("public"."is_my_account"("account_id"));



CREATE POLICY "orders_select_own" ON "public"."orders" FOR SELECT USING ("public"."is_my_account"("account_id"));



CREATE POLICY "orders_update_own" ON "public"."orders" FOR UPDATE USING ("public"."is_my_account"("account_id"));



ALTER TABLE "public"."price_quotes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quotes_read_all" ON "public"."price_quotes" FOR SELECT USING (true);



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rankings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rankings_read_all" ON "public"."rankings" FOR SELECT USING (true);



ALTER TABLE "public"."seasons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "seasons_read_all" ON "public"."seasons" FOR SELECT USING (true);



ALTER TABLE "public"."stocks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stocks_read_all" ON "public"."stocks" FOR SELECT USING (true);



ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tx_select_own" ON "public"."transactions" FOR SELECT USING ("public"."is_my_account"("account_id"));



ALTER TABLE "public"."watchlist_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wl_delete_own" ON "public"."watchlist_items" FOR DELETE USING ("public"."is_my_account"("account_id"));



CREATE POLICY "wl_insert_own" ON "public"."watchlist_items" FOR INSERT WITH CHECK ("public"."is_my_account"("account_id"));



CREATE POLICY "wl_select_own" ON "public"."watchlist_items" FOR SELECT USING ("public"."is_my_account"("account_id"));




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_my_account"("acc" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_my_account"("acc" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_my_account"("acc" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_price_quote"("p_stock_id" "text", "p_price" numeric, "p_prev_close" numeric, "p_change_rate" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_price_quote"("p_stock_id" "text", "p_price" numeric, "p_prev_close" numeric, "p_change_rate" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_price_quote"("p_stock_id" "text", "p_price" numeric, "p_prev_close" numeric, "p_change_rate" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_price_quote"("p_stock_id" "text", "p_price" numeric, "p_prev_close" numeric, "p_change_rate" numeric) TO "service_role";



GRANT ALL ON TABLE "public"."accounts" TO "anon";
GRANT ALL ON TABLE "public"."accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."accounts" TO "service_role";



GRANT ALL ON TABLE "public"."asset_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."asset_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."asset_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."fx_rates" TO "anon";
GRANT ALL ON TABLE "public"."fx_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."fx_rates" TO "service_role";



GRANT ALL ON TABLE "public"."holdings" TO "anon";
GRANT ALL ON TABLE "public"."holdings" TO "authenticated";
GRANT ALL ON TABLE "public"."holdings" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."price_quotes" TO "anon";
GRANT ALL ON TABLE "public"."price_quotes" TO "authenticated";
GRANT ALL ON TABLE "public"."price_quotes" TO "service_role";



GRANT ALL ON TABLE "public"."rankings" TO "anon";
GRANT ALL ON TABLE "public"."rankings" TO "authenticated";
GRANT ALL ON TABLE "public"."rankings" TO "service_role";



GRANT ALL ON TABLE "public"."seasons" TO "anon";
GRANT ALL ON TABLE "public"."seasons" TO "authenticated";
GRANT ALL ON TABLE "public"."seasons" TO "service_role";



GRANT ALL ON TABLE "public"."stocks" TO "anon";
GRANT ALL ON TABLE "public"."stocks" TO "authenticated";
GRANT ALL ON TABLE "public"."stocks" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



GRANT ALL ON TABLE "public"."watchlist_items" TO "anon";
GRANT ALL ON TABLE "public"."watchlist_items" TO "authenticated";
GRANT ALL ON TABLE "public"."watchlist_items" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";




ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";




ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


drop extension if exists "pg_net";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
