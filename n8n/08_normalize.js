// Job Radar v2 | Normalize (Code, run once for all items). Input: "Merge All".
// One schema for every source (the 12 v1 mappers + the v2 adapters), canonical URLs, work mode,
// employment type and kind (job or gig). Error and skip markers are passed through untouched so
// "Run Stats" can count them per source; disabled sources are dropped here (their fetch still ran).
const L = $('Load Config').first().json;
const S = L.config.sources || {};
const boardKeys = new Map((S.boards || []).map(b => [b.key, b]));
const enabled = src => S[src] ? !!S[src].enabled : (boardKeys.has(src) ? !!boardKeys.get(src).enabled : true);

const DROP_PARAMS = /^(utm_|ref$|ref_|refid|trk|tracking|src$|source$|gh_src|lever-|ashby_|fbclid|gclid|mc_)/i;
// HN Who is Hiring sends HTML-entity encoded text ("https:&#x2F;&#x2F;acme.com", "R&amp;D"): decode first (run 1, 2026-10-30).
const unent = s => String(s || '').replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d))).replace(/&quot;/g, '"').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
// String-based on purpose: the n8n Code-node sandbox has no URL / URLSearchParams globals (probe, 2026-10-30).
const canonUrl = u => {
  const m = unent(u).trim().match(/^(https?):\/\/([^\/?#\s]+)([^?#\s]*)(\?[^#\s]*)?/i);
  if (!m) return '';
  const query = (m[4] || '').slice(1).split('&').filter(p => p && !DROP_PARAMS.test(decodeURIComponent(p.split('=')[0] || '')));
  return m[1].toLowerCase() + '://' + m[2].toLowerCase() + (m[3] || '/') + (query.length ? '?' + query.join('&') : '');
};
const detectMode = t => /\bhybrid\b/i.test(t) ? 'hybrid'
  : /\b(fully remote|remote[- ]first|100% remote|remote|anywhere|worldwide|work from home|wfh|distributed team)\b/i.test(t) ? 'remote'
  : /\b(on[- ]?site|in[- ]office|office[- ]based|onsite)\b/i.test(t) ? 'onsite' : 'unknown';
const detectEmployment = t =>
  /\b(intern|internship|praktikum|werkstudent|working student)\b/i.test(t) ? 'internship'
  : /\b(freelance|freelancer)\b/i.test(t) ? 'freelance'
  : /\b(contract|contractor|fixed[- ]term|temporary)\b/i.test(t) ? 'contract'
  : /\bpart[- ]time\b/i.test(t) ? 'part_time'
  : /\bfull[- ]time\b/i.test(t) ? 'full_time' : 'unknown';
const GIG = /\b(freelance|freelancer|gig|one[- ]off|short[- ]term|project[- ]based|per hour|\/\s?hr|hourly|fixed[- ]price|budget|bounty|paid task|small task)\b/i;
// Community job boards (Clay, n8n forums) carry freelance asks, not employment (run 2, 2026-10-30).
const GIG_SOURCES = new Set(['reddit', 'contra', 'clay-community', 'n8n-community']);

const out = [];
const seen = new Set();
for (const it of $input.all()) {
  const j = it.json || {};
  if (j.__skip || j.__error) { out.push({ json: { source: j.source || 'unknown', __skip: j.__skip, __error: j.__error } }); continue; }
  if (!j.url || !j.source) continue;
  if (!enabled(j.source)) { out.push({ json: { source: j.source, __skip: 'disabled' } }); continue; }
  const url = canonUrl(j.url);
  if (!url || seen.has(url)) continue;
  seen.add(url);

  const title = unent(j.title).replace(/\s+/g, ' ').trim();
  const desc = String(j.description_text || '').trim();
  const head = [title, j.location_raw, j.employment_type_raw, j.list_context, desc.slice(0, 600)].filter(Boolean).join(' | ');
  let mode = j.work_mode || (j.work_policy === 'remote' ? 'remote' : j.work_policy === 'onsite' ? 'onsite' : 'unknown');
  if (!['remote', 'hybrid', 'onsite'].includes(mode)) mode = detectMode([title, j.location_raw, j.list_context].join(' '));
  if (mode === 'remote' && /\bhybrid\b/i.test(title + ' ' + (j.location_raw || ''))) mode = 'hybrid';   // "Remote / Hybrid" titles
  const employment = detectEmployment(head);
  const kind = j.kind === 'gig' || GIG_SOURCES.has(j.source) || employment === 'freelance' || GIG.test(title + ' ' + desc.slice(0, 300)) ? 'gig' : 'job';
  const posted = new Date(j.posted_date);
  const postedOk = !isNaN(posted.getTime());

  out.push({ json: {
    source: j.source,
    source_id: String(j.source_id || j.id || url),
    url,
    title: title || '(untitled)',
    company: unent(j.company || 'unknown').trim() || 'unknown',
    location_raw: String(j.location_raw || '').trim(),
    work_mode: mode,
    employment_type: employment,
    kind,
    posted_date: postedOk ? posted.toISOString() : new Date().toISOString(),
    posted_estimated: !postedOk || !!j.posted_estimated,
    description_text: desc.slice(0, 6000),
    needs_detail: !!j.needs_detail && desc.length < 200,
    detail: j.detail || null,
    visa_flag: j.source === 'arbeitnow' ? j.visa_sponsorship === true : (j.visa_sponsorship === true ? true : null),
    seniority_hint: j.seniority_hint || '',
    gate_hint: j.gate_hint || '',
    list_context: j.list_context || ''
  } });
}
return out.length ? out : [{ json: { source: 'normalize', __skip: 'no_items' } }];
