// Suggested rev for a save from the console: previous rev + "-s" + MMDD-HHmm (local time of the browser).
// An earlier "-sMMDD-HHmm[ss]" suffix is replaced instead of stacked: v2-004-s1031-1412 -> v2-004-s1101-0915.
// A second save within the same minute would repeat the rev, so it gets the seconds too (-s1101-091542).
const SUFFIX = /-s\d{4}-\d{4}(\d{2})?$/;

export function nextRev(prev: string, now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stem = prev.replace(SUFFIX, "");
  const minute = `${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
  const rev = `${stem}-s${minute}`.slice(0, 80);
  return rev === prev ? `${stem}-s${minute}${p(now.getSeconds())}`.slice(0, 80) : rev;
}
