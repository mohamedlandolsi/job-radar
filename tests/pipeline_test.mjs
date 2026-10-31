// End-to-end test of the v2 Code nodes against the real schema (PGlite = Postgres in WASM).
// HTTP calls (LinkedIn, Jina, Tavily, ATS, Working Nomads, LLMs) are mocked with realistic payloads.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import { makeEnv } from './harness.mjs';

const [, , SQL, CFG, N8N] = process.argv;
const db = new PGlite();
await db.exec(fs.readFileSync(SQL, 'utf8'));
const q = async (s, p = []) => (await db.query(s, p)).rows;
let fails = 0;
const check = (cond, msg) => { console.log(cond ? 'ok  ' : 'FAIL', msg); if (!cond) fails++; };

// Test config: add one ATS company so that adapter runs too.
const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
cfg.rev = 'test-001';
cfg.sources.ats.companies = [{ name: 'Koyfin', ats: 'ashby', token: 'Koyfin' }];
await q('select jr_save_config($1)', [JSON.stringify(cfg)]);

const now = new Date();
const iso = d => new Date(now.getTime() - d * 86400000).toISOString();
const day = d => iso(d).slice(0, 10);

// ---------------- HTTP mock ----------------
const LI_CARD = (id, title, company, loc, d) => `<li>
  <div class="base-card job-search-card" data-entity-urn="urn:li:jobPosting:${id}">
    <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/x-${id}?position=1&amp;refId=abc"></a>
    <div class="base-search-card__info">
      <h3 class="base-search-card__title">
        ${title}
      </h3>
      <h4 class="base-search-card__subtitle"><a class="hidden-nested-link" href="#">${company}</a></h4>
      <div class="base-search-card__metadata">
        <span class="job-search-card__location">
          ${loc}
        </span>
        <time class="job-search-card__listdate" datetime="${d}">1 day ago</time>
      </div></div></div></li>`;
const LI_DETAIL = (body, seniority) => `<html><div class="show-more-less-html__markup show-more-less-html__markup--clamp-after-5">${body}</div>
  <ul class="description__job-criteria-list"><li class="description__job-criteria-item">
  <h3 class="description__job-criteria-subheader">Seniority level</h3>
  <span class="description__job-criteria-text description__job-criteria-text--criteria">${seniority}</span></li>
  <li class="description__job-criteria-item"><h3 class="description__job-criteria-subheader">Employment type</h3>
  <span class="description__job-criteria-text description__job-criteria-text--criteria">Full-time</span></li></ul></html>`;
