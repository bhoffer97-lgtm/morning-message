alter table "public"."entries" drop constraint "entries_type_check";

drop index if exists "public"."entries_user_type_idx";

alter table "public"."entries" alter column "type" drop not null;


