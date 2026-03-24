
  create table "public"."verse_intensities" (
    "key" text not null,
    "label" text not null,
    "sort_order" integer not null default 0,
    "description" text
      );



  create table "public"."verse_principles" (
    "key" text not null,
    "label" text not null,
    "description" text
      );



  create table "public"."verse_tones" (
    "key" text not null,
    "label" text not null,
    "description" text
      );



  create table "public"."verse_topics" (
    "key" text not null,
    "label" text not null,
    "description" text
      );



  create table "public"."verse_use_cases" (
    "key" text not null,
    "label" text not null,
    "description" text
      );


alter table "public"."bible_verses" add column "active" boolean not null default true;

alter table "public"."bible_verses" add column "intensity" text;

alter table "public"."bible_verses" add column "is_crisis_safe" boolean not null default true;

alter table "public"."bible_verses" add column "is_general_daily" boolean not null default false;

alter table "public"."bible_verses" add column "notes" text;

alter table "public"."bible_verses" add column "primary_topic" text;

alter table "public"."bible_verses" add column "principles" text[] default '{}'::text[];

alter table "public"."bible_verses" add column "secondary_topics" text[] default '{}'::text[];

alter table "public"."bible_verses" add column "tone" text;

alter table "public"."bible_verses" add column "use_cases" text[] default '{}'::text[];

alter table "public"."daily_messages" add column "verse_id" uuid;

CREATE INDEX bible_verses_active_idx ON public.bible_verses USING btree (active);

CREATE INDEX bible_verses_general_daily_idx ON public.bible_verses USING btree (is_general_daily);

CREATE INDEX bible_verses_primary_topic_idx ON public.bible_verses USING btree (primary_topic);

CREATE UNIQUE INDEX verse_intensities_pkey ON public.verse_intensities USING btree (key);

CREATE UNIQUE INDEX verse_principles_pkey ON public.verse_principles USING btree (key);

CREATE UNIQUE INDEX verse_tones_pkey ON public.verse_tones USING btree (key);

CREATE UNIQUE INDEX verse_topics_pkey ON public.verse_topics USING btree (key);

CREATE UNIQUE INDEX verse_use_cases_pkey ON public.verse_use_cases USING btree (key);

alter table "public"."verse_intensities" add constraint "verse_intensities_pkey" PRIMARY KEY using index "verse_intensities_pkey";

alter table "public"."verse_principles" add constraint "verse_principles_pkey" PRIMARY KEY using index "verse_principles_pkey";

alter table "public"."verse_tones" add constraint "verse_tones_pkey" PRIMARY KEY using index "verse_tones_pkey";

alter table "public"."verse_topics" add constraint "verse_topics_pkey" PRIMARY KEY using index "verse_topics_pkey";

alter table "public"."verse_use_cases" add constraint "verse_use_cases_pkey" PRIMARY KEY using index "verse_use_cases_pkey";

alter table "public"."daily_messages" add constraint "daily_messages_verse_id_fkey" FOREIGN KEY (verse_id) REFERENCES public.bible_verses(id) ON DELETE SET NULL not valid;

alter table "public"."daily_messages" validate constraint "daily_messages_verse_id_fkey";

grant delete on table "public"."verse_intensities" to "anon";

grant insert on table "public"."verse_intensities" to "anon";

grant references on table "public"."verse_intensities" to "anon";

grant select on table "public"."verse_intensities" to "anon";

grant trigger on table "public"."verse_intensities" to "anon";

grant truncate on table "public"."verse_intensities" to "anon";

grant update on table "public"."verse_intensities" to "anon";

grant delete on table "public"."verse_intensities" to "authenticated";

grant insert on table "public"."verse_intensities" to "authenticated";

grant references on table "public"."verse_intensities" to "authenticated";

grant select on table "public"."verse_intensities" to "authenticated";

grant trigger on table "public"."verse_intensities" to "authenticated";

grant truncate on table "public"."verse_intensities" to "authenticated";

grant update on table "public"."verse_intensities" to "authenticated";

grant delete on table "public"."verse_intensities" to "service_role";

grant insert on table "public"."verse_intensities" to "service_role";

grant references on table "public"."verse_intensities" to "service_role";

grant select on table "public"."verse_intensities" to "service_role";

grant trigger on table "public"."verse_intensities" to "service_role";

grant truncate on table "public"."verse_intensities" to "service_role";

grant update on table "public"."verse_intensities" to "service_role";

grant delete on table "public"."verse_principles" to "anon";

grant insert on table "public"."verse_principles" to "anon";

grant references on table "public"."verse_principles" to "anon";

grant select on table "public"."verse_principles" to "anon";

grant trigger on table "public"."verse_principles" to "anon";

