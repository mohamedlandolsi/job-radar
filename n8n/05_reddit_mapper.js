// Job Radar v2 | Reddit Mapper (Code, run once for all items)
// Input: one Tavily response per query (HTTP node "Tavily Search", On Error = Continue).
// Keeps only posts from the configured subreddits, canonicalises the URL, and tags "[For Hire]" offers
// (people selling services) so gate A drops them with a visible reason instead of silently.
const SOURCE = 'reddit';
const L = $('Load Config').first().json;
const S = (L.config.sources || {}).reddit || {};
const subs = new Set((S.subreddits || []).map(s => String(s).toLowerCase().replace(/^r\//, '')));
const queries = $('Reddit Queries').all().map(i => i.json.query);

const out = [];
const seen = new Set();
const errors = [];
$input.all().forEach((it, idx) => {
  const res = it.json || {};
  if (res.error || !Array.isArray(res.results)) {
    errors.push((queries[idx] || 'query ' + idx) + ': ' + String((res.error && (res.error.message || res.error)) || 'no results field').slice(0, 120));
    return;
  }
  for (const r of res.results) {
    const m = String(r.url || '').match(/reddit\.com\/r\/([A-Za-z0-9_]+)\/comments\/([a-z0-9]+)/i);
    if (!m) continue;
    if (subs.size && !subs.has(m[1].toLowerCase())) continue;
    const url = 'https://www.reddit.com/r/' + m[1] + '/comments/' + m[2] + '/';
    if (seen.has(url)) continue;
    seen.add(url);
    const title = String(r.title || '').replace(/\s*:\s*r\/\w+\s*$/i, '').replace(/\s*[-|]\s*reddit\s*$/i, '').trim();
    const text = String(r.content || '').replace(/\s+/g, ' ').trim();
    const forHire = /\[\s*for\s*hire\s*\]|^\s*for\s*hire\b|\(for hire\)/i.test(title);
    const hiring = /\[\s*hiring\s*\]|\bhiring\b|\blooking for\b|\bneed(ed)?\b|\bseeking\b|\bwanted\b|\bpaid\b/i.test(title + ' ' + text.slice(0, 300));
    out.push({ json: {
      source: SOURCE, source_id: m[2], title: title.slice(0, 220), company: 'r/' + m[1], url,
      location_raw: /\bremote\b/i.test(title + ' ' + text) ? 'Remote' : '',
      work_mode: /\bremote\b/i.test(title + ' ' + text) ? 'remote' : 'unknown',
      kind: 'gig',
      posted_date: new Date().toISOString(), posted_estimated: true,   // time_range=day bounds the age
      description_text: (title + '\n' + text).slice(0, 6000),
      needs_detail: false,
      gate_hint: forHire ? 'reddit_for_hire' : (hiring ? '' : 'reddit_not_hiring'),
      subreddit: m[1]
    } });
  }
});
if (errors.length && !out.length) return [{ json: { source: SOURCE, __error: SOURCE + ': ' + errors.join(' | ').slice(0, 300) } }];
if (errors.length) out.push({ json: { source: SOURCE, __error: SOURCE + ': partial, ' + errors.join(' | ').slice(0, 300) } });
if (!out.length) return [{ json: { source: SOURCE, __skip: 'no_results' } }];
return out;
