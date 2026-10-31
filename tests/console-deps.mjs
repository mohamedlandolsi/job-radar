// Lets config_schema_test.mts import ../console/lib/config-schema.ts without installing the console app.
// A bare package import from console/ (zod) resolves normally first; if console/node_modules is missing,
// it falls back to tests/node_modules. Used via: node --import ./console-deps.mjs ...
import { registerHooks } from 'node:module';

const testsDir = import.meta.url;

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      const bare = !/^(\.|\/|[a-z]+:)/i.test(specifier);
      if (err?.code !== 'ERR_MODULE_NOT_FOUND' || !bare) throw err;
      return nextResolve(specifier, { ...context, parentURL: testsDir });
    }
  },
});
