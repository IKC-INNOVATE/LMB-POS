"use client";

import React, { useState } from 'react';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SecondaryButton from '@/components/ui/SecondaryButton';
import { addCashExpense } from '@/lib/services/register';

export default function CashExpenseButton({
  cashierName,
  storeCode,
  onSuccess,
  onClose,
}: {
  cashierName?: string;
  storeCode?: string;
  onSuccess?: () => void;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('0');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const amt = Number(amount || 0);
      if (!amt || amt <= 0) throw new Error('Montant invalide');
      await addCashExpense(amt, reason || 'Dépense caisse', cashierName, storeCode);
      alert('Dépense enregistrée');
      setOpen(false);
      setAmount('0');
      setReason('');
      try {
        onSuccess?.();
      } catch (e) {
        console.warn('onSuccess callback failed', e);
      }
    } catch (err) {
      alert(String(err instanceof Error ? err.message : err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <SecondaryButton onClick={() => setOpen(true)} className="px-3.5 py-2 text-xs">
        Sortie de caisse
      </SecondaryButton>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111111]/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[#D4AF37]/30 bg-[#F9F9FB] p-5 shadow-luxury">
            <h3 className="text-lg font-bold text-[#111111]">Sortie de caisse</h3>
            <div className="mt-4 space-y-3 text-sm text-[#111111]">
              <div>
                <label htmlFor="cash-expense-amount" className="mb-1 block font-medium">Montant</label>
                <input id="cash-expense-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-xl border border-[#D4AF37]/25 bg-white px-3 py-2 text-[#111111] outline-none focus:border-[#D4AF37]" />
              </div>
              <div>
                <label htmlFor="cash-expense-reason" className="mb-1 block font-medium">Motif</label>
                <input id="cash-expense-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-xl border border-[#D4AF37]/25 bg-white px-3 py-2 text-[#111111] outline-none focus:border-[#D4AF37]" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <PrimaryButton onClick={submit} disabled={loading} className="px-4 py-2 text-sm">
                {loading ? 'Enregistrement...' : 'Enregistrer'}
              </PrimaryButton>
              <button
                onClick={() => {
                  setOpen(false);
                  try {
                    onClose?.();
                  } catch (e) {
                    console.warn('onClose callback failed', e);
                  }
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
