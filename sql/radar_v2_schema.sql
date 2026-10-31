-- =====================================================================
-- Job Radar v2: Neon schema (supersedes radar_schema.sql from Sprint 6,
-- which was planned on 2026-10-18 but never applied).
-- Neon project job-radar, database neondb, branch production.
-- Safe to re-run: tables use IF NOT EXISTS, functions and views use
-- CREATE OR REPLACE, seed rows use ON CONFLICT / NOT EXISTS.
-- Every object is prefixed jr_ (views v_jr_) so a query sent to the wrong
-- database fails loudly instead of reading the GTM tables.
--
-- Ownership
--   n8n (engine):  jr_runs, jr_postings (stage fields), jr_matches (content)
--                  via jr_start_run, jr_ingest, jr_record_postings, jr_finish_run
--   console (you): jr_config_versions, jr_settings, review fields, flags
--                  via jr_save_config, jr_review, jr_flag_posting,
--                  jr_set_paused, jr_request_run
--   Job descriptions are never stored (privacy, storage, egress).
-- =====================================================================

-- ---------- helpers ----------------------------------------------------

-- Text to timestamptz. ISO with zone, zone-less text (read as UTC), epoch s/ms. Unreadable -> NULL.
create or replace function jr_ts(v text) returns timestamptz
language plpgsql immutable as $$
declare
  n numeric;
  t text := btrim(v);
begin
  if t is null or t = '' then return null; end if;
  if t ~ '^[0-9]+(\.[0-9]+)?$' then
    n := t::numeric;
    if n < 100000000000 then return to_timestamp(n); end if;
    return to_timestamp(n / 1000);
  end if;
  if t ~* '(z|[+-][0-9]{2}(:?[0-9]{2})?)$' then
    return t::timestamptz;
  end if;
  return t::timestamp at time zone 'UTC';
exception when others then
  return null;
end $$;

create or replace function jr_int(v text) returns integer
language plpgsql immutable as $$
begin
  if v is null or btrim(v) = '' then return null; end if;
  return round(btrim(v)::numeric)::integer;
exception when others then
  return null;
end $$;

create or replace function jr_bool(v text) returns boolean
language sql immutable as $$
  select case
    when v is null or btrim(v) = '' then null
    when lower(btrim(v)) in ('true', 't', '1', 'yes', 'y') then true
    when lower(btrim(v)) in ('false', 'f', '0', 'no', 'n') then false
    else null end
$$;

-- Cross-board duplicate key: same company + same title (letters and digits only).
-- NULL when the company is unknown, so unknown-company posts never collapse into each other.
-- Same job on two boards: company without legal suffix ("Kubermatic GmbH" = "Kubermatic") and title without
-- gender tags ("(w/m/d)", "(m/f/d)", "(all genders)"). C6b, 2026-10-31.
create or replace function jr_dupe_key(p_company text, p_title text) returns text
language sql immutable as $$
  select case
    when coalesce(btrim(p_company), '') = '' or lower(btrim(p_company)) in ('unknown', 'n/a', 'confidential')
      or coalesce(btrim(p_title), '') = '' then null
    else left(md5(
      regexp_replace(
        regexp_replace(lower(btrim(p_company)),
          '[\s,]+(gmbh|ag|se|kg|ug|inc|llc|ltd|limited|plc|corp|corporation|co|sas|sarl|sa|s\.a\.|bv|b\.v\.|nv|oy|ab|as|aps|srl|spa|sl)\.?((\s*&\s*co\.?)?\s*(kg|kgaa))?\s*$', ''),
        '[^a-z0-9]', '', 'g') || '|' ||
      regexp_replace(
        regexp_replace(lower(p_title),
          '\(\s*(?:[mwfdxh*]\s*[/|,]\s*){1,3}[mwfdxh*]\s*\)|\(\s*(?:all genders|gn|any gender|w/m/d|m/w/d)\s*\)|\m[mwf]/[mwf]/[dx]\M', ' ', 'g'),
        '[^a-z0-9]', '', 'g')), 16)
  end
$$;

-- ---------- console-owned tables ---------------------------------------

create table if not exists jr_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
insert into jr_settings (key, value) values ('paused', 'false'), ('run_requested_at', '')
on conflict (key) do nothing;

create table if not exists jr_config_versions (
  id           bigserial primary key,
  rev          text not null unique,
  payload_text text not null,                                         -- exactly as saved
  payload      jsonb generated always as (payload_text::jsonb) stored, -- rejects invalid JSON
  note         text,
  created_by   text not null default 'console',
  created_at   timestamptz not null default now()
);

create table if not exists jr_events (              -- audit log: every human decision
  id         bigserial primary key,
  entity     text not null,                         -- match | posting | config | settings
  entity_id  text not null,
  action     text not null,
  before     jsonb,
  after      jsonb,
  actor      text not null default 'console',
  created_at timestamptz not null default now()
);
create index if not exists jr_events_entity_idx on jr_events (entity, entity_id, created_at desc);

-- ---------- engine tables ----------------------------------------------

create table if not exists jr_runs (
  run_id        bigserial primary key,
  trigger       text not null default 'manual',
  config_rev    text,
  status        text not null default 'running',
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  funnel        jsonb not null default '{}'::jsonb,  -- fetched, gate_a_pass, new, detail_ok, gate_b_pass, llm_calls, scored, matches
  source_stats  jsonb not null default '{}'::jsonb,  -- {source: {fetched, errors, gate_a_pass, new, gate_b_pass, matches, error}}
  providers     text,
  failures      integer,
  warnings      text,
  errors_sample text,
  constraint jr_runs_status_chk  check (status in ('running', 'completed', 'failed')),
  constraint jr_runs_trigger_chk check (trigger in ('schedule', 'requested', 'manual'))
);
create index if not exists jr_runs_started_idx on jr_runs (started_at desc);

-- Every posting the engine has seen (funnel + dedupe ledger). No descriptions.
-- Rows that never matched are deleted after 45 days by jr_finish_run.
create table if not exists jr_postings (
  posting_id      text primary key,                 -- left(md5(url), 16)
  url             text not null unique,
  dupe_key        text,                             -- jr_dupe_key(company, title)
  source          text not null,
  kind            text not null default 'job',
  title           text,
  company         text,
  location_raw    text,
  work_mode       text,
  employment_type text,
  posted_at       timestamptz,
  first_seen_at   timestamptz not null default now(),
  first_run_id    bigint references jr_runs (run_id) on delete set null,
  last_run_id     bigint,
  gate_rev        text,                             -- config rev of the last gate decision
  stage           text not null,
  reason          text,                             -- machine reason code (gate A, B or C)
  reason_detail   text,                             -- evidence, 300 chars max
  attempts        integer not null default 0,       -- detail fetch failures
  final_score     integer,
  flag            text,                             -- false_negative (set from the console)
  flag_note       text,
  flagged_at      timestamptz,
  constraint jr_postings_stage_chk check (stage in
    ('dropped_a', 'duplicate', 'queued', 'dropped_b', 'skipped_cap', 'dropped_llm', 'below_score', 'matched', 'llm_failed')),
  constraint jr_postings_kind_chk check (kind in ('job', 'gig')),
  constraint jr_postings_flag_chk check (flag is null or flag = 'false_negative')
);
create index if not exists jr_postings_seen_idx   on jr_postings (first_seen_at desc);
create index if not exists jr_postings_stage_idx  on jr_postings (stage, reason);
create index if not exists jr_postings_dupe_idx   on jr_postings (dupe_key, first_seen_at desc) where dupe_key is not null;

create table if not exists jr_matches (
  match_id            text primary key,             -- = jr_postings.posting_id
  url                 text not null unique,
  run_id              bigint,
  run_date            timestamptz not null default now(),
  source              text,
  kind                text not null default 'job',
  title               text,
  company             text,
  location_raw        text,
  work_mode           text,
  employment_type     text,
  posted_date         timestamptz,
  final_score         integer,
  priority            boolean not null default false,
  why_match           text,
  red_flags           text,
  seniority           text,
  min_years_required  numeric,
  experience_evidence text,
  languages_required  text,
  visa_status         text,
  remote_region       text,
  contract_friendly   boolean,
  company_size_hint   text,
  salary              text,
  confidence          integer,
  provider            text,
  score_breakdown     text,
  config_rev          text,
  -- console-owned review fields
  status              text not null default 'new',
  fp_reason           text,
  notes               text,
  applied_at          timestamptz,
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now(),
  constraint jr_m_status_chk check (status in ('new', 'good', 'false_positive', 'applied', 'interviewing', 'offer', 'rejected')),
  constraint jr_m_fp_reason_chk check (fp_reason is null or fp_reason in
    ('seniority', 'experience', 'location', 'work_mode', 'language', 'visa', 'skills', 'role_type', 'duplicate', 'stale', 'other')),
  constraint jr_m_fp_needs_reason check (status <> 'false_positive' or fp_reason is not null),
  constraint jr_m_kind_chk check (kind in ('job', 'gig'))
);
create index if not exists jr_matches_status_idx on jr_matches (status, final_score desc);
create index if not exists jr_matches_run_idx    on jr_matches (run_date desc);

