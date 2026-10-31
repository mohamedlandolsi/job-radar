// Job Radar v2 | RevOps Roles Error (Code, run once for all items). Input: error output #1 of "RevOps Roles".
// The HTTP node runs with "continue (using error output)". Before this node the error branch was not
// connected, so a 429 made the source vanish with errors = 0. It now becomes a {source, __error} marker that
// Normalize passes through and Run Stats / v_jr_source_health count.
const SOURCE = 'revopsroles';
const j = $input.first().json || {};
const e = j.error || {};
const d = j.details || {};
const status = e.status || e.httpCode || '';
const msg = [status ? 'HTTP ' + status : '', d.message || e.message || 'request failed'].filter(Boolean).join(': ');
return [{ json: { source: SOURCE, __error: SOURCE + ': ' + String(msg).slice(0, 180) } }];
