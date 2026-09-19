'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Plus, Receipt, Repeat, Trash2, Wallet } from 'lucide-react';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SecondaryButton from '@/components/ui/SecondaryButton';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import LoadingState from '@/components/ui/LoadingState';
import { getCurrentStaff, type CurrentStaff } from '@/lib/services/auth';
import {
  listCharges,
  createCharge,
  deleteCharge,
  listChargeTemplates,
  createChargeTemplate,
  updateChargeTemplate,
  deleteChargeTemplate,
  ensureRecurringChargesGeneratedForMonth,
  CHARGE_CATEGORY_LABELS,
  CHARGE_PAYMENT_METHOD_LABELS,
  type Charge,
  type ChargeTemplate,
  type ChargeCategory,
  type ChargeStore,
  type ChargePaymentMethod,
} from '@/lib/services/charges';

// Chantier "Charges d'exploitation" (voir la feuille de route
// claude/roadmap-module-charges-exploitation-2026-09-19.md, projet LMB).
// Phase 2 : saisie manuelle (charges ponctuelles). Phase 3 : charges
// récurrentes (modèles + génération automatique "paresseuse" — dès
// l'ouverture de cet écran pour un mois donné, voir
// ensureRecurringChargesGeneratedForMonth dans lib/services/charges.ts).
//
// Accès : DIRECTION voit et gère les deux boutiques ; GERANT ne voit et ne
// saisit que celles de sa propre boutique (verrouillée, non modifiable dans
// les formulaires) — même principe que la Caisse et le Registre RH. Un
// CAISSIER n'atteint jamais cette page (liste blanche vide dans
// lib/services/auth.ts, CAISSIER_ALLOWED_ADMIN_PATHS). La RLS de
// lmb_charges / lmb_charge_templates applique la même règle côté base,
// indépendamment de l'UI.

type StoreFilter = ChargeStore | 'ALL';

const STORE_LABELS: Record<ChargeStore, string> = {
  DAKAR: 'Dakar',
  ABIDJAN: 'Abidjan',
};

const CATEGORY_OPTIONS = Object.entries(CHARGE_CATEGORY_LABELS) as Array<[ChargeCategory, string]>;
const PAYMENT_METHOD_OPTIONS = Object.entries(CHARGE_PAYMENT_METHOD_LABELS) as Array<[ChargePaymentMethod, string]>;

