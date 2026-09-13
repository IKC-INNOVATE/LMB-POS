-- Migration : policies RLS par rôle (remplace "authenticated_all_access")
--
-- CONTEXTE
-- --------
-- Voir 20260919_role_helper_functions.sql (current_staff_role/current_staff_store)
-- et la feuille de route "roadmap-audit2-securite-roles.md", Phase B, pour le
-- tableau des règles retenues par table. Ces règles sont des HYPOTHÈSES PAR
-- DÉFAUT construites à partir de ce que l'interface bloquait déjà et de ce que
-- chaque rôle utilise réellement dans le code — à ajuster si la Direction voit
-- les choses autrement (voir Tâche B.3 : tester avant de considérer que c'est
-- définitif).
--
-- Tables volontairement NON touchées ici (déjà correctes ou hors périmètre) :
--   - lmb_customers, lmb_customer_loyalty_events : accès complet pour les 3
--     rôles dès le départ (nécessaire pour la fidélité en caisse), pas de
--     scoping boutique pertinent (client partagé entre les deux boutiques).
--   - lmb_floor_price_alerts : déjà restreinte (lecture authenticated seule,
--     aucune écriture directe, tout passe par log_floor_price_sale()).
--   - lmb_products, lmb_promotions : traitées en Phase A (accès anon retiré) ;
--     restriction d'écriture par rôle ajoutée ici.
--   - lmb_audit_logs, inventory_reports : citées dans la Tâche 0.1 d'origine
--     mais aucune de ces deux tables n'existe réellement dans le schéma
--     (vérifié : aucun CREATE TABLE dans tout supabase/migrations/) — rien à
--     faire.
--
-- Idempotente : chaque bloc supprime d'abord ses policies avant de les recréer.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. lmb_products / lmb_promotions : lecture pour les 3 rôles, écriture
--    réservée à GERANT/DIRECTION.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_all_access" ON public.lmb_products;
CREATE POLICY "staff_read" ON public.lmb_products
  FOR SELECT TO authenticated
  USING (public.current_staff_role() IS NOT NULL);
CREATE POLICY "manager_write" ON public.lmb_products
  FOR ALL TO authenticated
  USING (public.current_staff_role() IN ('GERANT', 'DIRECTION'))
  WITH CHECK (public.current_staff_role() IN ('GERANT', 'DIRECTION'));

DROP POLICY IF EXISTS "authenticated_all_access" ON public.lmb_promotions;
CREATE POLICY "staff_read" ON public.lmb_promotions
  FOR SELECT TO authenticated
  USING (public.current_staff_role() IS NOT NULL);
CREATE POLICY "manager_write" ON public.lmb_promotions
  FOR ALL TO authenticated
  USING (public.current_staff_role() IN ('GERANT', 'DIRECTION'))
  WITH CHECK (public.current_staff_role() IN ('GERANT', 'DIRECTION'));


-- ---------------------------------------------------------------------
-- 2. lmb_sales : lecture/écriture limitées à sa propre boutique pour
--    CAISSIER/GERANT (store_name) ; DIRECTION voit tout. Pas de suppression
--    (aucun rôle ne doit supprimer une vente — les annulations passent par le
--    champ status, cf. migration 20260916).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_all_access" ON public.lmb_sales;
CREATE POLICY "sales_select" ON public.lmb_sales
  FOR SELECT TO authenticated
  USING (
    public.current_staff_role() = 'DIRECTION'
    OR (public.current_staff_role() IN ('CAISSIER', 'GERANT') AND store_name = public.current_staff_store())
  );
CREATE POLICY "sales_insert" ON public.lmb_sales
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_staff_role() = 'DIRECTION'
    OR (public.current_staff_role() IN ('CAISSIER', 'GERANT') AND store_name = public.current_staff_store())
  );
CREATE POLICY "sales_update" ON public.lmb_sales
  FOR UPDATE TO authenticated
  USING (
    public.current_staff_role() = 'DIRECTION'
    OR (public.current_staff_role() = 'GERANT' AND store_name = public.current_staff_store())
  )
  WITH CHECK (
    public.current_staff_role() = 'DIRECTION'
    OR (public.current_staff_role() = 'GERANT' AND store_name = public.current_staff_store())
  );


-- ---------------------------------------------------------------------
-- 3. lmb_customer_orders : même logique que lmb_sales, sur store_code
--    (colonne nullable : une ligne sans store_code n'est visible que par
--    DIRECTION, par prudence).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_all_access" ON public.lmb_customer_orders;
CREATE POLICY "customer_orders_select" ON public.lmb_customer_orders
  FOR SELECT TO authenticated
  USING (
    public.current_staff_role() = 'DIRECTION'
    OR (public.current_staff_role() IN ('CAISSIER', 'GERANT') AND store_code = public.current_staff_store())
  );
