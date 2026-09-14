import { supabase } from '@/lib/supabase';

type Location = 'DAKAR' | 'ABIDJAN' | 'RESERVE';

export interface TransferItem {
  productId: string;
  qty: number;
}

/**
 * UNE ligne de `lmb_transfers` = UN produit d'un colis.
 *
 * Schéma réel confirmé (information_schema) :
 *   NOT NULL sans défaut : id, ref_number, from_city, to_city,
 *                          product_sku, product_name, quantity
 *   Optionnelles          : status (défaut 'EN_TRANSIT'), carrier, created_at,
 *                          transfer_number, source_location, destination_location,
 *                          items (défaut '[]'), created_by, confirmed_at, metadata
 *
 * Contraintes confirmées (pg_constraint) :
 *   - lmb_transfers_pkey            PRIMARY KEY (id)
 *   - lmb_transfers_ref_number_key  UNIQUE (ref_number)   <-- bloquant
 *
 * Conséquence : `ref_number` doit être UNIQUE PAR LIGNE. L'identifiant de
 * regroupement d'un colis (partagé par toutes ses lignes) est donc
 * `transfer_number` (nullable, sans contrainte unique).
 *   ref_number      = `<groupe>-L1`, `<groupe>-L2`, ...   (unique, 1 par produit)
 *   transfer_number = `<groupe>` = `TRF-AAAAMMJJ-XXXXXX`  (partagé par le colis)
 *
 * `source_location` / `destination_location` / `items` sont remplies en miroir
 * (from_city / to_city / [une ligne]) pour rester lisibles, mais ne sont pas
 * la source de vérité.
 */
export interface TransferRow {
  id?: string;
  ref_number: string;
  transfer_number?: string;
  from_city: Location;
  to_city: Location;
  product_sku: string;
  product_name: string;
  quantity: number;
  status?: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  carrier?: string | null;
  created_by?: string | null;
  created_at?: string;
  confirmed_at?: string | null;
  metadata?: Record<string, unknown> | null;
  // Miroirs du format canonique historique (facultatifs).
  source_location?: Location;
  destination_location?: Location;
  items?: TransferItem[];
}

/** Vue "un colis" = toutes les lignes partageant un `transfer_number`. */
export interface TransferGroup {
  /** Identifiant de regroupement (= colonne `transfer_number`). */
  transfer_number: string;
  /** Alias de compat = `transfer_number` (l'ancien nom exposé à l'UI). */
  ref_number: string;
  from_city: Location;
  to_city: Location;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'MIXED';
  carrier?: string | null;
  created_by?: string | null;
  created_at?: string;
  confirmed_at?: string | null;
  metadata?: Record<string, unknown> | null;
  lines: Array<{
    id?: string;
    productId: string;
    product_sku: string;
    product_name: string;
    quantity: number;
    status?: string;
  }>;
}

const stockColumnFor = (location: string): string => {
  const loc = String(location ?? '').trim().toUpperCase();
  if (loc === 'DAKAR') return 'stock_dakar';
  if (loc === 'ABIDJAN') return 'stock_abidjan';
  if (loc === 'RESERVE') return 'stock_reserve';
  throw new Error(`Emplacement de stock inconnu : "${location}". Attendu DAKAR, ABIDJAN ou RESERVE.`);
};

interface RawTransferItem {
  productId?: string;
  product_id?: string;
  id?: string;
  qty?: number;
  quantity?: number;
  quantity_sent?: number;
}

const normalizeItem = (raw: RawTransferItem): TransferItem => ({
  productId: String(raw?.productId ?? raw?.product_id ?? raw?.id ?? ''),
  qty: Number(raw?.qty ?? raw?.quantity ?? raw?.quantity_sent ?? 0),
});

const CANONICAL_STATUS = (raw?: string): 'PENDING' | 'CONFIRMED' | 'CANCELLED' => {
  const s = String(raw ?? '').trim().toUpperCase();
  if (['CONFIRMED', 'RECEIVED', 'RECU', 'REÇU', 'DONE'].includes(s)) return 'CONFIRMED';
  if (['CANCELLED', 'CANCELED', 'ANNULE', 'ANNULÉ'].includes(s)) return 'CANCELLED';
  return 'PENDING';
};

