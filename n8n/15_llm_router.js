// Job Radar v2 | LLM Router v7 (Code, run once for all items). Input: "Build Prompts".
// v6 chain unchanged (groq gpt-oss-120b -> gemini 3.5 flash-lite -> gemini 2.5 flash). v7 adds:
//  - skips the {__empty} sentinel (no LLM call when nothing survived the gates)
//  - pacing from config llm.pace_ms (Groq free tier: 8K tokens/min and about 1.8K tokens per call, so 15 s)
//  - a time budget under N8N_RUNNERS_TASK_TIMEOUT: items it cannot reach are returned with
//    provider "deferred" and go back to the queue (skipped_cap) instead of killing the run
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const CHAIN = [
  { name: 'groq-gptoss',      url: GROQ_URL,   key: () => $env.GROQ_API_KEY,   model: 'openai/gpt-oss-120b' },
  { name: 'gemini-3.5-lite',  url: GEMINI_URL, key: () => $env.GEMINI_API_KEY, model: 'gemini-3.5-flash-lite', temperature: 0.2 },
  { name: 'gemini-2.5-flash', url: GEMINI_URL, key: () => $env.GEMINI_API_KEY, model: 'gemini-2.5-flash', temperature: 0.2 }
];
const C = $('Load Config').first().json.config;
const PACE = Math.max(4000, Number(C.llm.pace_ms) || 15000);
let limitS = 280;
try { limitS = Math.max(120, (Number($env.N8N_RUNNERS_TASK_TIMEOUT) || 300) - 30); } catch (e) { /* default */ }
const started = Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
function parseJSON(s) {
  try { return JSON.parse(s); } catch (e) {
    const m = (s || '').match(/\{[\s\S]*\}/);
    try { return m ? JSON.parse(m[0]) : null; } catch (e2) { return null; }
  }
}
const callProvider = async (p, system, prompt) => {
  const body = { model: p.model, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] };
  if (typeof p.temperature === 'number') body.temperature = p.temperature;
  const data = await this.helpers.httpRequest({
    method: 'POST', url: p.url, timeout: 60000,
    headers: { 'Authorization': 'Bearer ' + p.key(), 'Content-Type': 'application/json' }, body, json: true
  });
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  const parsed = parseJSON(data.choices?.[0]?.message?.content || '');
  if (!parsed) throw new Error('Unparseable JSON');
  return parsed;
};
const is429 = e => /429|rate|resource has been exhausted/i.test(String(e.message || e));

const items = $input.all().filter(i => i.json && i.json.prompt);
if (!items.length) return [{ json: { __empty: true } }];
const results = [];
for (let i = 0; i < items.length; i++) {
  const { system, prompt, job } = items[i].json;
  if ((Date.now() - started) / 1000 > limitS - 70) { results.push({ json: { job, provider: 'deferred', llm: null, errors: { budget: 'task time budget reached' } } }); continue; }
  let llm = null, provider = 'none';
  const errors = {};
  for (const p of CHAIN) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try { llm = await callProvider(p, system, prompt); provider = p.name; break; }
      catch (e) {
        errors[p.name] = String(e.message || e).slice(0, 200);
        if (is429(e) && attempt === 0 && (Date.now() - started) / 1000 < limitS - 90) { await sleep(25000); continue; }
        break;
      }
    }
    if (llm) break;
  }
  results.push({ json: { job, provider, llm, errors } });
  if (i < items.length - 1) await sleep(PACE);
}
return results;
