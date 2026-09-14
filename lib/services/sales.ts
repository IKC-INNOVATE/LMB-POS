import { supabase } from '@/lib/supabase';
import { ReceiptData, ReceiptItem, SaleReceipt } from '@/types';

const sanitizeForSupabase = <T extends Record<string, unknown>>(data: T) =>
  Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  ) as T;

/**
 * Erreur levée quand la fonction Postgres record_sale_and_decrement_stock
 * refuse la vente parce qu'un article n'a plus assez de stock réel au moment
 * de l'enregistrement (contrôle transactionnel, pas seulement l'affichage du
 * panier). Le message contient le nom du produit et le stock restant réel.
 */
export class InsufficientStockError extends Error {
  code = 'INSUFFICIENT_STOCK' as const;
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientStockError';
  }
}

/** DAKAR / ABIDJAN, dérivé du code boutique de la caissière. */
const resolveStoreCity = (storeName?: string): 'DAKAR' | 'ABIDJAN' => {
  const city = (storeName ?? '').trim().toUpperCase();
  if (city === 'DAKAR' || city === 'ABIDJAN') return city;
  throw new Error(
    `Boutique de vente invalide ("${storeName ?? ''}"). Le compte caissier doit être rattaché à DAKAR ou ABIDJAN.`
  );
};

