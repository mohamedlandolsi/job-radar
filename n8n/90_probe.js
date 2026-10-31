// Job Radar v2 | Probe (Code, run once for all items). Throwaway workflow "JR v2 Probe" (Phase 2):
//   Manual Trigger -> "Get Config" (Postgres: select payload from v_jr_active_config;) -> "Probe" (this code)
// Runs on the laptop, so it sees exactly what production will see (same IP, same Jina limits).
// Output: one item per check. Nothing is written anywhere.
const cfgRaw = $('Get Config').first().json.payload;
const C = typeof cfgRaw === 'string' ? JSON.parse(cfgRaw) : cfgRaw;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const out = [];

// Candidate list URLs to test before adding them to config (edit freely).
const EXTRA = [
  { key: 'gtmjobs-xyz', url: 'https://gtmjobs.xyz/jobs/tools/hubspot' },
  { key: 'gtmjobs-xyz', url: 'https://gtmjobs.xyz/jobs/page/1' },
  { key: 'upliftgtm', url: 'https://upliftgtm.com/remote-jobs/revenue-operations' },
  { key: 'startup-jobs', url: 'https://startup.jobs/remote-jobs' }
];
const targets = [];
for (const b of (C.sources.boards || [])) for (const u of b.list_urls) targets.push({ b, u, extra: false });
for (const e of EXTRA) { const b = (C.sources.boards || []).find(x => x.key === e.key); if (b) targets.push({ b, u: e.url, extra: true }); }

// 1) Boards: every list URL through Jina, all links grouped by host + first path segment.
for (const { b, u, extra } of targets) {
  {
    const row = { check: 'board', key: b.key, enabled: b.enabled, extra, list_url: u };
    try {
      const res = await this.helpers.httpRequest({ method: 'GET', url: 'https://r.jina.ai/' + u, json: true, timeout: 45000,
        headers: { Accept: 'application/json', 'X-Timeout': '25' } });
      const md = typeof res === 'string' ? res : String((res && res.data && res.data.content) || '');
      const links = [...md.matchAll(/\[((?:[^\[\]]|\[[^\]]*\])*)\]\((https?:\/\/[^)\s]+)\)/g)].map(m => ({ text: m[1].replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\s+/g, ' ').trim().slice(0, 90), href: m[2] }));
      let re = null; try { re = new RegExp('^(?:' + b.job_url_regex + ')', 'i'); } catch (e) { row.regex_error = e.message; }
      const groups = {};
      for (const l of links) {
        const g = String(l.href).match(/^https?:\/\/([^\/?#]+)\/?([^\/?#]*)/i);   // no URL global in the n8n sandbox
        if (g) { const k = g[1].toLowerCase() + '/' + g[2]; (groups[k] = groups[k] || []).push(l); }
      }
      Object.assign(row, {
        chars: md.length, links: links.length, regex_matches: re ? links.filter(l => re.test(l.href)).length : 0,
        sample_matches: re ? links.filter(l => re.test(l.href)).slice(0, 5) : [],
        top_groups: Object.entries(groups).sort((a, z) => z[1].length - a[1].length).slice(0, 6)
          .map(([k, v]) => ({ group: k, count: v.length, sample: v.slice(0, 3) })),
        head: md.slice(0, 600)
      });
    } catch (e) { row.error = String(e.message || e).slice(0, 200); }
    out.push({ json: row });
    await sleep(3500);
  }
}

// 2) LinkedIn guest endpoint: one request with the first configured search.
const s = (C.sources.linkedin.searches || [])[0];
if (s) {
  try {
    const html = String(await this.helpers.httpRequest({ method: 'GET', json: false, timeout: 20000, headers: { 'User-Agent': UA },
      url: 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=' + encodeURIComponent(s.keywords) +
           '&location=' + encodeURIComponent(s.location) + '&f_TPR=r604800&f_WT=2&f_E=1%2C2&start=0' }));
    out.push({ json: { check: 'linkedin', cards: (html.match(/urn:li:jobPosting:\d+/g) || []).length,
      has_title_class: html.includes('base-search-card__title'), has_location_class: html.includes('job-search-card__location'), bytes: html.length } });
  } catch (e) { out.push({ json: { check: 'linkedin', error: String(e.message || e).slice(0, 200) } }); }
}

// 3) Working Nomads feed.
try {
  const rows = await this.helpers.httpRequest({ method: 'GET', json: true, timeout: 30000, url: 'https://www.workingnomads.com/api/exposed_jobs/' });
  out.push({ json: { check: 'working-nomads', jobs: Array.isArray(rows) ? rows.length : 0, sample: Array.isArray(rows) ? rows.slice(0, 2).map(r => r.title) : [] } });
} catch (e) { out.push({ json: { check: 'working-nomads', error: String(e.message || e).slice(0, 200) } }); }

// 4) ATS tokens for the watchlist candidates (edit this list freely).
const CANDIDATES = [
  { name: 'Clay', tokens: ['clay', 'claylabs'] }, { name: 'Cargo', tokens: ['cargo', 'getcargo'] }, { name: 'n8n', tokens: ['n8n'] },
  { name: 'Attio', tokens: ['attio'] }, { name: 'Unify', tokens: ['unify', 'unifygtm'] }, { name: 'Common Room', tokens: ['commonroom'] },
  { name: 'lemlist', tokens: ['lemlist'] }, { name: 'Instantly', tokens: ['instantly'] }, { name: 'HeyReach', tokens: ['heyreach'] },
  { name: 'Apollo.io', tokens: ['apolloio', 'apollo'] }, { name: 'Remote', tokens: ['remotecom'] }, { name: 'Deel', tokens: ['deel'] },
  { name: 'Oyster', tokens: ['oyster', 'oysterhr'] }, { name: 'Bolt', tokens: ['bolt', 'boltdev'] }, { name: 'Wolt', tokens: ['wolt'] },
  { name: 'Scalable Capital', tokens: ['scalablecapital', 'scalable'] }, { name: 'Taxfix', tokens: ['taxfix'] },
  { name: 'NavVis', tokens: ['navvis'] }, { name: 'gridX', tokens: ['gridx'] }, { name: 'Forto', tokens: ['forto'] }, { name: 'AUTO1 Group', tokens: ['auto1', 'auto1group'] }
];
const ATS = {
  greenhouse: t => 'https://boards-api.greenhouse.io/v1/boards/' + t + '/jobs',
  lever: t => 'https://api.lever.co/v0/postings/' + t + '?mode=json&limit=5',
  ashby: t => 'https://api.ashbyhq.com/posting-api/job-board/' + t
};
for (const c of CANDIDATES) {
  const found = [];
  for (const t of c.tokens) for (const [ats, url] of Object.entries(ATS)) {
    try {
      const r = await this.helpers.httpRequest({ method: 'GET', json: true, timeout: 12000, url: url(t) });
      const n = Array.isArray(r) ? r.length : ((r && r.jobs) || []).length;
      if (n > 0 || (r && r.jobs)) found.push({ ats, token: t, jobs: n });
    } catch (e) { /* 404 = not this ATS */ }
    await sleep(250);
  }
  out.push({ json: { check: 'ats', name: c.name, found } });
}
return out;
