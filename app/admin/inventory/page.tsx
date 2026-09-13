"use client";

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import TransferModal from '@/components/admin/TransferModal';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SecondaryButton from '@/components/ui/SecondaryButton';
import { Product } from '@/types';

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchProducts = async () => {
    const { data } = await supabase.from('lmb_products').select('*');
    setProducts((data ?? []) as Product[]);
  };

  useEffect(() => { fetchProducts(); }, []);

  const getThreshold = (p: Product) => {
    // allow optional product-level threshold, default to 5
    return (p as any).stock_threshold ?? 5;
  };

  return (
    <div className="min-h-screen bg-[#F9F9FB] px-6 py-8 text-[#111111]">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#C5A059]">Inventory</p>
          <h2 className="mt-1 text-3xl font-black text-[#111111]">Stocks multi-boutiques</h2>
        </div>
        <div className="flex items-center gap-2">
          <PrimaryButton onClick={() => setIsModalOpen(true)}>Nouveau transfert</PrimaryButton>
          <SecondaryButton href="/admin/transfers">Voir les Transferts</SecondaryButton>
        </div>
      </div>

      <div className="overflow-auto rounded-2xl border border-[#D4AF37]/20 bg-[#111111] p-4 shadow-luxury">
        <table className="w-full table-auto text-sm">
          <thead>
            <tr className="text-left text-[#D7D7D7]">
              <th>SKU / Produit</th>
              <th>Dakar</th>
              <th>Abidjan</th>
              <th>Réserve</th>
              <th>Seuil d'alerte</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const threshold = getThreshold(p);
              const d = Number((p as any).stock_dakar ?? 0);
              const a = Number((p as any).stock_abidjan ?? 0);
              const r = Number((p as any).stock_reserve ?? 0);
              const badge = (val: number) => {
                if (val <= threshold) return <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs font-bold text-rose-300">{val}</span>;
                if (val <= threshold * 2) return <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-300">{val}</span>;
                return <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-300">{val}</span>;
              };

              return (
                <tr key={p.id} className="border-t border-[#D4AF37]/10 text-[#F9F9FB]">
                  <td className="py-3">
                    <div className="font-semibold text-white">{p.name}</div>
                    <div className="text-xs text-[#D7D7D7]">{p.sku}</div>
                  </td>
                  <td>{badge(d)}</td>
                  <td>{badge(a)}</td>
                  <td>{badge(r)}</td>
                  <td>{threshold}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <TransferModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); fetchProducts(); }} products={products} />
    </div>
  );
}
