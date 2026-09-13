"use client";

import React, { useState } from 'react';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SecondaryButton from '@/components/ui/SecondaryButton';
import { closeRegister, getOpenRegister } from '@/lib/services/register';

export default function CloseRegisterButton({
  storeCode,
  onSuccess,
  onClose,
}: {
  storeCode?: string;
  onSuccess?: () => void;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [countedCash, setCountedCash] = useState('0');
  const [notes, setNotes] = useState('');
  const [report, setReport] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const calculatePreview = async () => {
    // Fetch open register to show initial_cash and simple preview
    const reg = await getOpenRegister(storeCode);
    return reg;
  };

  const submit = async () => {
    setLoading(true);
    try {
      const counted = Number(countedCash || 0);
      const res = await closeRegister(counted, notes, storeCode);
      setReport(res);
      try {
        onSuccess?.();
      } catch (e) {
        console.warn('onSuccess callback failed', e);
      }
    } catch (err: any) {
      alert(String(err?.message ?? err));
    } finally {
      setLoading(false);
    }
  };

  const printReport = () => {
    if (!report) return;
    const html = `
      <html><head><title>Rapport de clôture Z</title></head><body>
      <h2>Rapport de clôture Z</h2>
      <p>Magasin: ${report.register?.store_code ?? ''}</p>
      <p>Caisse ouverte par: ${report.register?.cashier_name ?? ''}</p>
      <p>Ouverture: ${report.register?.opened_at ?? ''}</p>
      <p>Fonds initial: ${report.register?.initial_cash ?? 0}</p>
      <p>Total ventes espèces: ${report.total_cash_sales ?? 0}</p>
      <p>Total dépenses: ${report.total_expenses ?? 0}</p>
      <p>Espèces théoriques: ${report.theoretical_cash ?? 0}</p>
      <p>Espèces comptées: ${report.register?.counted_cash ?? ''}</p>
      <p>Écart: ${report.variance ?? 0}</p>
      <p>Notes: ${report.register?.notes ?? ''}</p>
      </body></html>
    `;
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
      w.print();
    }
  };

  return (
    <div>
      <SecondaryButton
        onClick={async () => {
          try {
            await calculatePreview();
          } catch (err: any) {
            // Prévisualisation indisponible (réseau) : on ouvre quand même la
            // modale, la clôture elle-même signalera toute erreur réelle.
            console.warn('calculatePreview failed', err);
          }
          setOpen(true);
        }}
        className="px-3.5 py-2 text-xs"
      >
        Clôture de caisse
      </SecondaryButton>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111111]/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[#D4AF37]/30 bg-[#F9F9FB] p-5 shadow-luxury">
            <h3 className="text-lg font-bold text-[#111111]">Clôture de caisse (Billetage)</h3>
            <div className="mt-4 space-y-3 text-sm text-[#111111]">
              <div>
                <label className="mb-1 block font-medium">Espèces comptées</label>
                <input type="number" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} className="w-full rounded-xl border border-[#D4AF37]/25 bg-white px-3 py-2 text-[#111111] outline-none focus:border-[#D4AF37]" />
              </div>
              <div>
                <label className="mb-1 block font-medium">Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[90px] w-full rounded-xl border border-[#D4AF37]/25 bg-white px-3 py-2 text-[#111111] outline-none focus:border-[#D4AF37]" />
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <PrimaryButton onClick={submit} disabled={loading} className="px-4 py-2 text-sm">
                {loading ? 'Clôture...' : 'Clôturer'}
              </PrimaryButton>
              <button
                onClick={() => {
                  setOpen(false);
                  setReport(null);
                  try {
                    onClose?.();
                  } catch (e) {
                    console.warn('onClose callback failed', e);
                  }
                }}
                className="rounded-xl border border-[#111111]/15 bg-white px-4 py-2 text-sm font-medium text-[#111111]"
              >
                Fermer
              </button>
              {report && (
                <>
                  <div className="mt-3 w-full rounded-xl border border-[#D4AF37]/20 bg-[#F3F4F6] p-3 text-xs text-[#111111]">
                    <p>Espèces théoriques: {report.theoretical_cash}</p>
                    <p>Écart: {report.variance > 0 ? `Surplus +${report.variance}` : `Manque ${report.variance}`}</p>
                  </div>
                  <SecondaryButton onClick={printReport} className="rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-4 py-2 text-xs font-bold text-[#111111]">Imprimer rapport Z</SecondaryButton>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