-- ---------- config validation ------------------------------------------
-- SQL guards the invariants that protect free-tier budgets and the pipeline.
-- The console also validates the full shape with zod (lib/config-schema.ts)
-- and compiles the JavaScript regexes before calling jr_save_config.

create or replace function jr_cfg_obj(p jsonb, path text[]) returns jsonb
language plpgsql immutable as $$
begin
  if coalesce(jsonb_typeof(p #> path), 'missing') <> 'object' then
    raise exception '%: must be an object', array_to_string(path, '.');
  end if;
  return p #> path;
end $$;

create or replace function jr_cfg_num(p jsonb, path text[], lo numeric, hi numeric, whole boolean default true)
returns numeric
language plpgsql immutable as $$
declare
  k text := array_to_string(path, '.');
  n numeric;
begin
  if coalesce(jsonb_typeof(p #> path), 'missing') <> 'number' then
    raise exception '%: must be a number', k;
  end if;
  n := (p #>> path)::numeric;
  if n < lo or n > hi then raise exception '%: must be between % and % (got %)', k, lo, hi, n; end if;
  if whole and n <> trunc(n) then raise exception '%: must be a whole number', k; end if;
  return n;
end $$;

create or replace function jr_cfg_bool(p jsonb, path text[]) returns boolean
language plpgsql immutable as $$
begin
  if coalesce(jsonb_typeof(p #> path), 'missing') <> 'boolean' then
    raise exception '%: must be true or false', array_to_string(path, '.');
  end if;
  return (p #>> path)::boolean;
end $$;

create or replace function jr_cfg_enum(p jsonb, path text[], allowed text[]) returns text
language plpgsql immutable as $$
declare v text;
begin
  if coalesce(jsonb_typeof(p #> path), 'missing') <> 'string' then
    raise exception '%: must be one of %', array_to_string(path, '.'), array_to_string(allowed, ', ');
  end if;
  v := p #>> path;
  if not v = any(allowed) then
    raise exception '%: must be one of % (got "%")', array_to_string(path, '.'), array_to_string(allowed, ', '), v;
  end if;
  return v;
end $$;

-- List of non-empty strings with a length range. Returns the list length.
create or replace function jr_cfg_strs(p jsonb, path text[], min_n int default 0, max_n int default 500) returns int
language plpgsql immutable as $$
declare
  k text := array_to_string(path, '.');
  e jsonb;
  n int;
begin
  if coalesce(jsonb_typeof(p #> path), 'missing') <> 'array' then raise exception '%: must be a list', k; end if;
  for e in select * from jsonb_array_elements(p #> path) loop
    if coalesce(jsonb_typeof(e), 'missing') <> 'string' or coalesce(btrim(e #>> '{}'), '') = '' then
      raise exception '%: every entry must be a non-empty text', k;
    end if;
  end loop;
  n := jsonb_array_length(p #> path);
  if n < min_n then raise exception '%: needs at least % entr%', k, min_n, case when min_n = 1 then 'y' else 'ies' end; end if;
  if n > max_n then raise exception '%: % entries at most (got %)', k, max_n, n; end if;
  return n;
end $$;

create or replace function jr_validate_config(p jsonb) returns void
language plpgsql as $$
declare
  k        text;
  e        jsonb;
  w        numeric := 0;
  n        int;
  li_pages int;
  urls     int := 0;
  keys     text[] := '{}';
  top_keys text[] := array['rev','profile','search','experience','work_modes','visa','languages','opportunity',
                           'freshness','llm','scoring','sources'];
  src_keys text[] := array['remotive','remoteok','arbeitnow','weworkremotely','weworkremotely-mkt','n8n-community',
                           'jobicy','hn-whoishiring','himalayas','revopsroles','clay-community','remocate',
                           'working-nomads','linkedin','reddit','ats','boards'];
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'config: must be one JSON object'; end if;
  for k in select jsonb_object_keys(p) loop
    if not k = any(top_keys) then raise exception 'unknown_key: "%" is not a Job Radar section (typo?)', k; end if;
  end loop;
  foreach k in array top_keys loop
    if not p ? k then raise exception 'missing_key: "%" is required', k; end if;
  end loop;

  -- rev
  if coalesce(jsonb_typeof(p -> 'rev'), 'missing') <> 'string' or coalesce(btrim(p ->> 'rev'), '') = '' then
    raise exception 'rev: must be a non-empty text';
  end if;
  if length(p ->> 'rev') > 80 then raise exception 'rev: 80 characters at most'; end if;

  -- profile (sent to the LLM)
  perform jr_cfg_obj(p, '{profile}');
  perform jr_cfg_strs(p, '{profile,target_roles}', 1, 20);
  perform jr_cfg_strs(p, '{profile,skills}', 1, 60);
  if length((p -> 'profile')::text) > 4000 then raise exception 'profile: 4000 characters at most (it is sent with every LLM call)'; end if;

  -- search
  perform jr_cfg_obj(p, '{search}');
  perform jr_cfg_strs(p, '{search,role_terms}', 1, 200);
  perform jr_cfg_strs(p, '{search,title_block_terms}', 0, 200);
  perform jr_cfg_strs(p, '{search,skills}', 1, 200);
  perform jr_cfg_num(p, '{search,min_skill_hits}', 0, 10);
  foreach k in array array['title_senior_regex','title_junior_regex'] loop
    if coalesce(jsonb_typeof(p -> 'search' -> k), 'missing') <> 'string' or coalesce(btrim(p -> 'search' ->> k), '') = '' then
      raise exception 'search.%: must be a non-empty text (a JavaScript regex)', k;
    end if;
  end loop;

  -- experience
  perform jr_cfg_obj(p, '{experience}');
  perform jr_cfg_num(p, '{experience,max_years_required}', 0, 10);
  perform jr_cfg_enum(p, '{experience,unknown_policy}', array['keep','drop']);
  perform jr_cfg_strs(p, '{experience,seniority_ok}', 1, 20);

  -- work modes
  perform jr_cfg_obj(p, '{work_modes}');
  perform jr_cfg_bool(p, '{work_modes,remote,enabled}');
  perform jr_cfg_strs(p, '{work_modes,remote,regions_ok}', 0, 100);
  perform jr_cfg_strs(p, '{work_modes,remote,location_block}', 0, 200);
  perform jr_cfg_strs(p, '{work_modes,remote,desc_block}', 0, 200);
  perform jr_cfg_bool(p, '{work_modes,hybrid,enabled}');
  perform jr_cfg_bool(p, '{work_modes,hybrid,require_visa}');
  perform jr_cfg_bool(p, '{work_modes,onsite,enabled}');
  perform jr_cfg_bool(p, '{work_modes,onsite,require_visa}');
  perform jr_cfg_enum(p, '{work_modes,unknown_policy}', array['keep','drop']);
  if not ((p #>> '{work_modes,remote,enabled}')::boolean or (p #>> '{work_modes,hybrid,enabled}')::boolean
          or (p #>> '{work_modes,onsite,enabled}')::boolean) then
    raise exception 'work_modes: enable at least one of remote, hybrid, onsite';
  end if;

  -- visa
  perform jr_cfg_obj(p, '{visa}');
  perform jr_cfg_enum(p, '{visa,unknown_policy}', array['keep','drop']);
  perform jr_cfg_strs(p, '{visa,positive_terms}', 0, 200);
  perform jr_cfg_strs(p, '{visa,negative_terms}', 0, 200);
  perform jr_cfg_strs(p, '{visa,work_auth_terms}', 0, 200);
  perform jr_cfg_strs(p, '{visa,known_sponsors}', 0, 300);
  perform jr_cfg_strs(p, '{visa,target_countries}', 0, 60);

  -- languages
  perform jr_cfg_obj(p, '{languages}');
  perform jr_cfg_strs(p, '{languages,blocked}', 0, 40);
  perform jr_cfg_strs(p, '{languages,banned_phrases}', 0, 200);
  perform jr_cfg_bool(p, '{languages,detect_jd_language}');

  -- opportunity types
  perform jr_cfg_obj(p, '{opportunity}');
  if not (jr_cfg_bool(p, '{opportunity,jobs}') or jr_cfg_bool(p, '{opportunity,gigs}')) then
    raise exception 'opportunity: enable jobs, gigs or both';
  end if;
  perform jr_cfg_strs(p, '{opportunity,employment_types}', 1, 6);
  if p #> '{opportunity,block_phrases}' is not null then        -- optional (C6b): commission, rev share, partnership
    perform jr_cfg_strs(p, '{opportunity,block_phrases}', 0, 200);
  end if;
  for e in select * from jsonb_array_elements(p #> '{opportunity,employment_types}') loop
    if not (e #>> '{}') = any(array['full_time','part_time','contract','freelance','internship','unknown']) then
      raise exception 'opportunity.employment_types: unknown type "%"', e #>> '{}';
    end if;
  end loop;

  -- freshness and LLM budget (free-tier guards)
  perform jr_cfg_num(p, '{freshness,window_days}', 1, 30);
  perform jr_cfg_num(p, '{llm,slice_cap}', 1, 60);
  perform jr_cfg_num(p, '{llm,detail_cap}', 0, 80);
  perform jr_cfg_num(p, '{llm,max_per_source}', 1, 60);
  perform jr_cfg_num(p, '{llm,pace_ms}', 4000, 60000);
  perform jr_cfg_num(p, '{llm,max_desc_chars}', 1000, 6000);

  -- scoring
  perform jr_cfg_num(p, '{scoring,min_score}', 0, 100);
  perform jr_cfg_num(p, '{scoring,priority_score}', 0, 100);
  if (p #>> '{scoring,priority_score}')::numeric < (p #>> '{scoring,min_score}')::numeric then
    raise exception 'scoring.priority_score: must be >= scoring.min_score';
  end if;
  perform jr_cfg_obj(p, '{scoring,weights}');
  foreach k in array array['match','filterFit','feasibility','recency'] loop
    w := w + jr_cfg_num(p, array['scoring','weights',k], 0, 1, false);
  end loop;
  for k in select jsonb_object_keys(p #> '{scoring,weights}') loop
    if not k = any(array['match','filterFit','feasibility','recency']) then
      raise exception 'scoring.weights: unknown weight "%"', k;
    end if;
  end loop;
  if abs(w - 1) > 0.01 then raise exception 'scoring.weights: must add up to 1 (got %)', round(w, 3); end if;

  -- sources
  perform jr_cfg_obj(p, '{sources}');
  for k in select jsonb_object_keys(p -> 'sources') loop
    if not k = any(src_keys) then raise exception 'sources: unknown source "%" (typo?)', k; end if;
  end loop;
  foreach k in array src_keys loop
    if k = 'boards' then continue; end if;
    if not (p -> 'sources') ? k then raise exception 'sources.%: missing (set enabled false instead of deleting it)', k; end if;
    perform jr_cfg_bool(p, array['sources', k, 'enabled']);
  end loop;

  perform jr_cfg_enum(p, '{sources,linkedin,mode}', array['guest','apify','off']);
  li_pages := jr_cfg_num(p, '{sources,linkedin,max_pages}', 1, 3)::int;
  perform jr_cfg_bool(p, '{sources,linkedin,detail}');
  if coalesce(jsonb_typeof(p #> '{sources,linkedin,searches}'), 'missing') <> 'array' then
    raise exception 'sources.linkedin.searches: must be a list';
  end if;
  n := jsonb_array_length(p #> '{sources,linkedin,searches}');
  if n > 10 then raise exception 'sources.linkedin.searches: 10 searches at most (got %)', n; end if;
  if n * li_pages > 20 then
    raise exception 'sources.linkedin: searches x max_pages must stay <= 20 requests a run (got %)', n * li_pages;
  end if;
  for e in select * from jsonb_array_elements(p #> '{sources,linkedin,searches}') loop
    if coalesce(btrim(e ->> 'keywords'), '') = '' then raise exception 'sources.linkedin.searches: every search needs keywords'; end if;
    if coalesce(jsonb_typeof(e -> 'work_types'), 'missing') <> 'array' or jsonb_array_length(e -> 'work_types') = 0 then
      raise exception 'sources.linkedin.searches: "%" needs work_types (remote, hybrid, onsite)', e ->> 'keywords';
    end if;
    if exists (select 1 from jsonb_array_elements_text(e -> 'work_types') t where t not in ('remote','hybrid','onsite')) then
      raise exception 'sources.linkedin.searches: "%" has an unknown work type', e ->> 'keywords';
    end if;
    if e ? 'experience' and exists (select 1 from jsonb_array_elements_text(e -> 'experience') t
                                    where t not in ('internship','entry','associate','mid_senior','director','executive')) then
      raise exception 'sources.linkedin.searches: "%" has an unknown experience level', e ->> 'keywords';
    end if;
  end loop;

  perform jr_cfg_enum(p, '{sources,reddit,mode}', array['tavily','off']);
  perform jr_cfg_enum(p, '{sources,reddit,time_range}', array['day','week']);
  perform jr_cfg_num(p, '{sources,reddit,max_queries}', 0, 10);
  perform jr_cfg_strs(p, '{sources,reddit,subreddits}', 0, 60);
  perform jr_cfg_strs(p, '{sources,reddit,queries}', 0, 20);

  perform jr_cfg_num(p, '{sources,ats,max_per_company}', 1, 100);
  if coalesce(jsonb_typeof(p #> '{sources,ats,companies}'), 'missing') <> 'array' then
    raise exception 'sources.ats.companies: must be a list';
  end if;
  if jsonb_array_length(p #> '{sources,ats,companies}') > 60 then raise exception 'sources.ats.companies: 60 at most'; end if;
  for e in select * from jsonb_array_elements(p #> '{sources,ats,companies}') loop
    if coalesce(btrim(e ->> 'name'), '') = '' or coalesce(btrim(e ->> 'token'), '') = ''
       or coalesce(e ->> 'ats', '') not in ('greenhouse','lever','ashby') then
      raise exception 'sources.ats.companies: every company needs name, token and ats (greenhouse, lever or ashby)';
    end if;
  end loop;

  if coalesce(jsonb_typeof(p #> '{sources,boards}'), 'missing') <> 'array' then raise exception 'sources.boards: must be a list'; end if;
  for e in select * from jsonb_array_elements(p #> '{sources,boards}') loop
    if coalesce(e ->> 'key', '') !~ '^[a-z0-9-]{2,40}$' then
      raise exception 'sources.boards: key "%" must be 2-40 lowercase letters, digits or dashes', e ->> 'key';
    end if;
    if (e ->> 'key') = any(keys) or (e ->> 'key') = any(src_keys) then
      raise exception 'sources.boards: key "%" is used twice', e ->> 'key';
    end if;
    keys := keys || (e ->> 'key');
    if coalesce(jsonb_typeof(e -> 'enabled'), 'missing') <> 'boolean' then raise exception 'sources.boards.%: enabled must be true or false', e ->> 'key'; end if;
    if coalesce(e ->> 'cadence', '') not in ('daily','weekly') then raise exception 'sources.boards.%: cadence must be daily or weekly', e ->> 'key'; end if;
    if coalesce(e ->> 'detail', '') not in ('jina','none') then raise exception 'sources.boards.%: detail must be jina or none', e ->> 'key'; end if;
    if coalesce(btrim(e ->> 'job_url_regex'), '') = '' then raise exception 'sources.boards.%: job_url_regex is required', e ->> 'key'; end if;
    if coalesce(jsonb_typeof(e -> 'max_items'), 'missing') <> 'number' or (e ->> 'max_items')::numeric not between 1 and 60 then
      raise exception 'sources.boards.%: max_items must be 1 to 60', e ->> 'key';
    end if;
    if coalesce(jsonb_typeof(e -> 'list_urls'), 'missing') <> 'array' or jsonb_array_length(e -> 'list_urls') not between 1 and 6 then
      raise exception 'sources.boards.%: list_urls needs 1 to 6 URLs', e ->> 'key';
    end if;
    if exists (select 1 from jsonb_array_elements_text(e -> 'list_urls') u where u !~ '^https://') then
      raise exception 'sources.boards.%: every list URL must start with https://', e ->> 'key';
    end if;
    if (e ->> 'enabled')::boolean then urls := urls + jsonb_array_length(e -> 'list_urls'); end if;
  end loop;
  if urls > 30 then
    raise exception 'sources.boards: enabled boards may fetch 30 list pages a run at most (got %): keeps Jina under its free rate limit', urls;
  end if;
end $$;

-- Saves a new config version and returns its id. Errors are readable: the console shows them verbatim.
create or replace function jr_save_config(p_text text, p_note text default null, p_actor text default 'console')
returns bigint
language plpgsql as $$
declare
  p      jsonb;
  prev   jr_config_versions%rowtype;
  new_id bigint;
begin
  begin
    p := p_text::jsonb;
  exception when others then
    raise exception 'invalid_json: %', sqlerrm;
  end;
  perform jr_validate_config(p);
  select * into prev from jr_config_versions order by id desc limit 1;
  if found and prev.rev = p ->> 'rev' then raise exception 'rev_unchanged: bump "rev" before saving'; end if;
  if exists (select 1 from jr_config_versions where rev = p ->> 'rev') then
    raise exception 'rev_exists: rev "%" was used before, pick a new one', p ->> 'rev';
  end if;
  insert into jr_config_versions (rev, payload_text, note, created_by)
  values (p ->> 'rev', p_text, p_note, coalesce(p_actor, 'console'))
  returning id into new_id;
  insert into jr_events (entity, entity_id, action, before, after, actor)
  values ('config', new_id::text, 'save',
          case when prev.id is null then null else jsonb_build_object('rev', prev.rev) end,
          jsonb_build_object('rev', p ->> 'rev', 'note', p_note), coalesce(p_actor, 'console'));
  return new_id;
end $$;

-- Seed: version 1 = config/default_config_v2.json (validated on insert).
do $seed$
declare cfg text := $cfg${
  "rev": "v2-001",
  "profile": {
    "headline": "Software engineering graduate (Diplome National d'Ingenieur, Master's-equivalent) pivoting to GTM automation engineering. 6-month Business Analyst and Software Engineer internship at a Berlin B2B SaaS startup building GTM workflows (FastAPI, Supabase, LLM routing, Apify, Tavily).",
    "seniority": "entry/junior: 0 years full-time, one 6-month production internship plus three short internships",
    "target_roles": [
      "GTM Engineer (junior)",
      "GTM, sales or marketing automation engineer",
      "RevOps or sales ops associate",
      "CRM or HubSpot specialist",
      "n8n, Make or Zapier automation specialist",
      "Clay specialist",
      "Integration engineer (junior)",
      "Technical business analyst"
    ],
    "skills": [
      "n8n",
      "Clay",
      "HubSpot",
      "Apify",
      "Tavily",
      "Python",
      "FastAPI",
      "SQL",
      "PostgreSQL",
      "Neon",
      "Supabase",
      "REST APIs",
      "webhooks",
      "LLM routing and RAG pipelines",
      "Next.js",
      "Docker",
      "Git",
      "requirements engineering",
      "BPMN"
    ],
    "languages": {
      "english": "professional working",
      "arabic": "native",
      "french": "reading only"
    },
    "location": "Tunisia (GMT+1)",
    "constraints": "Remote (worldwide, EMEA or Europe) as employee or contractor. Hybrid or on-site only with visa sponsorship or relocation support. Freelance, contract and small paid tasks are welcome."
  },
  "search": {
    "role_terms": [
      "gtm engineer",
      "go-to-market engineer",
      "gtm engineering",
      "growth engineer",
      "automation",
      "automations",
      "revops",
      "revenue operations",
      "sales operations",
      "sales ops",
      "marketing operations",
      "marketing ops",
      "gtm operations",
      "business operations",
      "crm",
      "hubspot",
      "salesforce admin",
      "clay",
      "n8n",
      "zapier",
      "make.com",
      "workflow",
      "integration",
      "integrations",
      "no-code",
      "low-code",
      "technical business analyst",
      "business systems",
      "systems analyst",
      "data operations",
      "lead generation engineer",
      "outbound engineer",
      "automate",
      "web scraping",
      "lead generation",
      "outbound"
    ],
    "title_block_terms": [
      "account executive",
      "sdr",
      "bdr",
      "sales development",
      "business development representative",
      "appointment setter",
      "cold caller",
      "closer",
      "recruiter",
      "customer success manager",
      "copywriter",
      "graphic designer",
      "video editor"
    ],
    "title_senior_regex": "\\b(senior|sr\\.?|staff|principal|lead(?!\\s*-?\\s*(?:gen|generation|enrichment|scoring|routing|management|qualification|nurtur|list|data|research|magnet|sourcing|capture|flow))|head of|director|vp|vice president|chief|manager|founding|ii|iii|iv)\\b",
    "title_junior_regex": "\\b(junior|jr\\.?|entry|entry[- ]level|graduate|grad|intern|internship|apprentice|trainee|working student|werkstudent)\\b",
    "skills": [
      "python",
      "fastapi",
      "n8n",
      "api",
      "apis",
      "integration",
      "automation",
      "javascript",
      "gtm",
      "revops",
      "business analyst",
      "clay",
      "hubspot",
      "salesforce",
      "zapier",
      "make.com",
      "enrichment",
      "workflow",
      "webhook",
      "webhooks",
      "sql",
      "postgres",
      "apify",
      "crm",
      "llm",
      "outbound"
    ],
    "min_skill_hits": 2
  },
  "experience": {
    "max_years_required": 0,
    "unknown_policy": "keep",
    "seniority_ok": [
      "intern",
      "internship",
      "entry",
      "entry-level",
      "junior",
      "entry/junior",
      "graduate",
      "associate",
      "unknown"
    ]
  },
  "work_modes": {
    "remote": {
      "enabled": true,
      "regions_ok": [
        "worldwide",
        "anywhere",
        "global",
        "emea",
        "europe",
        "eu",
        "european union",
        "africa",
        "north africa",
        "mena",
        "middle east",
        "tunisia",
        "gmt",
        "cet",
        "utc",
        "international"
      ],
      "location_block": [
        "united states",
        "usa",
        "us",
        "u.s.",
        "canada",
        "north america",
        "americas",
        "latin america",
        "latam",
        "brazil",
        "mexico",
        "argentina",
        "colombia",
        "australia",
        "new zealand",
        "india",
        "philippines",
        "pakistan",
        "apac",
        "asia",
        "singapore",
        "japan"
      ],
      "desc_block": [
        "us only",
        "usa only",
        "u.s. only",
        "united states only",
        "us-based only",
        "must be based in the us",
        "must be located in the us",
        "must reside in the us",
        "must live in the us",
        "north america only",
        "canada only",
        "latam only",
        "apac only",
        "uk only",
        "must be based in the uk",
        "must reside in the uk"
      ]
    },
    "hybrid": {
      "enabled": true,
      "require_visa": true
    },
    "onsite": {
      "enabled": true,
      "require_visa": true
    },
    "unknown_policy": "keep"
  },
  "visa": {
    "unknown_policy": "drop",
    "positive_terms": [
      "visa sponsorship available",
      "visa sponsorship is available",
      "visa sponsorship provided",
      "visa sponsorship offered",
      "offer visa sponsorship",
      "offers visa sponsorship",
      "provide visa sponsorship",
      "we sponsor visas",
      "we can sponsor visas",
      "we sponsor work visas",
      "sponsor your visa",
      "sponsor your work visa",
      "sponsor a visa",
      "visa support",
      "visa assistance",
      "relocation support",
      "relocation package",
      "relocation assistance",
      "relocation bonus",
      "help with relocation",
      "support your relocation",
      "blue card",
      "work permit support",
      "work permit sponsorship",
      "skilled worker visa",
      "sponsorship is available",
      "open to sponsoring"
    ],
    "negative_terms": [
      "no visa sponsorship",
      "not offer visa sponsorship",
      "not provide visa sponsorship",
      "unable to sponsor",
      "not able to sponsor",
      "cannot sponsor",
      "can't sponsor",
      "can not sponsor",
      "do not sponsor",
      "does not sponsor",
      "will not sponsor",
      "won't sponsor",
      "not sponsor visas",
      "without sponsorship",
      "without visa sponsorship",
      "no sponsorship",
      "sponsorship is not available",
      "not eligible for sponsorship"
    ],
    "work_auth_terms": [
      "right to work in the uk",
      "right to work in the us",
      "right to work in the eu",
      "right to work in the european union",
      "authorized to work in the united states",
      "authorized to work in the us",
      "authorised to work in the uk",
      "eligible to work in the us",
      "eligible to work in the uk",
      "eligible to work in the eu",
      "us citizens only",
      "u.s. citizens only",
      "us citizenship required",
      "security clearance",
      "green card holders",
      "valid eu work permit",
      "eu work permit required",
      "existing work permit"
    ],
    "known_sponsors": [
      "Bolt",
      "Wolt",
      "Scalable Capital",
      "Taxfix",
      "NavVis",
      "JustDice",
      "gridX",
      "Forto",
      "AUTO1 Group",
      "Plata"
    ],
    "target_countries": []
  },
  "languages": {
    "blocked": [
      "german",
      "french",
      "dutch",
      "spanish",
      "italian",
      "polish",
      "portuguese",
      "swedish",
      "danish",
      "norwegian",
      "finnish"
    ],
    "banned_phrases": [
      "german required",
      "french required",
      "fluent german",
      "fluent french",
      "fluent dutch",
      "deutschkenntnisse",
      "verhandlungssicher",
      "native german",
      "native french",
      "c1 german",
      "german c1",
      "german (c1)",
      "french (c1)"
    ],
    "detect_jd_language": true
  },
  "opportunity": {
    "jobs": true,
    "gigs": true,
    "employment_types": [
      "full_time",
      "part_time",
      "contract",
      "freelance",
      "internship",
      "unknown"
    ],
    "block_phrases": [
      "commission only",
      "commission-only",
      "commission based",
      "commission-based",
      "commission basis",
      "pure commission",
      "100% commission",
      "revenue share",
      "revenue sharing",
      "rev share",
      "rev-share",
      "revshare",
      "profit share",
      "profit sharing",
      "per attended call",
      "per attended meeting",
      "per booked call",
      "per booked meeting",
      "per qualified meeting",
      "per meeting booked",
      "pay per meeting",
      "pay-per-meeting",
      "pay per appointment",
      "pay-per-appointment",
      "per appointment set",
      "referral partner",
      "referral partners",
      "sales partner",
      "sales partners",
      "affiliate partner",
      "white label partner",
      "white-label partner",
      "looking to partner",
      "partnership opportunity",
      "equity only",
      "equity-only",
      "unpaid internship",
      "unpaid position",
      "unpaid role",
      "volunteer position"
    ]
  },
  "freshness": {
    "window_days": 7
  },
  "llm": {
    "slice_cap": 40,
    "detail_cap": 40,
    "max_per_source": 12,
    "pace_ms": 15000,
    "max_desc_chars": 3500
  },
  "scoring": {
    "min_score": 65,
    "priority_score": 80,
    "weights": {
      "match": 0.4,
      "filterFit": 0.25,
      "feasibility": 0.2,
      "recency": 0.15
    }
  },
  "sources": {
    "remotive": {
      "enabled": true
    },
    "remoteok": {
      "enabled": true
    },
    "arbeitnow": {
      "enabled": true,
      "visa_only": true
    },
    "weworkremotely": {
      "enabled": true
    },
    "weworkremotely-mkt": {
      "enabled": true
    },
    "n8n-community": {
      "enabled": true
    },
    "jobicy": {
      "enabled": true
    },
    "hn-whoishiring": {
      "enabled": true
    },
    "himalayas": {
      "enabled": true,
      "queries": [
        {
          "q": "gtm engineer"
        },
        {
          "q": "automation engineer"
        },
        {
          "q": "revenue operations"
        },
        {
          "q": "marketing operations"
        },
        {
          "q": "automation engineer",
          "seniority": "Entry-level"
        }
      ]
    },
    "revopsroles": {
      "enabled": true
    },
    "clay-community": {
      "enabled": true
    },
    "remocate": {
      "enabled": true,
      "categories": [
        "sales",
        "marketing",
        "analytics",
        "manager"
      ]
    },
    "working-nomads": {
      "enabled": true
    },
    "linkedin": {
      "enabled": true,
      "mode": "guest",
      "max_pages": 2,
      "detail": true,
      "searches": [
        {
          "keywords": "GTM engineer",
          "location": "Worldwide",
          "work_types": [
            "remote"
          ],
          "experience": [
            "internship",
            "entry"
          ]
        },
        {
          "keywords": "automation engineer n8n",
          "location": "Worldwide",
          "work_types": [
            "remote"
          ],
          "experience": [
            "internship",
            "entry"
          ]
        },
        {
          "keywords": "revenue operations",
          "location": "European Union",
          "work_types": [
            "remote"
          ],
          "experience": [
            "internship",
            "entry"
          ]
        },
        {
          "keywords": "HubSpot automation",
          "location": "European Union",
          "work_types": [
            "remote"
          ],
          "experience": [
            "internship",
            "entry"
          ]
        },
        {
          "keywords": "GTM engineer visa sponsorship",
          "location": "European Union",
          "work_types": [
            "hybrid",
            "onsite"
          ],
          "experience": [
            "internship",
            "entry"
          ]
        },
        {
          "keywords": "marketing automation relocation",
          "location": "European Union",
          "work_types": [
            "hybrid",
            "onsite"
          ],
          "experience": [
            "internship",
            "entry"
          ]
        }
      ]
    },
    "reddit": {
      "enabled": true,
      "mode": "tavily",
      "time_range": "day",
      "max_queries": 6,
      "subreddits": [
        "forhire",
        "B2BForHire",
        "ForHireFreelance",
        "freelance",
        "GTMbuilders",
        "gtmengineering",
        "RemoteJobs",
        "startups",
        "hiring",
        "jobbit",
        "n8n",
        "automation",
        "hubspot",
        "SalesOperations",
        "remotework"
      ],
      "queries": [
        "[Hiring] n8n OR Make OR Zapier automation freelancer r/forhire",
        "[Hiring] Clay OR HubSpot OR CRM automation specialist reddit",
        "hiring GTM engineer r/gtmengineering OR r/GTMbuilders",
        "hiring automation specialist remote r/RemoteJobs OR r/hiring",
        "B2B hiring lead generation automation r/B2BForHire",
        "n8n developer needed hiring r/n8n"
      ]
    },
    "ats": {
      "enabled": true,
      "max_per_company": 30,
      "companies": []
    },
    "boards": [
      {
        "key": "gtmjobs-xyz",
        "label": "GTM Jobs (gtmjobs.xyz)",
        "enabled": true,
        "cadence": "daily",
        "max_items": 40,
        "detail": "jina",
        "list_urls": [
          "https://gtmjobs.xyz/jobs/location/remote",
          "https://gtmjobs.xyz/jobs/tools/n8n",
          "https://gtmjobs.xyz/jobs/tools/clay"
        ],
        "job_url_regex": "https?://(?:www\\.)?gtmjobs\\.xyz/jobs/(?!location/|tools/|page/|hubs)[a-z0-9-]+-rec[a-z0-9]{8,}"
      },
      {
        "key": "gtmjobshq",
        "label": "GTM Jobs HQ",
        "enabled": true,
        "cadence": "daily",
        "max_items": 40,
        "detail": "jina",
        "list_urls": [
          "https://gtmjobshq.com/jobs?category=GTM%20Engineering",
          "https://gtmjobshq.com/jobs?category=Revenue%20Operations"
        ],
        "job_url_regex": "https?://(?:www\\.)?gtmjobshq\\.com/jobs/[0-9a-f-]{36}"
      },
      {
        "key": "upliftgtm",
        "label": "Uplift GTM",
        "enabled": true,
        "cadence": "daily",
        "max_items": 50,
        "detail": "jina",
        "list_urls": [
          "https://upliftgtm.com/remote-jobs",
          "https://upliftgtm.com/jobs?all=1"
        ],
        "job_url_regex": "https?://(?:www\\.)?upliftgtm\\.com/jobs/[a-z0-9-]+-[a-z0-9]{6}(?=[)\\s?#]|$)"
      },
      {
        "key": "revopscareers",
        "label": "RevOps Careers",
        "enabled": true,
        "cadence": "daily",
        "max_items": 40,
        "detail": "jina",
        "list_urls": [
          "https://revopscareers.com/gtm-jobs/",
          "https://revopscareers.com/clay-jobs/",
          "https://revopscareers.com/remote-jobs/"
        ],
        "job_url_regex": "https?://(?:www\\.)?revopscareers\\.com/job/[a-z0-9-]+/?"
      },
      {
        "key": "cargo",
        "label": "Cargo GTM job board",
        "enabled": true,
        "cadence": "weekly",
        "max_items": 40,
        "detail": "jina",
        "list_urls": [
          "https://www.getcargo.ai/jobs"
        ],
        "job_url_regex": "https?://(?:jobs\\.ashbyhq\\.com|job-boards(?:\\.eu)?\\.greenhouse\\.io|boards\\.greenhouse\\.io|jobs\\.lever\\.co|apply\\.workable\\.com|[a-z0-9-]+\\.workable\\.com|www\\.linkedin\\.com/jobs/view)/[^\\s)\\]\"']+"
      },
      {
        "key": "gtm-quest",
        "label": "GTM Quest",
        "enabled": true,
        "cadence": "daily",
        "max_items": 50,
        "detail": "jina",
        "list_urls": [
          "https://gtm.quest/gtm-jobs"
        ],
        "job_url_regex": "https?://(?:jobs\\.ashbyhq\\.com|job-boards(?:\\.eu)?\\.greenhouse\\.io|boards\\.greenhouse\\.io|jobs\\.lever\\.co|apply\\.workable\\.com|[a-z0-9-]+\\.workable\\.com|careers-page\\.com|[a-z0-9-]+\\.bamboohr\\.com/careers|[a-z0-9.-]+\\.myworkdayjobs\\.com|[a-z0-9-]+\\.icims\\.com/jobs)/[^\\s)\\]\"']+"
      },
      {
        "key": "clay-job-board",
        "label": "Clay GTM job board",
        "enabled": false,
        "cadence": "daily",
        "max_items": 40,
        "detail": "jina",
        "list_urls": [
          "https://www.clay.com/job-board"
        ],
        "job_url_regex": "https?://(?:www\\.)?clay\\.com/job-board/[a-z0-9-]+"
      },
      {
        "key": "adamgtm",
        "label": "adamgtm index (jobs)",
        "enabled": false,
        "cadence": "weekly",
        "max_items": 30,
        "detail": "jina",
        "list_urls": [
          "https://adamgtm.com/index/"
        ],
        "job_url_regex": "https?://(?:jobs\\.ashbyhq\\.com|job-boards(?:\\.eu)?\\.greenhouse\\.io|boards\\.greenhouse\\.io|jobs\\.lever\\.co|apply\\.workable\\.com)/[^\\s)\\]\"']+"
      },
      {
        "key": "gtmfund",
        "label": "GTMfund portfolio jobs (gtmnow.com/jobs)",
        "enabled": false,
        "cadence": "daily",
        "max_items": 40,
        "detail": "jina",
        "list_urls": [
          "https://jobs.gtmfund.com/jobs"
        ],
        "job_url_regex": "https?://jobs\\.gtmfund\\.com/companies/[^/\\s)]+/jobs/[0-9]+[^\\s)\\]\"']*"
      },
      {
        "key": "startup-jobs",
        "label": "startup.jobs",
        "enabled": false,
        "cadence": "daily",
        "max_items": 40,
        "detail": "jina",
        "list_urls": [
          "https://startup.jobs/?q=gtm%20engineer",
          "https://startup.jobs/?q=automation%20engineer"
        ],
        "job_url_regex": "https?://(?:www\\.)?startup\\.jobs/[a-z0-9-]+-\\d{4,}"
      },
      {
        "key": "contra",
        "label": "Contra featured jobs",
        "enabled": false,
        "cadence": "weekly",
        "max_items": 30,
        "detail": "jina",
        "list_urls": [
          "https://contra.com/featured-jobs/freelance-coding-jobs",
          "https://contra.com/featured-jobs/freelance-marketing-jobs"
        ],
        "job_url_regex": "https?://contra\\.com/(?:opportunity|opportunities|job|jobs)/[A-Za-z0-9-]+"
      }
    ]
  }
}$cfg$;
begin
  if not exists (select 1 from jr_config_versions) then
    perform jr_validate_config(cfg::jsonb);
    insert into jr_config_versions (rev, payload_text, note, created_by)
    values (cfg::jsonb ->> 'rev', cfg, 'v2 seed: config/default_config_v2.json', 'schema');
  end if;
end $seed$;

create or replace view v_jr_active_config as
select id, rev, payload, payload_text, note, created_at
from jr_config_versions
where id = (select max(id) from jr_config_versions);

-- ---------- engine functions (called from n8n) --------------------------

-- Schedule guard. Returns 'schedule', 'requested' or 'none'.
-- Side effect on purpose: a run still 'running' after 2 hours is marked failed
-- (laptop slept or n8n restarted mid-run), so it can never block the radar.
create or replace function jr_should_run(p_tz text default 'Africa/Tunis') returns text
language plpgsql as $$
declare
  v_paused    boolean := coalesce((select value from jr_settings where key = 'paused'), 'false') = 'true';
  v_req       timestamptz := jr_ts((select value from jr_settings where key = 'run_requested_at'));
  v_day_start timestamptz := date_trunc('day', now() at time zone p_tz) at time zone p_tz;
  v_done      int;
begin
  update jr_runs set status = 'failed', finished_at = now(),
         warnings = concat_ws('; ', warnings, 'stale: no finish within 2 hours')
  where status = 'running' and started_at < now() - interval '2 hours';
  if exists (select 1 from jr_runs where status = 'running') then return 'none'; end if;
  select count(*) into v_done from jr_runs where status = 'completed' and started_at >= v_day_start;
  if v_req is not null and v_req > now() - interval '1 day' and v_done < 3 then return 'requested'; end if;
  if v_paused then return 'none'; end if;
  if v_done = 0 then return 'schedule'; end if;
  return 'none';
end $$;

-- Opens a run and returns everything the workflow needs in one round trip:
-- run_id, active config, and when each source last fetched something (for weekly cadence).
create or replace function jr_start_run(p_trigger text default 'manual') returns jsonb
language plpgsql as $$
declare
  v_trigger text := case when p_trigger in ('schedule','requested','manual') then p_trigger else 'manual' end;
  c         v_jr_active_config%rowtype;
  v_run     bigint;
  v_last    jsonb;
begin
  select * into c from v_jr_active_config;
  if not found then raise exception 'no_config: jr_config_versions is empty, apply the schema seed'; end if;
  insert into jr_runs (trigger, config_rev) values (v_trigger, c.rev) returning run_id into v_run;
  if v_trigger = 'requested' then
    update jr_settings set value = '', updated_at = now() where key = 'run_requested_at';
  end if;
  select coalesce(jsonb_object_agg(t.k, t.last_ok), '{}'::jsonb) into v_last
  from (select s.key as k, max(r.started_at) as last_ok
        from jr_runs r cross join lateral jsonb_each(r.source_stats) s
        where r.status = 'completed' and r.started_at > now() - interval '21 days'
          and jsonb_typeof(s.value) = 'object' and coalesce(jr_int(s.value ->> 'fetched'), 0) > 0
        group by s.key) t;
  return jsonb_build_object('run_id', v_run, 'trigger', v_trigger, 'rev', c.rev, 'config', c.payload,
                            'last_ok', v_last, 'started_at', now());
end $$;

-- Records every normalized posting after gate A and returns the ones the pipeline should process:
--   new URL that passed gate A                         -> inserted as queued, returned
--   new URL, same company+title seen in last 30 days   -> inserted as duplicate, not returned
--   new URL that failed gate A                         -> inserted as dropped_a, not returned
--   known URL still queued, skipped_cap or llm_failed  -> returned again (retry), or dropped_a if gate A now drops it
--   known URL dropped by gate A or B under another rev -> re-evaluated: queued and returned if gate A passes now
--   anything else (matched, scored, duplicate)         -> ignored
-- p: JSON array of {url, source, kind, title, company, location_raw, work_mode, employment_type,
--                   posted_date, gate: "pass"|"drop", reason, detail}
create or replace function jr_ingest(p_run_id bigint, p_rev text, p jsonb)
returns table (posting_id text, url text, retry boolean)
language plpgsql as $$
declare
  r       jsonb;
  v_url   text;
  v_id    text;
  v_dupe  text;
  v_pass  boolean;
  cur     jr_postings%rowtype;
begin
  if coalesce(jsonb_typeof(p), 'missing') <> 'array' then raise exception 'ingest: payload must be a JSON array'; end if;
  for r in select * from jsonb_array_elements(p) loop
    v_url := nullif(btrim(r ->> 'url'), '');
    continue when v_url is null;
    v_id   := left(md5(v_url), 16);
    v_pass := coalesce(r ->> 'gate', 'drop') = 'pass';
    select * into cur from jr_postings jp where jp.posting_id = v_id;
    if not found then
      v_dupe := jr_dupe_key(r ->> 'company', r ->> 'title');
      if v_pass and v_dupe is not null and exists (
           select 1 from jr_postings d where d.dupe_key = v_dupe and d.first_seen_at > now() - interval '30 days') then
        insert into jr_postings (posting_id, url, dupe_key, source, kind, title, company, location_raw, work_mode,
                                 employment_type, posted_at, first_run_id, last_run_id, gate_rev, stage, reason)
        values (v_id, v_url, v_dupe, coalesce(nullif(r ->> 'source', ''), 'unknown'),
                case when r ->> 'kind' = 'gig' then 'gig' else 'job' end,
                left(r ->> 'title', 300), left(r ->> 'company', 200), left(r ->> 'location_raw', 300),
                nullif(r ->> 'work_mode', ''), nullif(r ->> 'employment_type', ''), jr_ts(r ->> 'posted_date'),
                p_run_id, p_run_id, p_rev, 'duplicate', 'same_company_title')
        on conflict do nothing;
        continue;
      end if;
      insert into jr_postings (posting_id, url, dupe_key, source, kind, title, company, location_raw, work_mode,
                               employment_type, posted_at, first_run_id, last_run_id, gate_rev, stage, reason, reason_detail)
      values (v_id, v_url, v_dupe, coalesce(nullif(r ->> 'source', ''), 'unknown'),
              case when r ->> 'kind' = 'gig' then 'gig' else 'job' end,
              left(r ->> 'title', 300), left(r ->> 'company', 200), left(r ->> 'location_raw', 300),
              nullif(r ->> 'work_mode', ''), nullif(r ->> 'employment_type', ''), jr_ts(r ->> 'posted_date'),
              p_run_id, p_run_id, p_rev,
              case when v_pass then 'queued' else 'dropped_a' end,
              case when v_pass then null else nullif(r ->> 'reason', '') end,
              case when v_pass then null else left(r ->> 'detail', 300) end)
      on conflict do nothing;
      if v_pass and found then
        posting_id := v_id; url := v_url; retry := false; return next;
      end if;
    elsif cur.stage in ('queued', 'skipped_cap', 'llm_failed') then
      if v_pass then
        update jr_postings set last_run_id = p_run_id, gate_rev = p_rev where jr_postings.posting_id = v_id;
        posting_id := v_id; url := v_url; retry := true; return next;
      else
        update jr_postings set stage = 'dropped_a', reason = nullif(r ->> 'reason', ''), reason_detail = left(r ->> 'detail', 300),
               last_run_id = p_run_id, gate_rev = p_rev
        where jr_postings.posting_id = v_id;
      end if;
    elsif cur.stage in ('dropped_a', 'dropped_b') and cur.gate_rev is distinct from p_rev then
      if v_pass then
        update jr_postings set stage = 'queued', reason = null, reason_detail = null, attempts = 0,
               last_run_id = p_run_id, gate_rev = p_rev
        where jr_postings.posting_id = v_id;
        posting_id := v_id; url := v_url; retry := true; return next;
      else
        update jr_postings set reason = nullif(r ->> 'reason', ''), reason_detail = left(r ->> 'detail', 300),
               stage = 'dropped_a', last_run_id = p_run_id, gate_rev = p_rev
        where jr_postings.posting_id = v_id;
      end if;
    end if;
  end loop;
end $$;

-- Records stage changes after gate B and the LLM, and inserts matches. One call per run.
-- p: {"updates": [{posting_id, stage, reason, detail, final_score, attempt}],
--     "matches": [{posting_id, url, title, company, ... match fields}]}
-- updates.stage: dropped_b | skipped_cap | queued (deferred, attempt=true counts a failed detail fetch)
--                | dropped_llm | below_score | llm_failed | matched
create or replace function jr_record_postings(p_run_id bigint, p_rev text, p jsonb) returns jsonb
language plpgsql as $$
declare
  r        jsonb;
  v_stage  text;
  n_upd    int := 0;
  n_match  int := 0;
  n_given  int := 0;
  n_gave_up int := 0;
  n_dup    int := 0;
  v_dupe   text;
  v_first  text;
  k        int;
begin
  for r in select * from jsonb_array_elements(coalesce(p -> 'updates', '[]'::jsonb)) loop
    v_stage := r ->> 'stage';
    if v_stage not in ('dropped_b','skipped_cap','queued','dropped_llm','below_score','llm_failed','matched') then
      raise exception 'record_postings: stage "%" cannot be set by the engine', v_stage;
    end if;
    update jr_postings set
      stage         = case when v_stage = 'queued' and coalesce(jr_bool(r ->> 'attempt'), false) and attempts + 1 >= 3
                           then 'dropped_b' else v_stage end,
      reason        = case when v_stage = 'queued' and coalesce(jr_bool(r ->> 'attempt'), false) and attempts + 1 >= 3
                           then 'no_description' else nullif(r ->> 'reason', '') end,
      reason_detail = left(r ->> 'detail', 300),
      attempts      = attempts + case when coalesce(jr_bool(r ->> 'attempt'), false) then 1 else 0 end,
      final_score   = coalesce(jr_int(r ->> 'final_score'), final_score),
      last_run_id   = p_run_id,
      gate_rev      = p_rev
    where posting_id = r ->> 'posting_id'
      and stage in ('queued','skipped_cap','llm_failed');      -- never touch decided rows
    get diagnostics k = row_count;
    n_upd := n_upd + k;
  end loop;
  select count(*) into n_gave_up from jr_postings where last_run_id = p_run_id and reason = 'no_description';

  for r in select * from jsonb_array_elements(coalesce(p -> 'matches', '[]'::jsonb)) loop
    continue when nullif(btrim(r ->> 'url'), '') is null;
    n_given := n_given + 1;
    -- Same company and title already matched from another board in the last 30 days: keep the first one.
    -- Board postings arrive with company "unknown", so this is the first point where the dupe key exists.
    v_dupe := jr_dupe_key(r ->> 'company', r ->> 'title');
    v_first := null;
    if v_dupe is not null then
      select m.url into v_first from jr_matches m
      where m.url <> r ->> 'url' and m.run_date > now() - interval '30 days'
        and jr_dupe_key(m.company, m.title) = v_dupe
      order by m.run_date limit 1;
    end if;
    if v_first is not null then
      update jr_postings set stage = 'duplicate', reason = 'same_company_title', reason_detail = left('same job as ' || v_first, 300),
             dupe_key = v_dupe, final_score = jr_int(r ->> 'final_score'), last_run_id = p_run_id, gate_rev = p_rev
      where posting_id = coalesce(nullif(r ->> 'posting_id', ''), left(md5(r ->> 'url'), 16));
      n_dup := n_dup + 1;
      continue;
    end if;
    insert into jr_matches (match_id, url, run_id, source, kind, title, company, location_raw, work_mode, employment_type,
      posted_date, final_score, priority, why_match, red_flags, seniority, min_years_required, experience_evidence,
      languages_required, visa_status, remote_region, contract_friendly, company_size_hint, salary, confidence, provider,
      score_breakdown, config_rev)
    values (coalesce(nullif(r ->> 'posting_id', ''), left(md5(r ->> 'url'), 16)), r ->> 'url', p_run_id,
      nullif(r ->> 'source', ''), case when r ->> 'kind' = 'gig' then 'gig' else 'job' end,
      left(r ->> 'title', 300), left(r ->> 'company', 200), left(r ->> 'location_raw', 300),
      nullif(r ->> 'work_mode', ''), nullif(r ->> 'employment_type', ''), jr_ts(r ->> 'posted_date'),
      jr_int(r ->> 'final_score'), coalesce(jr_bool(r ->> 'priority'), false), left(r ->> 'why_match', 2000),
      left(r ->> 'red_flags', 2000), nullif(r ->> 'seniority', ''),
      case when coalesce(r ->> 'min_years_required', '') ~ '^[0-9]+(\.[0-9]+)?$' then (r ->> 'min_years_required')::numeric end,
      left(r ->> 'experience_evidence', 300), nullif(r ->> 'languages_required', ''), nullif(r ->> 'visa_status', ''),
      nullif(r ->> 'remote_region', ''), jr_bool(r ->> 'contract_friendly'), nullif(r ->> 'company_size_hint', ''),
      left(r ->> 'salary', 200), jr_int(r ->> 'confidence'), nullif(r ->> 'provider', ''),
      left(r ->> 'score_breakdown', 200), p_rev)
    on conflict do nothing;
    get diagnostics k = row_count;
    n_match := n_match + k;
    update jr_postings set stage = 'matched', final_score = jr_int(r ->> 'final_score'), reason = null,
           last_run_id = p_run_id, gate_rev = p_rev
    where posting_id = coalesce(nullif(r ->> 'posting_id', ''), left(md5(r ->> 'url'), 16));
  end loop;
  return jsonb_build_object('updated', n_upd, 'matches_given', n_given, 'matches_new', n_match, 'matches_duplicate', n_dup,
                            'gave_up_no_description', n_gave_up);
end $$;

-- Closes a run. Also deletes postings that never matched and are older than 45 days.
-- p: {funnel: {...}, source_stats: {...}, providers, failures, warnings, errors_sample}
create or replace function jr_finish_run(p_run_id bigint, p jsonb) returns jsonb
language plpgsql as $$
declare
  n_del int;
  v     jr_runs%rowtype;
begin
  update jr_runs set
    status        = 'completed',
    finished_at   = now(),
    funnel        = case when jsonb_typeof(p -> 'funnel') = 'object' then p -> 'funnel' else '{}'::jsonb end,
    source_stats  = case when jsonb_typeof(p -> 'source_stats') = 'object' then p -> 'source_stats' else '{}'::jsonb end,
    providers     = left(p ->> 'providers', 2000),
    failures      = jr_int(p ->> 'failures'),
    warnings      = concat_ws('; ', warnings, nullif(left(p ->> 'warnings', 2000), '')),
    errors_sample = left(p ->> 'errors_sample', 2000)
  where run_id = p_run_id and status = 'running'
  returning * into v;
  if not found then raise exception 'finish_run: run % is not running (already finished, or marked stale)', p_run_id; end if;
  delete from jr_postings
  where first_seen_at < now() - interval '45 days' and stage <> 'matched' and flag is null;
  get diagnostics n_del = row_count;
  return jsonb_build_object('run_id', v.run_id, 'status', v.status, 'config_rev', v.config_rev,
                            'seconds', round(extract(epoch from v.finished_at - v.started_at))::int, 'purged', n_del);
end $$;

-- ---------- console functions ------------------------------------------

-- Review state machine. Actions: good | false_positive | applied | interviewing | offer | rejected | reopen | save_notes
create or replace function jr_review(p_id text, p_action text, p jsonb default '{}'::jsonb, p_actor text default 'console')
returns jsonb
language plpgsql as $$
declare
  r          jr_matches%rowtype;
  new_status text;
  reason     text := nullif(btrim(coalesce(p ->> 'fp_reason', '')), '');
  has_notes  boolean := p ? 'notes';
  new_notes  text := nullif(p ->> 'notes', '');
  allowed    boolean;
begin
  select * into r from jr_matches where match_id = p_id for update;
  if not found then raise exception 'not_found: no match with id %', p_id; end if;
  if has_notes and length(coalesce(new_notes, '')) > 2000 then raise exception 'notes_too_long: 2000 characters at most'; end if;

  if p_action = 'save_notes' then
    if not has_notes then raise exception 'nothing_to_save: send notes'; end if;
    new_status := r.status;
  else
    if p_action not in ('good','false_positive','applied','interviewing','offer','rejected','reopen') then
      raise exception 'unknown_action: %', p_action;
    end if;
    allowed := case r.status
      when 'new'            then p_action in ('good','false_positive','applied')
      when 'good'           then p_action in ('false_positive','applied','reopen')
      when 'false_positive' then p_action in ('good','reopen')
      when 'applied'        then p_action in ('interviewing','offer','rejected')
      when 'interviewing'   then p_action in ('offer','rejected')
      else false end;
    if not allowed then
      raise exception 'invalid_transition: "%" is not allowed when the match is "%"', p_action, r.status;
    end if;
    new_status := case p_action when 'reopen' then 'new' else p_action end;
    if p_action = 'false_positive' and (reason is null or reason not in
        ('seniority','experience','location','work_mode','language','visa','skills','role_type','duplicate','stale','other')) then
      raise exception 'fp_reason_required: pick why this match is wrong (seniority, experience, location, work_mode, language, visa, skills, role_type, duplicate, stale, other)';
    end if;
  end if;

  update jr_matches set
    status      = new_status,
    fp_reason   = case when new_status = 'false_positive' then reason when new_status = 'new' then null else fp_reason end,
    applied_at  = case when p_action = 'applied' then coalesce(applied_at, now()) when new_status = 'new' then null else applied_at end,
    notes       = case when has_notes then new_notes else notes end,
    reviewed_at = case when new_status <> r.status then now() else reviewed_at end
  where match_id = p_id;

  insert into jr_events (entity, entity_id, action, before, after, actor)
  select 'match', p_id, p_action,
         jsonb_strip_nulls(jsonb_build_object('status', r.status, 'fp_reason', r.fp_reason, 'notes', case when has_notes then r.notes end)),
         jsonb_strip_nulls(jsonb_build_object('status', m.status, 'fp_reason', m.fp_reason, 'notes', case when has_notes then m.notes end)),
         coalesce(p_actor, 'console')
  from jr_matches m where m.match_id = p_id;

  return (select jsonb_build_object('match_id', match_id, 'status', status, 'fp_reason', fp_reason,
                                    'applied_at', applied_at, 'reviewed_at', reviewed_at)
          from jr_matches where match_id = p_id);
end $$;

-- "Should have passed": mark a dropped posting as a false negative (or clear the flag).
create or replace function jr_flag_posting(p_id text, p_flag text, p_note text default null, p_actor text default 'console')
returns jsonb
language plpgsql as $$
declare r jr_postings%rowtype;
begin
  select * into r from jr_postings where posting_id = p_id for update;
  if not found then raise exception 'not_found: no posting with id %', p_id; end if;
  if p_flag is not null and p_flag <> 'false_negative' then raise exception 'unknown_flag: use false_negative or null'; end if;
  if p_flag = 'false_negative' and r.stage not in ('dropped_a','dropped_b','dropped_llm','below_score','duplicate') then
    raise exception 'not_dropped: only dropped postings can be flagged (stage is %)', r.stage;
  end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'note_too_long: 500 characters at most'; end if;
  update jr_postings set flag = p_flag, flag_note = case when p_flag is null then null else p_note end,
         flagged_at = case when p_flag is null then null else now() end
  where posting_id = p_id;
  insert into jr_events (entity, entity_id, action, before, after, actor)
  values ('posting', p_id, coalesce(p_flag, 'unflag'), jsonb_build_object('flag', r.flag),
          jsonb_build_object('flag', p_flag, 'stage', r.stage, 'reason', r.reason, 'note', p_note), coalesce(p_actor, 'console'));
  return jsonb_build_object('posting_id', p_id, 'flag', p_flag, 'stage', r.stage, 'reason', r.reason);
end $$;

create or replace function jr_set_paused(p_paused boolean, p_actor text default 'console') returns boolean
language plpgsql as $$
declare old text;
begin
  select value into old from jr_settings where key = 'paused';
  update jr_settings set value = case when p_paused then 'true' else 'false' end, updated_at = now() where key = 'paused';
  insert into jr_events (entity, entity_id, action, before, after, actor)
  values ('settings', 'paused', case when p_paused then 'pause' else 'resume' end,
          jsonb_build_object('paused', old), jsonb_build_object('paused', p_paused), coalesce(p_actor, 'console'));
  return p_paused;
end $$;

-- Ask for a run. The laptop schedule (every 30 minutes) picks it up; at most 3 completed runs a day.
create or replace function jr_request_run(p_actor text default 'console') returns timestamptz
language plpgsql as $$
declare v timestamptz := now();
begin
  update jr_settings set value = v::text, updated_at = v where key = 'run_requested_at';
  insert into jr_events (entity, entity_id, action, after, actor)
  values ('settings', 'run_requested_at', 'request_run', jsonb_build_object('at', v), coalesce(p_actor, 'console'));
  return v;
end $$;

-- ---------- console read views -----------------------------------------

create or replace view v_jr_inbox as
select m.*,
       round(extract(epoch from now() - coalesce(m.posted_date, m.run_date)) / 86400)::int as age_days
from jr_matches m
where m.status = 'new';

create or replace view v_jr_health as
select l.run_id                                                     as last_run_id,
       l.status                                                     as last_status,
       l.started_at                                                 as last_started_at,
       l.finished_at                                                as last_finished_at,
       extract(epoch from now() - coalesce(l.finished_at, l.started_at))::int as age_seconds,
       l.config_rev                                                 as last_run_rev,
       l.funnel                                                     as last_funnel,
       l.warnings                                                   as last_warnings,
       (select count(*) from jsonb_each(coalesce(l.source_stats, '{}'::jsonb)) s
         where jsonb_typeof(s.value) = 'object' and coalesce(jr_int(s.value ->> 'errors'), 0) > 0)::int as last_sources_with_errors,
       (select count(*) from jr_runs where status = 'completed' and started_at > now() - interval '7 days')::int as runs_7d,
       (select rev from v_jr_active_config)                         as config_rev,
       l.config_rev = (select rev from v_jr_active_config)          as rev_current,
       (select value from jr_settings where key = 'paused') = 'true' as paused,
       nullif((select value from jr_settings where key = 'run_requested_at'), '') as run_requested_at,
       (select count(*) from jr_matches where status = 'new')::int  as awaiting_review
from (select 1) one
left join lateral (select * from jr_runs order by run_id desc limit 1) l on true;

-- Per source over the last 7 completed runs: volume, yield, errors.
create or replace view v_jr_source_health as
with s as (
  select r.run_id, r.started_at, x.key as source, x.value as v
  from jr_runs r cross join lateral jsonb_each(r.source_stats) x
  where r.status = 'completed' and r.started_at > now() - interval '7 days' and jsonb_typeof(x.value) = 'object'
)
select source,
       count(*)::int                                          as runs,
       sum(coalesce(jr_int(v ->> 'fetched'), 0))::int        as fetched,
       sum(coalesce(jr_int(v ->> 'gate_a_pass'), 0))::int    as gate_a_pass,
       sum(coalesce(jr_int(v ->> 'new'), 0))::int            as new_postings,
       sum(coalesce(jr_int(v ->> 'gate_b_pass'), 0))::int    as gate_b_pass,
       sum(coalesce(jr_int(v ->> 'matches'), 0))::int        as matches,
       sum(coalesce(jr_int(v ->> 'errors'), 0))::int         as errors,
       max(started_at) filter (where coalesce(jr_int(v ->> 'fetched'), 0) > 0) as last_ok_at,
       (array_agg(v ->> 'error' order by started_at desc) filter (where coalesce(v ->> 'error', '') <> ''))[1] as last_error
from s
group by source;

-- Why postings were dropped, last 7 days (the "what did the gates kill" view).
create or replace view v_jr_gate_reasons as
select stage, coalesce(reason, '(none)') as reason, source, count(*)::int as postings,
       count(*) filter (where flag = 'false_negative')::int as flagged_false_negative
from jr_postings
where first_seen_at > now() - interval '7 days'
group by stage, coalesce(reason, '(none)'), source;

-- Dropped postings for the funnel screen (newest first, no descriptions stored).
create or replace view v_jr_dropped as
select posting_id, url, source, kind, title, company, location_raw, work_mode, employment_type, posted_at,
       first_seen_at, stage, reason, reason_detail, final_score, flag, flag_note, gate_rev
from jr_postings
where stage in ('dropped_a','dropped_b','dropped_llm','below_score','duplicate')
  and first_seen_at > now() - interval '14 days';

create or replace view v_jr_calibration as
select coalesce(config_rev, 'unknown') as rev,
       count(*)::int                                                         as matches,
       count(*) filter (where status <> 'new')::int                          as reviewed,
       count(*) filter (where status in ('good','applied','interviewing','offer','rejected'))::int as good,
       count(*) filter (where status = 'false_positive')::int                as false_positive,
       count(*) filter (where status in ('applied','interviewing','offer','rejected'))::int as applied,
       round(100.0 * count(*) filter (where status in ('good','applied','interviewing','offer','rejected'))
             / nullif(count(*) filter (where status <> 'new'), 0))::int        as precision_pct,
       round(avg(final_score))::int                                          as avg_score,
       min(run_date)                                                         as first_run,
       max(run_date)                                                         as last_run
from jr_matches
group by coalesce(config_rev, 'unknown');

create or replace view v_jr_fp_levers as
with lever(fp_reason, config_key, advice) as (values
  ('seniority',  'experience.seniority_ok / search.title_senior_regex', 'Add the leaked title word to title_senior_regex, or remove a level from seniority_ok'),
  ('experience', 'experience.max_years_required',                      'Check the experience evidence; if the regex missed a phrasing, note it and lower max_years_required only if intended'),
  ('location',   'work_modes.remote.location_block / desc_block',      'Add the region or phrase that leaked'),
  ('work_mode',  'work_modes.*.enabled / require_visa',                'Disable the mode or require a visa for it'),
  ('language',   'languages.blocked / banned_phrases',                 'Add the language or the phrase'),
  ('visa',       'visa.negative_terms / visa.unknown_policy',          'Add the refusal phrase, or set visa.unknown_policy to drop'),
  ('skills',     'scoring.min_score / weights.match',                  'Raise min_score by 5, or lower weights.match'),
  ('role_type',  'search.role_terms / search.title_block_terms / opportunity.block_phrases', 'Remove the role term that surfaced it, block the title word, or add the offer phrase'),
  ('duplicate',  'jr_dupe_key',                                        'Company or title spelled differently across boards: note both URLs'),
  ('stale',      'freshness.window_days',                              'Lower window_days'),
  ('other',      'notes',                                              'Read the notes on these matches'))
select l.fp_reason, l.config_key, l.advice,
       count(m.match_id)::int                                                           as total,
       count(m.match_id) filter (where m.reviewed_at > now() - interval '30 days')::int as last_30d
from lever l
left join jr_matches m on m.status = 'false_positive' and m.fp_reason = l.fp_reason
group by l.fp_reason, l.config_key, l.advice;

create or replace view v_jr_score_buckets as
select (final_score / 5) * 5                                                   as bucket,
       count(*)::int                                                           as matches,
       count(*) filter (where status <> 'new')::int                            as reviewed,
       count(*) filter (where status in ('good','applied','interviewing','offer','rejected'))::int as good,
       count(*) filter (where status = 'false_positive')::int                  as false_positive
from jr_matches
where final_score is not null
group by 1;
