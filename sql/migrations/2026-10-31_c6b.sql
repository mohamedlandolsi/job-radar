-- Job Radar v2 | migration C6b (2026-10-31). Apply once to an existing job-radar database; idempotent.
-- Fresh installs get the same objects from radar_v2_schema.sql.
--   1. jr_dupe_key: ignores legal suffixes (GmbH, Inc, Ltd...) and gender tags ((w/m/d), (m/f/d)...)
--   2. jr_validate_config: optional opportunity.block_phrases
--   3. jr_record_postings: a match with the same company and title as a match from the last 30 days becomes
--      stage "duplicate" (reason same_company_title) instead of a second match
--   4. v_jr_fp_levers: role_type lever mentions opportunity.block_phrases
--   5. recompute jr_postings.dupe_key with the new function

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

update jr_postings set dupe_key = jr_dupe_key(company, title)
where dupe_key is distinct from jr_dupe_key(company, title);
