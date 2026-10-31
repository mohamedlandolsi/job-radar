// Job Radar v2 | Reddit Queries (Code, run once for all items)
// Reddit closed self-serve API keys (Nov 2025), blocks logged-out .json (since May 2026) and ends RSS on
// 2026-11-13. So Reddit is read through a search index instead: Tavily, already in your n8n credentials.
// One item per query -> "Tavily Search" (HTTP Request, credential "Tavily Header Auth") -> "Reddit Mapper".
// Budget: 1 credit per basic search; 6 queries x 30 days = 180 of the 1,000 free monthly credits.
const L = $('Load Config').first().json;
const S = (L.config.sources || {}).reddit || {};
if (!S.enabled || S.mode !== 'tavily' || L.due.reddit === false) return [];   // branch stops; Merge New still runs

const queries = (S.queries || []).slice(0, Math.max(0, Number(S.max_queries) || 0));
return queries.map(q => ({ json: {
  query: q,
  body: {
    query: q,
    search_depth: 'basic',
    topic: 'general',
    time_range: S.time_range === 'week' ? 'week' : 'day',
    max_results: 10,
    include_domains: ['reddit.com'],
    include_answer: false,
    include_raw_content: false
  }
} }));
