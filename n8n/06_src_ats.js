// Job Radar v2 | Src ATS (Code, run once for all items)
// Company watchlist read straight from public ATS job-board APIs (no key, stable JSON, full descriptions):
//   Greenhouse  https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
//   Lever       https://api.lever.co/v0/postings/{token}?mode=json
//   Ashby       https://api.ashbyhq.com/posting-api/job-board/{token}
// Companies live in config sources.ats.companies [{name, ats, token}] and are edited in the console.
const SOURCE = 'ats';
const L = $('Load Config').first().json;
const S = (L.config.sources || {})[SOURCE] || {};
if (!S.enabled || L.due[SOURCE] === false) return [{ json: { source: SOURCE, __skip: 'disabled_or_not_due' } }];
const companies = S.companies || [];
if (!companies.length) return [{ json: { source: SOURCE, __skip: 'no_companies' } }];

const cutoff = Date.now() - (Number(L.config.freshness.window_days) || 7) * 86400000;
const cap = Number(S.max_per_company) || 30;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const decode = s => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const strip = s => decode(decode(String(s || ''))).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const mode = (wt, remote, loc) => {
  const w = String(wt || '').toLowerCase();
  if (w.includes('hybrid')) return 'hybrid';
  if (w.includes('remote') || remote === true) return 'remote';
  if (w.includes('onsite') || w.includes('on-site') || w.includes('in office')) return 'onsite';
  return /\bremote\b/i.test(loc || '') ? 'remote' : (/\bhybrid\b/i.test(loc || '') ? 'hybrid' : 'unknown');
};

const out = [];
const errors = [];
for (const c of companies) {
  try {
    let rows = [];
    if (c.ats === 'greenhouse') {
      const r = await this.helpers.httpRequest({ method: 'GET', json: true, timeout: 20000,
        url: 'https://boards-api.greenhouse.io/v1/boards/' + encodeURIComponent(c.token) + '/jobs?content=true' });
      rows = (r.jobs || []).map(j => ({
        id: String(j.id), title: j.title, url: j.absolute_url, loc: (j.location && j.location.name) || '',
        posted: j.first_published || j.updated_at, desc: strip(j.content), wm: mode('', null, (j.location && j.location.name) || '')
      }));
    } else if (c.ats === 'lever') {
      const r = await this.helpers.httpRequest({ method: 'GET', json: true, timeout: 20000,
        url: 'https://api.lever.co/v0/postings/' + encodeURIComponent(c.token) + '?mode=json' });
      rows = (Array.isArray(r) ? r : []).map(j => ({
        id: j.id, title: j.text, url: j.hostedUrl, loc: (j.categories && j.categories.location) || '',
        posted: j.createdAt, emp: j.categories && j.categories.commitment,
        desc: strip([j.descriptionPlain || j.description, ...(j.lists || []).map(l => l.text + ': ' + strip(l.content)), j.additionalPlain].join(' ')),
        wm: mode(j.workplaceType, null, (j.categories && j.categories.location) || '')
      }));
    } else if (c.ats === 'ashby') {
      const r = await this.helpers.httpRequest({ method: 'GET', json: true, timeout: 20000,
        url: 'https://api.ashbyhq.com/posting-api/job-board/' + encodeURIComponent(c.token) });
      rows = (r.jobs || []).filter(j => j.isListed !== false).map(j => ({
        id: j.id || j.jobUrl, title: j.title, url: j.jobUrl, loc: j.location || '', posted: j.publishedAt,
        emp: j.employmentType, desc: strip(j.descriptionPlain || j.descriptionHtml), wm: mode(j.workplaceType, j.isRemote, j.location)
      }));
    }
    const fresh = rows.filter(j => j.url && (!j.posted || new Date(j.posted).getTime() >= cutoff)).slice(0, cap);
    for (const j of fresh) {
      out.push({ json: {
        source: SOURCE, source_id: c.ats + ':' + c.token + ':' + j.id, title: j.title, company: c.name, url: j.url,
        location_raw: j.loc, work_mode: j.wm, employment_type_raw: j.emp || '',
        posted_date: j.posted ? new Date(j.posted).toISOString() : new Date().toISOString(), posted_estimated: !j.posted,
        description_text: j.desc.slice(0, 6000), needs_detail: false, ats_company: c.name
      } });
    }
  } catch (e) {
    errors.push(c.name + ' (' + c.ats + '/' + c.token + '): ' + String(e.message || e).slice(0, 80));
  }
  await sleep(400);
}
if (errors.length) out.push({ json: { source: SOURCE, __error: SOURCE + ': ' + errors.join(' | ').slice(0, 400) } });
if (!out.length) return [{ json: { source: SOURCE, __skip: 'nothing_fresh' } }];
return out;
