// Job Radar v2 | Run Stats (Code, run once for all items). Input: "Record Postings".
// Builds the jr_finish_run() payload: the funnel for this run and one stats object per source.
const safeAll = name => { try { return $(name).all().map(i => i.json); } catch (e) { return []; } };
const L = $('Load Config').first().json;
const merged = safeAll('Merge All');
const norm = safeAll('Normalize').filter(j => j.url);
const gateA = safeAll('Gate A').filter(j => j.url);
const fresh = safeAll('Rejoin').filter(j => j.url);
const gateB = safeAll('Gate B').filter(j => j.url);
const router = safeAll('LLM Router').filter(j => j.job);
const scored = safeAll('Gate & Score').filter(j => j.url);
const rec = (safeAll('Record Postings')[0] || {}).result || {};

const S = {};
const bump = (src, k, n = 1) => { S[src] = S[src] || { fetched: 0, errors: 0, gate_a_pass: 0, new: 0, gate_b_pass: 0, matches: 0 }; S[src][k] += n; };
for (const j of merged) {
  if (j.__error) { bump(j.source || 'unknown', 'errors'); S[j.source || 'unknown'].error = String(j.__error).slice(0, 200); }
  else if (j.__skip && j.source && j.source !== 'normalize') { bump(j.source, 'fetched', 0); S[j.source].skipped = j.__skip; }
}
for (const j of norm) bump(j.source, 'fetched');
for (const j of gateA) if (j.gate_a === 'pass') bump(j.source, 'gate_a_pass');
for (const j of fresh) bump(j.source, 'new');
for (const j of gateB) if (j.gate_b === 'pass') bump(j.source, 'gate_b_pass');
for (const r of scored) if (r.outcome === 'matched') bump(r.source, 'matches');

const providers = router.map(r => r.provider);
const funnel = {
  merged: merged.length,
  fetched: norm.length,
  gate_a_pass: gateA.filter(j => j.gate_a === 'pass').length,
  new_or_retry: fresh.length,
  detail_ok: gateB.filter(j => j.detail_status === 'ok').length,
  gate_b_pass: gateB.filter(j => j.gate_b === 'pass').length,
  llm_calls: providers.filter(p => p !== 'none' && p !== 'deferred').length,
  llm_deferred: providers.filter(p => p === 'deferred').length,
  scored: scored.length,
  matches: scored.filter(r => r.outcome === 'matched').length,
  matches_new: Number(rec.matches_new || 0)
};
const sourceErrors = merged.filter(j => j.__error).map(j => j.__error);
const routerErrors = router.filter(r => r.errors && Object.keys(r.errors).length).slice(0, 2).map(r => JSON.stringify(r.errors).slice(0, 160));
return [{ json: {
  run_id: L.run_id,
  payload: {
    funnel, source_stats: S,
    providers: providers.join(','),
    failures: providers.filter(p => p === 'none').length,
    warnings: (L.warnings || []).join('; '),
    errors_sample: sourceErrors.concat(routerErrors).join(' | ').slice(0, 1500)
  }
} }];