const LONG = ' We build GTM automation with n8n, Clay, HubSpot, Python, APIs, webhooks and SQL for B2B SaaS teams across EMEA. ';
const llmCalls = [];
const http = async (req) => {
  const u = req.url;
  if (u.includes('seeMoreJobPostings')) {
    const start = new URL(u).searchParams.get('start');
    const kw = new URL(u).searchParams.get('keywords');
    if (start !== '0') return '';
    if (kw === 'GTM engineer') return LI_CARD('4011111111', 'Junior GTM Engineer', 'Acme', 'European Union', day(1)) + LI_CARD('4012222222', 'Senior GTM Engineer', 'Bigco', 'Remote', day(1));
    if (kw === 'GTM engineer visa sponsorship') return LI_CARD('4013333333', 'GTM Automation Engineer', 'Wolt', 'Berlin, Germany', day(2));
    return LI_CARD('4014444444', 'Revenue Operations Associate', 'Beta', 'Remote', day(3));
  }
  if (u.includes('jobs-guest/jobs/api/jobPosting/4011111111')) return LI_DETAIL('<p>Join us as a Junior GTM Engineer.' + LONG + '</p><ul><li>0-1 years of experience with n8n or Clay</li><li>Fully remote within EMEA</li></ul>', 'Entry level');
  if (u.includes('jobPosting/4013333333')) return LI_DETAIL('<p>GTM Automation Engineer in our Berlin office (hybrid).' + LONG + 'We offer visa sponsorship and a relocation package. No prior experience required.</p>', 'Entry level');
  if (u.includes('jobPosting/4014444444')) return LI_DETAIL('<p>RevOps Associate.' + LONG + 'You have 2+ years of experience in revenue operations.</p>', 'Associate');
  if (u.startsWith('https://r.jina.ai/https://gtmjobs.xyz/jobs/location/remote')) return { code: 200, data: { title: 'GTM jobs', content:
    `# Remote GTM jobs\n\n[![logo](https://x/img.png) Junior Automation Engineer Remote Labs Remote 2d ago](https://gtmjobs.xyz/jobs/junior-automation-engineer-remote-labs-recabcdefghij12)\n\n[GTM Engineer – HubSpot, Automation & AI (w/m/d) Kubermatic GmbH Hamburg, Germany 1d ago](https://gtmjobs.xyz/jobs/gtm-engineer-hubspot-automation-ai-wmd-kubermatic-gmbh-rec0lebnhissrjscl)\n\n[Next page](https://gtmjobs.xyz/jobs/page/2)` } };
  if (u.startsWith('https://r.jina.ai/https://gtmjobs.xyz/jobs/junior-automation')) return { code: 200, data: { title: 'Junior Automation Engineer at Remote Labs', content: '## Junior Automation Engineer\nRemote Labs is hiring a junior to automate GTM with n8n and Clay. Remote, worldwide, contractors welcome.' + LONG + 'Experience: 6+ months with APIs.' } };
  if (u.startsWith('https://r.jina.ai/https://gtmjobs.xyz/jobs/gtm-engineer-hubspot')) return { code: 200, data: { title: 'GTM Engineer', content: 'Wir suchen einen GTM Engineer für unser Team in Hamburg. Du arbeitest mit HubSpot und wir bieten dir die Möglichkeit, mit uns zu wachsen. Das Team ist klein und die Aufgaben sind vielfältig. Wir freuen uns auf deine Bewerbung und sind für dich da. Die Stelle ist in Hamburg mit einem Tag remote, und du bist nicht allein auf dem Weg. Sie sprechen Deutsch auf C1 Niveau und haben Erfahrung mit CRM Systemen.' } };
  if (u.startsWith('https://r.jina.ai/https://revopscareers.com/gtm-jobs/')) return { code: 200, data: { title: 'GTM jobs', content:
    `*   [![Image 1: Acme](https://revopscareers.com/logo.png)](https://revopscareers.com/job/acme-junior-gtm-automation-engineer-remote/)\n    *   Remote\n    *   Posted 3 hours ago\n    [Junior GTM Automation Engineer](https://revopscareers.com/job/acme-junior-gtm-automation-engineer-remote/)\n*   [![Image 2: Beta](https://revopscareers.com/logo2.png)](https://revopscareers.com/job/beta-revops-analyst-remote/)\n    *   Posted 1 day ago` } };
  if (u.startsWith('https://r.jina.ai/https://revopscareers.com/job/')) return { code: 200, data: { title: 'job', content: 'RevOps role at a SaaS company, remote within EMEA.' + LONG + 'No prior experience required.' } };
  if (u.startsWith('https://r.jina.ai/')) return { code: 200, data: { title: 'empty', content: 'nothing here' } };
  if (u.includes('api.ashbyhq.com')) return { jobs: [
    { title: 'GTM Engineer', location: 'New York', isRemote: true, workplaceType: 'Remote', publishedAt: iso(1), jobUrl: 'https://jobs.ashbyhq.com/Koyfin/a33e451d', descriptionPlain: 'GTM Engineer.' + LONG + 'Requirements: 3+ years of experience in GTM engineering.' },
    { title: 'Old role', location: 'Remote', isRemote: true, publishedAt: iso(30), jobUrl: 'https://jobs.ashbyhq.com/Koyfin/old', descriptionPlain: 'x' }
  ] };
  if (u.includes('workingnomads.com')) return [
    { url: 'https://www.workingnomads.com/job/go/1/', title: 'Marketing Operations Specialist', description: '<p>Marketing ops.' + LONG + 'US only. You must be based in the US.</p>', company_name: 'Nomadic', category_name: 'Marketing', tags: 'hubspot', location: 'USA', pub_date: iso(1) },
    { url: 'https://www.workingnomads.com/job/go/2/', title: 'n8n Automation Specialist (Contract)', description: '<p>Contract automation work.' + LONG + 'Worldwide, contractors welcome, no experience required.</p>', company_name: 'Flowly', category_name: 'Development', tags: 'n8n', location: 'Worldwide', pub_date: iso(0) }
  ];
  if (u.includes('chat/completions')) {
    const prompt = req.body.messages[1].content;
    llmCalls.push(prompt.match(/Title: (.*)/)[1]);
    const t = prompt.match(/Title: (.*)/)[1];
    const base = { match_score: 80, why_match: 'Fits.', red_flags: [], confidence: 80, extracted: { job_title: t, company: 'X', seniority: 'entry', min_years_required: null, experience_evidence: '', work_mode: 'remote', location_constraint: 'EMEA', remote_region: 'emea', languages_required: ['english'], visa_status: 'unknown', employment_type: 'full_time', contract_friendly: false, company_size_hint: 'startup', salary: 'not listed' } };
    if (/GTM Automation Engineer/.test(t)) { base.extracted.work_mode = 'hybrid'; base.extracted.visa_status = 'sponsors'; base.extracted.remote_region = 'unknown'; base.match_score = 88; }
    if (/Revenue Operations Associate \(remotive\)/.test(t)) { base.extracted.min_years_required = 1; base.extracted.experience_evidence = 'at least one year in RevOps'; }
    if (/n8n Automation Specialist/.test(t)) { base.extracted.employment_type = 'contract'; base.extracted.contract_friendly = true; base.extracted.remote_region = 'worldwide'; base.match_score = 78; }
    if (/hiring/i.test(t)) { base.match_score = 60; base.extracted.employment_type = 'freelance'; }
    return { choices: [{ message: { content: JSON.stringify(base) } }] };
  }
  if (u.includes('api.tavily.com')) throw new Error('Tavily is called by the HTTP node, not by code');
  throw new Error('unmocked ' + u);
};

