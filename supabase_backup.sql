


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



CREATE EXTENSION IF NOT EXISTS "hypopg" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "index_advisor" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."compute_reminder_group_next_run"("p_cadence" "text", "p_time_of_day" time without time zone, "p_day_of_week" integer, "p_day_of_month" integer, "p_month_of_year" integer, "p_now" timestamp with time zone DEFAULT "now"()) RETURNS timestamp with time zone
    LANGUAGE "plpgsql"
    AS $$
declare
  local_now timestamp;
  candidate timestamp;
  target_time time;
  current_date_local date;
  days_ahead integer;
  target_year integer;
  target_month integer;
  safe_day integer;
  last_day integer;
begin
  if p_time_of_day is null then
    target_time := time '09:00';
  else
    target_time := p_time_of_day;
  end if;

  local_now := p_now::timestamp;
  current_date_local := local_now::date;

  if p_cadence = 'daily' then
    candidate := current_date_local + target_time;

    if candidate <= local_now then
      candidate := (current_date_local + 1) + target_time;
    end if;

    return candidate;
  end if;

  if p_cadence = 'weekly' then
    if p_day_of_week is null then
      return null;
    end if;

    days_ahead := p_day_of_week - extract(dow from current_date_local)::integer;

    if days_ahead < 0 then
      days_ahead := days_ahead + 7;
    end if;

    candidate := (current_date_local + days_ahead) + target_time;

    if candidate <= local_now then
      candidate := (current_date_local + days_ahead + 7) + target_time;
    end if;

    return candidate;
  end if;

  if p_cadence = 'monthly' then
    if p_day_of_month is null then
      return null;
    end if;

    target_year := extract(year from current_date_local)::integer;
    target_month := extract(month from current_date_local)::integer;

    last_day := extract(day from (date_trunc('month', make_date(target_year, target_month, 1)) + interval '1 month - 1 day'))::integer;
    safe_day := least(p_day_of_month, last_day);

    candidate := make_date(target_year, target_month, safe_day) + target_time;

    if candidate <= local_now then
      if target_month = 12 then
        target_year := target_year + 1;
        target_month := 1;
      else
        target_month := target_month + 1;
      end if;

      last_day := extract(day from (date_trunc('month', make_date(target_year, target_month, 1)) + interval '1 month - 1 day'))::integer;
      safe_day := least(p_day_of_month, last_day);

      candidate := make_date(target_year, target_month, safe_day) + target_time;
    end if;

    return candidate;
  end if;

  if p_cadence = 'yearly' then
    if p_day_of_month is null or p_month_of_year is null then
      return null;
    end if;

    target_year := extract(year from current_date_local)::integer;

    last_day := extract(day from (date_trunc('month', make_date(target_year, p_month_of_year, 1)) + interval '1 month - 1 day'))::integer;
    safe_day := least(p_day_of_month, last_day);

    candidate := make_date(target_year, p_month_of_year, safe_day) + target_time;

    if candidate <= local_now then
      target_year := target_year + 1;

      last_day := extract(day from (date_trunc('month', make_date(target_year, p_month_of_year, 1)) + interval '1 month - 1 day'))::integer;
      safe_day := least(p_day_of_month, last_day);

      candidate := make_date(target_year, p_month_of_year, safe_day) + target_time;
    end if;

    return candidate;
  end if;

  return null;
end;
$$;


