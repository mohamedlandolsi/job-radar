// Job Radar v2 | Rejoin (Code, run once for all items). Input: "Ingest" (rows from jr_ingest).
// jr_ingest returns only postings worth processing (new, or retries). Descriptions never went to the
// database, so the full items are taken back from "Gate A" by URL.
const back = $input.all().map(i => i.json).filter(r => r && r.posting_id && r.url);
if (!back.length) return [{ json: { __empty: true } }];
const byUrl = new Map($('Gate A').all().map(i => i.json).filter(j => j.url).map(j => [j.url, j]));
const out = [];
for (const r of back) {
  const j = byUrl.get(r.url);
  if (!j) continue;
  const { _ingest, ...rest } = j;
  out.push({ json: Object.assign(rest, { posting_id: r.posting_id, retry: r.retry === true || r.retry === 't' }) });
}
return out.length ? out : [{ json: { __empty: true } }];
