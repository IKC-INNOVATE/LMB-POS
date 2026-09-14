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
type SupabaseResult = { data: unknown; error: unknown };

interface MockBuilder {
  [method: string]: (...args: unknown[]) => unknown;
}

export function queueSupabaseFrom(results: Array<SupabaseResult>) {
  let i = 0;
  const from = vi.fn(() => {
    const result = results[i] ?? { data: null, error: null };
    i += 1;
    return makeBuilder(result);
  });
  return from;
}

function makeBuilder(result: SupabaseResult): MockBuilder {
  const builder: MockBuilder = {};
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
  builder.then = (...args: unknown[]) => {
    const [resolve, reject] = args as [
      (value: SupabaseResult) => void,
      ((reason?: unknown) => void)?,
    ];
    return Promise.resolve(result).then(resolve, reject);
  };
  return builder;
}

export function makeRpcMock(results: Array<SupabaseResult>) {
  let i = 0;
  return vi.fn(() => {
    const result = results[i] ?? { data: null, error: null };
    i += 1;
    return Promise.resolve(result);
  });
}
