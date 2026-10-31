// Job Radar v2 | RemoteOK Mapper1 (v1 node, patched). Input: "RemoteOK".
// Fix (run 1, 2026-10-30): the map read job.description on the n8n item wrapper, so every description
// was empty and the length filter dropped all jobs (100 in, 0 out). It now reads item.json.
const items = $input.all();

// Hard veto: drop legal disclaimer, missing fields, string "undefined", and whitespace/empty descriptions
const jobs = items.filter(item => {
  const j = item.json;
  if (!j || !j.position || !j.company) return false;
  
  // Guard 1: reject literal string "undefined" and whitespace-only IDs
  const id = String(j.id || '').trim();
  if (!id || id.toLowerCase() === 'undefined') return false;
  
  // Guard 2: reject whitespace-only or HTML-comment-only descriptions (before regex cleaning)
  const desc = String(j.description || '').trim();
  if (desc.length < 50) return false;
  
  return true;
});

return jobs.map(item => {
  const job = item.json;
  const cleanDesc = (job.description || '').replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim().slice(0, 6000);
  let finalUrl = job.url;
  if (finalUrl && !finalUrl.startsWith('http')) finalUrl = 'https://remoteok.com' + finalUrl;

  return {
    json: {
      source: 'remoteok',
      id: String(job.id).trim(),
      title: job.position,
      company: job.company,
      url: finalUrl,
      location_raw: job.location || 'Worldwide',
      work_policy: 'remote',
      posted_date: job.date,
      description_text: cleanDesc,
      visa_sponsorship: false,
      heuristic_score: 0
    }
  };
}).filter(item => item.json.description_text.length > 100);