async function oneRun(label) {
  const E = makeEnv(N8N, { GROQ_API_KEY: 'x', GEMINI_API_KEY: 'y', N8N_RUNNERS_TASK_TIMEOUT: '1800' }, http);
  const go = (await q("select jr_should_run() as go"))[0].go;
  const ctx = (await q('select jr_start_run($1) as ctx', ['manual']))[0].ctx;
  E.set('Start Run', [{ ctx }]);
  const LC = (await E.run('Load Config', '01_load_config.js', [{ ctx }]))[0];
  // v1 mappers (unchanged) produce these shapes
  const legacy = [
    { source: 'remotive', id: '1', title: 'Revenue Operations Associate (remotive)', company: 'Yolo', url: 'https://remotive.com/remote-jobs/1?utm_source=x', location_raw: 'Worldwide', work_policy: 'remote', posted_date: iso(1), description_text: 'Revenue operations associate.' + LONG + 'At least one year in RevOps is a must.', visa_sponsorship: false },
    { source: 'arbeitnow', id: '2', title: 'Werkstudent Marketing Automation', company: 'Gmbh', url: 'https://arbeitnow.com/2', location_raw: 'Berlin', work_policy: 'onsite', posted_date: iso(1), description_text: 'Wir suchen einen Werkstudent für Marketing Automation mit HubSpot. Du bist für die Pflege der Daten zuständig und wir bieten dir ein tolles Team. Die Stelle ist in Berlin und wir freuen uns auf dich, mit uns die Zukunft zu gestalten. Sie haben erste Erfahrungen mit CRM Systemen und sind motiviert.', visa_sponsorship: true },
    { source: 'remoteok', id: '3', title: 'Sales Development Representative', company: 'Z', url: 'https://remoteok.com/3', location_raw: 'Worldwide', work_policy: 'remote', posted_date: iso(1), description_text: 'SDR', visa_sponsorship: false },
    { source: 'hn-whoishiring', id: '49922584', title: 'Acme &amp; Co (Remote EMEA) &#x2F; Junior RevOps Automation Specialist', company: 'Acme &amp; Co', url: 'https:&#x2F;&#x2F;acme.example&#x2F;careers', location_raw: 'Remote EMEA', work_policy: 'remote', posted_date: iso(1), description_text: 'Junior GTM automation engineer.' + LONG, visa_sponsorship: false },
    { source: 'clay-community', id: '7', title: 'Need a Clay table built for lead scoring', company: 'unknown', url: 'https://community.clay.com/x/share-jobs/msg_test/need-a-clay-table', location_raw: '', work_policy: 'remote', posted_date: iso(1), description_text: 'Paid task: build a Clay table with enrichment and scoring for our agency.' + LONG, visa_sponsorship: false },
    { source: 'hn-whoishiring', id: 'error', title: '', company: '', url: '', __error: 'hn-whoishiring: timeout' }
  ];
  const li = await E.run('Src LinkedIn', '02_src_linkedin.js', [LC]);
  const boards = await E.run('Src Boards', '03_src_boards.js', [LC]);
  const rq = await E.run('Reddit Queries', '04_reddit_queries.js', [LC]);
  E.set('Tavily Search', []);
  const tav = rq.map((x, i) => i === 0 ? { query: x.query, results: [
      { title: '[Hiring] n8n expert to build lead enrichment workflows : r/forhire', url: 'https://www.reddit.com/r/forhire/comments/1abcde/hiring_n8n_expert/', content: 'Looking for someone to build n8n workflows with Clay and HubSpot for our agency. Budget $500, remote, paid per milestone. Must know APIs and webhooks. We are a small B2B team.' },
      { title: '[For Hire] n8n developer : r/forhire', url: 'https://www.reddit.com/r/forhire/comments/1xyz99/for_hire/', content: 'I build automations' },
      { title: 'meme', url: 'https://www.reddit.com/r/memes/comments/1q/x/', content: 'lol' }] }
    : (i === 1 ? { error: { message: 'Request failed with status code 432' } } : { query: x.query, results: [] }));
  const rm = await E.run('Reddit Mapper', '05_reddit_mapper.js', tav);
  const ats = await E.run('Src ATS', '06_src_ats.js', [LC]);
  const wn = await E.run('Src Working Nomads', '07_src_working_nomads.js', [LC]);
  const mergeAll = [...legacy, ...li, ...boards, ...rm, ...ats, ...wn];
  E.set('Merge All', mergeAll);
  const norm = await E.run('Normalize', '08_normalize.js', mergeAll);
  const ga = await E.run('Gate A', '09_gate_a.js', norm);
  const ingestPayload = ga.filter(j => j._ingest).map(j => j._ingest);
  let ingest = await q('select * from jr_ingest($1::bigint, $2::text, $3::jsonb)', [LC.run_id, LC.rev, JSON.stringify(ingestPayload)]);
  if (!ingest.length) ingest = [{}];               // Always Output Data
  E.set('Ingest', ingest);
  const rj = await E.run('Rejoin', '10_rejoin.js', ingest);
  const df = await E.run('Detail Fetch', '11_detail_fetch.js', rj);
  const gb = await E.run('Gate B', '12_gate_b.js', df);
  const rs = await E.run('Rank & Slice', '13_rank_slice.js', gb);
  const bp = await E.run('Build Prompts', '14_build_prompts.js', rs);
  const lr = await E.run('LLM Router', '15_llm_router.js', bp);
  const gs = await E.run('Gate & Score', '16_gate_score.js', lr);
  const bw = (await E.run('Build Writes', '17_build_writes.js', gs))[0];
  const rec = await q('select jr_record_postings($1::bigint, $2::text, $3::jsonb) as result', [bw.run_id, bw.rev, JSON.stringify(bw.payload)]);
  E.set('Record Postings', rec);
  const st = (await E.run('Run Stats', '18_run_stats.js', rec))[0];
  const fin = await q('select jr_finish_run($1::bigint, $2::jsonb) as run', [st.run_id, JSON.stringify(st.payload)]);
  console.log(`\n=== ${label}: should_run=${go} run_id=${LC.run_id}`);
  console.log('gate A:', ga.filter(j => j.url).map(j => `${j.source}:${j.title.slice(0, 32)} -> ${j.gate_a}${j.gate_a_reason ? ' (' + j.gate_a_reason + ')' : ''}`).join('\n        '));
  console.log('gate B:', gb.filter(j => j.url).map(j => `${j.title.slice(0, 32)} -> ${j.gate_b} ${j.gate_b_reason || ''} ${j.gate_b_detail ? '[' + j.gate_b_detail.slice(0, 60) + ']' : ''}`).join('\n        '));
  console.log('scored:', gs.filter(j => j.url).map(j => `${j.url.slice(0, 50)} -> ${j.outcome} ${j.reason || ''} ${j.final_score || ''}`).join('\n        '));
  console.log('record:', JSON.stringify(rec[0].result), '\nfunnel:', JSON.stringify(st.payload.funnel), '\nfinish:', JSON.stringify(fin[0].run));
  console.log('source_stats:', JSON.stringify(st.payload.source_stats));
  return { ga, gb, gs, st, rec: rec[0].result, LC };
}

