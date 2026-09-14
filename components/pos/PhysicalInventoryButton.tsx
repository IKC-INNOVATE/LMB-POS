"use client";

import React, { useMemo, useState } from 'react';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SecondaryButton from '@/components/ui/SecondaryButton';
import { submitPhysicalInventoryReport } from '@/lib/services/audits';
import type { StoreCity } from '@/lib/services/products';

interface CatalogProductLike {
  id: string;
  sku: string;
  name: string;
  stock: number;
}

const locationLabels: Record<StoreCity, string> = {
  DAKAR: 'SN Sénégal (Dakar)',
  ABIDJAN: "CI Côte d'Ivoire (Abidjan)",
};

export default function PhysicalInventoryButton({
  cashierName,
  storeCity,
  products,
  onSuccess,
}: {
  cashierName?: string;
  storeCity: StoreCity | null;
  products: CatalogProductLike[];
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState('');

  const openModal = () => {
    // Pré-remplit le compte réel avec le stock théorique : la caissière n'a
    // plus qu'à corriger les produits qui diffèrent réellement.
    const initial: Record<string, string> = {};
    products.forEach((p) => {
      initial[p.id] = String(p.stock ?? 0);
    });
    setCounts(initial);
    setFilter('');
    setOpen(true);
  };

  const filteredProducts = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
    );
  }, [filter, products]);

  const varianceCount = useMemo(
    () =>
      products.filter((p) => {
        const counted = Number(counts[p.id] ?? p.stock ?? 0);
        return counted !== Number(p.stock ?? 0);
      }).length,
    [products, counts],
  );

  const handleSubmit = async () => {
    if (!storeCity) {
      alert('Boutique introuvable pour ce compte — impossible de transmettre l’inventaire.');
      return;
    }
    setSubmitting(true);
    try {
      const items = products.map((p) => {
        const physical = Number(counts[p.id] ?? p.stock ?? 0) || 0;
        const theoretical = Number(p.stock ?? 0);
        return {
          sku: p.sku,
          name: p.name,
          theoretical,
          physical,
          discrepancy: physical - theoretical,
        };
      });

      await submitPhysicalInventoryReport({
        locationCountry: locationLabels[storeCity],
        cashierName: cashierName || 'Caissière',
        items,
      });

      alert(
        'Inventaire transmis à la Direction. Rappel : le stock officiel n’est pas modifié automatiquement — la Direction validera si besoin via son propre outil.',
      );
      setOpen(false);
      onSuccess?.();
    } catch (err) {
      console.error('submitPhysicalInventoryReport failed', err);
      alert(String(err instanceof Error ? err.message : err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <SecondaryButton onClick={openModal} className="px-3.5 py-2 text-xs">
        Inventaire physique
      </SecondaryButton>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111111]/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-[#D4AF37]/30 bg-[#F9F9FB] p-5 shadow-luxury">
            <h3 className="text-lg font-bold text-[#111111]">Inventaire physique — {storeCity ? locationLabels[storeCity] : '—'}</h3>
            <p className="mt-1 text-xs text-[#111111]/70">
              Corrigez uniquement les produits dont le compte réel diffère du stock théorique. Ce
              rapport est transmis à la Direction pour information — il ne modifie pas le stock
              officiel.
            </p>

            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrer par nom ou SKU..."
              style={{ colorScheme: 'light', backgroundColor: '#ffffff', color: '#111111' }}
              className="mt-3 w-full rounded-xl border border-[#D4AF37]/25 px-3 py-2 text-sm outline-none focus:border-[#D4AF37]"
            />

            <div className="mt-3 flex-1 overflow-y-auto rounded-xl border border-[#D4AF37]/15">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-[#F3F4F6]">
                  <tr className="text-[10px] uppercase text-[#111111]/60">
                    <th className="px-3 py-2">Produit</th>
                    <th className="px-3 py-2 text-center">Théorique</th>
                    <th className="px-3 py-2 text-center">Compté</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D4AF37]/10">
                  {filteredProducts.map((p) => {
                    const counted = Number(counts[p.id] ?? p.stock ?? 0);
                    const hasVariance = counted !== Number(p.stock ?? 0);
                    return (
                      <tr key={p.id} className={hasVariance ? 'bg-amber-50' : undefined}>
                        <td className="px-3 py-2">
                          <div className="font-semibold text-[#111111]">{p.name}</div>
                          <div className="text-[10px] text-[#111111]/50">{p.sku}</div>
                        </td>
                        <td className="px-3 py-2 text-center text-[#111111]/70">{p.stock ?? 0}</td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="number"
                            min={0}
                            value={counts[p.id] ?? ''}
                            onChange={(e) =>
                              setCounts((prev) => ({ ...prev, [p.id]: e.target.value }))
                            }
                            // Couleurs forcées en style inline (pas seulement en classes
                            // Tailwind) : un champ number peut sinon hériter du rendu
                            // sombre natif du navigateur (color-scheme) en mode sombre
                            // de l'application, ce qui rendait le chiffre saisi invisible
                            // (texte foncé sur fond resté sombre malgré bg-white).
                            style={{ colorScheme: 'light', backgroundColor: '#ffffff', color: '#111111' }}
                            className="w-20 rounded-lg border border-[#D4AF37]/25 px-2 py-1 text-center outline-none focus:border-[#D4AF37]"
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-[#111111]/50">
                        Aucun produit ne correspond à ce filtre.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-[#111111]/60">
                {varianceCount === 0
                  ? 'Aucun écart pour le moment'
                  : `${varianceCount} produit(s) avec un écart`}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-[#111111]/15 bg-white px-4 py-2 text-sm font-medium text-[#111111]"
                >
                  Annuler
                </button>
                <PrimaryButton onClick={handleSubmit} disabled={submitting} className="px-4 py-2 text-sm">
                  {submitting ? 'Transmission...' : 'Transmettre à la Direction'}
                </PrimaryButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
