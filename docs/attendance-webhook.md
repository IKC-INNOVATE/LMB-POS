# Webhook de pointage — `POST /api/attendance/webhook`

Reçoit les pointages (arrivée / départ) depuis le système de reconnaissance
faciale / le boîtier caméra.

## Écriture en base

La table `public.lmb_attendance` est « sensible » (RLS : aucun accès `anon`).
L'insert passe donc par un client **`service_role`**, instancié uniquement dans
`app/api/attendance/webhook/route.ts` (clé jamais exposée au navigateur ;
`lib/supabase.ts`, le client anon partagé, n'est pas touché).

Colonnes réellement écrites : `cashier_name`, `store_city` (`DAKAR` | `ABIDJAN`),
`type` (`ARRIVEE` | `DEPART`), `timestamp` (ISO), `camera_reference`.

### Déduction ARRIVEE / DEPART

À chaque appel, on regarde s'il existe déjà au moins un pointage **aujourd'hui**
(bornes UTC) pour ce `cashier_name` :

- aucun pointage aujourd'hui → `type = ARRIVEE` (`action: "CREATED_ARRIVEE"`)
- au moins un pointage aujourd'hui → `type = DEPART` (`action: "CREATED_DEPART"`)

Aucun changement côté boîtier caméra : il envoie toujours le même payload, c'est
le serveur qui décide ARRIVEE vs DEPART.

Si l'insert échoue, le webhook renvoie `500 { "error": "Pointage NON enregistré : …" }`
(plus de faux succès silencieux).

## Authentification

Le webhook exige un secret partagé, envoyé dans le header HTTP :

```
Authorization: Bearer <ATTENDANCE_WEBHOOK_SECRET>
```

- Le secret est défini dans `.env.local` sous `ATTENDANCE_WEBHOOK_SECRET`
  (strictement côté serveur, **jamais** préfixé par `NEXT_PUBLIC_`).
- Comparaison à temps constant (`crypto.timingSafeEqual`).
- Toute requête sans header valide reçoit `401 { "error": "Non autorisé" }`
  et la tentative est journalisée dans `lmb_attendance_webhook_log`
  (date, IP, nom d'employé tenté si présent).

## Tester manuellement

Remplacez `SECRET` par la valeur de `ATTENDANCE_WEBHOOK_SECRET` et adaptez l'URL
(`http://localhost:3000` en dev, sinon le domaine de production).

### 1. Avec le bon secret — doit RÉUSSIR (HTTP 201)

```bash
SECRET="<valeur de ATTENDANCE_WEBHOOK_SECRET dans .env.local>"
BASE="http://localhost:3000"

curl -i -X POST "$BASE/api/attendance/webhook" \
  -H "Authorization: Bearer $SECRET" \
  -H "Content-Type: application/json" \
  -d '{"employee_name":"Awa Diop","store":"LMB - Dakar"}'
```

Réponse attendue : `HTTP/1.1 201` avec
`{"success":true,"action":"CREATED_ARRIVEE","record":{…}}` au 1er appel du jour,
puis `"action":"CREATED_DEPART"` aux appels suivants du même jour.

Champs du payload :

| champ              | obligatoire | notes                                            |
| ----------------- | ----------- | ------------------------------------------------ |
| `employee_name`   | oui         | doit correspondre au `full_name` de `lmb_staff`  |
| `store`           | oui         | doit contenir « Dakar » ou « Abidjan »           |
| `camera_reference`| non         | défaut `CAM_STREAM_<VILLE>_01`                    |

Le champ `source` n'est plus utilisé (ignoré s'il est envoyé).

### 2. Sans header Authorization — doit ÉCHOUER (HTTP 401)

```bash
curl -i -X POST "$BASE/api/attendance/webhook" \
  -H "Content-Type: application/json" \
  -d '{"employee_name":"Faux Pointage","store":"LMB - Dakar"}'
```

Réponse attendue : `HTTP/1.1 401` avec `{"error":"Non autorisé"}`.

### 3. Avec un mauvais secret — doit ÉCHOUER (HTTP 401)

```bash
curl -i -X POST "$BASE/api/attendance/webhook" \
  -H "Authorization: Bearer mauvais-secret" \
  -H "Content-Type: application/json" \
  -d '{"employee_name":"Faux Pointage","store":"LMB - Dakar"}'
```

Réponse attendue : `HTTP/1.1 401` avec `{"error":"Non autorisé"}`.

### Vérifier le journal des tentatives refusées

Dashboard Supabase → SQL Editor (ou connecté en DIRECTION dans l'app) :

```sql
SELECT attempted_at, ip_address, attempted_employee_name, reason
FROM public.lmb_attendance_webhook_log
ORDER BY attempted_at DESC
LIMIT 20;
```

Les tests 2 et 3 doivent y apparaître ; le test 1 ne doit **pas** y figurer.
