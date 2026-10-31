// Job Radar v2 | Src Boards (Code, run once for all items)
// Generic "Jina Reader bridge" for job boards without an API (ADR-JR-29). Each board is DATA in the
// config (list_urls + job_url_regex), edited from the console: fixing a board never needs a code change.
// r.jina.ai renders JavaScript pages (headless browser) and returns markdown. Free without a key at
// 20 requests/minute per IP, so requests are paced at 3.5 s. Set JINA_API_KEY in n8n env to go faster.
const L = $('Load Config').first().json;
const boards = ((L.config.sources || {}).boards || []).filter(b => b.enabled && L.due[b.key] !== false);
if (!boards.length) return [{ json: { source: 'boards', __skip: 'none_enabled_or_due' } }];

let JINA_KEY = '';
try { JINA_KEY = $env.JINA_API_KEY || ''; } catch (e) { JINA_KEY = ''; }
const headers = { 'Accept': 'application/json', 'X-Timeout': '25', 'X-Return-Format': 'markdown' };
if (JINA_KEY) headers.Authorization = 'Bearer ' + JINA_KEY;
const PACE = JINA_KEY ? 800 : 3500;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const GENERIC = /^(apply( now)?|view( job| role| details)?|see (job|more|details)|learn more|details|read more|open|new|featured|save|share)$/i;
const cleanText = s => String(s || '')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')            // images
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')           // nested links
  .replace(/[#>*_`|]+/g, ' ').replace(/\\/g, '').replace(/\s+/g, ' ').trim();

// "3d ago", "8h ago", "today", "Oct 24", "2026-10-24" -> ISO date, else null
const parseWhen = (text) => {
  const t = String(text || '').toLowerCase();
  const now = Date.now();
  let m = t.match(/\b(\d{1,3})\s*(m|min|mins|minutes?|h|hr|hrs|hours?|d|days?|w|wk|weeks?|mo|months?)\b\.?\s*ago/);
  if (m) {
    const n = Number(m[1]); const u = m[2];
    const ms = /^m(in|ins|inutes?)?$/.test(u) ? 60e3 : /^h/.test(u) ? 3600e3 : /^d/.test(u) ? 86400e3 : /^w/.test(u) ? 7 * 86400e3 : 30 * 86400e3;
    return new Date(now - n * ms).toISOString();
  }
  if (/\b(just now|today|new)\b/.test(t)) return new Date(now).toISOString();
  if (/\byesterday\b/.test(t)) return new Date(now - 86400e3).toISOString();
  m = t.match(/\b(20\d\d-\d\d-\d\d)\b/);
  if (m) return new Date(m[1] + 'T12:00:00Z').toISOString();
  m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s+(20\d\d))?\b/);
  if (m) {
    const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
    const y = m[3] ? Number(m[3]) : new Date().getUTCFullYear();
    let d = Date.UTC(y, months[m[1]], Number(m[2]), 12);
    if (!m[3] && d > now + 2 * 86400e3) d = Date.UTC(y - 1, months[m[1]], Number(m[2]), 12);
    return new Date(d).toISOString();
  }
  return null;
};
// Last resort: "/job/acme-gtm-engineer-berlin/" -> "acme gtm engineer berlin"
const slugTitle = u => {
  const parts = String(u).split('?')[0].replace(/\/+$/, '').split('/');
  const slug = decodeURIComponent(parts[parts.length - 1] || '');
  // Trailing ids are dropped only when they contain a digit ("-rec0lebnhiss", "-dvs9j7"), never words like "-remote".
  return /[a-z]{3,}-[a-z]{3,}/i.test(slug) ? slug.replace(/-(?:rec)?(?=[a-z0-9]*\d)[a-z0-9]{6,}$/i, '').replace(/[-_]+/g, ' ').trim() : '';
};
const modeOf = t => /\bhybrid\b/i.test(t) ? 'hybrid' : /\b(remote|anywhere|worldwide|work from home|fully remote)\b/i.test(t) ? 'remote'
  : /\b(on[- ]?site|in[- ]office|onsite)\b/i.test(t) ? 'onsite' : 'unknown';