/**
 * Crée un colis inter-boutiques : insère UNE LIGNE PAR PRODUIT dans
 * `lmb_transfers`. Les lignes partagent le même `transfer_number` (regroupement) ;
 * chaque ligne reçoit un `ref_number` UNIQUE (`<groupe>-L1`, `-L2`, ...) car
 * `lmb_transfers_ref_number_key` interdit les doublons.
 *
 * Choix de statut : on écrit explicitement `status='PENDING'` (et PAS le défaut
 * SQL 'EN_TRANSIT'). Raison : `confirmTransfer()`, le badge de /admin/transfers
 * et la migration 20260907_normalize_transfers.sql travaillent tous sur le
 * vocabulaire PENDING / CONFIRMED / CANCELLED. 'EN_TRANSIT' est précisément
 * l'incohérence que cette migration a supprimée — on ne la réintroduit pas.
 *
 * Le stock N'EST PAS modifié ici : il ne bouge qu'à
 * `confirmTransfer(transfer_number)`.
 * Aucun fallback silencieux : succès réel (lignes renvoyées par la base) ou throw.
 */
export async function createTransfer(
  from: Location,
  to: Location,
  items: TransferItem[],
  metadata?: Record<string, unknown>
) {
  const now = new Date().toISOString();
  const fromCity = String(from).toUpperCase() as Location;
  const toCity = String(to).toUpperCase() as Location;

  const normalizedItems = (items ?? [])
    .map(normalizeItem)
    .filter((it) => it.productId && it.qty > 0);

  if (normalizedItems.length === 0) {
    throw new Error('Transfert vide : ajoutez au moins un produit avec une quantité supérieure à 0.');
  }
  if (fromCity === toCity) {
    throw new Error('La source et la destination du transfert doivent être différentes.');
  }
  // stockColumnFor throw si une ville est invalide -> on valide tôt.
  stockColumnFor(fromCity);
  stockColumnFor(toCity);

  // Fusion des doublons (même produit ajouté 2x) : additionne les quantités.
  const merged = new Map<string, number>();
  for (const it of normalizedItems) {
    merged.set(it.productId, (merged.get(it.productId) ?? 0) + it.qty);
  }
  const productIds = [...merged.keys()];

  // product_sku / product_name sont NOT NULL : on lit les vraies valeurs en base
  // (source de vérité), pas ce que l'UI a bien voulu envoyer.
  const { data: prodRows, error: prodErr } = await supabase
    .from('lmb_products')
    .select('id, sku, name')
    .in('id', productIds);

  if (prodErr) {
    throw new Error(`Transfert NON enregistré : lecture des produits échouée (${prodErr.message}).`);
  }
  interface ProductRow {
    id: string;
    sku?: string;
    name?: string;
  }
  const prodById = new Map((prodRows ?? []).map((p: ProductRow) => [String(p.id), p]));
  const missing = productIds.filter((id) => !prodById.has(id));
  if (missing.length > 0) {
    throw new Error(`Transfert NON enregistré : produit(s) introuvable(s) en base : ${missing.join(', ')}.`);
  }

  const stamp = now.slice(0, 10).replace(/-/g, '');
  const rand = (Math.random().toString(36).slice(2, 8) + '000000').slice(0, 6).toUpperCase();
  const groupNumber = `TRF-${stamp}-${rand}`; // partagé par toutes les lignes du colis
  const carrier = metadata?.carrier ?? metadata?.tracking_reference ?? null;
  const createdBy = metadata?.createdBy ?? metadata?.created_by ?? null;

  const rows = productIds.map((productId, idx) => {
    const p = prodById.get(productId)!;
    const qty = merged.get(productId)!;
    return {
      ref_number: `${groupNumber}-L${idx + 1}`, // UNIQUE par ligne (contrainte)
      transfer_number: groupNumber,             // identifiant de regroupement
      from_city: fromCity,
      to_city: toCity,
      product_sku: String(p.sku ?? 'SKU-INCONNU'),
      product_name: String(p.name ?? 'Produit inconnu'),
      quantity: qty,
      status: 'PENDING',
      carrier,
      created_by: createdBy,
      created_at: now,
      metadata: metadata ?? {},
      // miroirs canoniques (facultatifs mais gardés cohérents)
      source_location: fromCity,
      destination_location: toCity,
      items: [{ productId, qty }],
    };
  });

  const { data, error } = await supabase.from('lmb_transfers').insert(rows).select();

  if (error) {
    throw new Error(`Transfert NON enregistré : ${error.message}. Vérifiez la connexion et réessayez.`);
  }
  if (!data || data.length !== rows.length) {
    throw new Error('Transfert NON enregistré : la base n’a pas renvoyé toutes les lignes attendues.');
  }

  return {
    ref_number: groupNumber, // compat UI : c'est le n° affiché du colis
    transfer_number: groupNumber,
    from_city: fromCity,
    to_city: toCity,
    status: 'PENDING' as const,
    created_at: now,
    rows: data as TransferRow[],
    lineCount: rows.length,
  };
}

