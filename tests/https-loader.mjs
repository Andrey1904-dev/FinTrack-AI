/* ============================================================================
   https-loader.mjs — резолвер для тестов: https-импорты из Edge Functions
   подменяются локальными заглушками (Deno и esm.sh в Node не нужны).
   ========================================================================== */
const MAP = {
  'https://esm.sh/@supabase/supabase-js@2': new URL('./stubs/supabase-js.mjs', import.meta.url).href,
};

export async function resolve(specifier, context, next) {
  if (MAP[specifier]) return next(MAP[specifier]);
  if (specifier.startsWith('https://')) {
    throw new Error('В тестах нет стаба для импорта: ' + specifier);
  }
  return next(specifier, context);
}
