// Job Radar v2 | Src LinkedIn (Code, run once for all items)
// LinkedIn public guest endpoint (no login, no cookies, $0). The laptop's residential IP is the
// reason this works: keep it to <= 20 list requests a run (enforced in jr_validate_config).
// Descriptions are fetched later by "Detail Fetch", only for postings that survive gate A and dedupe.
const SOURCE = 'linkedin';
const L = $('Load Config').first().json;
const S = (L.config.sources || {})[SOURCE] || {};
if (!S.enabled || S.mode !== 'guest' || L.due[SOURCE] === false) return [{ json: { source: SOURCE, __skip: 'disabled_or_not_due' } }];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const WT = { onsite: 1, remote: 2, hybrid: 3 };
const EXP = { internship: 1, entry: 2, associate: 3, mid_senior: 4, director: 5, executive: 6 };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const decode = s => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, ' ');
const strip = s => decode(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const pick = (html, re) => { const m = html.match(re); return m ? strip(m[1]) : ''; };

const windowSec = Math.max(1, Math.min(30, Number(L.config.freshness.window_days) || 7)) * 86400;
const out = [];
const seen = new Set();
let requests = 0, blocked = false, lastError = '';

for (const s of (S.searches || [])) {
  if (blocked) break;
  const modes = (s.work_types || []).filter(w => WT[w]);
  const mode = modes.length === 1 ? modes[0] : 'unknown';
  for (let page = 0; page < Math.min(3, Number(S.max_pages) || 1); page++) {
    // Built by hand: the n8n Code-node sandbox has no URLSearchParams.
    const params = [['keywords', s.keywords], ['location', s.location || 'Worldwide'], ['f_TPR', 'r' + windowSec],
                    ['sortBy', 'DD'], ['start', String(page * 10)]];
    if (modes.length) params.push(['f_WT', modes.map(w => WT[w]).join(',')]);
    const exps = (s.experience || []).map(e => EXP[e]).filter(Boolean);
    if (exps.length) params.push(['f_E', exps.join(',')]);
    const qs = params.map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
    let html = '';
    try {
      requests++;
      html = String(await this.helpers.httpRequest({
        method: 'GET',
        url: 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?' + qs,
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', 'Accept': 'text/html' },
        json: false, timeout: 20000
      }));
    } catch (e) {
      lastError = String(e.message || e).slice(0, 160);
      if (/429|999|403/.test(lastError)) blocked = true;   // LinkedIn throttled this IP: stop for today
      break;
    }
    const cards = html.split(/<li[\s>]/).slice(1);
    if (!cards.length) break;
    for (const c of cards) {
      const id = (c.match(/urn:li:jobPosting:(\d+)/) || c.match(/\/jobs\/view\/[^"?]*?-(\d{6,})/) || [])[1];
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const dt = (c.match(/<time[^>]*datetime="(\d{4}-\d{2}-\d{2})"/) || [])[1];
      out.push({ json: {
        source: SOURCE, source_id: id,
        title: pick(c, /base-search-card__title[^>]*>([\s\S]*?)<\/h3>/),
        company: pick(c, /base-search-card__subtitle[^>]*>([\s\S]*?)<\/h4>/) || 'unknown',
        url: 'https://www.linkedin.com/jobs/view/' + id + '/',
        location_raw: pick(c, /job-search-card__location[^>]*>([\s\S]*?)<\/span>/),
        work_mode: mode,
        posted_date: dt ? new Date(dt + 'T12:00:00Z').toISOString() : new Date().toISOString(),
        posted_estimated: !dt,
        description_text: '',
        needs_detail: !!S.detail,
        detail: { mode: 'linkedin', id },
        search: s.keywords
      } });
    }
    if (cards.length < 10) break;
    await sleep(2500);
  }
  await sleep(2500);
}

if (!out.length) {
  return [{ json: { source: SOURCE, __error: SOURCE + ': ' + (lastError || 'no cards parsed (' + requests + ' requests): markup changed or no results') } }];
}
if (lastError) out.push({ json: { source: SOURCE, __error: SOURCE + ': partial, ' + lastError } });
return out;
