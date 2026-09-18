'use client';

import LoadingState from '@/components/ui/LoadingState';
import { useCallback, useEffect, useMemo, useState } from 'react';
import SecondaryButton from '@/components/ui/SecondaryButton';
import PrimaryButton from '@/components/ui/PrimaryButton';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Smartphone,
  Wallet,
} from 'lucide-react';
import { getCurrentStaff } from '@/lib/services/auth';
import {
  getCurrentBalances,
  getReconciliation,
  listBalanceSnapshots,
  listWithdrawals,
  recordBalanceSnapshot,
  recordWithdrawal,
  MERCHANT_PLATFORMS,
  MERCHANT_STORES,
  PLATFORM_LABEL,
  type BalanceSnapshot,
  type CurrentBalance,
  type MerchantPlatform,
  type MerchantWithdrawal,
  type ReconciliationResult,
  type StoreCode,
} from '@/lib/services/merchant-accounts';

type Section = 'BALANCES' | 'WITHDRAWALS' | 'RECONCILIATION';
type StoreFilter = 'ALL' | StoreCode;

const formatMoney = (value: number | null | undefined) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'XOF',
        maximumFractionDigits: 0,
      }).format(Number(value));

const formatDate = (value: string | null | undefined) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const toDateInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const defaultRange = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 29); // 30 derniers jours
  return { start: toDateInput(start), end: toDateInput(end) };
};

const STORE_META: Record<StoreCode, string> = {
  DAKAR: '🇸🇳 Dakar',
  ABIDJAN: '🇨🇮 Abidjan',
};

