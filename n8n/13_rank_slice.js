// Job Radar v2 | Rank & Slice (Code, run once for all items). Input: "Gate B".
// Ranks gate B survivors with a cheap heuristic and sends at most llm.slice_cap to the LLM, with at
// most llm.max_per_source from one source (so one noisy board cannot eat the budget). The rest is
// recorded as skipped_cap and comes back next run while still inside the freshness window.
const L = $('Load Config').first().json;
const C = L.config;
const pass = $input.all().map(i => i.json).filter(j => j.url && j.gate_b === 'pass');
if (!pass.length) return [{ json: { __empty: true } }];

const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const skillRes = (C.search.skills || []).map(s => new RegExp('(?:^|[^a-z0-9])' + esc(String(s).toLowerCase()) + '(?=$|[^a-z0-9])', 'i'));
const junior = (() => { try { return new RegExp(C.search.title_junior_regex, 'i'); } catch (e) { return /$^/; } })();
for (const j of pass) {
  const text = j.title + ' ' + j.description_text;
  const skills = skillRes.filter(re => re.test(text)).length;
  const ageDays = (Date.now() - new Date(j.posted_date).getTime()) / 86400000;
  j.heuristic_score = Math.min(skills, 10)
    + (/\b(gtm|automation|revops|n8n|clay|hubspot|crm|workflow)\b/i.test(j.title) ? 4 : 0)
    + (junior.test(j.title) ? 3 : 0)
    + (j.regex_min_years === 0 || j.regex_min_years === null ? 1 : 0)
    + (j.visa_signal === 'positive' ? 2 : 0)
    + (ageDays <= 2 ? 2 : ageDays <= 4 ? 1 : 0)
    + (j.retry ? 1 : 0);
}
pass.sort((a, b) => b.heuristic_score - a.heuristic_score);
const cap = Math.max(1, Number(C.llm.slice_cap) || 25);
const perSource = Math.max(1, Number(C.llm.max_per_source) || cap);
const used = {};
const slice = [];
for (const j of pass) {
  if (slice.length >= cap) break;
  if ((used[j.source] || 0) >= perSource) continue;
  used[j.source] = (used[j.source] || 0) + 1;
  slice.push(j);
}
return slice.map(j => ({ json: j }));
