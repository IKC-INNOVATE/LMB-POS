# Migrations Supabase — LMB POS

Ce dossier contient les migrations SQL versionnées de la base.

## Vérifier que la Row Level Security (RLS) fonctionne

Après avoir appliqué `20260901_enable_rls.sql`, la **clé anon publique**
(`NEXT_PUBLIC_SUPABASE_ANON_KEY`, celle qui est visible dans le navigateur)
ne doit plus pouvoir lire les données sensibles.

### Test rapide avec `curl`

Remplacez `VOTRE_PROJET` et `CLE_ANON` par les valeurs de votre projet
(Dashboard Supabase → Project Settings → API).

```bash
SUPABASE_URL="https://VOTRE_PROJET.supabase.co"
ANON_KEY="CLE_ANON"

# 1. Doit ÉCHOUER (données sensibles) -> réponse vide [] ou erreur 401/403
curl -s -o /dev/null -w "lmb_customers -> HTTP %{http_code}\n" \
  "$SUPABASE_URL/rest/v1/lmb_customers?select=*" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"

curl -s -o /dev/null -w "lmb_sales -> HTTP %{http_code}\n" \
  "$SUPABASE_URL/rest/v1/lmb_sales?select=*" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"

# 2. Doit RÉUSSIR (catalogue public) -> HTTP 200 avec des lignes
curl -s -o /dev/null -w "lmb_products -> HTTP %{http_code}\n" \
  "$SUPABASE_URL/rest/v1/lmb_products?select=*" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"

# 3. Doit ÉCHOUER (écriture interdite pour anon) -> 401/403
curl -s -o /dev/null -w "INSERT lmb_products -> HTTP %{http_code}\n" \
  -X POST "$SUPABASE_URL/rest/v1/lmb_products" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"hack","price_xof":1}'
```

### Résultat attendu

| Requête (clé anon)              | Avant la migration | Après la migration        |
|--------------------------------|--------------------|---------------------------|
| `SELECT lmb_customers`          | 200 + données      | `[]` vide ou **401/403**  |
| `SELECT lmb_sales`              | 200 + données      | `[]` vide ou **401/403**  |
| `SELECT lmb_products`           | 200 + données      | 200 + données (OK)        |
| `INSERT lmb_products`           | 201 créé           | **401/403** refusé        |

> Note : selon la configuration, PostgREST peut renvoyer soit une **erreur
> 401/403**, soit un **tableau vide `[]` avec un code 200** (aucune ligne ne
> passe la policy). Les deux cas signifient que la RLS bloque bien l'accès.
> L'essentiel : **aucune donnée sensible ne doit ressortir**.

### Script Node (optionnel)

```js
// node check-rls.mjs
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://VOTRE_PROJET.supabase.co',
  'CLE_ANON', // clé anon publique uniquement
);

for (const table of ['lmb_customers', 'lmb_sales']) {
  const { data, error } = await supabase.from(table).select('*').limit(1);
  console.log(table, '->', error ? `BLOQUÉ (${error.message})` : `${data.length} ligne(s) visibles`);
}
```

Le test est réussi si `lmb_customers` et `lmb_sales` renvoient **BLOQUÉ** ou
**0 ligne visible**.
