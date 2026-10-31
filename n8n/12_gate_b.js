// Job Radar v2 | Gate B (Code, run once for all items). Input: "Detail Fetch".
// Deterministic gates on the description, before any LLM call:
//   experience_years  "3+ years of experience", "minimum two (2) years", "Experience: 2+ yrs" ...
//   language          required non-English language, banned phrases, or a JD written in German/French
//   visa_negative / work_authorization / visa_unknown   (hybrid and on-site need a visa signal)
//   remote_region_desc  "US only", "must reside in the UK" ...
//   opportunity_blocked  commission only, revenue share, pay per meeting, partnership offers
// Rule: drop only on clear evidence. Ambiguous cases go to the LLM, which re-checks (gate C).
const L = $('Load Config').first().json;
const C = L.config;
const items = $input.all().map(i => i.json).filter(j => j.url);
if (!items.length) return [{ json: { __empty: true } }];

const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phraseRe = terms => (terms && terms.length)
  ? new RegExp('(?:^|[^a-z0-9])(' + terms.map(t => esc(String(t).toLowerCase()).replace(/\s+/g, '\\s+')).join('|') + ')(?=$|[^a-z0-9])', 'i') : null;
const hit = (re, text) => { if (!re) return ''; const m = String(text || '').match(re); return m ? m[1] : ''; };

// ---- experience: minimum years required (lenient: the smallest stated minimum wins) ----
const WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const N = '(\\d{1,2}(?:\\.\\d)?|zero|one|two|three|four|five|six|seven|eight|nine|ten)';
const YEARS_RE = new RegExp('(up to |less than |under |at least |a minimum of |minimum of |minimum |min\\.? |over |more than )?' + N +
  '(?:\\s*\\(\\d{1,2}\\))?\\s*(\\+|plus| or more)?\\s*(?:(?:-|to|or)\\s*' + N + '\\s*\\+?\\s*)?(years?|yrs?|months?)\\b', 'g');
const toNum = s => (s in WORDS ? WORDS[s] : Number(s));
function minYears(text) {
  const t = ' ' + String(text || '').toLowerCase().replace(/[‐-―]/g, '-').replace(/\s+/g, ' ') + ' ';
  const zeroHint = /\b(no (prior |previous |professional )?(work )?experience (is )?(required|needed|necessary)|new grads?|recent graduates?|0 years)\b/.test(t);
  let best = null, evidence = '';
  YEARS_RE.lastIndex = 0;
  let m;
  while ((m = YEARS_RE.exec(t)) !== null) {
    const after = t.slice(YEARS_RE.lastIndex, YEARS_RE.lastIndex + 80);
    const before = t.slice(Math.max(0, m.index - 50), m.index);
    const expAfter = /^\s*(?:'s|’s)?\s*(?:of\s+)?(?:[a-z0-9/&+.,'’()-]+\s+){0,6}?(?:experience|exp\b|work history|track record)/.test(after);
    const expBefore = /(?:experience|exp)\s*(?:required|level|needed)?\s*(?:[:\-–]|of)?\s*$/.test(before);
    if (!expAfter && !expBefore) continue;
    if (/\b(combined|collective|total team)\b/.test(after.slice(0, 40))) continue;
    if (/\b(founded|since|ago|in business|history of|established|for over)\b[^.]{0,25}$/.test(before)) continue;
    if (/^[^.]{0,60}\b(nice to have|is a plus|a plus|bonus|preferred|ideally|advantage)\b/.test(after)) continue;
    let lo = toNum(m[2]);
    if (/^month/.test(m[5])) lo = lo / 12;
    if (/up to|less than|under/.test(m[1] || '')) lo = 0;
    if (!Number.isFinite(lo)) continue;
    if (best === null || lo < best) { best = lo; evidence = t.slice(Math.max(0, m.index - 20), YEARS_RE.lastIndex + 45).trim(); }
  }
  return { min: best, evidence: evidence.slice(0, 160), zeroHint };
}

// ---- language ----
const blocked = (C.languages.blocked || []).map(s => s.toLowerCase());
const langReqRe = blocked.length ? new RegExp(
  '\\b(?:(?:fluent|fluency|native|proficient|proficiency|business[- ]level|professional|excellent|strong|working)\\s+(?:in\\s+|command of\\s+)?(' + blocked.map(esc).join('|') +
  ')|(' + blocked.map(esc).join('|') + ')\\s*(?:\\((?:c1|c2|b2)\\)|c1|c2|b2)?\\s*(?:language\\s+)?(?:skills\\s+)?(?:is\\s+|are\\s+)?(?:required|mandatory|essential|a must|must[- ]have|needed))\\b', 'i') : null;
