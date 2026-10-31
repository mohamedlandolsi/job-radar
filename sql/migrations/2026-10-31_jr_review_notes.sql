-- Job Radar v2 | migration jr_review notes fix (2026-10-31). Apply once to an existing job-radar database; idempotent.
-- Fresh installs get the same function from radar_v2_schema.sql.
--   1. jr_review: "save_notes" on a false_positive match kept failing with jr_m_fp_needs_reason, because
--      fp_reason was set from the payload, which has no fp_reason on a notes save. It now keeps the stored
--      reason: fp_reason = coalesce(reason, fp_reason) when the status stays or becomes false_positive.
--      Marking a match false_positive still requires a valid fp_reason; reopen still clears it.

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
    fp_reason   = case when new_status = 'false_positive' then coalesce(reason, fp_reason) when new_status = 'new' then null else fp_reason end,
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
