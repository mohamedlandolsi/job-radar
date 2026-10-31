// Detail Fetch budget (C6b): LinkedIn throttling must not eat detail_cap slots meant for Jina boards.
import fs from 'node:fs';
import { makeEnv } from './harness.mjs';
const [, , CFG, N8N] = process.argv;
const config = JSON.parse(fs.readFileSync(CFG, 'utf8'));
config.llm.detail_cap = 4;
let fails = 0;
const check = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const LONG = ' We automate GTM for B2B SaaS teams with n8n, Clay and HubSpot. '.repeat(4);
let liCalls = 0, jinaCalls = 0;
const http = async (o) => {
  if (o.url.includes('linkedin.com')) { liCalls++; throw new Error('Request failed with status code 429'); }
  if (o.url.startsWith('https://r.jina.ai/')) { jinaCalls++; return { data: { title: 't', content: 'Junior automation role.' + LONG } }; }
  throw new Error('unexpected ' + o.url);
};
const E = makeEnv(N8N, { N8N_RUNNERS_TASK_TIMEOUT: '1800' }, http);
E.set('Load Config', [{ config }]);
const li = n => ({ url: 'https://www.linkedin.com/jobs/view/' + n + '/', source: 'linkedin', title: 'Junior GTM Engineer ' + n, needs_detail: true, detail: { mode: 'linkedin', id: String(n) } });
const jb = n => ({ url: 'https://gtmjobshq.com/jobs/' + n, source: 'gtmjobshq', title: 'Automation Specialist ' + n, needs_detail: true, detail: { mode: 'jina', url: 'https://gtmjobshq.com/jobs/' + n } });
const items = [li(1), li(2), li(3), li(4), jb(1), jb(2), jb(3), { url: 'https://x/forum', source: 'clay-community', title: 'n8n help', needs_detail: false, detail: null }];
const out = await E.run('Detail Fetch', '11_detail_fetch.js', items);
const st = s => out.filter(j => j.detail_status === s).map(j => j.source + ':' + j.url.split('/').filter(Boolean).pop());
console.log('ok', st('ok'), '| failed', st('failed'), '| deferred', st('deferred'), '| not_needed', st('not_needed'));
check(liCalls === 1, 'LinkedIn stops after the first 429 (' + liCalls + ' call)');
check(st('failed').length === 1 && st('failed')[0].startsWith('linkedin'), 'the throttled LinkedIn item is failed (retried next run)');
check(jinaCalls === 3 && st('ok').length === 3, 'all 3 Jina items fetched: the blocked LinkedIn slots went back to the pool');
check(st('deferred').length === 3 && st('deferred').every(s => s.startsWith('linkedin')), 'the other 3 LinkedIn items deferred without using budget');
check(st('not_needed').length === 1, 'item without detail untouched');
check(out.length === items.length && out[0].url === items[0].url, 'output keeps input order and size');
// budget still holds when nothing is blocked
liCalls = 0; jinaCalls = 0;
const E2 = makeEnv(N8N, { N8N_RUNNERS_TASK_TIMEOUT: '1800' }, async (o) => { jinaCalls++; return { data: { content: 'Junior role.' + LONG } }; });
E2.set('Load Config', [{ config }]);
const out2 = await E2.run('Detail Fetch', '11_detail_fetch.js', [jb(1), jb(2), jb(3), jb(4), jb(5), jb(6)]);
check(jinaCalls === 4 && out2.filter(j => j.detail_status === 'deferred').length === 2, 'detail_cap 4 respected (4 fetched, 2 deferred)');
if (fails) { console.log(fails + ' FAIL'); process.exit(1); } else console.log('all ok');
