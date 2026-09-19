'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ClipboardCheck, Save, PackageCheck } from 'lucide-react';
import {
  completeInventoryAudit,
  listInventoryAudits,
  saveAuditDraft,
  startInventoryAudit,
  type InventoryAudit,
  type InventoryLocation,
} from '@/lib/services/audits';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SecondaryButton from '@/components/ui/SecondaryButton';
import LoadingState from '@/components/ui/LoadingState';

const locations: InventoryLocation[] = ['dakar', 'abidjan', 'reserve'];

const formatCurrency = (value: number) => new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'XOF',
  maximumFractionDigits: 0,
}).format(value || 0);

export default function InventoryAuditPage() {
  const [audits, setAudits] = useState<InventoryAudit[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<InventoryLocation>('dakar');
  const [currentAudit, setCurrentAudit] = useState<InventoryAudit | null>(null);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAudits = async () => {
    setLoading(true);
    try {
      const items = await listInventoryAudits();
      setAudits(items);
      if (!currentAudit && items.length > 0) {
        setCurrentAudit(items[0]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudits();
  }, []);

  const auditItems = currentAudit?.items ?? [];

  const totalVarianceValue = useMemo(
    () => auditItems.reduce((sum, item) => sum + Number(item.variance_value ?? 0), 0),
    [auditItems],
  );

  const handleStartAudit = async () => {
    try {
      const created = await startInventoryAudit(selectedLocation, 'admin');
      setCurrentAudit(created);
      setAudits((prev) => [created, ...prev]);
    } catch (error) {
      console.error('startInventoryAudit', error);
      alert('Impossible de démarrer l’inventaire.');
    }
  };

  const updateCount = (productId: string, value: number) => {
    if (!currentAudit) return;

    const nextItems = (currentAudit.items ?? []).map((item) => {
      if (item.product_id !== productId) return item;

      const countedStock = Number(value) || 0;
      const variance = countedStock - Number(item.theoretical_stock ?? 0);
      const varianceValue = variance * Number(item.unit_price_xof ?? 0);

      return {
        ...item,
        counted_stock: countedStock,
        variance,
        variance_value: varianceValue,
      };
    });

    setCurrentAudit({ ...currentAudit, items: nextItems });
  };

  const handleSaveDraft = async () => {
    if (!currentAudit?.id) return;
    setSaving(true);
    try {
      const saved = await saveAuditDraft(currentAudit.id, currentAudit.items ?? []);
      setCurrentAudit(saved);
      setAudits((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
    } catch (error) {
      console.error('saveAuditDraft', error);
      alert('Impossible de sauvegarder le brouillon d’inventaire.');
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async () => {
    if (!currentAudit?.id) return;
    setValidating(true);
    try {
      const completed = await completeInventoryAudit(currentAudit.id);
      setCurrentAudit(completed);
      setAudits((prev) => prev.map((item) => (item.id === completed.id ? completed : item)));
      await fetchAudits();
    } catch (error) {
      console.error('completeInventoryAudit', error);
      alert('Impossible de valider et ajuster les stocks.');
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9F9FB] text-[#111111] lmb-audits">
      <header className="sticky top-0 z-30 border-b border-[#D4AF37]/30 bg-[#111111]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="inline-flex items-center gap-2 text-xs font-semibold text-[#F5E3B3] hover:text-[#D4AF37]">
              <ArrowLeft className="h-4 w-4" />
              Retour admin
            </Link>
            <div className="h-5 w-px bg-[#D4AF37]/40" />
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-[#D4AF37]">Inventaires</p>
              <h1 className="text-xl font-bold text-white">Contrôle de stock & écarts</h1>
            </div>
          </div>

          <Link href="/admin" className="rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#C5A059] px-3 py-2 text-xs font-bold text-[#111111] shadow-md shadow-[#D4AF37]/20">
            Tableau de bord
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <div className="rounded-3xl border border-[#D4AF37]/20 bg-[#111111] p-5 shadow-luxury">
          <div className="mb-4 flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-[#D4AF37]" />
            <h2 className="text-lg font-bold text-white">Démarrer un inventaire</h2>
          </div>

          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="w-full md:max-w-xs">
              <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-slate-400">Magasin</label>
              <Select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value as InventoryLocation)}
              >
                {locations.map((location) => (
                  <option key={location} value={location}>
                    {location === 'dakar' ? 'Dakar' : location === 'abidjan' ? 'Abidjan' : 'Réserve'}
                  </option>
                ))}
              </Select>
            </div>

            <PrimaryButton onClick={handleStartAudit}>Nouveau comptage</PrimaryButton>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl">
          {loading ? (
            <LoadingState label="Chargement des audits…" />
          ) : !currentAudit ? (
            <div className="py-10 text-center text-sm text-slate-400">Aucun inventaire en cours.</div>
          ) : (
            <>
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300">Audit actif</p>
                  <h3 className="text-xl font-bold text-white">{currentAudit.audit_number}</h3>
                </div>

                <div className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
                  <span className="font-semibold text-cyan-300">Site:</span> {currentAudit.location}
                  <span className="mx-2 text-slate-500">|</span>
                  <span className="font-semibold text-amber-300">Statut:</span> {currentAudit.status}
                </div>
              </div>

              <div className="mb-5 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Variance totale</p>
                  <p className="mt-2 text-2xl font-bold text-amber-300">{formatCurrency(totalVarianceValue)}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Produits</p>
                  <p className="mt-2 text-2xl font-bold text-white">{auditItems.length}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Créé par</p>
                  <p className="mt-2 text-lg font-semibold text-cyan-300">{currentAudit.created_by ?? 'admin'}</p>
                </div>
              </div>

              <div className="mb-5 flex flex-wrap gap-3">
                <SecondaryButton onClick={handleSaveDraft} disabled={saving} className="inline-flex items-center gap-2">
                  <Save className="h-4 w-4" />
                  {saving ? 'Sauvegarde…' : 'Sauvegarder le brouillon'}
                </SecondaryButton>

                <PrimaryButton onClick={handleValidate} disabled={validating} className="inline-flex items-center gap-2">
                  <PackageCheck className="h-4 w-4" />
                  {validating ? 'Validation…' : 'Valider et Ajuster les Stocks'}
                </PrimaryButton>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                      <th className="py-3 px-3">Produit</th>
                      <th className="py-3 px-3">SKU</th>
                      <th className="py-3 px-3">Théorique</th>
                      <th className="py-3 px-3">Compté</th>
                      <th className="py-3 px-3">Écart</th>
                      <th className="py-3 px-3">Valeur</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {auditItems.map((item) => (
                      <tr key={item.product_id} className="hover:bg-slate-800/40">
                        <td className="py-3 px-3 font-semibold text-white">{item.name}</td>
                        <td className="py-3 px-3 text-slate-300">{item.sku}</td>
                        <td className="py-3 px-3 text-slate-300">{item.theoretical_stock}</td>
                        <td className="py-3 px-3">
                          <Input
                            type="number"
                            value={Number(item.counted_stock ?? 0)}
                            onChange={(e) => updateCount(item.product_id, Number(e.target.value || 0))}
                            onFocus={(e) => e.target.select()}
                            className="w-24 px-2 py-1 text-center"
                          />
                        </td>
                        <td className={`py-3 px-3 font-bold ${Number(item.variance ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {Number(item.variance ?? 0)}
                        </td>
                        <td className="py-3 px-3 text-slate-200">{formatCurrency(Number(item.variance_value ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {!loading && audits.length > 0 && (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl">
            <div className="mb-4 flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-amber-400" />
              <h2 className="text-lg font-bold text-white">Historique des audits</h2>
            </div>

            <div className="space-y-3">
              {audits.map((audit) => (
                <button
                  key={audit.id}
                  type="button"
                  onClick={() => setCurrentAudit(audit)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${currentAudit?.id === audit.id ? 'border-cyan-500 bg-cyan-500/5' : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'}`}
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-bold text-white">{audit.audit_number}</p>
                      <p className="text-xs text-slate-400">{audit.location} • {audit.status}</p>
                    </div>
                    <div className="text-sm text-slate-200">
                      {formatCurrency(Number(audit.total_variance_value ?? 0))}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