grant truncate on table "public"."verse_principles" to "anon";

grant update on table "public"."verse_principles" to "anon";

grant delete on table "public"."verse_principles" to "authenticated";

grant insert on table "public"."verse_principles" to "authenticated";

grant references on table "public"."verse_principles" to "authenticated";

grant select on table "public"."verse_principles" to "authenticated";

grant trigger on table "public"."verse_principles" to "authenticated";

grant truncate on table "public"."verse_principles" to "authenticated";

grant update on table "public"."verse_principles" to "authenticated";

grant delete on table "public"."verse_principles" to "service_role";

grant insert on table "public"."verse_principles" to "service_role";

grant references on table "public"."verse_principles" to "service_role";

grant select on table "public"."verse_principles" to "service_role";

grant trigger on table "public"."verse_principles" to "service_role";

grant truncate on table "public"."verse_principles" to "service_role";

grant update on table "public"."verse_principles" to "service_role";

grant delete on table "public"."verse_tones" to "anon";

grant insert on table "public"."verse_tones" to "anon";

grant references on table "public"."verse_tones" to "anon";

grant select on table "public"."verse_tones" to "anon";

grant trigger on table "public"."verse_tones" to "anon";

grant truncate on table "public"."verse_tones" to "anon";

grant update on table "public"."verse_tones" to "anon";

grant delete on table "public"."verse_tones" to "authenticated";

grant insert on table "public"."verse_tones" to "authenticated";

grant references on table "public"."verse_tones" to "authenticated";

grant select on table "public"."verse_tones" to "authenticated";

grant trigger on table "public"."verse_tones" to "authenticated";

grant truncate on table "public"."verse_tones" to "authenticated";

grant update on table "public"."verse_tones" to "authenticated";

grant delete on table "public"."verse_tones" to "service_role";

grant insert on table "public"."verse_tones" to "service_role";

grant references on table "public"."verse_tones" to "service_role";

grant select on table "public"."verse_tones" to "service_role";

grant trigger on table "public"."verse_tones" to "service_role";

grant truncate on table "public"."verse_tones" to "service_role";

grant update on table "public"."verse_tones" to "service_role";

grant delete on table "public"."verse_topics" to "anon";

grant insert on table "public"."verse_topics" to "anon";

grant references on table "public"."verse_topics" to "anon";

grant select on table "public"."verse_topics" to "anon";

grant trigger on table "public"."verse_topics" to "anon";

grant truncate on table "public"."verse_topics" to "anon";

grant update on table "public"."verse_topics" to "anon";

grant delete on table "public"."verse_topics" to "authenticated";

grant insert on table "public"."verse_topics" to "authenticated";

grant references on table "public"."verse_topics" to "authenticated";

grant select on table "public"."verse_topics" to "authenticated";

grant trigger on table "public"."verse_topics" to "authenticated";

grant truncate on table "public"."verse_topics" to "authenticated";

grant update on table "public"."verse_topics" to "authenticated";

grant delete on table "public"."verse_topics" to "service_role";

grant insert on table "public"."verse_topics" to "service_role";

grant references on table "public"."verse_topics" to "service_role";

grant select on table "public"."verse_topics" to "service_role";

grant trigger on table "public"."verse_topics" to "service_role";

grant truncate on table "public"."verse_topics" to "service_role";

grant update on table "public"."verse_topics" to "service_role";

grant delete on table "public"."verse_use_cases" to "anon";

grant insert on table "public"."verse_use_cases" to "anon";

grant references on table "public"."verse_use_cases" to "anon";

grant select on table "public"."verse_use_cases" to "anon";

grant trigger on table "public"."verse_use_cases" to "anon";

grant truncate on table "public"."verse_use_cases" to "anon";

grant update on table "public"."verse_use_cases" to "anon";

grant delete on table "public"."verse_use_cases" to "authenticated";

grant insert on table "public"."verse_use_cases" to "authenticated";

grant references on table "public"."verse_use_cases" to "authenticated";

grant select on table "public"."verse_use_cases" to "authenticated";

grant trigger on table "public"."verse_use_cases" to "authenticated";

grant truncate on table "public"."verse_use_cases" to "authenticated";

grant update on table "public"."verse_use_cases" to "authenticated";

grant delete on table "public"."verse_use_cases" to "service_role";

grant insert on table "public"."verse_use_cases" to "service_role";

grant references on table "public"."verse_use_cases" to "service_role";

grant select on table "public"."verse_use_cases" to "service_role";

grant trigger on table "public"."verse_use_cases" to "service_role";

grant truncate on table "public"."verse_use_cases" to "service_role";

grant update on table "public"."verse_use_cases" to "service_role";


