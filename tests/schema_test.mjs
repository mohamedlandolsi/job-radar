import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const db = new PGlite();
const sql = fs.readFileSync(process.argv[2], 'utf8');
await db.exec(sql);
await db.exec(sql); // idempotent re-run
const q = async (s, p=[]) => (await db.query(s, p)).rows;
const expectErr = async (s, p, frag) => { try { await db.query(s, p); console.log('FAIL no error for', frag); process.exitCode = 1; } catch (e) { const ok = e.message.includes(frag); console.log(ok ? 'ok  ' : 'FAIL', 'error:', e.message.slice(0,140)); if (!ok) process.exitCode = 1; } };
const check = (cond, msg) => { console.log(cond ? 'ok  ' : 'FAIL', msg); if (!cond) process.exitCode = 1; };

console.log(await q("select id, rev, created_by from jr_config_versions"));
const cfg = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
// validation errors
const bad = (mut, frag) => { const c = structuredClone(cfg); mut(c); c.rev = 'bad-' + Math.random(); return expectErr('select jr_save_config($1)', [JSON.stringify(c)], frag); };
await bad(c => { c.llm.slice_cap = 99; }, 'llm.slice_cap: must be between 1 and 60');
await bad(c => { c.scoring.weights.match = 0.9; }, 'must add up to 1');
await bad(c => { c.work_modes.remote.enabled = false; c.work_modes.hybrid.enabled = false; c.work_modes.onsite.enabled = false; }, 'enable at least one');
await bad(c => { c.sources.foo = {enabled:true}; }, 'unknown source "foo"');
await bad(c => { delete c.sources.reddit; }, 'sources.reddit: missing');
await bad(c => { c.sources.boards.push({...c.sources.boards[0]}); }, 'used twice');
await bad(c => { c.sources.linkedin.searches = Array(11).fill(c.sources.linkedin.searches[0]); c.sources.linkedin.max_pages = 1; }, '10 searches at most');
await bad(c => { c.sources.linkedin.searches = Array(7).fill(c.sources.linkedin.searches[0]); c.sources.linkedin.max_pages = 3; }, '<= 20 requests');
await bad(c => { c.experience.max_years_required = 11; }, 'max_years_required: must be between 0 and 10');
await bad(c => { c.experience.unknown_policy = 'maybe'; }, 'experience.unknown_policy: must be one of keep, drop');
await bad(c => { c.sources.ats.companies = [{name:'Clay', token:'clay', ats:'workday'}]; }, 'greenhouse, lever or ashby');
await bad(c => { c.opportunity.employment_types = ['gig']; }, 'unknown type "gig"');
await bad(c => { c.colour = 1; }, 'unknown_key');
await bad(c => { c.sources.boards.forEach(b => { b.enabled = true; b.list_urls = ['https://a.com','https://b.com','https://c.com']; }); }, '30 list pages');
await expectErr('select jr_save_config($1)', [JSON.stringify(cfg)], 'rev_unchanged');
await expectErr('select jr_save_config($1)', ['{bad json'], 'invalid_json');
const c2 = structuredClone(cfg); c2.rev = 'v2-002'; c2.experience.max_years_required = 1;
console.log('save v2-002 ->', await q('select jr_save_config($1, $2) as id', [JSON.stringify(c2), 'test']));

