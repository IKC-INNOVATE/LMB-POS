-- Migration : photos produits (colonne + bucket de stockage)
-- Generated: 2026-09-21
--
-- CONTEXTE
-- --------
-- Feuille de route (point 2.5, "Audit corrections") : afficher une vraie
-- photo produit dans la Caisse et la Grille Tarifaire au lieu des simples
-- initiales (badge de repli déjà en place côté code, cf. `productInitials`
-- dans app/page.tsx). Cette migration ajoute :
--   1. La colonne `photo_url` sur `lmb_products` (chemin vers l'image).
--   2. Le bucket Supabase Storage `product-photos` qui héberge ces images.
--   3. Les policies RLS sur `storage.objects` pour ce bucket.
--
-- CHOIX DE SÉCURITÉ (à lire avant d'exécuter) :
-- ----------------------------------------------
-- Toutes les autres tables de l'application sont strictement réservées aux
-- comptes connectés (cf. 20260918_revoke_anon_catalog_access.sql :
-- "aucune page de l'application n'est accessible sans connexion"). Pour ce
-- bucket d'images uniquement, on fait une exception délibérée : le bucket
-- est PUBLIC EN LECTURE (n'importe qui avec l'URL exacte d'une photo peut
-- l'afficher, sans être connecté). Justification : ce sont des photos de
-- produits cosmétiques (pas des données personnelles ou financières), et un
-- bucket public évite d'avoir à régénérer des URLs signées à chaque
-- affichage du catalogue (complexité inutile pour ce cas). L'ÉCRITURE
-- (dépôt, remplacement, suppression d'une photo) reste réservée aux rôles
-- GERANT et DIRECTION, comme le reste du catalogue (cf. migration
-- 20260920_rls_policies_by_role.sql, policy "manager_write" sur lmb_products).
--
-- Si vous préférez un bucket privé (photos visibles uniquement depuis
-- l'application, une fois connecté), dites-le : la policy de lecture
-- publique ci-dessous peut être remplacée par une policy "to authenticated"
-- et le code applicatif adapté pour utiliser des URLs signées.
--
-- Idempotente : ADD COLUMN IF NOT EXISTS, bucket en ON CONFLICT DO NOTHING,
-- policies DROP IF EXISTS avant recréation. Peut être exécutée plusieurs fois
-- sans risque.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Colonne photo_url sur lmb_products
-- ---------------------------------------------------------------------
ALTER TABLE public.lmb_products
  ADD COLUMN IF NOT EXISTS photo_url text;

COMMENT ON COLUMN public.lmb_products.photo_url IS
  'URL publique de la photo produit (bucket Storage "product-photos"). NULL = pas de photo, l''UI affiche les initiales du nom en repli.';

-- ---------------------------------------------------------------------
-- 2. Bucket de stockage "product-photos"
--    Limite 5 Mo par fichier, formats image courants uniquement.
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-photos',
  'product-photos',
  true,
  5242880, -- 5 Mo
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- ---------------------------------------------------------------------
-- 3. Policies RLS sur storage.objects, limitées à ce bucket
--    (nécessite les fonctions public.current_staff_role() créées par
--    20260919_role_helper_functions.sql)
-- ---------------------------------------------------------------------
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_photos_public_read" ON storage.objects;
CREATE POLICY "product_photos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-photos');

DROP POLICY IF EXISTS "product_photos_manager_insert" ON storage.objects;
CREATE POLICY "product_photos_manager_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-photos'
    AND public.current_staff_role() IN ('GERANT', 'DIRECTION')
  );

DROP POLICY IF EXISTS "product_photos_manager_update" ON storage.objects;
CREATE POLICY "product_photos_manager_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND public.current_staff_role() IN ('GERANT', 'DIRECTION')
  )
  WITH CHECK (
    bucket_id = 'product-photos'
    AND public.current_staff_role() IN ('GERANT', 'DIRECTION')
  );

DROP POLICY IF EXISTS "product_photos_manager_delete" ON storage.objects;
CREATE POLICY "product_photos_manager_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND public.current_staff_role() IN ('GERANT', 'DIRECTION')
  );

-- =====================================================================
-- VÉRIFICATION MANUELLE (après migration) :
--
--   -- 1. La colonne existe :
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'lmb_products' AND column_name = 'photo_url';
--
--   -- 2. Le bucket existe et est public :
--   SELECT id, public, file_size_limit, allowed_mime_types
--   FROM storage.buckets WHERE id = 'product-photos';
--
--   -- 3. Les 4 policies existent :
--   SELECT policyname FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects'
--     AND policyname LIKE 'product_photos_%';
--   -- Attendu : 4 lignes (public_read, manager_insert, manager_update,
--   -- manager_delete).
--
--   -- 4. Test applicatif : connecté en GERANT ou DIRECTION, ouvrir
--   -- Admin → Grille Tarifaire, déposer une photo sur un produit, vérifier
--   -- qu'elle s'affiche aussitôt dans la Caisse ("/") pour ce produit.
--   -- Connecté en CAISSIER, vérifier que le contrôle de dépôt de photo
--   -- n'est pas utilisable (ou renvoie une erreur si forcé).
-- =====================================================================
