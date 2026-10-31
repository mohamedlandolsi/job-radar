// Unit cases for Gate B (experience, language, visa, region) with the default config.
import fs from 'node:fs';
import { makeEnv } from './harness.mjs';
const [, , CFG, N8N] = process.argv;
const config = JSON.parse(fs.readFileSync(CFG, 'utf8'));
const PAD = ' We automate GTM for B2B SaaS teams with n8n, Clay and HubSpot. You will build workflows, APIs and data syncs with our team. ';
const cases = [
  // [description, work_mode, expected gate_b, expected reason, extra]
  ['You have 3+ years of experience in RevOps.', 'remote', 'drop', 'experience_years'],
  ['At least 2 years of hands-on experience with HubSpot.', 'remote', 'drop', 'experience_years'],
  ['0-2 years experience in automation.', 'remote', 'pass', ''],
  ['1-3 years of professional experience.', 'remote', 'drop', 'experience_years'],
  ['We were founded 10 years ago and have grown fast.', 'remote', 'pass', ''],
  ['Experience: 2+ years in sales ops.', 'remote', 'drop', 'experience_years'],
  ['6+ months of experience with n8n.', 'remote', 'pass', ''],
  ['A minimum of two (2) years of experience in CRM administration.', 'remote', 'drop', 'experience_years'],
  ['5 years of experience with Salesforce is a plus.', 'remote', 'pass', ''],
  ['Our team has 15 years of combined experience in GTM.', 'remote', 'pass', ''],
  ['3-5 yrs exp in marketing ops.', 'remote', 'drop', 'experience_years'],
  ['1 year of experience with Python.', 'remote', 'drop', 'experience_years'],
  ['No prior experience required, we train you.', 'remote', 'pass', ''],
  ['Up to 2 years of experience.', 'remote', 'pass', ''],
  ['2 or more years of experience building automations.', 'remote', 'drop', 'experience_years'],
  ['Fluent German is required for client calls.', 'remote', 'drop', 'language'],
  ['German is a plus but not required.', 'remote', 'pass', ''],
  ['French (C1) required.', 'remote', 'drop', 'language'],
  ['This role is US only. Remote.', 'remote', 'drop', 'remote_region_desc'],
  ['Candidates must be authorized to work in the United States.', 'remote', 'drop', 'work_authorization'],
  ['You must have the right to work in your country of residence.', 'remote', 'pass', ''],
  ['Hybrid in Amsterdam. We offer visa sponsorship and relocation support.', 'hybrid', 'pass', '', { visa_signal: 'positive' }],
  ['Hybrid in Amsterdam. We do not offer visa sponsorship.', 'hybrid', 'drop', 'visa_negative'],
  ['On-site in Dublin. Great snacks.', 'onsite', 'drop', 'visa_unknown'],
  ['On-site in Berlin. Unfortunately we are unable to sponsor visas.', 'onsite', 'drop', 'visa_negative'],
  ['On-site in Berlin. We sponsor conferences and learning.', 'onsite', 'drop', 'visa_unknown'],
  ['Office in London. You need the right to work in the UK.', 'onsite', 'drop', 'work_authorization'],
];
const E = makeEnv(N8N, {}, async () => { throw new Error('no http'); });
E.set('Load Config', [{ config }]);
const items = cases.map((c, i) => ({ url: 'https://x/' + i, title: 'Automation Engineer', company: 'Acme', work_mode: c[1], description_text: c[0] + PAD, detail_status: 'not_needed', posted_date: new Date().toISOString() }));
items.push({ url: 'https://x/sponsor', title: 'Automation Engineer', company: 'Wolt Enterprises', work_mode: 'onsite', description_text: 'On-site in Berlin.' + PAD, detail_status: 'not_needed' });
items.push({ url: 'https://x/de', title: 'Automation Engineer', company: 'Acme', work_mode: 'remote', description_text: 'Wir suchen dich für unser Team. Du arbeitest mit uns an der Automatisierung und wir bieten dir die Möglichkeit, mit n8n und HubSpot zu arbeiten. Die Stelle ist remote und wir freuen uns auf deine Bewerbung, sie ist nicht befristet und für dich.', detail_status: 'not_needed' });
items.push({ url: 'https://x/short', title: 'x', company: 'y', work_mode: 'remote', description_text: 'tiny', detail_status: 'not_needed' });
// opportunity.block_phrases (C6b): the three community posts that matched in run 2/3, and a normal JD that must pass
items.push({ url: 'https://x/permeeting', title: 'Looking for Clay operators to book qualified meetings for $100 per attended call', company: 'unknown', work_mode: 'remote', description_text: 'We need Clay operators for outbound.' + PAD, detail_status: 'not_needed' });
items.push({ url: 'https://x/revshare', title: 'Referral and Sales Partner for n8n & AI automation (Revenue Sharing)', company: 'unknown', work_mode: 'remote', description_text: 'Bring clients, earn a cut.' + PAD, detail_status: 'not_needed' });
items.push({ url: 'https://x/partner', title: 'Outbound Agency Backend Offer Partnership', company: 'unknown', work_mode: 'remote', description_text: 'We are looking to partner with outbound agencies on a backend offer.' + PAD, detail_status: 'not_needed' });
items.push({ url: 'https://x/normaljd', title: 'GTM Automation Engineer', company: 'Acme', work_mode: 'remote', description_text: 'You will partner with sales leaders and own commission reporting in HubSpot.' + PAD, detail_status: 'not_needed' });
items.push({ url: 'https://x/fail', title: 'x', company: 'y', work_mode: 'remote', description_text: '', detail_status: 'failed' });
const out = await E.run('Gate B', '12_gate_b.js', items);
let fails = 0;
cases.forEach((c, i) => {
  const r = out[i];
  let ok = r.gate_b === c[2] && (r.gate_b_reason || '') === c[3];
  if (ok && c[4]) for (const [k, v] of Object.entries(c[4])) ok = ok && r[k] === v;
  if (!ok) fails++;
  console.log(ok ? 'ok  ' : 'FAIL', JSON.stringify(c[0]).padEnd(78), '->', r.gate_b, r.gate_b_reason || '', r.gate_b_detail ? '[' + r.gate_b_detail.slice(0, 50) + ']' : '');
});
const extra = [['https://x/sponsor', 'pass', ''], ['https://x/de', 'drop', 'language'], ['https://x/short', 'drop', 'no_description'], ['https://x/fail', 'retry', 'detail_retry'],
  ['https://x/permeeting', 'drop', 'opportunity_blocked'], ['https://x/revshare', 'drop', 'opportunity_blocked'],
  ['https://x/partner', 'drop', 'opportunity_blocked'], ['https://x/normaljd', 'pass', '']];
for (const [u, g, reason] of extra) {
  const r = out.find(o => o.url === u);
  const ok = r.gate_b === g && (r.gate_b_reason || '') === reason;
  if (!ok) fails++;
  console.log(ok ? 'ok  ' : 'FAIL', u.padEnd(78), '->', r.gate_b, r.gate_b_reason, r.gate_b_detail || r.visa_evidence || '');
}
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exitCode = fails ? 1 : 0;