ALTER FUNCTION "public"."compute_reminder_group_next_run"("p_cadence" "text", "p_time_of_day" time without time zone, "p_day_of_week" integer, "p_day_of_month" integer, "p_month_of_year" integer, "p_now" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_reminder_group_next_run"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  current_local timestamp;
  candidate_local timestamp;
  target_date date;
  target_day integer;
  last_day integer;
  target_month integer;
  target_year integer;
begin
  if new.is_active = false then
    new.next_run_at := null;
    return new;
  end if;

  if new.time_of_day is null then
    new.next_run_at := null;
    return new;
  end if;

  current_local := now();

  if new.cadence = 'daily' then
    candidate_local := date_trunc('day', current_local) + new.time_of_day;

    if candidate_local <= current_local then
      candidate_local := candidate_local + interval '1 day';
    end if;

    new.next_run_at := candidate_local;
    return new;
  end if;

  if new.cadence = 'weekly' then
    if new.day_of_week is null then
      new.next_run_at := null;
      return new;
    end if;

    target_date :=
      current_date
      + ((new.day_of_week - extract(dow from current_date)::integer + 7) % 7);

    candidate_local := target_date + new.time_of_day;

    if candidate_local <= current_local then
      candidate_local := candidate_local + interval '7 days';
    end if;

    new.next_run_at := candidate_local;
    return new;
  end if;

  if new.cadence = 'monthly' then
    if new.day_of_month is null then
      new.next_run_at := null;
      return new;
    end if;

    target_date := date_trunc('month', current_date)::date;
    last_day := extract(day from (target_date + interval '1 month - 1 day'))::integer;
    target_day := least(new.day_of_month, last_day);

    candidate_local := (target_date + (target_day - 1)) + new.time_of_day;

    if candidate_local <= current_local then
      target_date := (date_trunc('month', current_date) + interval '1 month')::date;
      last_day := extract(day from (target_date + interval '1 month - 1 day'))::integer;
      target_day := least(new.day_of_month, last_day);
      candidate_local := (target_date + (target_day - 1)) + new.time_of_day;
    end if;

    new.next_run_at := candidate_local;
    return new;
  end if;

  if new.cadence = 'yearly' then
    if new.month_of_year is null or new.day_of_month is null then
      new.next_run_at := null;
      return new;
    end if;

    target_month := new.month_of_year;
    target_year := extract(year from current_date)::integer;

    target_date := make_date(target_year, target_month, 1);
    last_day := extract(day from (target_date + interval '1 month - 1 day'))::integer;
    target_day := least(new.day_of_month, last_day);

    candidate_local := (target_date + (target_day - 1)) + new.time_of_day;

    if candidate_local <= current_local then
      target_year := target_year + 1;
      target_date := make_date(target_year, target_month, 1);
      last_day := extract(day from (target_date + interval '1 month - 1 day'))::integer;
      target_day := least(new.day_of_month, last_day);
      candidate_local := (target_date + (target_day - 1)) + new.time_of_day;
    end if;

    new.next_run_at := candidate_local;
    return new;
  end if;

  new.next_run_at := null;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_reminder_group_next_run"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."bible_verses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reference" "text" NOT NULL,
    "verse_text" "text" NOT NULL,
    "translation" "text" DEFAULT 'NET'::"text",
    "primary_topic" "text",
    "secondary_topics" "text"[] DEFAULT '{}'::"text"[],
    "principles" "text"[] DEFAULT '{}'::"text"[],
    "tone" "text",
    "intensity" "text",
    "use_cases" "text"[] DEFAULT '{}'::"text"[],
    "is_general_daily" boolean DEFAULT false NOT NULL,
    "is_crisis_safe" boolean DEFAULT true NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "notes" "text"
);


ALTER TABLE "public"."bible_verses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_messages" (
    "id" bigint NOT NULL,
    "message" "text",
    "verse_reference" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "message_date" "date",
    "message_text" "text",
    "verse_query" "text",
    "background_key" "text",
    "message_index" integer,
    "is_primary" boolean DEFAULT false NOT NULL,
    "verse_id" "uuid"
);


ALTER TABLE "public"."daily_messages" OWNER TO "postgres";


ALTER TABLE "public"."daily_messages" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."daily_messages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "content" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "answered_at" timestamp with time zone,
    "answer_notes" "text",
    "reminder_frequency" "text" DEFAULT 'none'::"text" NOT NULL,
    "reminder_time" time without time zone,
    "last_reminded_at" timestamp with time zone,
    "title" "text",
    "reminder_group_id" "uuid",
    "completed_from_label" "text",
    CONSTRAINT "entries_reminder_frequency_check" CHECK (("reminder_frequency" = ANY (ARRAY['none'::"text", 'daily'::"text", 'weekly'::"text", 'biweekly'::"text", 'monthly'::"text"]))),
    CONSTRAINT "entries_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'answered'::"text"]))),
    CONSTRAINT "entries_type_check" CHECK (("type" = ANY (ARRAY['prayer'::"text", 'gratitude'::"text", 'affirmation'::"text", 'goal'::"text"])))
);


ALTER TABLE "public"."entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "message_id" bigint NOT NULL,
    "feedback_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "message_feedback_feedback_type_check" CHECK (("feedback_type" = ANY (ARRAY['helpful'::"text", 'not_helpful'::"text", 'favorite'::"text"])))
);


