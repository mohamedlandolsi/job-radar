// Job Radar v2 | Build Prompts (Code, run once for all items). Input: "Rank & Slice".
// The candidate profile now lives in config.profile (edited in the console), not in this code.
const L = $('Load Config').first().json;
const C = L.config;
const items = $input.all().map(i => i.json).filter(j => j.url);
if (!items.length) return [{ json: { __empty: true } }];

const SYSTEM = [
  'You are a strict job-fit analyst for one candidate. Evaluate ONE posting against the candidate profile.',
  'Return ONLY valid JSON with exactly this schema:',
  '{"match_score": number 0-100, "why_match": string (max 2 sentences), "red_flags": [string], "confidence": number 0-100,',
  ' "extracted": {"job_title": string, "company": string,',
  '  "seniority": "intern|entry|junior|mid|senior|lead|unknown",',
  '  "min_years_required": number or null (the smallest MINIMUM years of experience the posting REQUIRES; null if none is stated; months as a fraction),',
  '  "experience_evidence": string (quote the exact phrase, or ""),',
  '  "work_mode": "remote|hybrid|onsite|unknown", "location_constraint": string,',
  '  "remote_region": "worldwide|emea|europe|us|americas|apac|uk|country|unknown",',
  '  "languages_required": [string] (only languages that are REQUIRED, never "nice to have"),',
  '  "visa_status": "sponsors|relocation_support|no_sponsorship|work_auth_required|unknown",',
  '  "employment_type": "full_time|part_time|contract|freelance|internship|unknown",',
  '  "contract_friendly": boolean, "company_size_hint": string, "salary": string}}',
  'Rules: never guess years; "proven experience" without a number means null. A freelance gig is judged on the task, not on employer perks.'
].join('\n');

const profile = JSON.stringify(C.profile);
const maxChars = Number(C.llm.max_desc_chars) || 3500;
return items.map(j => ({ json: {
  system: SYSTEM,
  prompt: 'Candidate profile: ' + profile +
    '\n\nPosting (' + j.kind + ', source ' + j.source + ')\nTitle: ' + j.title + '\nCompany: ' + j.company +
    '\nLocation: ' + (j.location_raw || 'not stated') + '\nWork mode (detected): ' + j.work_mode +
    '\nDescription: ' + String(j.description_text || '').slice(0, maxChars) +
    '\n\nEvaluate fit and extract attributes. JSON only.',
  job: j
} }));