const r1 = await oneRun('run 1');
const by = (arr, frag) => arr.find(j => j.url && j.title && j.title.includes(frag));
check(by(r1.ga, 'Senior GTM').gate_a_reason === 'title_senior', 'senior title dropped at gate A');
check(by(r1.ga, 'Sales Development').gate_a_reason === 'title_blocked', 'SDR title blocked');
check(r1.ga.find(j => j.url && j.url.includes('1xyz99')).gate_a_reason === 'reddit_for_hire', '[For Hire] reddit post dropped with reason');
check(!r1.ga.some(j => j.url && j.url.includes('/r/memes/')), 'subreddit allow-list applied');
check(!r1.ga.some(j => j.url && j.url.includes('utm_source')), 'tracking params stripped');
const byUrl = (arr, frag) => arr.find(j => j.url && j.url.includes(frag));
check(byUrl(r1.gb, '4014444444').gate_b_reason === 'experience_years', 'LinkedIn "2+ years of experience" dropped by regex');
check(byUrl(r1.ga, '1abcde').gate_a === 'pass', 'reddit [Hiring] "lead enrichment" gig is not mistaken for a senior title');
check(by(r1.gb, 'GTM Engineer – HubSpot') && by(r1.gb, 'GTM Engineer – HubSpot').gate_b_reason === 'language', 'German JD dropped (language)');
check(r1.ga.find(j => j.source === 'arbeitnow').gate_a === 'pass' && r1.gb.find(j => j.source === 'arbeitnow').gate_b_reason === 'language', 'arbeitnow German JD: visa flag passes A, language drops at B');
check(by(r1.gb, 'Marketing Operations Specialist') === undefined || by(r1.ga, 'Marketing Operations Specialist').gate_a_reason === 'remote_region', 'US-only Working Nomads job dropped (location USA)');
check(byUrl(r1.gb, 'ashbyhq.com/Koyfin/a33e').gate_b_reason === 'experience_years', 'Ashby 3+ years dropped');
check(!r1.ga.some(j => j.url && j.url.includes('Koyfin/old')), 'ATS posting older than window filtered');
check(by(r1.gb, 'GTM Automation Engineer').gate_b === 'pass' && by(r1.gb, 'GTM Automation Engineer').visa_signal === 'positive', 'hybrid Berlin job with visa sponsorship passes, visa_signal positive');
check(r1.gs.some(j => j.outcome === 'dropped_llm' && j.reason === 'llm_experience'), 'remotive "at least one year" caught by the LLM gate (regex missed it)');
check(r1.rec.matches_new >= 3, 'matches written: ' + r1.rec.matches_new);
check(r1.st.payload.source_stats['hn-whoishiring'].errors === 1, 'source error counted per source');
check(r1.ga.some(j => j.url === 'https://revopscareers.com/job/acme-junior-gtm-automation-engineer-remote/' && j.title === 'Junior GTM Automation Engineer'), 'revopscareers: empty logo link skipped, title taken from the second link');
check(r1.ga.some(j => j.url === 'https://revopscareers.com/job/beta-revops-analyst-remote/' && j.title === 'beta revops analyst remote'), 'revopscareers: title rebuilt from the URL slug when no link has text');
check(r1.ga.some(j => j.url === 'https://jobs.ashbyhq.com/Koyfin/a33e451d'), 'canonical URL without the URL global');
check(r1.ga.some(j => j.url === 'https://acme.example/careers' && j.title === 'Acme & Co (Remote EMEA) / Junior RevOps Automation Specialist' && j.company === 'Acme & Co'), 'HN entity-encoded URL, title and company decoded (not silently dropped)');
check(r1.ga.find(j => j.source === 'clay-community').kind === 'gig', 'Clay community post classified as gig');
check(r1.st.payload.source_stats.reddit.errors === 1, 'Tavily 432 counted as reddit error, run continued');

const stages = await q("select source, stage, reason, left(title,40) as title from jr_postings order by source, stage");
console.table(stages);
const matches = await q("select source, kind, left(title,40) as title, company, work_mode, visa_status, final_score, priority from jr_matches order by final_score desc");
console.table(matches);

// Run 2: same sources, nothing new, nothing re-scored.
await q("select jr_request_run()");
llmCalls.length = 0;
const r2 = await oneRun('run 2 (same postings)');
check(llmCalls.length === 0, 'run 2 made no LLM calls (dedupe works)');
check(r2.rec.matches_new === 0, 'run 2 wrote no duplicate matches');
console.table(await q("select * from v_jr_source_health order by source"));
console.table(await q("select stage, reason, sum(postings)::int as n from v_jr_gate_reasons group by 1,2 order by 3 desc"));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exitCode = fails ? 1 : 0;