ALTER TABLE "public"."message_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "timezone" "text" DEFAULT 'America/New_York'::"text",
    "notifications_enabled" boolean DEFAULT true NOT NULL,
    "morning_notification_time" time without time zone DEFAULT '07:00:00'::time without time zone,
    "evening_reminder_time" time without time zone DEFAULT '20:30:00'::time without time zone
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reminder_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "cadence" "text" NOT NULL,
    "time_of_day" time without time zone,
    "day_of_week" integer,
    "day_of_month" integer,
    "month_of_year" integer,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "next_run_at" timestamp with time zone,
    "last_run_at" timestamp with time zone,
    CONSTRAINT "reminder_groups_cadence_check" CHECK (("cadence" = ANY (ARRAY['daily'::"text", 'weekly'::"text", 'monthly'::"text", 'yearly'::"text", 'custom'::"text"]))),
    CONSTRAINT "reminder_groups_day_of_month_check" CHECK ((("day_of_month" IS NULL) OR (("day_of_month" >= 1) AND ("day_of_month" <= 31)))),
    CONSTRAINT "reminder_groups_day_of_week_check" CHECK ((("day_of_week" IS NULL) OR (("day_of_week" >= 0) AND ("day_of_week" <= 6)))),
    CONSTRAINT "reminder_groups_month_of_year_check" CHECK ((("month_of_year" IS NULL) OR (("month_of_year" >= 1) AND ("month_of_year" <= 12))))
);


ALTER TABLE "public"."reminder_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."verse_intensities" (
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "description" "text"
);


ALTER TABLE "public"."verse_intensities" OWNER TO "postgres";


COMMENT ON TABLE "public"."verse_intensities" IS 'Allowed intensity values for bible_verses.intensity';



CREATE TABLE IF NOT EXISTS "public"."verse_principles" (
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text"
);


ALTER TABLE "public"."verse_principles" OWNER TO "postgres";


COMMENT ON TABLE "public"."verse_principles" IS 'Allowed principle taxonomy for bible_verses.principles';



CREATE TABLE IF NOT EXISTS "public"."verse_tones" (
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text"
);


ALTER TABLE "public"."verse_tones" OWNER TO "postgres";


COMMENT ON TABLE "public"."verse_tones" IS 'Allowed tone values for bible_verses.tone';



CREATE TABLE IF NOT EXISTS "public"."verse_topics" (
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text"
);


ALTER TABLE "public"."verse_topics" OWNER TO "postgres";


COMMENT ON TABLE "public"."verse_topics" IS 'Allowed primary topic taxonomy for bible_verses.primary_topic';



CREATE TABLE IF NOT EXISTS "public"."verse_use_cases" (
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text"
);


ALTER TABLE "public"."verse_use_cases" OWNER TO "postgres";


COMMENT ON TABLE "public"."verse_use_cases" IS 'Allowed use case values for bible_verses.use_cases';



ALTER TABLE ONLY "public"."bible_verses"
    ADD CONSTRAINT "bible_verses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bible_verses"
    ADD CONSTRAINT "bible_verses_reference_unique" UNIQUE ("reference");



ALTER TABLE ONLY "public"."daily_messages"
    ADD CONSTRAINT "daily_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entries"
    ADD CONSTRAINT "entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_feedback"
    ADD CONSTRAINT "message_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_feedback"
    ADD CONSTRAINT "one_feedback_per_type_per_message" UNIQUE ("user_id", "message_id", "feedback_type");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reminder_groups"
    ADD CONSTRAINT "reminder_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."verse_intensities"
    ADD CONSTRAINT "verse_intensities_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."verse_principles"
    ADD CONSTRAINT "verse_principles_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."verse_tones"
    ADD CONSTRAINT "verse_tones_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."verse_topics"
    ADD CONSTRAINT "verse_topics_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."verse_use_cases"
    ADD CONSTRAINT "verse_use_cases_pkey" PRIMARY KEY ("key");



CREATE INDEX "bible_verses_active_idx" ON "public"."bible_verses" USING "btree" ("active");



CREATE INDEX "bible_verses_general_daily_idx" ON "public"."bible_verses" USING "btree" ("is_general_daily");



CREATE INDEX "bible_verses_primary_topic_idx" ON "public"."bible_verses" USING "btree" ("primary_topic");



CREATE UNIQUE INDEX "daily_messages_user_id_message_date_key" ON "public"."daily_messages" USING "btree" ("user_id", "message_date");



CREATE INDEX "entries_reminder_group_id_idx" ON "public"."entries" USING "btree" ("reminder_group_id");



CREATE INDEX "entries_user_id_idx" ON "public"."entries" USING "btree" ("user_id");



CREATE INDEX "entries_user_status_idx" ON "public"."entries" USING "btree" ("user_id", "status");



CREATE INDEX "entries_user_type_idx" ON "public"."entries" USING "btree" ("user_id", "type");



CREATE INDEX "reminder_groups_user_cadence_idx" ON "public"."reminder_groups" USING "btree" ("user_id", "cadence");



CREATE INDEX "reminder_groups_user_id_idx" ON "public"."reminder_groups" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "reminder_groups_set_next_run" BEFORE INSERT OR UPDATE ON "public"."reminder_groups" FOR EACH ROW EXECUTE FUNCTION "public"."set_reminder_group_next_run"();



