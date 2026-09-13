import { supabase } from '@/lib/supabase';
import { Product } from '@/types';

export type StoreCity = 'DAKAR' | 'ABIDJAN';

/**
 * Produit tel que consommé par l'écran de caisse : les champs utiles de
 * lmb_products + `stock`, la quantité disponible dans la boutique active
 * (résolue depuis stock_dakar ou stock_abidjan selon storeCity).
 */
export interface PosProduct extends Product {
  stock: number;
}

const stockColumn = (storeCity: StoreCity): 'stock_dakar' | 'stock_abidjan' =>
  storeCity === 'ABIDJAN' ? 'stock_abidjan' : 'stock_dakar';

const mapRow = (row: any, storeCity: StoreCity): PosProduct => {
  const dakar = Number(row.stock_dakar ?? 0);
  const abidjan = Number(row.stock_abidjan ?? 0);
  return {
    id: row.id,
    sku: row.sku ?? '',
    barcode: row.barcode ?? undefined,
    name: row.name ?? '',
    category_name: row.category_name ?? undefined,
    standard_retail_price_xof: Number(row.standard_retail_price_xof ?? 0),
    floor_price_xof: Number(row.floor_price_xof ?? 0),
    cost_price_xof: Number(row.cost_price_xof ?? 0),
    stock_dakar: dakar,
    stock_abidjan: abidjan,
    stock: storeCity === 'ABIDJAN' ? abidjan : dakar,
  };
};

/** Liste complète des produits avec le stock de la boutique demandée. */
export async function listProducts(storeCity: StoreCity): Promise<PosProduct[]> {
  const { data, error } = await supabase
    .from('lmb_products')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.warn('listProducts error:', error);
    return [];
  }

  return (data ?? []).map((row) => mapRow(row, storeCity));
}

/**
 * Recherche par nom, SKU ou code-barres (ilike), limitée à ~20 résultats.
 * Le stock renvoyé est celui de la boutique concernée.
 */
export async function searchProducts(
  query: string,
  storeCity: StoreCity,
): Promise<PosProduct[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const term = `%${trimmed}%`;

  const { data, error } = await supabase
    .from('lmb_products')
    .select('*')
    .or(`name.ilike.${term},sku.ilike.${term},barcode.ilike.${term}`)
    .order('name', { ascending: true })
    .limit(20);

  if (error) {
    console.warn('searchProducts error:', error);
    return [];
  }

  return (data ?? []).map((row) => mapRow(row, storeCity));
}

/** Colonnes prix de `lmb_products` éditables depuis la Grille Tarifaire. */
export type EditablePriceField =
  | 'standard_retail_price_xof'
  | 'floor_price_xof'
  | 'cost_price_xof';

/**
 * Met à jour un des trois prix d'un produit (prix standard, prix plancher, coût
 * d'achat) et persiste immédiatement en base. Centralise le pattern jusque-là
 * dupliqué inline dans app/admin/page.tsx (`handleDirectCostChange`).
 *
 * Toute erreur Postgres est convertie en `Error` explicite et RE-LANCÉE : aucun
 * échec silencieux, l'appelant DOIT l'afficher à l'écran.
 */
export async function updateProductPrice(
  productId: string,
  field: EditablePriceField,
  value: number,
): Promise<void> {
  if (!productId) throw new Error('Produit introuvable (identifiant manquant).');

  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error('Le montant doit être un nombre positif ou nul.');
  }

  const { error } = await supabase
    .from('lmb_products')
    .update({ [field]: numeric })
    .eq('id', productId);

  if (error) {
    console.warn('updateProductPrice error:', error);
    throw new Error(`Sauvegarde impossible : ${error.message}`);
  }
}

/** Résolution d'un code-barres unique (scan douchette / mobile à venir). */
export async function getProductByBarcode(
  barcode: string,
  storeCity: StoreCity,
): Promise<PosProduct | null> {
  const trimmed = barcode.trim();
  if (!trimmed) return null;

  const { data, error } = await supabase
    .from('lmb_products')
    .select('*')
    .eq('barcode', trimmed)
    .maybeSingle();

  if (error) {
    console.warn('getProductByBarcode error:', error);
    return null;
  }

  return data ? mapRow(data, storeCity) : null;
}