CREATE POLICY "customer_orders_insert" ON public.lmb_customer_orders
  FOR INSERT TO authenticated
  WITH CHECK (public.current_staff_role() IS NOT NULL);


-- ---------------------------------------------------------------------
-- 4. lmb_registers : lecture/écriture limitées à sa boutique (store_code)
--    pour CAISSIER/GERANT ; DIRECTION voit tout.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_all_access" ON public.lmb_registers;
CREATE POLICY "registers_select" ON public.lmb_registers
  FOR SELECT TO authenticated
  USING (
    public.current_staff_role() = 'DIRECTION'
    OR (public.current_staff_role() IN ('CAISSIER', 'GERANT') AND store_code = public.current_staff_store())
  );
CREATE POLICY "registers_write" ON public.lmb_registers
  FOR ALL TO authenticated
  USING (
    public.current_staff_role() = 'DIRECTION'
    OR (public.current_staff_role() IN ('CAISSIER', 'GERANT') AND store_code = public.current_staff_store())
  )
  WITH CHECK (
    public.current_staff_role() = 'DIRECTION'
    OR (public.current_staff_role() IN ('CAISSIER', 'GERANT') AND store_code = public.current_staff_store())
  );

-- lmb_register_expenses n'a pas de colonne boutique directe : on remonte à la
-- boutique via la caisse (register_id -> lmb_registers.store_code).
DROP POLICY IF EXISTS "authenticated_all_access" ON public.lmb_register_expenses;
CREATE POLICY "register_expenses_select" ON public.lmb_register_expenses
  FOR SELECT TO authenticated
  USING (
    public.current_staff_role() = 'DIRECTION'
    OR (
      public.current_staff_role() IN ('CAISSIER', 'GERANT')
      AND EXISTS (
        SELECT 1 FROM public.lmb_registers r
        WHERE r.id = lmb_register_expenses.register_id
          AND r.store_code = public.current_staff_store()
      )
    )
  );
CREATE POLICY "register_expenses_insert" ON public.lmb_register_expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_staff_role() = 'DIRECTION'
    OR (
      public.current_staff_role() IN ('CAISSIER', 'GERANT')
      AND EXISTS (
        SELECT 1 FROM public.lmb_registers r
        WHERE r.id = lmb_register_expenses.register_id
          AND r.store_code = public.current_staff_store()
      )
    )
  );


-- ---------------------------------------------------------------------
-- 5. lmb_expenses : réservée à GERANT (sa boutique, store_city) et DIRECTION
--    (tout). Aucun accès pour CAISSIER (cohérent avec /admin/finance déjà
--    bloqué pour ce rôle).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_all_access" ON public.lmb_expenses;
CREATE POLICY "expenses_access" ON public.lmb_expenses
  FOR ALL TO authenticated
  USING (
    public.current_staff_role() = 'DIRECTION'
    OR (public.current_staff_role() = 'GERANT' AND store_city = public.current_staff_store())
  )
  WITH CHECK (
    public.current_staff_role() = 'DIRECTION'
    OR (public.current_staff_role() = 'GERANT' AND store_city = public.current_staff_store())
  );


-- ---------------------------------------------------------------------
-- 6. lmb_purchase_orders / lmb_suppliers : réservées à GERANT/DIRECTION
--    (cohérent avec /admin/purchases déjà bloqué pour CAISSIER). Pas de
--    colonne boutique sur ces tables (achats mutualisés) : pas de scoping.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_all_access" ON public.lmb_purchase_orders;
CREATE POLICY "purchase_orders_access" ON public.lmb_purchase_orders
  FOR ALL TO authenticated
  USING (public.current_staff_role() IN ('GERANT', 'DIRECTION'))
  WITH CHECK (public.current_staff_role() IN ('GERANT', 'DIRECTION'));

DROP POLICY IF EXISTS "authenticated_all_access" ON public.lmb_suppliers;
CREATE POLICY "suppliers_access" ON public.lmb_suppliers
  FOR ALL TO authenticated
  USING (public.current_staff_role() IN ('GERANT', 'DIRECTION'))
  WITH CHECK (public.current_staff_role() IN ('GERANT', 'DIRECTION'));