const bannedRe = phraseRe(C.languages.banned_phrases);
// Pay models and offers that are not paid work: commission only, revenue share, pay per meeting, partnerships.
const offerRe = phraseRe((C.opportunity || {}).block_phrases);
const STOP = {
  german: [' und ', ' der ', ' die ', ' das ', ' wir ', ' für ', ' mit ', ' sie ', ' ist ', ' nicht ', ' auf '],
  french: [' et ', ' les ', ' des ', ' nous ', ' pour ', ' vous ', ' une ', ' dans ', ' sur ', ' avec '],
  dutch: [' en ', ' het ', ' een ', ' wij ', ' voor ', ' met ', ' van ', ' je ', ' zijn '],
  spanish: [' y ', ' los ', ' las ', ' para ', ' con ', ' una ', ' del ', ' nuestro ', ' somos ']
};
const EN = [' and ', ' the ', ' you ', ' we ', ' for ', ' with ', ' our ', ' to ', ' of ', ' is '];
const count = (t, words) => words.reduce((n, w) => n + t.split(w).length - 1, 0);
function jdLanguage(text) {
  const t = ' ' + String(text || '').toLowerCase().replace(/\s+/g, ' ').slice(0, 2500) + ' ';
  const en = count(t, EN);
  let best = 'english', bestN = en;
  for (const [lang, words] of Object.entries(STOP)) { const n = count(t, words); if (n > bestN * 1.3 && n >= 8) { best = lang; bestN = n; } }
  return best;
}

// ---- visa and region ----
const posRe = phraseRe(C.visa.positive_terms);
const negRe = phraseRe(C.visa.negative_terms);
const authRe = phraseRe(C.visa.work_auth_terms);
const descBlockRe = phraseRe(C.work_modes.remote.desc_block);
const sponsors = (C.visa.known_sponsors || []).map(s => s.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean);
const isSponsor = company => { const c = String(company || '').toLowerCase().replace(/[^a-z0-9]/g, ''); return !!c && sponsors.some(s => c === s || c.startsWith(s)); };
const modeOf = t => /\bhybrid\b/i.test(t) ? 'hybrid' : /\b(fully remote|remote[- ]first|100% remote|work from anywhere|remote position|remote role)\b/i.test(t) ? 'remote'
  : /\b(on[- ]?site|in[- ]office|office[- ]based|onsite)\b/i.test(t) ? 'onsite' : 'unknown';

const maxYears = Number(C.experience.max_years_required) || 0;

function gate(j) {
  if (j.detail_status === 'deferred') return ['deferred', 'detail_deferred', ''];
  if (j.detail_status === 'failed') return ['retry', 'detail_retry', j.detail_error || ''];
  const desc = String(j.description_text || '');
  if (desc.trim().length < 50) return ['drop', 'no_description', desc.length + ' chars'];
  const low = desc.toLowerCase();
  const offer = hit(offerRe, String(j.title || '').toLowerCase() + ' \n ' + low);
  if (offer) return ['drop', 'opportunity_blocked', offer];

  if (j.work_mode === 'unknown') {
    const m = modeOf(desc.slice(0, 2000));
    if (m !== 'unknown') { j.work_mode = m; j.work_mode_from = 'description'; }
  }
  const wm = C.work_modes;
  if ((j.work_mode === 'hybrid' || j.work_mode === 'onsite') && !wm[j.work_mode].enabled) return ['drop', 'mode_disabled', j.work_mode];
  if (j.work_mode === 'remote' && !wm.remote.enabled) return ['drop', 'mode_disabled', 'remote'];

  const ex = minYears(desc);
  j.regex_min_years = ex.min;
  j.regex_evidence = ex.evidence;
  if (ex.min !== null && ex.min >= maxYears + 1) return ['drop', 'experience_years', ex.evidence];

  if (C.languages.detect_jd_language) {
    const lang = jdLanguage(desc);
    j.jd_language = lang;
    if (lang !== 'english' && blocked.includes(lang)) return ['drop', 'language', 'description written in ' + lang];
  }
  const lr = desc.match(langReqRe || /$^/);
  if (lr) return ['drop', 'language', lr[0].trim().slice(0, 80)];
  const banned = hit(bannedRe, low);
  if (banned) return ['drop', 'banned_phrase', banned];

  const neg = hit(negRe, low);
  const auth = hit(authRe, low);
  const pos = hit(posRe, low);
  j.visa_signal = neg ? 'negative' : auth ? 'work_auth' : (pos || j.visa_flag === true || isSponsor(j.company)) ? 'positive' : 'unknown';
  j.visa_evidence = neg || auth || pos || (j.visa_flag === true ? 'source flag' : isSponsor(j.company) ? 'known sponsor' : '');

  if (j.work_mode === 'remote') {
    if (auth) return ['drop', 'work_authorization', auth];   // specific phrases only, e.g. "authorized to work in the us"
    const region = hit(descBlockRe, low);
    if (region) return ['drop', 'remote_region_desc', region];
  } else if (j.work_mode === 'hybrid' || j.work_mode === 'onsite') {
    if (wm[j.work_mode].require_visa) {
      if (neg) return ['drop', 'visa_negative', neg];
      if (auth) return ['drop', 'work_authorization', auth];
      if (j.visa_signal !== 'positive' && C.visa.unknown_policy === 'drop') return ['drop', 'visa_unknown', 'no sponsorship or relocation signal'];
    }
  }
  return ['pass', '', ''];
}

return items.map(j => {
  const [g, reason, detail] = gate(j);
  return { json: Object.assign(j, { gate_b: g, gate_b_reason: reason, gate_b_detail: String(detail || '').slice(0, 300) }) };
});
