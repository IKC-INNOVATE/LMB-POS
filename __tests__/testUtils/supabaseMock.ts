import { vi } from 'vitest';

/**
 * Mock minimal et chaînable du client Supabase, pour tester la logique
 * métier des services (lib/services/*.ts) sans base de données réelle.
 *
 * Usage : queue les réponses successives des appels `supabase.from(...)`
 * dans l'ordre où le code sous test les déclenche. Chaque objet retourné
 * par `.from()` est chaînable (`.select().eq().order()...`) et se comporte
 * comme une Promise quand on l'attend directement (sans `.single()`), tout
 * comme le vrai client supabase-js.
 */
export function queueSupabaseFrom(results: Array<{ data: any; error: any }>) {
  let i = 0;
  const from = vi.fn(() => {
    const result = results[i] ?? { data: null, error: null };
    i += 1;
    return makeBuilder(result);
  });
  return from;
}

function makeBuilder(result: { data: any; error: any }) {
  const builder: any = {};
  const chainMethods = [
    'select', 'eq', 'order', 'limit', 'gte', 'lte', 'or', 'insert', 'update', 'delete',
  ];
  chainMethods.forEach((method) => {
    builder[method] = vi.fn(() => builder);
  });
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  // Rend le builder "thenable" : `await supabase.from(...).select(...).eq(...)`
  // (sans `.single()`) résout directement, comme le vrai client.
  builder.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

export function makeRpcMock(results: Array<{ data: any; error: any }>) {
  let i = 0;
  return vi.fn(() => {
    const result = results[i] ?? { data: null, error: null };
    i += 1;
    return Promise.resolve(result);
  });
}
