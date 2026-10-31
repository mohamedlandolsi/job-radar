// Job Radar v2 | Gate A (Code, run once for all items). Input: "Normalize".
// Deterministic gates on metadata only (title, location, dates, source flags). Cheap, so it runs on
// everything. Every item gets gate = pass|drop plus a reason code; "Ingest" records all of them so
// the console can show what was dropped and why. Rule: drop only on clear evidence.
const L = $('Load Config').first().json;
const C = L.config;
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const termRe = terms => (terms && terms.length)
  ? new RegExp('(?:^|[^a-z0-9])(' + terms.map(t => esc(String(t).toLowerCase())).join('|') + ')(?=$|[^a-z0-9])', 'i') : null;
const hit = (re, text) => { if (!re) return ''; const m = String(text || '').match(re); return m ? m[1] : ''; };
const safeRe = (src, fb) => { try { return new RegExp(src, 'i'); } catch (e) { return fb; } };

const roleRe = termRe(C.search.role_terms);
const blockRe = termRe(C.search.title_block_terms);
const seniorRe = safeRe(C.search.title_senior_regex, /$^/);
const juniorRe = safeRe(C.search.title_junior_regex, /$^/);
const skillRes = (C.search.skills || []).map(s => termRe([s]));
const okRe = termRe(C.work_modes.remote.regions_ok);
const locBlockRe = termRe(C.work_modes.remote.location_block);
const countryRe = termRe(C.visa.target_countries);
const SENIOR_HINT = /^(mid-level|mid|senior|lead|staff\+?|exec|executive|director|mid_senior)$/i;
const cutoff = Date.now() - C.freshness.window_days * 86400000;
const minHits = Number(C.search.min_skill_hits) || 0;
const allowedEmployment = new Set(C.opportunity.employment_types || []);
const arbeitnowVisaOnly = !!(C.sources.arbeitnow && C.sources.arbeitnow.visa_only);

function gate(j) {
  if (j.gate_hint) return ['drop', j.gate_hint, ''];
  if (j.kind === 'job' && !C.opportunity.jobs) return ['drop', 'kind_disabled', 'job'];
  if (j.kind === 'gig' && !C.opportunity.gigs) return ['drop', 'kind_disabled', 'gig'];
  if (!allowedEmployment.has(j.employment_type)) return ['drop', 'employment_type', j.employment_type];
  if (new Date(j.posted_date).getTime() < cutoff) return ['drop', 'stale', j.posted_date.slice(0, 10)];

  const title = j.title.toLowerCase();
  const blocked = hit(blockRe, title);
  if (blocked) return ['drop', 'title_blocked', blocked];
  const senior = (title.match(seniorRe) || [])[0];
  if (senior && !juniorRe.test(title)) return ['drop', 'title_senior', senior];
  if (j.seniority_hint && SENIOR_HINT.test(j.seniority_hint)) return ['drop', 'seniority_hint', j.seniority_hint];

  const role = hit(roleRe, title);
  if (!role) {
    const desc = j.description_text || '';
    const hits = desc.length >= 200 ? skillRes.filter(re => re && re.test(desc)).length : 0;
    if (hits < Math.max(1, minHits)) return ['drop', 'role_mismatch', desc.length >= 200 ? hits + ' skill hits' : 'title only'];
  }

  if (j.source === 'arbeitnow' && arbeitnowVisaOnly && j.visa_flag !== true) return ['drop', 'visa_flag_false', 'arbeitnow'];

  const mode = j.work_mode;
  const wm = C.work_modes;
  if (mode === 'remote') {
    if (!wm.remote.enabled) return ['drop', 'mode_disabled', 'remote'];
    const loc = j.location_raw || '';
    const blockedLoc = hit(locBlockRe, loc);
    if (blockedLoc && !hit(okRe, loc)) return ['drop', 'remote_region', blockedLoc];
  } else if (mode === 'hybrid' || mode === 'onsite') {
    if (!wm[mode].enabled) return ['drop', 'mode_disabled', mode];
    if (countryRe && j.location_raw && !hit(countryRe, j.location_raw)) return ['drop', 'country_not_target', j.location_raw.slice(0, 60)];
  } else if (wm.unknown_policy === 'drop') {
    return ['drop', 'mode_unknown', ''];
  }
  return ['pass', '', ''];
}

const out = [];
for (const it of $input.all()) {
  const j = it.json;
  if (!j.url) { out.push({ json: j }); continue; }               // skip/error markers pass through for stats
  const [g, reason, detail] = gate(j);
  out.push({ json: Object.assign({}, j, {
    gate_a: g, gate_a_reason: reason,
    _ingest: {
      url: j.url, source: j.source, kind: j.kind, title: j.title, company: j.company, location_raw: j.location_raw,
      work_mode: j.work_mode, employment_type: j.employment_type, posted_date: j.posted_date,
      gate: g, reason, detail: String(detail || '').slice(0, 300)
    }
  }) });
}
return out;
