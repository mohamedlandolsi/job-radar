// Job Radar v2 | Src Working Nomads (Code, run once for all items)
// Free public JSON feed of curated remote jobs: https://www.workingnomads.com/api/exposed_jobs/
// Fields: url, title, description (HTML), company_name, category_name, tags, location, pub_date.
const SOURCE = 'working-nomads';
const L = $('Load Config').first().json;
const S = (L.config.sources || {})[SOURCE] || {};
if (!S.enabled || L.due[SOURCE] === false) return [{ json: { source: SOURCE, __skip: 'disabled_or_not_due' } }];
const strip = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
try {
  const rows = await this.helpers.httpRequest({ method: 'GET', json: true, timeout: 30000,
    url: 'https://www.workingnomads.com/api/exposed_jobs/', headers: { 'User-Agent': 'JobRadar/2.0' } });
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return [{ json: { source: SOURCE, __error: SOURCE + ': empty response (format changed?)' } }];
  return list.filter(j => j.url && j.title).map(j => ({ json: {
    source: SOURCE, source_id: j.url, title: j.title, company: j.company_name || 'unknown', url: j.url,
    location_raw: j.location || 'Remote', work_mode: 'remote',
    posted_date: j.pub_date ? new Date(j.pub_date).toISOString() : new Date().toISOString(), posted_estimated: !j.pub_date,
    description_text: strip(j.description).slice(0, 6000), needs_detail: false,
    tags: String(j.tags || '').split(',').map(t => t.trim()).filter(Boolean), category: j.category_name || ''
  } }));
} catch (e) {
  return [{ json: { source: SOURCE, __error: SOURCE + ': ' + String(e.message || e).slice(0, 200) } }];
}
