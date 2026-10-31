// v1 node patches (C5b), run against real payloads captured from execution 495 (2026-10-30).
import fs from 'node:fs';
import { makeEnv } from './harness.mjs';
const [, , N8N] = process.argv;
const fx = JSON.parse(fs.readFileSync(new URL('./fixtures_run1.json', import.meta.url)));
let fails = 0;
const check = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const E = makeEnv(N8N, {}, async () => { throw new Error('no http'); });

const ro = await E.run('RemoteOK Mapper1', '19_remoteok_mapper.js', fx.remoteok);
check(ro.length === fx.remoteok.length - 1, `RemoteOK mapper keeps real jobs (${ro.length} of ${fx.remoteok.length}, legal item dropped)`);
check(ro.every(j => j.source === 'remoteok' && j.url.startsWith('https://') && j.description_text.length > 100 && j.title), 'RemoteOK items have source, url, title, description');

const er = await E.run('RevOps Roles Error', '20_revops_roles_error.js', [fx.revops_error]);
check(er.length === 1 && er[0].source === 'revopsroles' && /^revopsroles: HTTP 429: /.test(er[0].__error), 'RevOps 429 becomes a source error marker: ' + er[0].__error);
const er2 = await E.run('RevOps Roles Error', '20_revops_roles_error.js', [{}]);
check(er2[0].__error === 'revopsroles: request failed', 'error marker without error details');

if (fails) { console.log(fails + ' FAIL'); process.exit(1); } else console.log('all ok');
