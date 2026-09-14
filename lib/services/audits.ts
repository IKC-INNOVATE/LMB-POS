import { supabase } from '@/lib/supabase';

export type InventoryLocation = 'dakar' | 'abidjan' | 'reserve';
export type InventoryAuditStatus = 'IN_PROGRESS' | 'COMPLETED';

export interface InventoryAuditItem {
  product_id: string;
  sku: string;
  name: string;
  theoretical_stock: number;
  counted_stock: number;
  variance: number;
  variance_value: number;
  location: InventoryLocation;
  unit_price_xof?: number;
}

export interface InventoryAudit {
  id?: string;
  audit_number: string;
  location: InventoryLocation;
  status: InventoryAuditStatus;
  items: InventoryAuditItem[];
  total_variance_value: number;
  created_by?: string | null;
  created_at?: string;
  completed_at?: string | null;
}

const locationToStockColumn: Record<InventoryLocation, string> = {
  dakar: 'stock_dakar',
  abidjan: 'stock_abidjan',
  reserve: 'stock_reserve',
};

const normalizeLocation = (location: string): InventoryLocation => {
  const normalized = String(location ?? '').trim().toLowerCase();
  if (normalized === 'abidjan') return 'abidjan';
  if (normalized === 'reserve') return 'reserve';
  return 'dakar';
};

const buildAuditItems = (
  products: Record<string, unknown>[],
  location: InventoryLocation,
): InventoryAuditItem[] => {
  const column = locationToStockColumn[location];

  return (products ?? []).map((product) => {
    const theoreticalStock = Number(product?.[column] ?? 0);
    const unitPrice = Number(product?.standard_retail_price_xof ?? product?.floor_price_xof ?? 0);

    return {
      product_id: String(product.id ?? ''),
      sku: String(product.sku ?? ''),
      name: String(product.name ?? ''),
      theoretical_stock: theoreticalStock,
      counted_stock: theoreticalStock,
      variance: 0,
      variance_value: 0,
      location,
      unit_price_xof: unitPrice,
    };
  });
};

export async function listInventoryAudits(): Promise<InventoryAudit[]> {
  const { data, error } = await supabase
    .from('lmb_inventory_audits')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('listInventoryAudits error:', error);
    return [];
  }

  return (data ?? []) as InventoryAudit[];
}

export async function startInventoryAudit(location: string, createdBy: string): Promise<InventoryAudit> {
  const normalizedLocation = normalizeLocation(location);
  const { data: products, error: productsError } = await supabase.from('lmb_products').select('*');
  if (productsError) throw productsError;

  const items = buildAuditItems(products ?? [], normalizedLocation);
  const auditNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;

  const payload = {
    audit_number: auditNumber,
    location: normalizedLocation,
    status: 'IN_PROGRESS',
    items,
    total_variance_value: 0,
    created_by: createdBy || 'admin',
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('lmb_inventory_audits')
    .insert([payload])
    .select()
    .single();

  if (error) throw error;
  return data as InventoryAudit;
}

export async function saveAuditDraft(auditId: string, items: InventoryAuditItem[]): Promise<InventoryAudit> {
  if (!auditId) throw new Error('Audit ID requis.');

  const normalizedItems = (items ?? []).map((item) => {
    const variance = Number(item.counted_stock ?? 0) - Number(item.theoretical_stock ?? 0);
    const varianceValue = variance * Number(item.unit_price_xof ?? 0);

    return {
      ...item,
      variance,
      variance_value: varianceValue,
    };
  });

  const totalVarianceValue = normalizedItems.reduce((sum, item) => sum + Number(item.variance_value ?? 0), 0);

  const { data, error } = await supabase
    .from('lmb_inventory_audits')
    .update({
      items: normalizedItems,
      total_variance_value: totalVarianceValue,
    })
    .eq('id', auditId)
    .select()
    .single();

  if (error) throw error;
  return data as InventoryAudit;
}

export async function completeInventoryAudit(auditId: string): Promise<InventoryAudit> {
  if (!auditId) throw new Error('Audit ID requis.');

  const { data: audit, error: auditError } = await supabase
    .from('lmb_inventory_audits')
    .select('*')
    .eq('id', auditId)
    .single();

  if (auditError) throw auditError;
  if (!audit) throw new Error('Audit introuvable.');

  const location = normalizeLocation(audit.location);
  const stockColumn = locationToStockColumn[location];
  const items = (Array.isArray(audit.items) ? audit.items : []) as InventoryAuditItem[];

  const productIds = items.map((item) => item.product_id).filter(Boolean);
  const { data: products, error: productsError } = productIds.length
    ? await supabase.from('lmb_products').select('*').in('id', productIds)
    : { data: [], error: null };

  if (productsError) throw productsError;

  const productMap = new Map((products ?? []).map((product) => [product.id, product]));

  let totalVarianceValue = 0;

  for (const item of items) {
    const product = productMap.get(item.product_id);
    const currentCount = Number(item.counted_stock ?? 0);
    const variance = currentCount - Number(item.theoretical_stock ?? 0);
    const unitPrice = Number(product?.standard_retail_price_xof ?? product?.floor_price_xof ?? item.unit_price_xof ?? 0);
    const varianceValue = variance * unitPrice;
    totalVarianceValue += varianceValue;

    if (product) {
      await supabase
        .from('lmb_products')
        .update({ [stockColumn]: currentCount })
        .eq('id', product.id);
    }
  }

  const finalItems = items.map((item) => {
    const variance = Number(item.counted_stock ?? 0) - Number(item.theoretical_stock ?? 0);
    const unitPrice = Number(item.unit_price_xof ?? 0);
    return {
      ...item,
      variance,
      variance_value: variance * unitPrice,
    };
  });

  const { data: completed, error: completeError } = await supabase
    .from('lmb_inventory_audits')
    .update({
      items: finalItems,
      total_variance_value: totalVarianceValue,
      status: 'COMPLETED',
      completed_at: new Date().toISOString(),
    })
    .eq('id', auditId)
    .select()
    .single();

  if (completeError) throw completeError;
  return completed as InventoryAudit;
}