-- ---------------------------------------------------------------------
-- 7. lmb_transfers : réservée à GERANT/DIRECTION. Un GERANT ne voit/ne gère
--    que les colis dont sa boutique est source OU destination (from_city /
--    to_city) ; DIRECTION voit tout.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_all_access" ON public.lmb_transfers;
CREATE POLICY "transfers_access" ON public.lmb_transfers
  FOR ALL TO authenticated
  USING (
    public.current_staff_role() = 'DIRECTION'
    OR (
      public.current_staff_role() = 'GERANT'
      AND public.current_staff_store() IN (from_city, to_city)
    )
  )
  WITH CHECK (
    public.current_staff_role() = 'DIRECTION'
    OR (
      public.current_staff_role() = 'GERANT'
      AND public.current_staff_store() IN (from_city, to_city)
    )
  );


-- ---------------------------------------------------------------------
-- 8. lmb_inventory_audits : réservée à GERANT (sa boutique, colonne
--    `location`, valeurs en minuscules 'dakar'/'abidjan'/'reserve' —
--    comparaison insensible à la casse) et DIRECTION (tout, y compris
--    'reserve').
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_all_access" ON public.lmb_inventory_audits;
CREATE POLICY "inventory_audits_access" ON public.lmb_inventory_audits
  FOR ALL TO authenticated
  USING (
    public.current_staff_role() = 'DIRECTION'
    OR (public.current_staff_role() = 'GERANT' AND lower(location) = lower(coalesce(public.current_staff_store(), '')))
  )
  WITH CHECK (
    public.current_staff_role() = 'DIRECTION'
    OR (public.current_staff_role() = 'GERANT' AND lower(location) = lower(coalesce(public.current_staff_store(), '')))
  );


-- ---------------------------------------------------------------------
-- 9. lmb_attendance : simplification retenue par rapport à l'hypothèse
--    initiale ("ses propres pointages") — cette table identifie l'employé
--    par un simple texte `cashier_name`, pas par un identifiant fiable
--    (auth.uid()), ce qui rendrait un filtre "ses propres pointages"
--    trompeur (deux employés au même nom, faute de frappe...). Retenu à la
--    place : accès scopé par boutique (store_city), comme le reste —
--    CAISSIER/GERANT voient les pointages de leur boutique, DIRECTION tout.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_all_access" ON public.lmb_attendance;
CREATE POLICY "attendance_access" ON public.lmb_attendance
  FOR ALL TO authenticated
  USING (
    public.current_staff_role() = 'DIRECTION'
    OR (public.current_staff_role() IN ('CAISSIER', 'GERANT') AND store_city = public.current_staff_store())
  )
  WITH CHECK (
    public.current_staff_role() = 'DIRECTION'
    OR (public.current_staff_role() IN ('CAISSIER', 'GERANT') AND store_city = public.current_staff_store())
  );


-- ---------------------------------------------------------------------
-- 10. lmb_merchant_balance_snapshots / lmb_merchant_withdrawals /
--     lmb_surveillance_status : déjà réservées à DIRECTION au niveau de
--     l'interface (DIRECTION_ONLY_ADMIN_PATHS) ; on l'impose maintenant
--     aussi en base.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_all_access" ON public.lmb_merchant_balance_snapshots;
CREATE POLICY "direction_only" ON public.lmb_merchant_balance_snapshots
  FOR ALL TO authenticated
  USING (public.current_staff_role() = 'DIRECTION')
  WITH CHECK (public.current_staff_role() = 'DIRECTION');

DROP POLICY IF EXISTS "authenticated_all_access" ON public.lmb_merchant_withdrawals;
CREATE POLICY "direction_only" ON public.lmb_merchant_withdrawals
  FOR ALL TO authenticated
  USING (public.current_staff_role() = 'DIRECTION')
  WITH CHECK (public.current_staff_role() = 'DIRECTION');

DROP POLICY IF EXISTS "authenticated_all_access" ON public.lmb_surveillance_status;
CREATE POLICY "direction_only" ON public.lmb_surveillance_status
  FOR ALL TO authenticated
  USING (public.current_staff_role() = 'DIRECTION')
  WITH CHECK (public.current_staff_role() = 'DIRECTION');

-- =====================================================================
-- VÉRIFICATION MANUELLE (après migration) — voir aussi la Tâche B.3 de la
-- feuille de route pour les parcours applicatifs à rejouer en conditions
-- réelles :
--
--   -- Aucune table listée ci-dessus ne doit plus avoir "authenticated_all_access" :
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname = 'public' AND policyname = 'authenticated_all_access'
--     AND tablename IN (
--       'lmb_products','lmb_promotions','lmb_sales','lmb_customer_orders',
--       'lmb_registers','lmb_register_expenses','lmb_expenses',
--       'lmb_purchase_orders','lmb_suppliers','lmb_transfers',
--       'lmb_inventory_audits','lmb_attendance',
--       'lmb_merchant_balance_snapshots','lmb_merchant_withdrawals',
--       'lmb_surveillance_status'
--     );
--   -- Attendu : 0 ligne.
-- =====================================================================
