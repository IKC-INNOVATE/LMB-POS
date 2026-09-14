export type StoreCity = 'DAKAR' | 'ABIDJAN';

export type PaymentMethod =
  | 'ESPECES'
  | 'WAVE_SN'
  | 'WAVE_CI'
  | 'ORANGE_MONEY_SN'
  | 'ORANGE_MONEY_CI'
  | 'MTN_MOMO_CI'
  | 'MOOV_MONEY_CI'
  | 'CARTE_BANCAIRE';

export type SkinType =
  | 'SECHE'
  | 'GRASSE'
  | 'MIXTE'
  | 'SENSIBLE_ATOPIQUE'
  | 'HYPERPIGMENTATION_TERNE'
  | 'NORMALE';

export interface Product {
  id: string;
  sku: string;
  barcode?: string;
  name: string;
  category_name?: string;
  standard_retail_price_xof: number;
  floor_price_xof: number;
  /**
   * Coût d'achat réel unitaire (FCFA). Colonne `cost_price_xof` de lmb_products.
   * 0 ou absent = non renseigné -> la marge est estimée (voir lib/services/finance.ts).
   */
  cost_price_xof?: number;
  stock_dakar: number;
  stock_abidjan: number;
  /** URL publique de la photo (bucket Storage "product-photos"). Null/absent = pas de photo. */
  photo_url?: string | null;
}

export interface CartItem {
  product: Product;
  quantity: number;
  appliedUnitPriceXof: number;
  isUnderFloorPrice: boolean;
}

export interface Customer {
  id?: string;
  full_name?: string;
  phone?: string;
  email?: string | null;
  country?: string;
  skin_type?: SkinType;
  loyalty_points?: number;
  vip_status?: 'STANDARD' | 'VIP' | 'VIP_PREMIUM';
  total_spent_xof?: number;
  total_orders?: number;
  last_purchase_at?: string | null;
  // `notes` (jsonb) : les notes esthétiques libres vivent sous la clé `beauty`.
  notes?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export interface CustomerOrder {
  id?: string;
  customer_id?: string | null;
  sale_id?: string | null;
  store_code?: string;
  order_total_xof?: number;
  discount_applied_xof?: number;
  points_earned?: number;
  points_redeemed?: number;
  payment_method?: string;
  created_at?: string;
  metadata?: Record<string, unknown> | null;
}

export interface LoyaltyEvent {
  id?: string;
  customer_id?: string | null;
  event_type?: 'PURCHASE' | 'REDEMPTION' | 'ADJUSTMENT' | 'VIP_PROMOTION' | 'MANUAL_UPDATE';
  points_delta?: number;
  reason?: string | null;
  related_order_id?: string | null;
  created_at?: string;
  metadata?: Record<string, unknown> | null;
}

export interface ReceiptItem {
  id?: string;
  product_id?: string;
  product?: Partial<Product>;
  name?: string;
  sku?: string;
  quantity: number;
  unit_price_xof: number;
  total_price_xof: number;
}

export interface ReceiptData {
  receiptNumber: string;
  createdAt: string;
  cashierName: string;
  storeName: string;
  customer?: Partial<Customer>;
  customerName?: string;
  customerPhone?: string;
  items: ReceiptItem[];
  subtotalXof: number;
  discountXof: number;
  totalXof: number;
  paymentMethod: string;
  paymentReference?: string;
  paymentDetails?: Record<string, unknown> | null;
  notes?: string;
}

export interface SaleReceipt {
  id?: string;
  receiptNumber?: string;
  storeName?: string;
  cashierName?: string;
  customerName?: string;
  customerPhone?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_vip?: string;
  customerVip?: string;
  customer_points?: number;
  points_earned?: number;
  customer_id?: string | null;
  items?: CartItem[];
  items_json?: Record<string, unknown>[];
  totalAmountXof?: number;
  total_amount_xof?: number | string;
  totalDiscountXof?: number;
  paymentMethod?: PaymentMethod;
  payment_method?: string;
  paymentReference?: string;
  createdAt?: string;
  created_at?: string;
  subtotal_xof?: number;
  discount_xof?: number;
  payment_reference?: string;
  store_code?: string;
}