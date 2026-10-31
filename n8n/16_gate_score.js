// Job Radar v2 | Gate & Score v2 (Code, run once for all items). Input: "LLM Router".
// Gate C re-checks the hard rules on what the LLM extracted (it reads phrasings the regexes miss),
// then scores. Emits one result per job: outcome matched | below_score | dropped_llm | llm_failed | deferred.
const L = $('Load Config').first().json;
const C = L.config;
const W = Object.assign({ match: 0.40, filterFit: 0.25, feasibility: 0.20, recency: 0.15 }, C.scoring.weights);
const maxYears = Number(C.experience.max_years_required) || 0;
const seniorityOk = new Set((C.experience.seniority_ok || []).map(s => String(s).toLowerCase()));
const blockedLang = (C.languages.blocked || []).map(s => s.toLowerCase());
const BAD_REGIONS = new Set(['us', 'americas', 'apac', 'uk']);
const WIDE = new Set(['worldwide', 'emea', 'europe']);
const clamp = n => Math.max(0, Math.min(100, Number(n) || 0));

const out = [];
for (const item of $input.all()) {
  const { job, provider, llm } = item.json;
  if (!job || !job.url) continue;
  const base = { posting_id: job.posting_id, url: job.url, source: job.source };
  if (provider === 'deferred') { out.push({ json: Object.assign(base, { outcome: 'deferred', reason: 'llm_time_budget' }) }); continue; }
  if (!llm) { out.push({ json: Object.assign(base, { outcome: 'llm_failed', reason: 'all_providers_failed', detail: JSON.stringify(item.json.errors || {}).slice(0, 200) }) }); continue; }

  const ex = llm.extracted || {};
  const seniority = String(ex.seniority || 'unknown').toLowerCase();
  const mode = ['remote', 'hybrid', 'onsite'].includes(String(ex.work_mode).toLowerCase()) ? String(ex.work_mode).toLowerCase()
    : (['remote', 'hybrid', 'onsite'].includes(job.work_mode) ? job.work_mode : 'unknown');
  const region = String(ex.remote_region || 'unknown').toLowerCase();
  const visa = String(ex.visa_status || 'unknown').toLowerCase();
  const langs = (Array.isArray(ex.languages_required) ? ex.languages_required : []).map(l => String(l).toLowerCase());
  const years = (ex.min_years_required === null || ex.min_years_required === undefined || ex.min_years_required === '') ? null : Number(ex.min_years_required);
  const contract = !!ex.contract_friendly;
  const wm = C.work_modes;

  let drop = null;
  if (Number.isFinite(years) && years >= maxYears + 1) drop = ['llm_experience', String(ex.experience_evidence || years + ' years').slice(0, 200)];
  else if (!seniorityOk.has(seniority)) drop = ['llm_seniority', seniority];
  else if (langs.some(l => blockedLang.some(b => l.includes(b)))) drop = ['llm_language', langs.join(', ')];
  else if (mode !== 'unknown' && !wm[mode].enabled) drop = ['llm_work_mode', mode];
  else if (mode === 'remote' && (visa === 'work_auth_required' || (BAD_REGIONS.has(region) && !contract))) drop = ['llm_location', region + ' / ' + visa];
  else if ((mode === 'hybrid' || mode === 'onsite') && wm[mode].require_visa) {
    if (visa === 'no_sponsorship' || visa === 'work_auth_required') drop = ['llm_visa', visa];
    else if (visa === 'unknown' && job.visa_signal !== 'positive' && C.visa.unknown_policy === 'drop') drop = ['llm_visa', 'unknown'];
  }
  if (drop) { out.push({ json: Object.assign(base, { outcome: 'dropped_llm', reason: drop[0], detail: drop[1] }) }); continue; }

  // ---- score (same four factors as v1; feasibility now reads visa_status and remote region) ----
  const match = clamp(llm.match_score);
  const juniorish = ['intern', 'entry', 'junior'].includes(seniority);
  const wide = WIDE.has(region);
  const visaOk = visa === 'sponsors' || visa === 'relocation_support' || job.visa_signal === 'positive';
  const filterFit = ((juniorish ? 1 : 0) + (mode === 'remote' ? 1 : 0) + (wide ? 1 : 0) + (visaOk || contract ? 1 : 0)) / 4 * 100;
  const feasibility = mode === 'remote'
    ? (wide ? 75 : region === 'unknown' ? 55 : 35) + (contract ? 10 : 0)
    : (visa === 'sponsors' ? 90 : visa === 'relocation_support' ? 80 : job.visa_signal === 'positive' ? 70 : 30);
  const days = (Date.now() - new Date(job.posted_date).getTime()) / 86400000;
  const recency = days <= 2 ? 100 : days <= 7 ? 80 : days <= 14 ? 60 : 40;
  const final = Math.round(W.match * match + W.filterFit * filterFit + W.feasibility * Math.min(100, feasibility) + W.recency * recency);
  const breakdown = 'match=' + match + '; fit=' + Math.round(filterFit) + '; feas=' + Math.min(100, feasibility) + '; rec=' + recency;
  if (final < C.scoring.min_score) { out.push({ json: Object.assign(base, { outcome: 'below_score', reason: 'below_min_score', final_score: final, detail: breakdown }) }); continue; }

  const CLEAN = new Set(['linkedin', 'ats', 'working-nomads', 'remotive', 'remoteok', 'arbeitnow', 'weworkremotely', 'weworkremotely-mkt', 'jobicy', 'himalayas', 'revopsroles', 'remocate']);
  const cleanTitle = (!CLEAN.has(job.source) || job.title.length > 120 || job.title === '(untitled)') && ex.job_title ? String(ex.job_title) : job.title;
  const company = (job.company === 'unknown' || /^r\//.test(job.company)) && ex.company ? String(ex.company) : job.company;
  out.push({ json: Object.assign(base, {
    outcome: 'matched', final_score: final,
    match: {
      posting_id: job.posting_id, url: job.url, source: job.source, kind: job.kind,
      title: cleanTitle.slice(0, 300), company: company.slice(0, 200), location_raw: job.location_raw,
      work_mode: mode, employment_type: String(ex.employment_type || job.employment_type || 'unknown'),
      posted_date: job.posted_date, final_score: final, priority: final >= C.scoring.priority_score,
      why_match: llm.why_match || '', red_flags: (Array.isArray(llm.red_flags) ? llm.red_flags : []).join('; '),
      seniority, min_years_required: Number.isFinite(years) ? years : (job.regex_min_years ?? ''),
      experience_evidence: String(ex.experience_evidence || job.regex_evidence || '').slice(0, 300),
      languages_required: langs.join(', '), visa_status: visa === 'unknown' && job.visa_signal === 'positive' ? 'signal:' + job.visa_evidence : visa,
      remote_region: region, contract_friendly: contract, company_size_hint: ex.company_size_hint || 'unknown',
      salary: ex.salary || 'not listed', confidence: clamp(llm.confidence), provider, score_breakdown: breakdown
    }
  }) });
}
return out.length ? out : [{ json: { __empty: true } }];