// run lifecycle
check((await q("select jr_should_run() as go"))[0].go === 'schedule', 'should_run = schedule on empty day');
const ctx = (await q("select jr_start_run('schedule') as ctx"))[0].ctx;
check(ctx.run_id === 1 && ctx.rev === 'v2-002' && ctx.config.experience.max_years_required === 1, 'start_run returns run_id, rev, config');
check((await q("select jr_should_run() as go"))[0].go === 'none', 'should_run = none while a run is running');
const items = [
  { url: 'https://a.com/1', source: 'linkedin', kind: 'job', title: 'GTM Engineer', company: 'Acme', gate: 'pass', posted_date: '2026-10-29' },
  { url: 'https://b.com/2', source: 'gtmjobs-xyz', kind: 'job', title: 'GTM  engineer!', company: 'ACME', gate: 'pass' },
  { url: 'https://c.com/3', source: 'remotive', kind: 'job', title: 'Senior Dev', company: 'X', gate: 'drop', reason: 'title_senior', detail: 'senior' },
  { url: 'https://d.com/4', source: 'reddit', kind: 'gig', title: '[Hiring] n8n', company: 'unknown', gate: 'pass' },
  { url: 'https://e.com/5', source: 'reddit', kind: 'gig', title: '[Hiring] n8n', company: 'unknown', gate: 'pass' },
  { url: '', source: 'x', gate: 'pass' }
];
const back = await q('select * from jr_ingest($1::bigint, $2::text, $3::jsonb)', [1, 'v2-002', JSON.stringify(items)]);
console.log('ingest returned', back);
check(back.length === 3 && back.every(r => r.retry === false), '3 new passers returned (dupe and drop excluded)');
console.log(await q("select source, stage, reason from jr_postings order by url"));
const pid = back.find(r => r.url === 'https://a.com/1').posting_id;
const pid4 = back.find(r => r.url === 'https://d.com/4').posting_id;
const pid5 = back.find(r => r.url === 'https://e.com/5').posting_id;
const rec = await q('select jr_record_postings($1::bigint, $2::text, $3::jsonb) as r', [1, 'v2-002', JSON.stringify({
  updates: [{ posting_id: pid4, stage: 'queued', reason: 'detail_retry', attempt: true }, { posting_id: pid5, stage: 'skipped_cap', reason: 'slice_cap' }],
  matches: [{ posting_id: pid, url: 'https://a.com/1', title: 'GTM Engineer', company: 'Acme', final_score: 82, priority: true, min_years_required: '0', kind: 'job', visa_status: 'unknown', source: 'linkedin' }]
})]);
console.log('record', rec[0].r);
check(rec[0].r.matches_new === 1 && rec[0].r.updated === 2, 'record_postings: 1 match, 2 updates');
await expectErr('select jr_record_postings($1::bigint, $2::text, $3::jsonb)', [1, 'v2-002', JSON.stringify({updates:[{posting_id: pid, stage: 'duplicate'}]})], 'cannot be set by the engine');
const fin = await q('select jr_finish_run($1::bigint, $2::jsonb) as r', [1, JSON.stringify({ funnel: { fetched: 6, matches: 1 }, source_stats: { linkedin: { fetched: 1, errors: 0, matches: 1 }, reddit: { fetched: 2, errors: 1, error: 'tavily 432' } }, providers: 'groq-gptoss', failures: 0, warnings: '' })]);
console.log('finish', fin[0].r);
await expectErr('select jr_finish_run($1::bigint, $2::jsonb)', [1, '{}'], 'is not running');
check((await q("select jr_should_run() as go"))[0].go === 'none', 'should_run = none after a completed run today');
// second run: retry semantics
await q("select jr_request_run()");
check((await q("select jr_should_run() as go"))[0].go === 'requested', 'requested run allowed');
const ctx2 = (await q("select jr_start_run('requested') as ctx"))[0].ctx;
check(ctx2.last_ok.linkedin && ctx2.last_ok.reddit && !ctx2.last_ok.remotive, 'last_ok map from source_stats');
check((await q("select value from jr_settings where key='run_requested_at'"))[0].value === '', 'request cleared');
const back2 = await q('select * from jr_ingest($1::bigint, $2::text, $3::jsonb)', [ctx2.run_id, 'v2-002', JSON.stringify(items)]);
console.log('ingest 2', back2.map(r => [r.url, r.retry]));
check(back2.length === 2 && back2.every(r => r.retry), 'run 2 returns only the retryable (queued, skipped_cap) rows');
// config change re-evaluates drops
const back3 = await q('select * from jr_ingest($1::bigint, $2::text, $3::jsonb)', [ctx2.run_id, 'v2-003', JSON.stringify([{ url: 'https://c.com/3', source: 'remotive', gate: 'pass', title: 'Senior Dev', company: 'X' }])]);
check(back3.length === 1 && back3[0].retry, 'dropped_a row re-evaluated under a new rev');
// attempts -> gives up after 3
for (let i = 0; i < 2; i++) await q('select jr_record_postings($1::bigint, $2::text, $3::jsonb)', [ctx2.run_id, 'v2-002', JSON.stringify({updates:[{posting_id: pid4, stage: 'queued', reason: 'detail_retry', attempt: true}]})]);
console.log(await q('select stage, reason, attempts from jr_postings where posting_id=$1', [pid4]));
check((await q('select stage from jr_postings where posting_id=$1', [pid4]))[0].stage === 'dropped_b', 'gives up after 3 detail failures');
// review machine
console.log(await q("select jr_review($1, 'good') as r", [pid]));
await expectErr("select jr_review($1, 'offer')", [pid], 'invalid_transition');
await expectErr("select jr_review($1, 'false_positive', '{}'::jsonb)", [pid], 'fp_reason_required');
console.log(await q(`select jr_review($1, 'false_positive', '{"fp_reason":"experience","notes":"3 years"}'::jsonb) as r`, [pid]));
// flag
const drop = (await q("select posting_id from jr_postings where stage='dropped_b' limit 1"))[0].posting_id;
console.log(await q("select jr_flag_posting($1, 'false_negative', 'was fine') as r", [drop]));
await expectErr("select jr_flag_posting($1, 'false_negative')", [pid], 'not_dropped');
console.log(await q("select jr_set_paused(true) as p"));
check((await q("select jr_should_run() as go"))[0].go === 'none', 'paused + running run -> none');
// stale run handling
await q("update jr_runs set started_at = now() - interval '3 hours' where status='running'");
check((await q("select jr_should_run() as go"))[0].go === 'none', 'stale run marked failed; paused -> none');
console.log(await q("select run_id, status, warnings from jr_runs order by run_id"));
// C6b: dupe key ignores legal suffixes and gender tags
const dk = async (c, t) => (await q('select jr_dupe_key($1, $2) as k', [c, t]))[0].k;
check(await dk('Kubermatic GmbH', 'GTM Engineer – HubSpot, Automation & AI') === await dk('Kubermatic', 'GTM Engineer – HubSpot, Automation & AI (w/m/d)'), 'dupe key: "GmbH" and "(w/m/d)" ignored');
check(await dk('Acme GmbH & Co. KG', 'Automation Engineer (m/f/d)') === await dk('acme', 'Automation Engineer'), 'dupe key: "GmbH & Co. KG" and "(m/f/d)" ignored');
check(await dk('Acme Inc.', 'RevOps Analyst (all genders)') === await dk('ACME', 'RevOps Analyst'), 'dupe key: "Inc." and "(all genders)" ignored');
check(await dk('Acme', 'Automation Engineer') !== await dk('Acme', 'Automation Engineer II'), 'dupe key: different titles stay different');
check(await dk('unknown', 'x') === null, 'dupe key: unknown company -> null');
// C6b: cross-source duplicate at match time (board postings have company "unknown" at ingest)
const ctx3 = (await q("select jr_start_run('manual') as ctx"))[0].ctx;
const ing3 = await q('select * from jr_ingest($1::bigint, $2::text, $3::jsonb)', [ctx3.run_id, 'v2-002', JSON.stringify([
  { url: 'https://himalayas.app/kuber', source: 'himalayas', kind: 'job', title: 'GTM Engineer – HubSpot, Automation & AI (w/m/d)', company: 'Kubermatic', gate: 'pass' },
  { url: 'https://gtmjobs.xyz/jobs/kuber-rec12345678', source: 'gtmjobs-xyz', kind: 'job', title: 'kuber gtm engineer', company: 'unknown', gate: 'pass' }])]);
