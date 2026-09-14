"use client";

import React, { useState } from 'react';
import PrimaryButton from '@/components/ui/PrimaryButton';
import { openRegister } from '@/lib/services/register';

export default function OpenRegisterButton({
  storeCode,
  cashierName,
  onSuccess,
}: {
  storeCode?: string;
  cashierName?: string;
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('0');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      if (!storeCode) {
        throw new Error(
          "Aucune boutique déterminée pour votre compte. Sélectionnez d'abord une boutique avant d'ouvrir la caisse."
        );
      }
      const amt = Number(amount || 0);
      if (Number.isNaN(amt) || amt < 0) {
        throw new Error('Fond de caisse initial invalide.');
      }
      // openRegister vérifie lui-même qu'aucune caisse n'est déjà ouverte pour
      // cette boutique et lève une erreur explicite sinon (pas de faux succès).
      await openRegister(storeCode, amt, cashierName || 'Inconnu');
      alert('Caisse ouverte');
      setOpen(false);
      setAmount('0');
      try {
        onSuccess?.();
      } catch (e) {
        console.warn('onSuccess callback failed', e);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PrimaryButton onClick={() => setOpen(true)} className="px-3.5 py-2 text-xs">
        Ouvrir la caisse
      </PrimaryButton>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111111]/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-[#D4AF37]/30 bg-[#F9F9FB] p-5 shadow-luxury">
            <h3 className="text-lg font-bold text-[#111111]">Ouverture de caisse</h3>
            <div className="mt-4 space-y-3 text-sm text-[#111111]">
              <div>
                <label className="mb-1 block font-medium">Boutique</label>
                <div className="w-full rounded-xl border border-[#D4AF37]/25 bg-[#EFEFEF] px-3 py-2 font-mono text-[#111111]">
                  {storeCode || '— aucune boutique —'}
                </div>
              </div>
              <div>
                <label className="mb-1 block font-medium">Fond de caisse initial (FCFA)</label>
                <input
                  type="number"
                  value={amount}
                  onFocus={(e) => (e.target as HTMLInputElement).select()}
                  onChange={(e) => setAmount(e.target.value)}
                  style={{ colorScheme: 'light', backgroundColor: '#ffffff', color: '#111111' }}
                  className="w-full rounded-xl border border-[#D4AF37]/25 px-3 py-2 outline-none focus:border-[#D4AF37]"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <PrimaryButton onClick={submit} disabled={loading || !storeCode} className="px-4 py-2 text-sm">
                {loading ? 'Ouverture...' : 'Ouvrir la caisse'}
              </PrimaryButton>
              <button
                onClick={() => {
                  setOpen(false);
                  setAmount('0');
                }}
                className="rounded-xl border border-[#111111]/15 bg-white px-4 py-2 text-sm font-medium text-[#111111]"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