export async function createSaleWithCustomer(payload: {
  customer_id?: string | null;
  cashier_name?: string;
  store_name?: string;
  payment_method?: string;
  payment_reference?: string;
  items: Array<{
    id?: string;
    product_id?: string;
    name?: string;
    sku?: string;
    quantity: number;
    unit_price_xof: number;
    total_price_xof: number;
    floor_price_xof?: number;
  }>;
  subtotal_xof?: number;
  discount_xof?: number;
  total_xof?: number;
  payment_details?: Record<string, unknown> | null;
  notes?: string;
}): Promise<{ sale: SaleReceipt; receipt: ReceiptData }> {
  const now = new Date().toISOString();
  const receiptNumber = `LMB-${Date.now()}`;
  const subtotal = Number(payload.subtotal_xof ?? payload.items.reduce((sum, item) => sum + item.total_price_xof, 0));
  const discount = Number(payload.discount_xof ?? 0);
  const total = Number(payload.total_xof ?? subtotal - discount);

  const storeCity = resolveStoreCity(payload.store_name);

  const items = payload.items.map((item) => ({
    ...item,
    total_price_xof: item.total_price_xof ?? item.quantity * item.unit_price_xof,
  }));

  const salePayload = sanitizeForSupabase({
    // Clés CANONIQUES lues par la fonction Postgres record_sale_and_decrement_stock.
    // La fonction les mappe elle-même sur les VRAIS noms de colonnes de `lmb_sales`
    // (schéma historique) via information_schema : on n'envoie jamais un nom de
    // colonne deviné, seulement des clés canoniques + synonymes.
    total_amount: total,
    total_amount_xof: total,
    subtotal_xof: subtotal,
    discount_xof: discount,
    payment_method: payload.payment_method ?? 'ESPECES',
    payment_reference: payload.payment_reference ?? null,
    store_code: payload.store_name ?? 'INCONNU',
    store_name: payload.store_name ?? 'INCONNU',
    customer_id: payload.customer_id ?? null,
    cashier_name: payload.cashier_name ?? 'Inconnu',
    receipt_number: receiptNumber,
    notes: payload.notes ?? null,
    created_at: now,
    // Articles vendus : colonne dédiée si elle existe, sinon repris dans metadata.
    items_json: items,
    // Détails supplémentaires dans metadata (ignoré si la colonne n'existe pas)
    metadata: {
      customer_id: payload.customer_id ?? null,
      cashier_name: payload.cashier_name ?? 'Inconnu',
      payment_reference: payload.payment_reference ?? null,
      subtotal_xof: subtotal,
      discount_xof: discount,
      items,
      payment_details: payload.payment_details ?? null,
      notes: payload.notes ?? null,
    },
  });

  // Enregistrement ATOMIQUE : insertion de la vente + décrément du stock de la
  // bonne boutique, dans une seule transaction Postgres qui verrouille les
  // lignes produits. Aucun fallback silencieux : succès réel ou erreur explicite.
  const { data, error } = await supabase.rpc('record_sale_and_decrement_stock', {
    p_sale: salePayload,
    p_items: items.map((item) => ({
      product_id: item.product_id ?? item.id ?? null,
      id: item.id ?? item.product_id ?? null,
      name: item.name ?? null,
      quantity: item.quantity,
    })),
    p_store_city: storeCity,
  });

  if (error) {
    const message = String(error.message ?? error ?? '');
    if (/stock insuffisant/i.test(message)) {
      throw new InsufficientStockError(message);
    }
    throw new Error(`Échec de l'enregistrement de la vente : ${message}`);
  }

  const insertedSale = (data as SaleReceipt) ?? null;
  if (!insertedSale) {
    throw new Error("Échec de l'enregistrement de la vente : aucune ligne renvoyée par la base.");
  }

  // Audit prix plancher : la vente est déjà enregistrée (le front a demandé la
  // confirmation explicite au caissier). On journalise ici, sans bloquer, toute
  // ligne passée sous son floor_price_xof pour contrôle ultérieur par la
  // direction. Un échec de log n'annule jamais la vente.
  const floorViolations = items.filter(
    (item) =>
      typeof item.floor_price_xof === 'number' &&
      item.floor_price_xof > 0 &&
      Number(item.unit_price_xof) < Number(item.floor_price_xof)
  );
  if (floorViolations.length > 0) {
    const { error: floorLogError } = await supabase.rpc('log_floor_price_sale', {
      p_receipt_number: receiptNumber,
      p_store: payload.store_name ?? 'INCONNU',
      p_cashier: payload.cashier_name ?? 'Inconnu',
      p_items: floorViolations.map((item) => ({
        product_id: item.product_id ?? item.id ?? null,
        name: item.name ?? null,
        sku: item.sku ?? null,
        quantity: item.quantity,
        unit_price_xof: item.unit_price_xof,
        floor_price_xof: item.floor_price_xof,
      })),
    });
    if (floorLogError) {
      console.warn('log_floor_price_sale error:', floorLogError);
    }
  }

  if (payload.customer_id) {
    const pointsEarned = Math.max(0, Math.floor(total / 1000));
    const saleIdForCustomerOrder =
      insertedSale?.id &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(insertedSale.id)
        ? insertedSale.id
        : null;

    const customerOrderPayload = sanitizeForSupabase({
      customer_id: payload.customer_id,
      sale_id: saleIdForCustomerOrder,
      store_code: payload.store_name ?? 'INCONNU',
      order_total_xof: total,
      discount_applied_xof: discount,
      points_earned: pointsEarned,
      points_redeemed: 0,
      payment_method: payload.payment_method ?? 'ESPECES',
      created_at: now,
      metadata: {
        receipt_number: receiptNumber,
        cashier_name: payload.cashier_name ?? 'Inconnu',
        items: payload.items,
      },
    });

    const { error: customerOrderError } = await supabase
      .from('lmb_customer_orders')
      .insert([customerOrderPayload]);

    if (customerOrderError) {
      // La vente et le stock sont déjà enregistrés : on ne bloque pas le reçu
      // pour un échec d'historique client, mais on le trace explicitement.
      console.warn('createSaleWithCustomer customer order error:', customerOrderError);
    }
  }

  const receiptItems: ReceiptItem[] = payload.items.map((item) => ({
    id: item.id ?? item.product_id ?? item.sku ?? `${Date.now()}-${Math.random()}`,
    product_id: item.product_id,
    name: item.name,
    sku: item.sku,
    quantity: item.quantity,
    unit_price_xof: item.unit_price_xof,
    total_price_xof: item.total_price_xof ?? item.quantity * item.unit_price_xof,
  }));

  const receipt: ReceiptData = {
    receiptNumber,
    createdAt: now,
    cashierName: payload.cashier_name ?? 'Inconnu',
    storeName: payload.store_name ?? 'INCONNU',
    customer: payload.customer_id ? { id: payload.customer_id } : undefined,
    customerName: payload.customer_id ? 'Client fidélité' : undefined,
    customerPhone: undefined,
    items: receiptItems,
    subtotalXof: subtotal,
    discountXof: discount,
    totalXof: total,
    paymentMethod: payload.payment_method ?? 'ESPECES',
    paymentReference: payload.payment_reference,
    notes: payload.notes ?? 'Merci pour votre achat chez Luxury Magic Butter',
    paymentDetails: payload.payment_details ?? null,
  };

  return {
    sale: insertedSale,
    receipt,
  };
}
