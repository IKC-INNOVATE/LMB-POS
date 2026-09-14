"use client";

import React, { useEffect, useState } from 'react';
import { listTransfers, confirmTransfer, TransferGroup } from '@/lib/services/inventory';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SecondaryButton from '@/components/ui/SecondaryButton';
import LoadingState from '@/components/ui/LoadingState';

export default function TransfersPage() {
  const [groups, setGroups] = useState<TransferGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pendingConfirmRef, setPendingConfirmRef] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetch = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listTransfers(200);
      setGroups(data);
    } catch (err) {
      console.error('fetch transfers', err);
      setLoadError(String(err instanceof Error ? err.message : err));
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  const handleConfirm = async (refNumber: string) => {
    if (!refNumber) return;
    setPendingConfirmRef(null);
    setConfirming(refNumber);
    try {
      const res = await confirmTransfer(refNumber);
      await fetch();
      alert(`Colis ${refNumber} confirmé : ${res.lines} mouvement(s) de stock appliqué(s).`);
    } catch (err) {
      alert(String(err instanceof Error ? err.message : err));
    } finally {
      setConfirming(null);
    }
  };

  const statusBadge = (s?: string) => {
    switch (s) {
      case 'PENDING':
        return <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-300">EN ATTENTE</span>;
      case 'CONFIRMED':
        return <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-300">CONFIRMÉ</span>;
      case 'CANCELLED':
        return <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs font-bold text-rose-300">ANNULÉ</span>;
      case 'MIXED':
        return <span className="rounded-full border border-orange-500/40 bg-orange-500/10 px-2 py-1 text-xs font-bold text-orange-300">INCOHÉRENT</span>;
      default:
        return <span className="rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-2 py-1 text-xs font-bold text-[#F5E3B3]">{s}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-[#F9F9FB] px-6 py-8 text-[#111111]">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#C5A059]">Transfers</p>
          <h2 className="mt-1 text-3xl font-black text-[#111111]">Transferts inter-boutiques</h2>
        </div>
        <SecondaryButton href="/admin/inventory">← Retour Inventaire</SecondaryButton>
      </div>

      <div className="space-y-4 rounded-2xl border border-[#D4AF37]/20 bg-[#111111] p-4 shadow-luxury">
        {loadError ? (
          <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-300">
            Impossible de charger les transferts : {loadError}
          </p>
        ) : loading ? (
          <LoadingState />
        ) : groups.length === 0 ? (
          <p className="text-[#D7D7D7]">Aucun transfert.</p>
        ) : (
          groups.map((g) => {
            const totalQty = g.lines.reduce((s, l) => s + l.quantity, 0);
            return (
              <div key={g.transfer_number} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-bold text-[#F5E3B3]">{g.transfer_number}</p>
                    <p className="text-xs text-[#D7D7D7]">
                      {g.from_city} → {g.to_city}
                      {' · '}
                      {g.lines.length} produit(s) · {totalQty} flacon(s)
                      {g.created_at ? ` · ${new Date(g.created_at).toLocaleString('fr-FR')}` : ''}
                      {g.carrier ? ` · ${g.carrier}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {statusBadge(g.status)}
                    {g.status === 'PENDING' && pendingConfirmRef === g.transfer_number && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-amber-300">Confirmer toutes les lignes ?</span>
                        <PrimaryButton
                          onClick={() => handleConfirm(g.transfer_number)}
                          disabled={confirming === g.transfer_number}
                          className="rounded-lg px-3 py-1 text-xs"
                        >
                          {confirming === g.transfer_number ? 'Confirmation...' : 'Confirmer'}
                        </PrimaryButton>
                        <button
                          type="button"
                          onClick={() => setPendingConfirmRef(null)}
                          className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-slate-500"
                        >
                          Annuler
                        </button>
                      </div>
                    )}
                    {g.status === 'PENDING' && pendingConfirmRef !== g.transfer_number && (
                      <PrimaryButton
                        onClick={() => setPendingConfirmRef(g.transfer_number)}
                        disabled={confirming === g.transfer_number}
                        className="rounded-lg px-3 py-1 text-xs"
                      >
                        Confirmer Réception
                      </PrimaryButton>
                    )}
                  </div>
                </div>

                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase text-[#9aa0a6]">
                      <th className="py-1">SKU</th>
                      <th className="py-1">Produit</th>
                      <th className="py-1 text-right">Quantité</th>
                      <th className="py-1 text-right">Statut ligne</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.lines.map((l, i) => (
                      <tr key={l.id ?? i} className="border-t border-slate-800/60 text-[#E4E4E4]">
                        <td className="py-1 font-mono text-cyan-300">{l.product_sku}</td>
                        <td className="py-1">{l.product_name}</td>
                        <td className="py-1 text-right">{l.quantity}</td>
                        <td className="py-1 text-right">{l.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
