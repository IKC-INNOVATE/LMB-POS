"use client";

import React, { useState } from 'react';
import { Product } from '@/types';
import { createTransfer } from '@/lib/services/inventory';
import Select from '@/components/ui/Select';
import Input from '@/components/ui/Input';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SecondaryButton from '@/components/ui/SecondaryButton';

export default function TransferModal({ isOpen, onClose, products }: { isOpen: boolean; onClose: () => void; products: Product[] }) {
  const [from, setFrom] = useState<'DAKAR' | 'ABIDJAN' | 'RESERVE'>('DAKAR');
  const [to, setTo] = useState<'DAKAR' | 'ABIDJAN' | 'RESERVE'>('ABIDJAN');
  const [items, setItems] = useState<Array<{ productId: string; qty: string }>>([
    { productId: products?.[0]?.id ?? '', qty: '1' },
  ]);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const updateItem = (index: number, field: 'productId' | 'qty', value: string) => {
    const copy = [...items];
    (copy[index] as any)[field] = value;
    setItems(copy);
  };

  const addRow = () => setItems((s) => [...s, { productId: products?.[0]?.id ?? '', qty: '1' }]);
  const removeRow = (i: number) => setItems((s) => s.filter((_, idx) => idx !== i));

  const submit = async () => {
    setLoading(true);
    try {
      const payload = items.map((it) => ({ productId: it.productId, qty: Number(it.qty || 0) }));
      await createTransfer(from, to, payload, { createdBy: 'admin-ui' });
      alert('Transfert créé');
      onClose();
    } catch (err: any) {
      alert(String(err?.message ?? err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-slate-900 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Nouveau transfert</h3>
          <SecondaryButton onClick={onClose} className="text-sm">Fermer</SecondaryButton>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs text-slate-400">Source</label>
            <Select value={from} onChange={(e) => setFrom(e.target.value as any)}>
              <option value="DAKAR">DAKAR</option>
              <option value="ABIDJAN">ABIDJAN</option>
              <option value="RESERVE">RÉSERVE</option>
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Destination</label>
            <Select value={to} onChange={(e) => setTo(e.target.value as any)}>
              <option value="DAKAR">DAKAR</option>
              <option value="ABIDJAN">ABIDJAN</option>
              <option value="RESERVE">RÉSERVE</option>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          {items.map((it, idx) => (
            <div key={idx} className="flex gap-2">
              <Select value={it.productId} onChange={(e) => updateItem(idx, 'productId', e.target.value)} className="flex-1">
                {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
              </Select>
              <Input type="number" value={it.qty} onChange={(e) => updateItem(idx, 'qty', e.target.value)} className="w-28" />
              <SecondaryButton onClick={() => removeRow(idx)} className="rounded-lg bg-rose-600 px-3 py-2 text-white">Suppr</SecondaryButton>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <PrimaryButton onClick={addRow} className="px-3 py-2">Ajouter produit</PrimaryButton>
          <PrimaryButton onClick={submit} disabled={loading} className="px-3 py-2">Créer transfert</PrimaryButton>
        </div>
      </div>
    </div>
  );
}