const formatMoney = (value: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

const currentMonthValue = () => new Date().toISOString().slice(0, 7); // "YYYY-MM"

const monthRange = (month: string) => {
  const [year, m] = month.split('-').map(Number);
  const startDate = `${month}-01`;
  const lastDay = new Date(year, m, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;
  return { startDate, endDate };
};

const todayValue = () => new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

const emptyForm = (defaultStore: ChargeStore | '') => ({
  store_code: defaultStore,
  category: 'LOYER' as ChargeCategory,
  amount_xof: '',
  charge_date: todayValue(),
  payment_method: '' as ChargePaymentMethod | '',
  note: '',
});

const emptyTemplateForm = (defaultStore: ChargeStore | '') => ({
  store_code: defaultStore,
  category: 'LOYER' as ChargeCategory,
  amount_xof: '',
  day_of_month: '5',
  payment_method: '' as ChargePaymentMethod | '',
  note: '',
});

export default function ChargesPage() {
  const [currentStaff, setCurrentStaff] = useState<CurrentStaff | null>(null);
  const [staffLoading, setStaffLoading] = useState(true);

  const [month, setMonth] = useState(currentMonthValue());
  const [storeFilter, setStoreFilter] = useState<StoreFilter>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<ChargeCategory | 'ALL'>('ALL');

  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isDirection = currentStaff?.staff.role === 'DIRECTION';
  const ownStore = (currentStaff?.staff.store_code as ChargeStore | null) ?? null;

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm(''));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [generatedCount, setGeneratedCount] = useState(0);

  const [templates, setTemplates] = useState<ChargeTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm(''));
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateFormError, setTemplateFormError] = useState<string | null>(null);
  const [templateActionId, setTemplateActionId] = useState<string | null>(null);
  const [deleteTemplateConfirmId, setDeleteTemplateConfirmId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setStaffLoading(true);
      try {
        const staff = await getCurrentStaff();
        setCurrentStaff(staff);
        // Un GERANT est verrouillé sur sa propre boutique, aussi bien pour le
        // filtre que pour le formulaire de saisie.
        if (staff && staff.staff.role !== 'DIRECTION' && staff.staff.store_code) {
          setStoreFilter(staff.staff.store_code as ChargeStore);
          setForm((f) => ({ ...f, store_code: staff.staff.store_code as ChargeStore }));
          setTemplateForm((f) => ({ ...f, store_code: staff.staff.store_code as ChargeStore }));
        }
      } catch (err) {
        console.error('getCurrentStaff (charges)', err);
      } finally {
        setStaffLoading(false);
      }
    })();
  }, []);

  const loadCharges = async () => {
    setLoading(true);
    setError(null);
    setGeneratedCount(0);
    try {
      const effectiveStore = storeFilter === 'ALL' ? null : storeFilter;

      // Génération "paresseuse" des charges récurrentes (Phase 3) : à chaque
      // ouverture de ce mois, on vérifie d'abord si les modèles actifs ont
      // déjà leur charge du mois, et on la crée sinon — avant de recharger
      // la liste, pour qu'elle apparaisse immédiatement.
      if (currentStaff) {
        setGenerating(true);
        try {
          const created = await ensureRecurringChargesGeneratedForMonth(month, effectiveStore, {
            name: currentStaff.staff.full_name,
            role: currentStaff.staff.role,
          });
          setGeneratedCount(created);
        } catch (err) {
          console.error('ensureRecurringChargesGeneratedForMonth', err);
        } finally {
          setGenerating(false);
        }
      }

      const { startDate, endDate } = monthRange(month);
      const result = await listCharges({
        startDate,
        endDate,
        storeCode: effectiveStore,
        category: categoryFilter === 'ALL' ? null : categoryFilter,
      });
      setCharges(result);
    } catch (err) {
      console.error('listCharges', err);
      setError(err instanceof Error ? err.message : 'Impossible de charger les charges pour cette période.');
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const result = await listChargeTemplates(storeFilter === 'ALL' ? null : storeFilter);
      setTemplates(result);
    } catch (err) {
      console.error('listChargeTemplates', err);
    } finally {
      setTemplatesLoading(false);
    }
  };

  useEffect(() => {
    if (staffLoading) return;
    loadCharges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffLoading, month, storeFilter, categoryFilter]);

  useEffect(() => {
    if (staffLoading) return;
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffLoading, storeFilter]);

  const total = useMemo(() => charges.reduce((sum, c) => sum + Number(c.amount_xof ?? 0), 0), [charges]);

  const openForm = () => {
    setFormError(null);
    setForm(emptyForm(isDirection ? '' : (ownStore ?? '')));
    setShowForm(true);
  };

  const submitCharge = async () => {
    setFormError(null);

    const storeCode = isDirection ? form.store_code : ownStore;
    if (!storeCode) {
      setFormError('Choisissez une boutique.');
      return;
    }
    const amount = Number(form.amount_xof);
    if (!amount || amount <= 0) {
      setFormError('Indiquez un montant valide, supérieur à 0.');
      return;
    }
    if (!form.charge_date) {
      setFormError('Indiquez une date.');
      return;
    }
    if (!currentStaff) {
      setFormError('Session expirée. Reconnectez-vous et réessayez.');
      return;
    }

    setSaving(true);
    try {
      await createCharge({
        store_code: storeCode as ChargeStore,
        category: form.category,
        amount_xof: amount,
        charge_date: form.charge_date,
        payment_method: form.payment_method || null,
        note: form.note || null,
        recorded_by_name: currentStaff.staff.full_name,
        recorded_by_role: currentStaff.staff.role,
      });
      setShowForm(false);
      await loadCharges();
    } catch (err) {
      console.error('createCharge', err);
      setFormError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteConfirmId(null);
    setCharges((prev) => prev.filter((c) => c.id !== id));
    try {
      await deleteCharge(id);
    } catch (err) {
      console.error('deleteCharge', err);
      // La suppression a échoué côté base : on recharge pour resynchroniser
      // la liste au lieu de laisser une ligne fantôme retirée à tort.
      loadCharges();
      alert(err instanceof Error ? err.message : 'Suppression impossible.');
    }
  };

  const openTemplateForm = () => {
    setTemplateFormError(null);
    setTemplateForm(emptyTemplateForm(isDirection ? '' : (ownStore ?? '')));
    setShowTemplateForm(true);
  };

  const submitTemplate = async () => {
    setTemplateFormError(null);

    const storeCode = isDirection ? templateForm.store_code : ownStore;
    if (!storeCode) {
      setTemplateFormError('Choisissez une boutique.');
      return;
    }
    const amount = Number(templateForm.amount_xof);
    if (!amount || amount <= 0) {
      setTemplateFormError('Indiquez un montant valide, supérieur à 0.');
      return;
    }
    const day = Number(templateForm.day_of_month);
    if (!day || day < 1 || day > 28) {
      setTemplateFormError('Choisissez un jour entre 1 et 28 (pour rester valable sur tous les mois).');
      return;
    }
    if (!currentStaff) {
      setTemplateFormError('Session expirée. Reconnectez-vous et réessayez.');
      return;
    }

    setTemplateSaving(true);
    try {
      await createChargeTemplate({
        store_code: storeCode as ChargeStore,
        category: templateForm.category,
        amount_xof: amount,
        day_of_month: day,
        payment_method: templateForm.payment_method || null,
        note: templateForm.note || null,
        created_by_name: currentStaff.staff.full_name,
        created_by_role: currentStaff.staff.role,
      });
      setShowTemplateForm(false);
      await loadTemplates();
      // Le nouveau modèle peut immédiatement générer la charge du mois en
      // cours (si elle n'existe pas déjà) : on relance le chargement du
      // mois affiché pour qu'elle apparaisse sans avoir à recharger la page.
      await loadCharges();
    } catch (err) {
      console.error('createChargeTemplate', err);
      setTemplateFormError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setTemplateSaving(false);
    }
  };

  const toggleTemplateActive = async (template: ChargeTemplate) => {
    setTemplateActionId(template.id);
    try {
      await updateChargeTemplate(template.id, { is_active: !template.is_active });
      await loadTemplates();
    } catch (err) {
      console.error('updateChargeTemplate', err);
      alert(err instanceof Error ? err.message : 'Modification impossible.');
    } finally {
      setTemplateActionId(null);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    setDeleteTemplateConfirmId(null);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    try {
      await deleteChargeTemplate(id);
    } catch (err) {
      console.error('deleteChargeTemplate', err);
      loadTemplates();
      alert(err instanceof Error ? err.message : 'Suppression impossible.');
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0F1D] text-slate-100 lmb-charges">
      <header className="border-b border-slate-800 bg-slate-900/90 px-6 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <SecondaryButton href="/admin" className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.18em]">
              <ArrowLeft className="h-3.5 w-3.5" />
              Retour
            </SecondaryButton>
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-300">ERP • Charges</p>
              <h1 className="mt-1 text-2xl font-bold text-white">Charges d&apos;exploitation</h1>
            </div>
          </div>

          <PrimaryButton onClick={openForm} className="inline-flex items-center gap-2 text-xs">
            <Plus className="h-3.5 w-3.5" />
            Nouvelle charge
          </PrimaryButton>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-2xl shadow-slate-950/20">
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-xs">
              <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Mois</span>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
            </label>

            {isDirection ? (
              <label className="text-xs">
                <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Boutique</span>
                <Select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value as StoreFilter)} className="w-44">
                  <option value="ALL">Toutes les boutiques</option>
                  <option value="DAKAR">Dakar</option>
                  <option value="ABIDJAN">Abidjan</option>
                </Select>
              </label>
            ) : (
              <div className="text-xs">
                <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Boutique</span>
                <p className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-300">
                  {ownStore ? STORE_LABELS[ownStore] : '—'}
                </p>
              </div>
            )}

            <label className="text-xs">
              <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Catégorie</span>
              <Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as ChargeCategory | 'ALL')}
                className="w-52"
              >
                <option value="ALL">Toutes les catégories</option>
                {CATEGORY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>

            <div className="ml-auto rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-right">
              <p className="text-[10px] uppercase tracking-[0.18em] text-amber-300">Total du mois</p>
              <p className="text-lg font-black text-white">{formatMoney(total)}</p>
            </div>
          </div>
        </div>

        {error ? (
          <div className="mb-6 rounded-3xl border border-rose-500/40 bg-rose-500/10 p-5 text-sm text-rose-200">{error}</div>
        ) : null}

        {!generating && generatedCount > 0 ? (
          <div className="mb-6 flex items-center gap-2 rounded-3xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
            <Repeat className="h-4 w-4 shrink-0" />
            <span>
              {generatedCount === 1
                ? '1 charge récurrente a été générée automatiquement pour ce mois (voir « Enregistrée par » dans le tableau).'
                : `${generatedCount} charges récurrentes ont été générées automatiquement pour ce mois (voir « Enregistrée par » dans le tableau).`}
            </span>
          </div>
        ) : null}

        {showForm ? (
          <div className="mb-6 rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
            <h3 className="mb-4 text-lg font-bold text-white">Nouvelle charge</h3>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="text-xs">
                <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Boutique</span>
                {isDirection ? (
                  <Select value={form.store_code} onChange={(e) => setForm((f) => ({ ...f, store_code: e.target.value as ChargeStore }))}>
                    <option value="">Choisir…</option>
                    <option value="DAKAR">Dakar</option>
                    <option value="ABIDJAN">Abidjan</option>
                  </Select>
                ) : (
                  <p className="rounded-lg border border-gray-700 bg-[#111111] px-3 py-2 text-sm text-slate-200">
                    {ownStore ? STORE_LABELS[ownStore] : '—'}
                  </p>
                )}
              </label>

              <label className="text-xs">
                <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Catégorie</span>
                <Select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ChargeCategory }))}
                >
                  {CATEGORY_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="text-xs">
                <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Montant (FCFA)</span>
                <Input
                  type="number"
                  min={1}
                  value={form.amount_xof}
                  onChange={(e) => setForm((f) => ({ ...f, amount_xof: e.target.value }))}
                  placeholder="Ex. 150000"
                />
              </label>

              <label className="text-xs">
                <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Date</span>
                <Input
                  type="date"
                  value={form.charge_date}
                  onChange={(e) => setForm((f) => ({ ...f, charge_date: e.target.value }))}
                />
              </label>

              <label className="text-xs">
                <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Mode de paiement (optionnel)</span>
                <Select
                  value={form.payment_method}
                  onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value as ChargePaymentMethod | '' }))}
                >
                  <option value="">Non précisé</option>
                  {PAYMENT_METHOD_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="text-xs md:col-span-2 xl:col-span-3">
                <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Note (optionnel)</span>
                <Textarea
                  rows={2}
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="Ex. numéro de facture, précision utile…"
                />
              </label>
            </div>

            {formError ? <p className="mt-3 text-sm text-rose-300">{formError}</p> : null}

            <div className="mt-4 flex items-center gap-3">
              <PrimaryButton onClick={submitCharge} disabled={saving} className="text-xs">
                {saving ? 'Enregistrement…' : 'Enregistrer la charge'}
              </PrimaryButton>
              <SecondaryButton onClick={() => setShowForm(false)} disabled={saving} className="text-xs">
                Annuler
              </SecondaryButton>
            </div>
          </div>
        ) : null}

        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
          <div className="mb-4 flex items-center gap-2">
            <Receipt className="h-4 w-4 text-cyan-300" />
            <h3 className="text-lg font-bold text-white">Charges du mois</h3>
          </div>

          {staffLoading || loading ? (
            <LoadingState label="Chargement des charges…" />
          ) : charges.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-slate-400">
              <Wallet className="h-6 w-6 text-slate-600" />
              <p>Aucune charge enregistrée pour cette période.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] uppercase tracking-[0.14em] text-slate-400">
                    <th className="py-2.5 px-3">Date</th>
                    {storeFilter === 'ALL' ? <th className="py-2.5 px-3">Boutique</th> : null}
                    <th className="py-2.5 px-3">Catégorie</th>
                    <th className="py-2.5 px-3">Montant</th>
                    <th className="py-2.5 px-3">Paiement</th>
                    <th className="py-2.5 px-3">Note</th>
                    <th className="py-2.5 px-3">Enregistrée par</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {charges.map((charge) => (
                    <tr key={charge.id} className="text-slate-200">
                      <td className="py-2.5 px-3">{formatDate(charge.charge_date)}</td>
                      {storeFilter === 'ALL' ? (
                        <td className="py-2.5 px-3">{STORE_LABELS[charge.store_code]}</td>
                      ) : null}
                      <td className="py-2.5 px-3">{CHARGE_CATEGORY_LABELS[charge.category]}</td>
                      <td className="py-2.5 px-3 font-bold text-white">{formatMoney(charge.amount_xof)}</td>
                      <td className="py-2.5 px-3 text-slate-400">
                        {charge.payment_method ? CHARGE_PAYMENT_METHOD_LABELS[charge.payment_method] : '—'}
                      </td>
                      <td className="py-2.5 px-3 max-w-[220px] truncate text-slate-400" title={charge.note ?? undefined}>
                        {charge.note ?? '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">{charge.recorded_by_name}</td>
                      <td className="py-2.5 px-3 text-right">
                        {deleteConfirmId === charge.id ? (
                          <span className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleDelete(charge.id)}
                              className="rounded-lg bg-rose-500 px-2 py-1 text-[10px] font-bold text-white"
                            >
                              Confirmer
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(null)}
                              className="rounded-lg border border-slate-600 px-2 py-1 text-[10px] font-bold text-slate-300"
                            >
                              Annuler
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(charge.id)}
                            className="p-1 text-slate-600 hover:text-rose-400 transition"
                            aria-label="Supprimer cette charge"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Repeat className="h-4 w-4 text-cyan-300" />
              <div>
                <h3 className="text-lg font-bold text-white">Charges récurrentes</h3>
                <p className="text-xs text-slate-400">
                  Un modèle (ex. loyer) génère automatiquement sa charge chaque mois, sans ressaisie.
                </p>
              </div>
            </div>
            <SecondaryButton onClick={openTemplateForm} className="inline-flex shrink-0 items-center gap-2 text-xs">
              <Plus className="h-3.5 w-3.5" />
              Nouveau modèle récurrent
            </SecondaryButton>
          </div>

          {showTemplateForm ? (
            <div className="mb-5 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="text-xs">
                  <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Boutique</span>
                  {isDirection ? (
                    <Select
                      value={templateForm.store_code}
                      onChange={(e) => setTemplateForm((f) => ({ ...f, store_code: e.target.value as ChargeStore }))}
                    >
                      <option value="">Choisir…</option>
                      <option value="DAKAR">Dakar</option>
                      <option value="ABIDJAN">Abidjan</option>
                    </Select>
                  ) : (
                    <p className="rounded-lg border border-gray-700 bg-[#111111] px-3 py-2 text-sm text-slate-200">
                      {ownStore ? STORE_LABELS[ownStore] : '—'}
                    </p>
                  )}
                </label>

                <label className="text-xs">
                  <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Catégorie</span>
                  <Select
                    value={templateForm.category}
                    onChange={(e) => setTemplateForm((f) => ({ ...f, category: e.target.value as ChargeCategory }))}
                  >
                    {CATEGORY_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </label>

                <label className="text-xs">
                  <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Montant (FCFA)</span>
                  <Input
                    type="number"
                    min={1}
                    value={templateForm.amount_xof}
                    onChange={(e) => setTemplateForm((f) => ({ ...f, amount_xof: e.target.value }))}
                    placeholder="Ex. 150000"
                  />
                </label>

                <label className="text-xs">
                  <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Jour du mois (1 à 28)</span>
                  <Input
                    type="number"
                    min={1}
                    max={28}
                    value={templateForm.day_of_month}
                    onChange={(e) => setTemplateForm((f) => ({ ...f, day_of_month: e.target.value }))}
                    placeholder="Ex. 5"
                  />
                </label>

                <label className="text-xs">
                  <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Mode de paiement (optionnel)</span>
                  <Select
                    value={templateForm.payment_method}
                    onChange={(e) => setTemplateForm((f) => ({ ...f, payment_method: e.target.value as ChargePaymentMethod | '' }))}
                  >
                    <option value="">Non précisé</option>
                    {PAYMENT_METHOD_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </label>

                <label className="text-xs md:col-span-2 xl:col-span-1">
                  <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Note (optionnel)</span>
                  <Textarea
                    rows={1}
                    value={templateForm.note}
                    onChange={(e) => setTemplateForm((f) => ({ ...f, note: e.target.value }))}
                    placeholder="Ex. bail n°…"
                  />
                </label>
              </div>

              {templateFormError ? <p className="mt-3 text-sm text-rose-300">{templateFormError}</p> : null}

              <div className="mt-4 flex items-center gap-3">
                <PrimaryButton onClick={submitTemplate} disabled={templateSaving} className="text-xs">
                  {templateSaving ? 'Enregistrement…' : 'Créer le modèle récurrent'}
                </PrimaryButton>
                <SecondaryButton onClick={() => setShowTemplateForm(false)} disabled={templateSaving} className="text-xs">
                  Annuler
                </SecondaryButton>
              </div>
            </div>
          ) : null}

          {templatesLoading ? (
            <LoadingState label="Chargement des modèles récurrents…" />
          ) : templates.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Aucune charge récurrente définie pour l&apos;instant.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] uppercase tracking-[0.14em] text-slate-400">
                    {storeFilter === 'ALL' ? <th className="py-2.5 px-3">Boutique</th> : null}
                    <th className="py-2.5 px-3">Catégorie</th>
                    <th className="py-2.5 px-3">Montant</th>
                    <th className="py-2.5 px-3">Jour du mois</th>
                    <th className="py-2.5 px-3">Statut</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {templates.map((template) => (
                    <tr key={template.id} className="text-slate-200">
                      {storeFilter === 'ALL' ? (
                        <td className="py-2.5 px-3">{STORE_LABELS[template.store_code]}</td>
                      ) : null}
                      <td className="py-2.5 px-3">{CHARGE_CATEGORY_LABELS[template.category]}</td>
                      <td className="py-2.5 px-3 font-bold text-white">{formatMoney(template.amount_xof)}</td>
                      <td className="py-2.5 px-3">Le {template.day_of_month}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={
                            template.is_active
                              ? 'rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300'
                              : 'rounded-full border border-slate-700 bg-slate-950/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400'
                          }
                        >
                          {template.is_active ? 'Actif' : 'En pause'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {deleteTemplateConfirmId === template.id ? (
                          <span className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleDeleteTemplate(template.id)}
                              className="rounded-lg bg-rose-500 px-2 py-1 text-[10px] font-bold text-white"
                            >
                              Confirmer
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTemplateConfirmId(null)}
                              className="rounded-lg border border-slate-600 px-2 py-1 text-[10px] font-bold text-slate-300"
                            >
                              Annuler
                            </button>
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => toggleTemplateActive(template)}
                              disabled={templateActionId === template.id}
                              className="rounded-lg border border-slate-600 px-2 py-1 text-[10px] font-bold text-slate-300 hover:border-slate-400"
                            >
                              {templateActionId === template.id ? '…' : template.is_active ? 'Mettre en pause' : 'Réactiver'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTemplateConfirmId(template.id)}
                              className="p-1 text-slate-600 hover:text-rose-400 transition"
                              aria-label="Supprimer ce modèle récurrent"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