check(ing3.length === 2, 'both postings ingested (no company on the board posting yet)');
const pk1 = ing3.find(r => r.url.includes('himalayas')).posting_id, pk2 = ing3.find(r => r.url.includes('gtmjobs')).posting_id;
const m = (pid, url, src, company, title) => ({ posting_id: pid, url, source: src, title, company, final_score: 77, kind: 'job' });
const r3 = (await q('select jr_record_postings($1::bigint, $2::text, $3::jsonb) as r', [ctx3.run_id, 'v2-002', JSON.stringify({ updates: [], matches: [
  m(pk1, 'https://himalayas.app/kuber', 'himalayas', 'Kubermatic', 'GTM Engineer – HubSpot, Automation & AI (w/m/d)'),
  m(pk2, 'https://gtmjobs.xyz/jobs/kuber-rec12345678', 'gtmjobs-xyz', 'Kubermatic GmbH', 'GTM Engineer – HubSpot, Automation & AI')] })]))[0].r;
check(r3.matches_new === 1 && r3.matches_duplicate === 1, 'second board copy recorded as duplicate, not a second match: ' + JSON.stringify(r3));
const dupRow = (await q('select stage, reason, reason_detail from jr_postings where posting_id=$1', [pk2]))[0];
check(dupRow.stage === 'duplicate' && dupRow.reason === 'same_company_title' && dupRow.reason_detail.includes('himalayas.app/kuber'), 'duplicate row points to the first match');
const r3b = (await q('select jr_record_postings($1::bigint, $2::text, $3::jsonb) as r', [ctx3.run_id, 'v2-002', JSON.stringify({ updates: [], matches: [
  m(pk1, 'https://himalayas.app/kuber', 'himalayas', 'Kubermatic', 'GTM Engineer – HubSpot, Automation & AI (w/m/d)')] })]))[0].r;
check(r3b.matches_duplicate === 0, 'same URL again is not its own duplicate');
await q("select jr_finish_run($1::bigint, '{}'::jsonb)", [ctx3.run_id]);
// C6b: opportunity.block_phrases validated when present
await bad(c => { c.opportunity.block_phrases = ['ok', '']; }, 'opportunity.block_phrases: every entry must be a non-empty text');
// views
for (const v of ['v_jr_inbox','v_jr_health','v_jr_source_health','v_jr_gate_reasons','v_jr_dropped','v_jr_calibration','v_jr_fp_levers','v_jr_score_buckets','v_jr_active_config']) {
  const rows = await q(`select * from ${v}`); console.log(v, rows.length, JSON.stringify(rows[0] ?? {}).slice(0, 220));
}