export default function MerchantAccountsPage() {
  const [section, setSection] = useState<Section>('BALANCES');
  const [storeFilter, setStoreFilter] = useState<StoreFilter>('ALL');
  const [recordedBy, setRecordedBy] = useState('');

  useEffect(() => {
    getCurrentStaff()
      .then((s) => setRecordedBy(s?.staff.full_name ?? ''))
      .catch(() => setRecordedBy(''));
  }, []);

  const storeParam: StoreCode | null = storeFilter === 'ALL' ? null : storeFilter;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 lmb-merchant">
      <div className="mb-6 flex items-center gap-3">
        <SecondaryButton
          href="/admin"
          className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.18em]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour
        </SecondaryButton>
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-300">Direction • Trésorerie</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-white">
            <Smartphone className="h-6 w-6 text-[#D4AF37]" />
            Comptes Marchands — Wave / Orange Money
          </h1>
        </div>
      </div>

      {/* Barre : sections + filtre boutique */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['BALANCES', 'Soldes actuels'],
              ['WITHDRAWALS', 'Retraits vers banque'],
              ['RECONCILIATION', 'Réconciliation'],
            ] as [Section, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={`rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] transition ${
                section === id
                  ? 'border-[#D4AF37] bg-[#D4AF37] text-black'
                  : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-[#D4AF37]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">
          Boutique
          <Select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value as StoreFilter)}
            className="w-auto"
          >
            <option value="ALL">Toutes</option>
            {MERCHANT_STORES.map((s) => (
              <option key={s} value={s}>
                {STORE_META[s]}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {section === 'BALANCES' && <BalancesSection storeParam={storeParam} recordedBy={recordedBy} />}
      {section === 'WITHDRAWALS' && <WithdrawalsSection storeParam={storeParam} recordedBy={recordedBy} />}
      {section === 'RECONCILIATION' && <ReconciliationSection storeParam={storeParam} />}
    </main>
  );
}

// =====================================================================
// VOLET 1 — Soldes
// =====================================================================
function BalancesSection({
  storeParam,
  recordedBy,
}: {
  storeParam: StoreCode | null;
  recordedBy: string;
}) {
  const [current, setCurrent] = useState<CurrentBalance[]>([]);
  const [history, setHistory] = useState<BalanceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    store_code: 'DAKAR',
    platform: 'WAVE' as MerchantPlatform,
    balance_xof: '',
    observed_at: toDateInput(new Date()),
    note: '',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cur, hist] = await Promise.all([
        getCurrentBalances(),
        listBalanceSnapshots(storeParam),
      ]);
      setCurrent(cur);
      setHistory(hist);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement des soldes impossible.');
    } finally {
      setLoading(false);
    }
  }, [storeParam]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveOk(null);
    try {
      await recordBalanceSnapshot({
        store_code: form.store_code,
        platform: form.platform,
        balance_xof: Number(form.balance_xof),
        observed_at: form.observed_at,
        recorded_by: recordedBy,
        note: form.note,
      });
      setSaveOk('Relevé de solde enregistré.');
      setForm((f) => ({ ...f, balance_xof: '', note: '' }));
      await load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  const visibleCurrent = storeParam ? current.filter((c) => c.store === storeParam) : current;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>
      )}

      {/* Soldes actuels */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? [0, 1, 2, 3].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/70" />
            ))
          : visibleCurrent.map((c) => (
              <div
                key={`${c.store}-${c.platform}`}
                className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg"
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  {STORE_META[c.store]} · {PLATFORM_LABEL[c.platform]}
                </p>
                <p className="mt-2 text-xl font-black text-white">
                  {c.snapshot ? formatMoney(c.snapshot.balance_xof) : '— non saisi'}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {c.snapshot
                    ? `Relevé du ${formatDate(c.snapshot.observed_at)} · ${c.snapshot.recorded_by}`
                    : 'Aucun relevé enregistré'}
                </p>
              </div>
            ))}
      </div>

      {/* Formulaire de saisie */}
      <form
        onSubmit={submit}
        className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg"
      >
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-slate-200">
          <Wallet className="h-4 w-4 text-[#D4AF37]" />
          Saisir un relevé de solde
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
            Boutique
            <Select
              value={form.store_code}
              onChange={(e) => setForm((f) => ({ ...f, store_code: e.target.value }))}
              className="mt-1"
            >
              {MERCHANT_STORES.map((s) => (
                <option key={s} value={s}>
                  {STORE_META[s]}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
            Plateforme
            <Select
              value={form.platform}
              onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value as MerchantPlatform }))}
              className="mt-1"
            >
              {MERCHANT_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABEL[p]}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
            Solde constaté (FCFA)
            <Input
              type="number"
              min="0"
              step="1"
              required
              value={form.balance_xof}
              onChange={(e) => setForm((f) => ({ ...f, balance_xof: e.target.value }))}
              className="mt-1"
            />
          </label>
          <label className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
            Date du relevé
            <Input
              type="date"
              required
              max={toDateInput(new Date())}
              value={form.observed_at}
              onChange={(e) => setForm((f) => ({ ...f, observed_at: e.target.value }))}
              className="mt-1"
            />
          </label>
          <label className="text-[11px] uppercase tracking-[0.14em] text-slate-400 md:col-span-2 lg:col-span-1">
            Note (facultatif)
            <Input
              type="text"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              className="mt-1"
              placeholder="ex: capture app Wave"
            />
          </label>
        </div>

        {saveError && (
          <p className="mt-3 flex items-center gap-2 text-xs text-rose-300">
            <AlertTriangle className="h-3.5 w-3.5" /> {saveError}
          </p>
        )}
        {saveOk && (
          <p className="mt-3 flex items-center gap-2 text-xs text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" /> {saveOk}
          </p>
        )}
        {!recordedBy && (
          <p className="mt-3 text-xs text-amber-300">Session non identifiée : reconnectez-vous avant de saisir.</p>
        )}

        <div className="mt-4">
          <PrimaryButton disabled={saving || !recordedBy} className="text-xs">
            {saving ? 'Enregistrement…' : 'Enregistrer le relevé'}
          </PrimaryButton>
        </div>
      </form>

      {/* Historique des relevés */}
      <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.14em] text-slate-200">
          Historique des relevés {storeParam ? `— ${STORE_META[storeParam]}` : ''}
        </h2>
        {loading ? (
          <LoadingState className="py-4" />
        ) : history.length === 0 ? (
          <p className="text-xs text-slate-500">Aucun relevé enregistré.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 px-3">Boutique</th>
                <th className="py-2 px-3">Plateforme</th>
                <th className="py-2 px-3 text-right">Solde</th>
                <th className="py-2 px-3">Saisi par</th>
                <th className="py-2 pl-3">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {history.map((h) => (
                <tr key={h.id} className="text-slate-200">
                  <td className="py-2 pr-3">{formatDate(h.observed_at)}</td>
                  <td className="py-2 px-3">{h.store_code}</td>
                  <td className="py-2 px-3">{PLATFORM_LABEL[h.platform]}</td>
                  <td className="py-2 px-3 text-right font-mono">{formatMoney(h.balance_xof)}</td>
                  <td className="py-2 px-3 text-slate-400">{h.recorded_by}</td>
                  <td className="py-2 pl-3 text-slate-500">{h.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// VOLET 2 — Retraits
// =====================================================================
function WithdrawalsSection({
  storeParam,
  recordedBy,
}: {
  storeParam: StoreCode | null;
  recordedBy: string;
}) {
  const [rows, setRows] = useState<MerchantWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    store_code: 'DAKAR',
    platform: 'WAVE' as MerchantPlatform,
    amount_xof: '',
    transfer_date: toDateInput(new Date()),
    bank_reference: '',
    note: '',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listWithdrawals({ store: storeParam }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement des retraits impossible.');
    } finally {
      setLoading(false);
    }
  }, [storeParam]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveOk(null);
    try {
      await recordWithdrawal({
        store_code: form.store_code,
        platform: form.platform,
        amount_xof: Number(form.amount_xof),
        transfer_date: form.transfer_date,
        bank_reference: form.bank_reference,
        recorded_by: recordedBy,
        note: form.note,
      });
      setSaveOk('Retrait enregistré.');
      setForm((f) => ({ ...f, amount_xof: '', bank_reference: '', note: '' }));
      await load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  const total = useMemo(() => rows.reduce((s, r) => s + r.amount_xof, 0), [rows]);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>
      )}

      <form onSubmit={submit} className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-slate-200">
          <Banknote className="h-4 w-4 text-[#D4AF37]" />
          Saisir un transfert compte marchand → banque
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
            Boutique
            <Select
              value={form.store_code}
              onChange={(e) => setForm((f) => ({ ...f, store_code: e.target.value }))}
              className="mt-1"
            >
              {MERCHANT_STORES.map((s) => (
                <option key={s} value={s}>
                  {STORE_META[s]}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
            Plateforme
            <Select
              value={form.platform}
              onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value as MerchantPlatform }))}
              className="mt-1"
            >
              {MERCHANT_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABEL[p]}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
            Montant transféré (FCFA)
            <Input
              type="number"
              min="1"
              step="1"
              required
              value={form.amount_xof}
              onChange={(e) => setForm((f) => ({ ...f, amount_xof: e.target.value }))}
              className="mt-1"
            />
          </label>
          <label className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
            Date du transfert
            <Input
              type="date"
              required
              max={toDateInput(new Date())}
              value={form.transfer_date}
              onChange={(e) => setForm((f) => ({ ...f, transfer_date: e.target.value }))}
              className="mt-1"
            />
          </label>
          <label className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
            Référence bancaire (facultatif)
            <Input
              type="text"
              value={form.bank_reference}
              onChange={(e) => setForm((f) => ({ ...f, bank_reference: e.target.value }))}
              className="mt-1"
              placeholder="n° virement / bordereau"
            />
          </label>
          <label className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
            Note (facultatif)
            <Input
              type="text"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              className="mt-1"
            />
          </label>
        </div>

        {saveError && (
          <p className="mt-3 flex items-center gap-2 text-xs text-rose-300">
            <AlertTriangle className="h-3.5 w-3.5" /> {saveError}
          </p>
        )}
        {saveOk && (
          <p className="mt-3 flex items-center gap-2 text-xs text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" /> {saveOk}
          </p>
        )}
        {!recordedBy && (
          <p className="mt-3 text-xs text-amber-300">Session non identifiée : reconnectez-vous avant de saisir.</p>
        )}

        <div className="mt-4">
          <PrimaryButton disabled={saving || !recordedBy} className="text-xs">
            {saving ? 'Enregistrement…' : 'Enregistrer le transfert'}
          </PrimaryButton>
        </div>
      </form>

      <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-200">
            Historique des transferts {storeParam ? `— ${STORE_META[storeParam]}` : ''}
          </h2>
          <span className="text-xs text-slate-400">
            Total affiché : <strong className="text-white">{formatMoney(total)}</strong>
          </span>
        </div>
        {loading ? (
          <LoadingState className="py-4" />
        ) : rows.length === 0 ? (
          <p className="text-xs text-slate-500">Aucun transfert enregistré.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 px-3">Boutique</th>
                <th className="py-2 px-3">Plateforme</th>
                <th className="py-2 px-3 text-right">Montant</th>
                <th className="py-2 px-3">Réf. bancaire</th>
                <th className="py-2 px-3">Saisi par</th>
                <th className="py-2 pl-3">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {rows.map((r) => (
                <tr key={r.id} className="text-slate-200">
                  <td className="py-2 pr-3">{formatDate(r.transfer_date)}</td>
                  <td className="py-2 px-3">{r.store_code}</td>
                  <td className="py-2 px-3">{PLATFORM_LABEL[r.platform]}</td>
                  <td className="py-2 px-3 text-right font-mono">{formatMoney(r.amount_xof)}</td>
                  <td className="py-2 px-3 text-slate-400">{r.bank_reference ?? '—'}</td>
                  <td className="py-2 px-3 text-slate-400">{r.recorded_by}</td>
                  <td className="py-2 pl-3 text-slate-500">{r.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// VOLET 3 — Réconciliation
// =====================================================================
function ReconciliationSection({ storeParam }: { storeParam: StoreCode | null }) {
  const initial = useMemo(() => defaultRange(), []);
  const [startInput, setStartInput] = useState(initial.start);
  const [endInput, setEndInput] = useState(initial.end);
  const [range, setRange] = useState(initial);

  const [data, setData] = useState<ReconciliationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const startISO = new Date(`${range.start}T00:00:00`).toISOString();
        const endISO = new Date(`${range.end}T23:59:59.999`).toISOString();
        const result = await getReconciliation(startISO, endISO, storeParam);
        if (!cancelled) setData(result);
      } catch (err) {
        console.error('reconciliation', err);
        if (!cancelled) setError('Impossible de charger la réconciliation pour cette période.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [range, storeParam]);

  const applyRange = () => {
    if (!startInput || !endInput) return;
    const s = startInput <= endInput ? startInput : endInput;
    const e = startInput <= endInput ? endInput : startInput;
    setStartInput(s);
    setEndInput(e);
    setRange({ start: s, end: e });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.14em] text-slate-400">
            Du
            <input
              type="date"
              value={startInput}
              max={endInput}
              onChange={(e) => setStartInput(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.14em] text-slate-400">
            Au
            <input
              type="date"
              value={endInput}
              min={startInput}
              max={toDateInput(new Date())}
              onChange={(e) => setEndInput(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <PrimaryButton onClick={applyRange} className="text-xs">
            Appliquer
          </PrimaryButton>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Comparaison : <strong>solde d&apos;ouverture + ventes encaissées (Wave / OM) − retraits saisis</strong> doit
          égaler le <strong>solde de clôture saisi</strong>. Les ventes annulées / remboursées et les modes de
          paiement non reconnus sont exclus et listés à part.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>
      )}

      {loading ? (
        <div className="h-72 animate-pulse rounded-3xl border border-slate-800 bg-slate-900/70" />
      ) : data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {data.lines.map((line) => {
              const statusStyle =
                line.status === 'ANOMALIE'
                  ? 'border-rose-500/50 bg-rose-500/10'
                  : line.status === 'OK'
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : 'border-amber-500/40 bg-amber-500/5';
              return (
                <div
                  key={`${line.store}-${line.platform}`}
                  className={`rounded-3xl border p-5 shadow-lg ${statusStyle}`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white">
                      {STORE_META[line.store]} · {PLATFORM_LABEL[line.platform]}
                    </h3>
                    <span className="rounded-full border border-slate-600 bg-slate-950/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-200">
                      {line.status === 'INCOMPLET' ? 'Relevés manquants' : line.status}
                    </span>
                  </div>

                  <dl className="space-y-1.5 text-xs">
                    <RecoRow label="Solde d'ouverture" value={line.openingBalanceXof} sub={formatDate(line.openingBalanceDate)} />
                    <RecoRow
                      label="Ventes encaissées (Wave/OM)"
                      value={line.salesInflowXof}
                      sub={`${line.directSalesCount} vente(s)${
                        line.splitAttributedXof > 0
                          ? ` + ${formatMoney(line.splitAttributedXof)} issus de ${line.splitAttributedCount} paiement(s) mixte(s)`
                          : ''
                      }`}
                      positive
                    />
                    <RecoRow label="Retraits saisis" value={line.withdrawalsOutflowXof} sub={`${line.withdrawalsCount} transfert(s)`} negative />
                    <RecoRow label="Solde de clôture attendu" value={line.expectedClosingXof} strong />
                    <RecoRow label="Solde de clôture saisi" value={line.closingBalanceXof} sub={formatDate(line.closingBalanceDate)} strong />
                  </dl>

                  <div className="mt-3 border-t border-slate-700/60 pt-3">
                    {line.varianceXof == null ? (
                      <p className="flex items-start gap-2 text-[11px] text-amber-200">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Saisir un relevé de solde daté au plus tard le {formatDate(range.start)} (ouverture) et un au
                        {' '}{formatDate(range.end)} ou après (clôture) pour calculer l&apos;écart.
                      </p>
                    ) : line.hasVariance ? (
                      <p className="flex items-center justify-between text-xs font-bold text-rose-200">
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle className="h-4 w-4" /> Écart inexpliqué
                        </span>
                        <span className="font-mono">
                          {line.varianceXof > 0 ? '+' : ''}
                          {formatMoney(line.varianceXof)}
                        </span>
                      </p>
                    ) : (
                      <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-200">
                        <CheckCircle2 className="h-4 w-4" /> Rapprochement OK (écart nul)
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Buckets non imputés */}
          <div className="grid gap-4 md:grid-cols-3">
            <DiagnosticCard
              title="Paiements mixtes non ventilés"
              tone={data.splitUnventilated.count > 0 ? 'amber' : 'neutral'}
            >
              {data.splitUnventilated.count === 0 ? (
                <p>Aucun.</p>
              ) : (
                <p>
                  <strong>{data.splitUnventilated.count}</strong> vente(s) SPLIT (
                  {formatMoney(data.splitUnventilated.totalXof)}) sans détail exploitable — <em>jamais</em> imputées à
                  une plateforme. Reçus : {data.splitUnventilated.receipts.slice(0, 10).join(', ')}
                  {data.splitUnventilated.receipts.length > 10 ? '…' : ''}
                </p>
              )}
            </DiagnosticCard>

            <DiagnosticCard
              title="Modes de paiement non reconnus"
              tone={data.unrecognized.count > 0 ? 'amber' : 'neutral'}
            >
              {data.unrecognized.count === 0 ? (
                <p>Aucun.</p>
              ) : (
                <p>
                  <strong>{data.unrecognized.count}</strong> vente(s) ({formatMoney(data.unrecognized.totalXof)}) avec
                  un <code>payment_method</code> ni Wave, ni OM, ni espèces/CB :{' '}
                  {data.unrecognized.labels.join(', ')}. Exclues du rapprochement.
                </p>
              )}
            </DiagnosticCard>

            <DiagnosticCard title="Exclusions" tone="neutral">
              <p>
                Annulées / remboursées : <strong>{data.voided.count}</strong> ({formatMoney(data.voided.totalXof)}).
              </p>
              {data.unassignedSales.count > 0 && (
                <p className="mt-1">
                  Hors Dakar/Abidjan : <strong>{data.unassignedSales.count}</strong> (
                  {formatMoney(data.unassignedSales.totalXof)}) — {data.unassignedSales.labels.join(', ')}.
                </p>
              )}
            </DiagnosticCard>
          </div>
        </>
      ) : null}
    </div>
  );
}

function RecoRow({
  label,
  value,
  sub,
  strong,
  positive,
  negative,
}: {
  label: string;
  value: number | null;
  sub?: string;
  strong?: boolean;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-slate-300">
        {label}
        {sub ? <span className="block text-[10px] text-slate-500">{sub}</span> : null}
      </dt>
      <dd
        className={`shrink-0 font-mono ${strong ? 'font-black text-white' : 'text-slate-100'} ${
          positive ? 'text-emerald-200' : negative ? 'text-rose-200' : ''
        }`}
      >
        {negative && value ? '− ' : ''}
        {formatMoney(value)}
      </dd>
    </div>
  );
}

function DiagnosticCard({
  title,
  tone,
  children,
}: {
  title: string;
  tone: 'amber' | 'neutral';
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 text-[11px] leading-relaxed ${
        tone === 'amber'
          ? 'border-amber-500/30 bg-amber-500/5 text-amber-100/90'
          : 'border-slate-800 bg-slate-900/70 text-slate-400'
      }`}
    >
      <p className="mb-1.5 font-bold uppercase tracking-[0.14em] text-slate-300">{title}</p>
      {children}
    </div>
  );
}
