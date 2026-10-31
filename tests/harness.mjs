// Runs n8n Code-node files outside n8n: $(), $input, $env, this.helpers.httpRequest are mocked.
import fs from 'node:fs';
import path from 'node:path';
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
globalThis.setTimeout = ((orig) => (fn, ms) => orig(fn, 0))(globalThis.setTimeout);   // no real waiting in tests
export function makeEnv(dir, env, http) {
  const nodes = {};
  const $ = (name) => {
    const data = nodes[name];
    return {
      all: () => { if (!data) throw new Error(`Referenced node is unexecuted: ${name}`); return data.map(j => ({ json: j })); },
      first: () => { if (!data) throw new Error(`Referenced node is unexecuted: ${name}`); return { json: data[0] }; },
      get isExecuted() { return !!data; }
    };
  };
  async function run(name, file, input) {
    const code = fs.readFileSync(path.join(dir, file), 'utf8');
    const $input = { all: () => input.map(j => ({ json: j })), first: () => ({ json: input[0] }) };
    // n8n's Code-node sandbox has no URL / URLSearchParams globals: shadow them so tests fail like n8n would.
    const fn = new AsyncFunction('$', '$input', '$env', 'URL', 'URLSearchParams', code);
    const res = await fn.call({ helpers: { httpRequest: http } }, $, $input, env, undefined, undefined);
    if (!Array.isArray(res)) throw new Error(name + ' did not return an array');
    nodes[name] = res.map(r => r.json);
    return nodes[name];
  }
  const set = (name, arr) => { nodes[name] = arr; };
  return { run, set, nodes };
}
