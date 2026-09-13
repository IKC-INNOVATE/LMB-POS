import { supabase } from '@/lib/supabase';

export type PurchaseStatus = 'DRAFT' | 'ORDERED' | 'RECEIVED';

export interface Supplier {
  id?: string;
  name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  created_at?: string;
}

export interface PurchaseOrderItem {
  product_id?: string;
  productId?: string;
  product_name?: string;
  name?: string;
  sku?: string;
  quantity: number;
  qty?: number;
  unit_cost: number;
  unitCost?: number;
  total_amount?: number;
  totalAmount?: number;
}

export interface PurchaseOrder {
  id?: string;
  order_number?: string;
  supplier_id?: string;
  supplierId?: string;
  status?: PurchaseStatus;
  total_amount?: number;
  items: PurchaseOrderItem[];
  created_at?: string;
  received_at?: string | null;
}

export async function listSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from('lmb_suppliers')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Supplier[];
}

export async function createSupplier(input: Partial<Supplier>): Promise<Supplier> {
  const payload = {
    name: String(input.name ?? '').trim(),
    contact_person: input.contact_person ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    address: input.address ?? null,
  };

  if (!payload.name) {
    throw new Error('Le nom du fournisseur est obligatoire.');
  }

  const { data, error } = await supabase
    .from('lmb_suppliers')
    .insert([payload])
    .select()
    .single();

  if (error) throw error;
  return data as Supplier;
}

function normalizePurchaseItems(items: PurchaseOrderItem[]): PurchaseOrderItem[] {
  return (items ?? []).map((item) => {
    const qty = Number(item.quantity ?? item.qty ?? 0);
    const unitCost = Number(item.unit_cost ?? item.unitCost ?? 0);
    const productId = item.product_id ?? item.productId ?? null;
    const total = qty * unitCost;

    return {
      product_id: productId ?? undefined,
      productId: productId ?? undefined,
      product_name: item.product_name ?? item.name ?? undefined,
      name: item.product_name ?? item.name ?? undefined,
      sku: item.sku ?? undefined,
      quantity: qty,
      qty,
      unit_cost: unitCost,
      unitCost,
      total_amount: total,
      totalAmount: total,
    };
  });
}

export async function createPurchaseOrder(
  supplierId: string,
  items: PurchaseOrderItem[],
  totalAmountInput?: number,
  status: PurchaseStatus = 'ORDERED',
): Promise<PurchaseOrder> {
  if (!supplierId) {
    throw new Error('Le fournisseur est obligatoire.');
  }

  const normalizedItems = normalizePurchaseItems(items);
  if (!normalizedItems.length) {
    throw new Error('Ajoutez au moins un article au bon de commande.');
  }

  const totalAmount = Number(totalAmountInput ?? normalizedItems.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.unit_cost) || 0)), 0));

  const orderDate = new Date();
  const orderNumber = `PO-${orderDate.toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

  const payload = {
    order_number: orderNumber,
    supplier_id: supplierId,
    status,
    total_amount: Number.isFinite(totalAmount) ? totalAmount : 0,
    items: normalizedItems,
    created_at: orderDate.toISOString(),
  };

  const { data, error } = await supabase
    .from('lmb_purchase_orders')
    .insert([payload])
    .select()
    .single();

  if (error) throw error;
  return data as PurchaseOrder;
}

export async function receivePurchaseOrder(orderId: string): Promise<PurchaseOrder> {
  if (!orderId) {
    throw new Error('Identifiant du bon de commande requis.');
  }

  const { data: order, error: orderError } = await supabase
    .from('lmb_purchase_orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    throw orderError ?? new Error('Bon de commande introuvable.');
  }

  const currentOrder = order as PurchaseOrder;
  if (currentOrder.status === 'RECEIVED') {
    return currentOrder;
  }

  const items = Array.isArray(currentOrder.items) ? currentOrder.items : [];

  for (const item of items) {
    const productId = item.product_id ?? item.productId;
    const quantity = Number(item.quantity ?? item.qty ?? 0);

    if (!productId || quantity <= 0) continue;

    const { data: product, error: productError } = await supabase
      .from('lmb_products')
      .select('stock_reserve')
      .eq('id', productId)
      .maybeSingle();

    if (productError) {
      console.warn('receivePurchaseOrder product lookup error:', productError);
      continue;
    }

    const currentReserve = Number(product?.stock_reserve ?? 0);
    const nextReserve = currentReserve + quantity;

    const { error: updateError } = await supabase
      .from('lmb_products')
      .update({ stock_reserve: nextReserve })
      .eq('id', productId);

    if (updateError) {
      console.warn('receivePurchaseOrder stock update error:', updateError);
      throw updateError;
    }
  }

  const now = new Date().toISOString();

  const { data: updated, error: updateOrderError } = await supabase
    .from('lmb_purchase_orders')
    .update({
      status: 'RECEIVED',
      received_at: now,
    })
    .eq('id', orderId)
    .select()
    .single();

  if (updateOrderError) throw updateOrderError;
  return updated as PurchaseOrder;
}
