// Job Radar v2 | Load Config (Code, run once for all items)
// Input: "Start Run" -> { ctx: jr_start_run() result }. The config was validated by jr_validate_config()
// when it was saved, so this node only fills safe fallbacks, computes source cadence, and keeps the
// legacy keys the v1 source nodes still read (himalayas_queries, remocate_*, window_days).
const raw = $('Start Run').first().json.ctx;
const ctx = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
if (!ctx.run_id || !ctx.config) throw new Error('Start Run returned no run_id/config: is the schema applied?');

const warnings = [];
const cfg = ctx.config;
const num = (v, fb, key) => { const n = Number(v); if (!Number.isFinite(n)) { warnings.push(key + ':fallback'); return fb; } return n; };

cfg.freshness = cfg.freshness || {};
cfg.freshness.window_days = num(cfg.freshness.window_days, 7, 'freshness.window_days');
cfg.llm = Object.assign({ slice_cap: 40, detail_cap: 40, max_per_source: 12, pace_ms: 15000, max_desc_chars: 3500 }, cfg.llm || {});
cfg.scoring = cfg.scoring || {};
cfg.scoring.weights = Object.assign({ match: 0.4, filterFit: 0.25, feasibility: 0.2, recency: 0.15 }, cfg.scoring.weights || {});
cfg.sources = cfg.sources || {};

// Cadence: weekly sources run when they have not fetched anything for 6 days.
const lastOk = ctx.last_ok || {};
const due = {};
const isDue = (key, cadence) => {
  if (cadence !== 'weekly') return true;
  const t = lastOk[key] ? new Date(lastOk[key]).getTime() : 0;
  return !t || (Date.now() - t) > 6 * 86400000;
};
for (const [key, s] of Object.entries(cfg.sources)) {
  if (key === 'boards') continue;
  due[key] = !!(s && s.enabled) && isDue(key, s && s.cadence);
}
for (const b of (cfg.sources.boards || [])) due[b.key] = !!b.enabled && isDue(b.key, b.cadence);

// Legacy aliases read by unchanged v1 nodes (Himalayas1, Remocate Mapper).
const S = cfg.sources;
const config = Object.assign({}, cfg, {
  window_days: cfg.freshness.window_days,
  himalayas_queries: (S.himalayas && S.himalayas.queries) || [],
  remocate_enabled: !!(S.remocate && S.remocate.enabled),
  remocate_categories: (S.remocate && S.remocate.categories) || ['sales', 'marketing', 'analytics', 'manager'],
  revops_enabled: !!(S.revopsroles && S.revopsroles.enabled),
  arbeitnow_visa_only: !!(S.arbeitnow && S.arbeitnow.visa_only)
});

return [{ json: {
  run_id: Number(ctx.run_id), rev: ctx.rev, trigger: ctx.trigger, started_at: ctx.started_at,
  config, due, warnings
} }];
