'use client';

import LoadingState from '@/components/ui/LoadingState';
import { useCallback, useEffect, useState } from 'react';
import SecondaryButton from '@/components/ui/SecondaryButton';
import PrimaryButton from '@/components/ui/PrimaryButton';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { AlertTriangle, ArrowLeft, Handshake, Power } from 'lucide-react';
import {
  listServiceProviders,
  createServiceProvider,
  updateServiceProvider,
  recordProviderPayment,
  listProviderPayments,
  type ServiceProvider,
  type CreateServiceProviderInput,
  type ServiceProviderPayment,
  type ServiceProviderFrequency,
} from '@/lib/services/service-providers';

const FREQUENCY_LABEL: Record<ServiceProviderFrequency, string> = {
  MENSUEL: 'Mensuel',
  HEBDOMADAIRE: 'Hebdomadaire',
  PONCTUEL: 'Ponctuel',
  AUTRE: 'Autre',
};

const toDateInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const emptyForm: CreateServiceProviderInput = {
  full_name: '',
  service_description: '',
  usual_amount_xof: undefined,
  frequency: 'PONCTUEL',
};

export default function ServiceProvidersPage() {
  const [providers, setProviders] = useState<ServiceProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ServiceProvider | null>(null);
  const [form, setForm] = useState<CreateServiceProviderInput>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ServiceProvider | null>(null);
  const [payments, setPayments] = useState<ServiceProviderPayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(toDateInput(new Date()));
  const [payNote, setPayNote] = useState('');
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProviders(await listServiceProviders());
    } catch (err) {
      console.error('listServiceProviders', err);
      setError(err instanceof Error ? err.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const loadPayments = useCallback(async (providerId: string) => {
    setPaymentsLoading(true);
    try {
      setPayments(await listProviderPayments(providerId));
    } catch (err) {
      console.error('listProviderPayments', err);
    } finally {
      setPaymentsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (selected) {
      (async () => {
        await loadPayments(selected.id);
        if (cancelled) return;
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [selected, loadPayments]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (p: ServiceProvider) => {
    setEditing(p);
    setForm({
      full_name: p.full_name,
      service_description: p.service_description ?? '',
      usual_amount_xof: p.usual_amount_xof ?? undefined,
      frequency: p.frequency,
    });
    setFormError(null);
    setShowForm(true);
  };

  const set = <K extends keyof CreateServiceProviderInput>(key: K, value: CreateServiceProviderInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.full_name.trim()) return setFormError('Le nom complet est obligatoire.');

    setBusy(true);
    try {
      if (editing) {
        await updateServiceProvider(editing.id, form);
      } else {
        await createServiceProvider(form);
      }
      setShowForm(false);
      await load();
    } catch (err) {
      console.error('saveServiceProvider', err);
      setFormError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (p: ServiceProvider) => {
    try {
      await updateServiceProvider(p.id, { is_active: !p.is_active } as never);
      await load();
    } catch (err) {
      console.error('toggleActive', err);
    }
  };

  const recordPayment = async () => {
    if (!selected) return;
    const amount = Number(payAmount);
    if (!amount || amount <= 0) {
      setPayError('Montant invalide.');
      return;
    }
    setPayBusy(true);
    setPayError(null);
    try {
      await recordProviderPayment(selected.id, amount, payDate, payNote.trim() || null);
      setPayAmount('');
      setPayNote('');
      await loadPayments(selected.id);
    } catch (err) {
      console.error('recordProviderPayment', err);
      setPayError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setPayBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 lmb-providers">
      <div className="mb-6 flex items-center gap-3">
        <SecondaryButton
          href="/admin"
          className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.18em]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour
        </SecondaryButton>
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-300">Direction • Prestataires</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-white">
            <Handshake className="h-6 w-6 text-[#D4AF37]" />
            Registre des prestataires
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-slate-400">
            Suivi simple des prestataires réguliers (livreur, ménage, technicien, etc.) — sans gestion de contrat pour
            l&apos;instant. Ils sont rémunérés correctement en dehors de tout contrat écrit ; une formalisation
            pourra être ajoutée plus tard sans perdre cet historique.
          </p>
        </div>
      </div>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <Handshake className="h-4 w-4 text-cyan-400" />
            Prestataires ({providers.length})
          </h2>
          <PrimaryButton onClick={openCreate} className="text-xs">
            + Ajouter un prestataire
          </PrimaryButton>
        </div>

        {error && (
          <p className="mb-3 flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        {loading ? (
          <LoadingState />
        ) : providers.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">Aucun prestataire enregistré.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                    <th className="py-2.5 pr-3">Nom</th>
                    <th className="py-2.5 px-3">Fréquence</th>
                    <th className="py-2.5 px-3 text-right">Montant habituel</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {providers.map((p) => (
                    <tr
                      key={p.id}
                      className={`cursor-pointer hover:bg-slate-800/40 ${selected?.id === p.id ? 'bg-slate-800/60' : ''}`}
                      onClick={() => setSelected(p)}
                    >
                      <td className="py-2.5 pr-3 font-semibold text-slate-100">
                        {p.full_name}
                        {!p.is_active && (
                          <span className="ml-2 rounded-full bg-slate-700 px-2 py-0.5 text-[9px] text-slate-300">INACTIF</span>
                        )}
                        {p.service_description && <p className="text-[10px] font-normal text-slate-500">{p.service_description}</p>}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">{FREQUENCY_LABEL[p.frequency]}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-300">
                        {p.usual_amount_xof != null ? p.usual_amount_xof.toLocaleString('fr-FR') : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(p);
                          }}
                          className="mr-2 text-cyan-300 hover:underline"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleActive(p);
                          }}
                          className="inline-flex items-center gap-1 text-slate-400 hover:underline"
                        >
                          <Power className="h-3 w-3" />
                          {p.is_active ? 'Désactiver' : 'Réactiver'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              {!selected ? (
                <p className="text-sm text-slate-400">Sélectionnez un prestataire pour enregistrer un paiement.</p>
              ) : (
                <>
                  <h3 className="mb-3 text-sm font-bold text-white">Paiements — {selected.full_name}</h3>

                  <div className="mb-4 grid gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 md:grid-cols-3">
                    <label className="text-xs">
                      <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Montant (FCFA)</span>
                      <input
                        type="number"
                        min="0"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      />
                    </label>
                    <label className="text-xs">
                      <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Date</span>
                      <input
                        type="date"
                        value={payDate}
                        onChange={(e) => setPayDate(e.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      />
                    </label>
                    <label className="text-xs">
                      <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Note (optionnel)</span>
                      <input
                        type="text"
                        value={payNote}
                        onChange={(e) => setPayNote(e.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      />
                    </label>
                    <div className="md:col-span-3 flex items-center justify-between">
                      {payError && <p className="text-xs text-rose-300">{payError}</p>}
                      <div className="ml-auto">
                        <PrimaryButton onClick={recordPayment} disabled={payBusy} className="text-xs">
                          {payBusy ? 'Enregistrement…' : 'Enregistrer le paiement'}
                        </PrimaryButton>
                      </div>
                    </div>
                  </div>

                  {paymentsLoading ? (
                    <LoadingState label="Chargement des paiements…" className="py-4" />
                  ) : payments.length === 0 ? (
                    <p className="text-xs text-slate-500">Aucun paiement enregistré pour ce prestataire.</p>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                          <th className="py-2 pr-3">Date</th>
                          <th className="py-2 px-3 text-right">Montant</th>
                          <th className="py-2 px-3">Note</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {payments.map((pay) => (
                          <tr key={pay.id}>
                            <td className="py-2 pr-3 text-slate-200">
                              {new Date(pay.payment_date).toLocaleDateString('fr-FR')}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-emerald-300">
                              {pay.amount_xof.toLocaleString('fr-FR')}
                            </td>
                            <td className="py-2 px-3 text-slate-400">{pay.note ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={submit} className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
            <h3 className="mb-4 text-sm font-bold text-white">
              {editing ? 'Modifier le prestataire' : 'Ajouter un prestataire'}
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs md:col-span-2">
                <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Nom complet</span>
                <Input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
              </label>
              <label className="text-xs md:col-span-2">
                <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Service rendu</span>
                <Input
                  value={form.service_description ?? ''}
                  onChange={(e) => set('service_description', e.target.value)}
                  placeholder="ex: Livraison, ménage, maintenance…"
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Montant habituel (FCFA)</span>
                <input
                  type="number"
                  min="0"
                  value={form.usual_amount_xof ?? ''}
                  onChange={(e) => set('usual_amount_xof', e.target.value === '' ? undefined : Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Fréquence</span>
                <Select
                  value={form.frequency}
                  onChange={(e) => set('frequency', e.target.value as ServiceProviderFrequency)}
                >
                  <option value="PONCTUEL">Ponctuel</option>
                  <option value="MENSUEL">Mensuel</option>
                  <option value="HEBDOMADAIRE">Hebdomadaire</option>
                  <option value="AUTRE">Autre</option>
                </Select>
              </label>
            </div>

            {formError && <p className="mt-3 text-xs text-rose-300">{formError}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <SecondaryButton type="button" onClick={() => setShowForm(false)} className="text-xs">
                Annuler
              </SecondaryButton>
              <PrimaryButton type="submit" disabled={busy} className="text-xs">
                {busy ? 'Enregistrement…' : 'Enregistrer'}
              </PrimaryButton>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