CREATE OR REPLACE TRIGGER "set_entries_updated_at" BEFORE UPDATE ON "public"."entries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_reminder_groups_updated_at" BEFORE UPDATE ON "public"."reminder_groups" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."daily_messages"
    ADD CONSTRAINT "daily_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_messages"
    ADD CONSTRAINT "daily_messages_verse_id_fkey" FOREIGN KEY ("verse_id") REFERENCES "public"."bible_verses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."entries"
    ADD CONSTRAINT "entries_reminder_group_id_fkey" FOREIGN KEY ("reminder_group_id") REFERENCES "public"."reminder_groups"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."entries"
    ADD CONSTRAINT "entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_feedback"
    ADD CONSTRAINT "message_feedback_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."daily_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_feedback"
    ADD CONSTRAINT "message_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reminder_groups"
    ADD CONSTRAINT "reminder_groups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Users can delete own entries" ON "public"."entries" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own feedback" ON "public"."message_feedback" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own reminder groups" ON "public"."reminder_groups" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own daily messages" ON "public"."daily_messages" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own entries" ON "public"."entries" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own feedback" ON "public"."message_feedback" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert their own reminder groups" ON "public"."reminder_groups" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own entries" ON "public"."entries" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own feedback" ON "public"."message_feedback" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own reminder groups" ON "public"."reminder_groups" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own daily messages" ON "public"."daily_messages" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own entries" ON "public"."entries" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own feedback" ON "public"."message_feedback" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their own reminder groups" ON "public"."reminder_groups" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Verses are readable" ON "public"."bible_verses" FOR SELECT USING (true);



ALTER TABLE "public"."bible_verses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reminder_groups" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";





























































































































































































GRANT ALL ON FUNCTION "public"."compute_reminder_group_next_run"("p_cadence" "text", "p_time_of_day" time without time zone, "p_day_of_week" integer, "p_day_of_month" integer, "p_month_of_year" integer, "p_now" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."compute_reminder_group_next_run"("p_cadence" "text", "p_time_of_day" time without time zone, "p_day_of_week" integer, "p_day_of_month" integer, "p_month_of_year" integer, "p_now" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_reminder_group_next_run"("p_cadence" "text", "p_time_of_day" time without time zone, "p_day_of_week" integer, "p_day_of_month" integer, "p_month_of_year" integer, "p_now" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_reminder_group_next_run"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_reminder_group_next_run"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_reminder_group_next_run"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";
























GRANT ALL ON TABLE "public"."bible_verses" TO "anon";
GRANT ALL ON TABLE "public"."bible_verses" TO "authenticated";
GRANT ALL ON TABLE "public"."bible_verses" TO "service_role";



GRANT ALL ON TABLE "public"."daily_messages" TO "anon";
GRANT ALL ON TABLE "public"."daily_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_messages" TO "service_role";



GRANT ALL ON SEQUENCE "public"."daily_messages_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."daily_messages_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."daily_messages_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."entries" TO "anon";
GRANT ALL ON TABLE "public"."entries" TO "authenticated";
GRANT ALL ON TABLE "public"."entries" TO "service_role";



GRANT ALL ON TABLE "public"."message_feedback" TO "anon";
GRANT ALL ON TABLE "public"."message_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."message_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."reminder_groups" TO "anon";
GRANT ALL ON TABLE "public"."reminder_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."reminder_groups" TO "service_role";



GRANT ALL ON TABLE "public"."verse_intensities" TO "anon";
GRANT ALL ON TABLE "public"."verse_intensities" TO "authenticated";
GRANT ALL ON TABLE "public"."verse_intensities" TO "service_role";



GRANT ALL ON TABLE "public"."verse_principles" TO "anon";
GRANT ALL ON TABLE "public"."verse_principles" TO "authenticated";
GRANT ALL ON TABLE "public"."verse_principles" TO "service_role";



GRANT ALL ON TABLE "public"."verse_tones" TO "anon";
GRANT ALL ON TABLE "public"."verse_tones" TO "authenticated";
GRANT ALL ON TABLE "public"."verse_tones" TO "service_role";



GRANT ALL ON TABLE "public"."verse_topics" TO "anon";
GRANT ALL ON TABLE "public"."verse_topics" TO "authenticated";
GRANT ALL ON TABLE "public"."verse_topics" TO "service_role";



GRANT ALL ON TABLE "public"."verse_use_cases" TO "anon";
GRANT ALL ON TABLE "public"."verse_use_cases" TO "authenticated";
GRANT ALL ON TABLE "public"."verse_use_cases" TO "service_role";









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































