/* ============================================================================
   deno-stub.mjs — подмена окружения Deno для прогона Edge Functions в Node.
   Подключается так:
     node --experimental-strip-types --import ./tests/deno-stub.mjs tests/functions.mjs

   Даёт:
   - globalThis.Deno.env.get() → читает __FT_ENV (его задаёт тест);
   - globalThis.Deno.serve(fn) → запоминает обработчик в __FT_HANDLER;
   - резолвер https://esm.sh/... → локальные стабы (см. https-loader.mjs).
   ========================================================================== */
import { register } from 'node:module';

register(new URL('./https-loader.mjs', import.meta.url));

globalThis.__FT_ENV = Object.create(null);
globalThis.__FT_HANDLER = null;

globalThis.Deno = {
  env: {
    get(name) {
      const env = globalThis.__FT_ENV || {};
      if (name in env) return env[name];
      return process.env[name] ?? undefined;
    },
  },
  serve(handler) {
    globalThis.__FT_HANDLER = handler;
  },
};
