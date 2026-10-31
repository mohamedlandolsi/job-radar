// Job Radar v2 | Detail Fetch (Code, run once for all items). Input: "Rejoin".
// List-only sources (LinkedIn, Jina boards) arrive without a description. Fetch it only now, after
// gate A and dedupe, and only for the best llm.detail_cap candidates (title role match and junior
// words first). The rest is deferred (stays queued) and retried next run while still fresh.
const L = $('Load Config').first().json;
const C = L.config;
const items = $input.all().map(i => i.json).filter(j => j.url);
if (!items.length) return [{ json: { __empty: true } }];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
let JINA_KEY = '';
try { JINA_KEY = $env.JINA_API_KEY || ''; } catch (e) { JINA_KEY = ''; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const decode = s => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, ' ');
const strip = s => decode(String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|h\d)>/gi, '\n').replace(/<[^>]*>/g, ' '))
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
const mdClean = s => String(s || '').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/[#>*_`|]+/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
const junior = (() => { try { return new RegExp(C.search.title_junior_regex, 'i'); } catch (e) { return /$^/; } })();
const prio = j => (junior.test(j.title) ? 2 : 0) + (/\b(gtm|automation|revops|n8n|clay|hubspot|crm)\b/i.test(j.title) ? 1 : 0);

// Budget is spent per attempted fetch, in priority order. When LinkedIn throttles, its remaining items are
// deferred without using budget, so the slots go to the next Jina candidates (run 3, 2026-10-30: 29 LinkedIn
// deferrals had blocked 7 Jina fetches).
const need = items.filter(j => j.needs_detail && j.detail && j.detail.mode !== 'none').sort((a, b) => prio(b) - prio(a));
const budget = Math.max(0, Number(C.llm.detail_cap) || 0);
let used = 0;
const startedAt = Date.now();
let liBlocked = false;
let timeLimitS = 280;
try { timeLimitS = Math.max(120, (Number($env.N8N_RUNNERS_TASK_TIMEOUT) || 300) - 20); } catch (e) { /* default */ }

for (const j of items) if (!j.needs_detail || !j.detail || j.detail.mode === 'none') j.detail_status = 'not_needed';
for (const j of need) {
  if (j.detail.mode === 'linkedin' && liBlocked) { j.detail_status = 'deferred'; continue; }   // no budget used
  if (used >= budget) { j.detail_status = 'deferred'; continue; }
  if ((Date.now() - startedAt) / 1000 > timeLimitS) { j.detail_status = 'deferred'; continue; }
  used++;
  try {
    if (j.detail.mode === 'linkedin') {
      const html = String(await this.helpers.httpRequest({ method: 'GET', json: false, timeout: 20000,
        url: 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/' + j.detail.id,
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } }));
      const body = (html.match(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '';
      const crit = {};
      const re = /description__job-criteria-subheader[^>]*>([\s\S]*?)<\/h3>[\s\S]*?description__job-criteria-text[^>]*>([\s\S]*?)<\/span>/g;
      let m;
      while ((m = re.exec(html)) !== null) crit[strip(m[1]).toLowerCase()] = strip(m[2]);
      j.description_text = strip(body).slice(0, 6000);
      if (crit['seniority level']) j.seniority_hint = crit['seniority level'].toLowerCase().replace(/\s+/g, '-');
      if (crit['employment type'] && j.employment_type === 'unknown') {
        const e = crit['employment type'].toLowerCase();
        j.employment_type = e.includes('intern') ? 'internship' : e.includes('contract') ? 'contract' : e.includes('part') ? 'part_time'
          : e.includes('full') ? 'full_time' : e.includes('temporary') ? 'contract' : 'unknown';
      }
      await sleep(2000);
    } else if (j.detail.mode === 'jina') {
      const headers = { 'Accept': 'application/json', 'X-Timeout': '25', 'X-Return-Format': 'markdown' };
      if (JINA_KEY) headers.Authorization = 'Bearer ' + JINA_KEY;
      const res = await this.helpers.httpRequest({ method: 'GET', url: 'https://r.jina.ai/' + (j.detail.url || j.url), headers, json: true, timeout: 45000 });
      const md = typeof res === 'string' ? res : String((res && res.data && res.data.content) || (res && res.content) || '');
      const titleFromPage = res && res.data && res.data.title;
      j.description_text = mdClean(md).slice(0, 6000);
      if (titleFromPage && (j.title === '(untitled)' || j.title.length > 140)) j.title = String(titleFromPage).slice(0, 200);
      await sleep(JINA_KEY ? 800 : 3500);
    }
    j.detail_status = (j.description_text || '').length >= 80 ? 'ok' : 'failed';
  } catch (e) {
    j.detail_status = 'failed';
    j.detail_error = String(e.message || e).slice(0, 120);
    if (/429|999/.test(j.detail_error) && j.detail.mode === 'linkedin') liBlocked = true;   // throttled: defer the rest
  }
}
return items.map(j => ({ json: j }));
