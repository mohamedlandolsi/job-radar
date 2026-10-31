// Job Radar v2 | Build Writes (Code, run once for all items). Input: "Gate & Score".
// Collects every stage change of this run into ONE payload for jr_record_postings():
// gate B drops, detail retries and deferrals, slice overflow, LLM outcomes and the new matches.
const safeAll = name => { try { return $(name).all().map(i => i.json); } catch (e) { return []; } };
const gateB = safeAll('Gate B').filter(j => j.url && j.posting_id);
const sliced = new Set(safeAll('Rank & Slice').filter(j => j.url).map(j => j.url));
const scored = $input.all().map(i => i.json).filter(j => j.url);

const updates = [];
for (const j of gateB) {
  if (j.gate_b === 'drop') updates.push({ posting_id: j.posting_id, stage: 'dropped_b', reason: j.gate_b_reason, detail: j.gate_b_detail });
  else if (j.gate_b === 'retry') updates.push({ posting_id: j.posting_id, stage: 'queued', reason: 'detail_retry', detail: j.gate_b_detail, attempt: true });
  else if (j.gate_b === 'deferred') updates.push({ posting_id: j.posting_id, stage: 'queued', reason: 'detail_deferred' });
  else if (j.gate_b === 'pass' && !sliced.has(j.url)) updates.push({ posting_id: j.posting_id, stage: 'skipped_cap', reason: 'slice_cap' });
}
const matches = [];
for (const r of scored) {
  if (r.outcome === 'matched') matches.push(r.match);
  else if (r.outcome === 'below_score') updates.push({ posting_id: r.posting_id, stage: 'below_score', reason: r.reason, detail: r.detail, final_score: r.final_score });
  else if (r.outcome === 'dropped_llm') updates.push({ posting_id: r.posting_id, stage: 'dropped_llm', reason: r.reason, detail: r.detail });
  else if (r.outcome === 'llm_failed') updates.push({ posting_id: r.posting_id, stage: 'llm_failed', reason: r.reason, detail: r.detail });
  else if (r.outcome === 'deferred') updates.push({ posting_id: r.posting_id, stage: 'skipped_cap', reason: 'llm_time_budget' });
}
const L = $('Load Config').first().json;
return [{ json: { run_id: L.run_id, rev: L.rev, payload: { updates, matches }, counts: { updates: updates.length, matches: matches.length } } }];
