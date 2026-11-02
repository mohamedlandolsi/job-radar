// Source pacing and retries: LinkedIn list requests (8-12 s apart, one 60 s retry on the first 429/999, stop on
// the second, 20 requests at most) and Jina boards (an empty list page is retried once, uncached, in the browser).
import fs from 'node:fs';
import { makeEnv } from './harness.mjs';
const [, , CFG, N8N] = process.argv;
const base = JSON.parse(fs.readFileSync(CFG, 'utf8'));
let fails = 0;
const check = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const delays = [];
const instant = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms) => { delays.push(ms); return instant(fn, ms); };   // record the waits, still instant

const T429 = () => { throw new Error('Request failed with status code 429'); };
const T999 = () => { throw new Error('Request failed with status code 999'); };
const card = id => `<li><div class="base-card" data-entity-urn="urn:li:jobPosting:${id}">
  <h3 class="base-search-card__title">GTM Engineer ${id}</h3><h4 class="base-search-card__subtitle">Acme</h4></div></li>`;
const cards = (from, n) => Array.from({ length: n }, (_, i) => card(from + i)).join('');

// steps: one response (or thrower) per LinkedIn list request, in order
async function runLinkedIn(searches, maxPages, steps) {
  const config = structuredClone(base);
  config.sources.linkedin = { enabled: true, mode: 'guest', max_pages: maxPages, detail: false,
    searches: Array.from({ length: searches }, (_, i) => ({ keywords: 'kw ' + i, location: 'Worldwide', work_types: ['remote'] })) };
  const calls = [];
  const E = makeEnv(N8N, {}, async (o) => {
    if (!o.url.includes('seeMoreJobPostings')) throw new Error('unexpected ' + o.url);
    calls.push(o.url);
    const step = typeof steps === 'function' ? steps(calls.length) : steps[calls.length - 1];
    return typeof step === 'function' ? step() : step;
  });
  E.set('Load Config', [{ config, due: {} }]);
  delays.length = 0;
  const out = await E.run('Src LinkedIn', '02_src_linkedin.js', [{}]);
  return { out, calls, jobs: out.filter(j => j.source_id), errors: out.filter(j => j.__error).map(j => j.__error), waits: [...delays] };
}

// 1. 429 then 200: the same request is retried after 60 s and its cards are kept
let r = await runLinkedIn(2, 1, [T429, cards(100, 3), cards(200, 2)]);
check(r.calls.length === 3 && r.calls[0] === r.calls[1], 'first 429 retries the same request once (' + r.calls.length + ' calls)');
check(r.jobs.length === 5 && r.jobs.some(j => j.source_id === '100'), 'cards from the retried request and the next search are kept (' + r.jobs.length + ')');
check(!r.errors.length, 'a recovered 429 leaves no error (' + r.errors.join(' | ') + ')');
check(r.waits.filter(w => w === 60000).length === 1, 'retry waited 60 s');
const gaps = r.waits.filter(w => w !== 60000);
check(gaps.length === 1 && gaps.every(w => w >= 8000 && w < 12000), 'next request waited 8-12 s (' + gaps.join(',') + ')');

// 2. 429 twice in a row: LinkedIn stops for the run, earlier cards survive
r = await runLinkedIn(3, 1, [cards(100, 4), T429, T429, cards(300, 4)]);
check(r.calls.length === 3, 'second 429 stops LinkedIn (' + r.calls.length + ' calls)');
check(r.jobs.length === 4, 'cards fetched before the stop are kept (' + r.jobs.length + ')');
check(r.errors.length === 1 && r.errors[0] === 'linkedin: partial after 1 of 3 requests, 429', 'error text: ' + r.errors[0]);

// 3. a later 999 after a recovered 429 is the second of the run: stop, no second retry
r = await runLinkedIn(3, 1, [T429, cards(100, 4), T999, cards(300, 4)]);
check(r.calls.length === 3 && r.errors[0] === 'linkedin: partial after 1 of 3 requests, 999', 'second throttle of the run stops: ' + r.errors[0]);

// 4. 429 twice with no cards at all still reports the partial error
r = await runLinkedIn(2, 1, [T429, T429]);
check(r.out.length === 1 && r.errors[0] === 'linkedin: partial after 0 of 2 requests, 429', 'stop before any card: ' + r.errors[0]);

// 5. pagination and pacing over pages and searches, never more than 20 requests
r = await runLinkedIn(10, 3, () => cards(Math.floor(Math.random() * 1e9), 10));
check(r.calls.length === 20, 'hard cap of 20 list requests (' + r.calls.length + ' with 10 searches x 3 pages)');
check(r.waits.length === 19 && r.waits.every(w => w >= 8000 && w < 12000), 'every request after the first waited 8-12 s (' + r.waits.length + ' waits)');

// 6. Boards: an empty list page is retried once with X-No-Cache and X-Engine: browser
async function runBoard(listPages) {
  const config = structuredClone(base);
  const b = structuredClone(base.sources.boards.find(x => x.key === 'gtmjobs-xyz'));
  b.list_urls = Object.keys(listPages);
  config.sources.boards = [b];
  const calls = [];
  const E = makeEnv(N8N, {}, async (o) => {
    const target = o.url.replace('https://r.jina.ai/', '');
    calls.push({ target, headers: { ...o.headers } });
    const seq = listPages[target];
    const n = calls.filter(c => c.target === target).length;
    return { code: 200, data: { content: seq[Math.min(n, seq.length) - 1] } };
  });
  E.set('Load Config', [{ config, due: {} }]);
  const out = await E.run('Src Boards', '03_src_boards.js', [{}]);
  return { calls, jobs: out.filter(j => j.url), errors: out.filter(j => j.__error).map(j => j.__error) };
}
const job = slug => `[Junior GTM Engineer ${slug} Remote 2d ago](https://gtmjobs.xyz/jobs/junior-gtm-engineer-${slug}-recabcdefgh12)`;
const P1 = 'https://gtmjobs.xyz/jobs/location/remote', P2 = 'https://gtmjobs.xyz/jobs/tools/n8n';
let br = await runBoard({ [P1]: ['# Loading...', job('alpha') + '\n\n' + job('beta')], [P2]: [job('gamma')] });
const p1 = br.calls.filter(c => c.target === P1), p2 = br.calls.filter(c => c.target === P2);
check(br.jobs.length === 3 && br.jobs.some(j => j.url.includes('alpha')), 'items from the retried page are present (' + br.jobs.length + ')');
check(p1.length === 2 && p1[1].headers['X-No-Cache'] === 'true' && p1[1].headers['X-Engine'] === 'browser', 'the retry carried X-No-Cache: true and X-Engine: browser');
check(!p1[0].headers['X-No-Cache'] && !p1[0].headers['X-Engine'], 'the first request has no retry headers');
check(p2.length === 1, 'a page with links is not retried');
check(!br.errors.length, 'a recovered empty page leaves no error');

// 7. Boards: empty again after the retry is counted in the error text
br = await runBoard({ [P1]: ['# Loading...', '# still nothing'] });
check(br.calls.length === 2 && br.errors.length === 1 && /1 page\(s\), 1 empty again on uncached browser retry, regex matched 0 links/.test(br.errors[0]), 'error text: ' + br.errors[0]);

if (fails) { console.log(fails + ' FAIL'); process.exit(1); } else console.log('all ok');