const seniorityOf = t => {
  const m = String(t || '').match(/\b(entry[- ]level|junior|intern(ship)?|mid[- ]level|senior|lead|staff\+?|exec(utive)?|director)\b/i);
  return m ? m[1].toLowerCase().replace(/\s+/g, '-') : '';
};

const out = [];
for (const b of boards) {
  let urlRe;
  try { urlRe = new RegExp('^(?:' + b.job_url_regex + ')', 'i'); }
  catch (e) { out.push({ json: { source: b.key, __error: b.key + ': bad job_url_regex (' + e.message + ')' } }); continue; }
  const seenUrl = new Set();
  let pages = 0, fails = 0, links = 0, lastErr = '';
  for (const listUrl of (b.list_urls || [])) {
    if (out.filter(i => i.json.source === b.key && i.json.url).length >= b.max_items) break;
    let md = '';
    try {
      const res = await this.helpers.httpRequest({ method: 'GET', url: 'https://r.jina.ai/' + listUrl, headers, json: true, timeout: 45000 });
      md = typeof res === 'string' ? res : String((res && res.data && res.data.content) || (res && res.content) || '');
      pages++;
    } catch (e) { fails++; lastErr = String(e.message || e).slice(0, 140); await sleep(PACE); continue; }
    const linkRe = /\[((?:[^\[\]]|\[[^\]]*\])*)\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/g;
    const found = [];
    let m;
    while ((m = linkRe.exec(md)) !== null) {
      const href = m[2].replace(/[.,;]+$/, '');
      if (!urlRe.test(href)) continue;
      links++;
      found.push({ text: m[1], href, start: m.index, end: linkRe.lastIndex });
    }
    for (let i = 0; i < found.length; i++) {
      const f = found[i];
      const url = f.href.split('#')[0];
      if (seenUrl.has(url)) continue;
      // Logo/image links carry no text: let a later link to the same job supply the title.
      if (!cleanText(f.text) && found.slice(i + 1).some(g => g.href.split('#')[0] === url && cleanText(g.text))) continue;
      const ctxEnd = i + 1 < found.length ? found[i + 1].start : Math.min(md.length, f.end + 500);
      const context = cleanText(md.slice(f.end, Math.min(ctxEnd, f.end + 500)));
      let title = cleanText(f.text);
      if (!title || GENERIC.test(title)) title = slugTitle(url);           // slug beats neighbouring card text
      if (!title || GENERIC.test(title)) {
        const before = cleanText(md.slice(Math.max(0, f.start - 300), f.start)).split(/\s{2,}|\n/).filter(Boolean);
        title = before.length ? before[before.length - 1].slice(-160) : '';
      }
      title = title.replace(/\s+(?:\d{1,3}\s*(?:m|min|h|hr|d|w|mo)[a-z]*\s+ago|today|yesterday|new|featured)\b.*$/i, '').trim();
      if (!title || GENERIC.test(title)) continue;
      seenUrl.add(url);
      const blob = title + ' ' + context;
      const posted = parseWhen(blob);
      out.push({ json: {
        source: b.key, source_id: url, title: title.slice(0, 220), company: 'unknown', url,
        location_raw: '', work_mode: modeOf(blob), seniority_hint: seniorityOf(blob),
        posted_date: posted || new Date().toISOString(), posted_estimated: !posted,
        description_text: '', list_context: context.slice(0, 400),
        needs_detail: b.detail === 'jina', detail: { mode: b.detail === 'jina' ? 'jina' : 'none', url }
      } });
      if (seenUrl.size >= b.max_items) break;
    }
    await sleep(PACE);
  }
  if (!seenUrl.size) {
    out.push({ json: { source: b.key, __error: b.key + ': ' + (fails ? 'fetch failed on ' + fails + ' page(s): ' + lastErr
      : 'parser_no_links (' + pages + ' page(s), regex matched ' + links + ' links): fix job_url_regex in the console') } });
  }
}
return out;