/**
 * Confirme la réception d'un COLIS entier (toutes les lignes partageant le même
 * `transfer_number`), de façon ATOMIQUE.
 *
 * Toute la logique — verrou des lignes, refus si une ligne est déjà
 * CONFIRMED/CANCELLED, contrôle de stock produit par produit, double mouvement
 * (- from_city / + to_city), bascule CONFIRMED + confirmed_at — est exécutée
 * dans la fonction Postgres `confirm_transfer(p_transfer_number)`
 * (migration 20260909_confirm_transfer_atomic.sql), donc dans UNE seule
 * transaction : si une étape échoue, RIEN n'est appliqué.
 */
export async function confirmTransfer(transferNumber: string) {
  if (!transferNumber) throw new Error('Numéro de transfert (transfer_number) manquant.');

  const { data, error } = await supabase.rpc('confirm_transfer', {
    p_transfer_number: transferNumber,
  });

  if (error) {
    // Les RAISE EXCEPTION de la fonction remontent ici tels quels (produit
    // manquant, stock insuffisant, ligne déjà confirmée…). Rien n'a été modifié.
    throw new Error(`Confirmation refusée : ${error.message}`);
  }

  const rows = (data ?? []) as TransferRow[];
  if (rows.length === 0) {
    throw new Error(`Aucun transfert avec le numéro ${transferNumber}.`);
  }

  return {
    success: true,
    transfer_number: transferNumber,
    ref_number: transferNumber,
    lines: rows.length,
    rows,
  };
}

/**
 * Liste les transferts REGROUPÉS par `transfer_number` (un objet = un colis).
 * Le statut du groupe est CONFIRMED/PENDING/CANCELLED si toutes les lignes
 * partagent le même, sinon 'MIXED' (anomalie à corriger manuellement).
 */
export async function listTransfers(limit = 100): Promise<TransferGroup[]> {
  const { data, error } = await supabase
    .from('lmb_transfers')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Impossible de charger les transferts : ${error.message}`);
  }

  interface RawTransferRow {
    id?: string;
    transfer_number?: string;
    ref_number?: string;
    product_id?: string;
    product_sku?: string;
    product_name?: string;
    quantity?: number;
    items?: Array<{ productId?: string; qty?: number }>;
    status?: string;
    from_city?: Location;
    to_city?: Location;
    source_location?: Location;
    destination_location?: Location;
    carrier?: string | null;
    created_by?: string | null;
    created_at?: string;
    confirmed_at?: string | null;
    metadata?: Record<string, unknown> & { carrier?: string } | null;
  }

  const rows = (data ?? []) as RawTransferRow[];
  const groups = new Map<string, TransferGroup>();

  for (const r of rows) {
    // Regroupement par transfer_number (ref_number est unique par ligne).
    const key = r.transfer_number ?? r.ref_number ?? r.id ?? '';
    const canonical = CANONICAL_STATUS(r.status);
    const line = {
      id: r.id,
      productId: String(r.product_id ?? (Array.isArray(r.items) ? r.items[0]?.productId : '') ?? ''),
      product_sku: r.product_sku ?? '—',
      product_name: r.product_name ?? '—',
      quantity: Number(r.quantity ?? (Array.isArray(r.items) ? r.items[0]?.qty : 0) ?? 0),
      status: canonical,
    };

    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        transfer_number: key,
        ref_number: key,
        from_city: (r.from_city ?? r.source_location) as Location,
        to_city: (r.to_city ?? r.destination_location) as Location,
        status: canonical,
        carrier: r.carrier ?? r.metadata?.carrier ?? null,
        created_by: r.created_by ?? null,
        created_at: r.created_at ?? undefined,
        confirmed_at: r.confirmed_at ?? null,
        metadata: r.metadata ?? null,
        lines: [line],
      });
    } else {
      existing.lines.push(line);
      if (existing.status !== canonical) existing.status = 'MIXED';
      if (!existing.confirmed_at && r.confirmed_at) existing.confirmed_at = r.confirmed_at;
    }
  }

  return [...groups.values()];
}
