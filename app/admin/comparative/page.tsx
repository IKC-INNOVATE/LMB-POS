'use client';

import { useEffect, useMemo, useState } from 'react';
import SecondaryButton from '@/components/ui/SecondaryButton';
import PrimaryButton from '@/components/ui/PrimaryButton';
import EstimationBadge from '@/components/ui/EstimationBadge';
import { AlertTriangle, ArrowLeft, Scale, TrendingUp, TrendingDown } from 'lucide-react';
import {
  getStoreComparison,
  STORE_KEYS,
  type StoreComparisonResult,
  type StoreComparisonMetrics,
  type StoreKey,
} from '@/lib/services/store-comparison';

const formatMoney = (value: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));

const formatDateLabel = (date: string | Date) =>
  new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

/** yyyy-mm-dd (valeur d'un <input type="date">) pour une date locale. */
const toDateInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const defaultRange = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6); // 7 derniers jours, aujourd'hui inclus
  return { start: toDateInput(start), end: toDateInput(end) };
};

const STORE_META: Record<StoreKey, { label: string; accent: string }> = {
  DAKAR: { label: '🇸🇳 Dakar', accent: 'cyan' },
  ABIDJAN: { label: '🇨🇮 Abidjan', accent: 'violet' },
};

export default function ComparativePage() {
  const initial = useMemo(() => defaultRange(), []);
  const [startInput, setStartInput] = useState(initial.start);
  const [endInput, setEndInput] = useState(initial.end);
  const [range, setRange] = useState(initial);

  const [data, setData] = useState<StoreComparisonResult | null>(null);
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
        const result = await getStoreComparison(startISO, endISO);
        if (!cancelled) setData(result);
      } catch (err) {
        console.error('load store comparison', err);
        if (!cancelled) setError('Impossible de charger le comparatif des boutiques pour cette période.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [range]);

  const applyRange = () => {
    if (!startInput || !endInput) return;
    const s = startInput <= endInput ? startInput : endInput;
    const e = startInput <= endInput ? endInput : startInput;
    setStartInput(s);
    setEndInput(e);
    setRange({ start: s, end: e });
  };

  const resetRange = () => {
    const r = defaultRange();
    setStartInput(r.start);
    setEndInput(r.end);
    setRange(r);
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <SecondaryButton href="/admin" className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.18em]">
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour
        </SecondaryButton>
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-300">Direction • Supervision</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-white">
            <Scale className="h-6 w-6 text-[#D4AF37]" />
            Comparatif Dakar vs Abidjan
          </h1>
        </div>
      </div>

      {/* Sélecteur de période */}
      <div className="mb-6 rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-2xl shadow-slate-950/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.20em] text-slate-400">Période analysée</p>
            <h2 className="mt-2 text-lg font-bold text-white">
              {data ? `${formatDateLabel(data.startDate)} → ${formatDateLabel(data.endDate)}` : 'Chargement…'}
            </h2>
          </div>

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
            <SecondaryButton onClick={resetRange} className="text-xs">
              7 derniers jours
            </SecondaryButton>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-3xl border border-rose-500/40 bg-rose-500/10 p-5 text-sm text-rose-200">{error}</div>
      ) : null}

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-96 animate-pulse rounded-3xl border border-slate-800 bg-slate-900/70" />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            {STORE_KEYS.map((key) => (
              <StoreCard key={key} store={key} metrics={data.stores[key]} />
            ))}
          </div>

          <ComparisonBar data={data} />

          {(data.unassignedExpenses.count > 0 || data.unassignedSales.count > 0) && (
            <div className="mt-6 rounded-3xl border border-amber-500/30 bg-amber-500/5 p-5 text-[12px] leading-relaxed text-amber-200/90">
              <p className="mb-2 flex items-center gap-2 font-bold uppercase tracking-[0.16em] text-amber-300">
                <AlertTriangle className="h-4 w-4" />
                Données non rattachées à une boutique
              </p>
              {data.unassignedExpenses.count > 0 && (
                <p>
                  <strong>{data.unassignedExpenses.count}</strong> dépense(s) totalisant{' '}
                  <strong>{formatMoney(data.unassignedExpenses.total)}</strong> ont un{' '}
                  <code>store_city</code> vide ou hors DAKAR/ABIDJAN
                  {data.unassignedExpenses.labels.length > 0
                    ? ` (${data.unassignedExpenses.labels.join(', ')})`
                    : ''}
                  . Elles ne sont imputées à <em>aucune</em> boutique ci-dessus.
                </p>
              )}
              {data.unassignedSales.count > 0 && (
                <p className="mt-1">
                  <strong>{data.unassignedSales.count}</strong> vente(s) ({formatMoney(data.unassignedSales.revenue)})
                  ont un <code>store_name</code> hors DAKAR/ABIDJAN
                  {data.unassignedSales.labels.length > 0 ? ` (${data.unassignedSales.labels.join(', ')})` : ''} et sont
                  exclues du comparatif.
                </p>
              )}
            </div>
          )}
        </>
      ) : null}
    </main>
  );
}

function StoreCard({ store, metrics }: { store: StoreKey; metrics: StoreComparisonMetrics }) {
  const meta = STORE_META[store];
  const netPositive = metrics.netResult >= 0;

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
      <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 className="text-lg font-bold text-white">{meta.label}</h3>
        <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
          {metrics.salesCount} ventes
        </span>
      </div>

      <div className="space-y-2.5 text-sm">
        <Row label="Chiffre d'affaires" value={formatMoney(metrics.totalRevenue)} strong />
        <Row label="Panier moyen" value={formatMoney(metrics.averageBasket)} />
        <Row
          label="Marge brute"
          value={formatMoney(metrics.grossMargin)}
          estimated={metrics.grossMarginIsEstimated}
        />
        <Row
          label="Taux de marge"
          value={`${metrics.grossMarginRate.toFixed(1)} %`}
          estimated={metrics.grossMarginIsEstimated}
        />
        <Row label="Coût des marchandises vendues" value={`- ${formatMoney(metrics.costOfGoodsSold)}`} />
        <Row label="Dépenses (lmb_expenses)" value={`- ${formatMoney(metrics.totalExpenses)}`} />
        <div
          className={`flex items-center justify-between rounded-2xl border px-3 py-2.5 ${
            netPositive
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
          }`}
        >
          <span className="flex items-center gap-1.5 font-bold">
            {netPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            Résultat net
            {metrics.grossMarginIsEstimated ? <EstimationBadge /> : null}
          </span>
          <span className="font-black">{formatMoney(metrics.netResult)}</span>
        </div>
      </div>

      {metrics.grossMarginIsEstimated ? (
        <p className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] leading-snug text-amber-200/90">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {metrics.estimatedRevenueShare.toFixed(0)} % du chiffre d&apos;affaires de cette boutique repose sur une{' '}
            <strong>estimation de coût (65 % du prix de vente)</strong>, faute de coût d&apos;achat réel. Renseignez le coût
            d&apos;achat des produits dans <strong>Admin → Grille Tarifaire</strong> pour une marge exacte.
          </span>
        </p>
      ) : null}

      <div className="mt-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
          Top produits vendus (quantité)
        </p>
        {metrics.topProducts.length === 0 ? (
          <p className="text-xs text-slate-500">Aucune vente détaillée sur la période.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                  <th className="py-2">Produit</th>
                  <th className="py-2 text-right">Qté</th>
                  <th className="py-2 text-right">CA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {metrics.topProducts.map((p, i) => (
                  <tr key={`${p.name}-${p.sku ?? i}`} className="text-slate-200">
                    <td className="py-2 pr-2">
                      {p.name}
                      {p.sku ? <span className="ml-1 text-[10px] text-slate-500">{p.sku}</span> : null}
                    </td>
                    <td className="py-2 text-right font-mono text-slate-100">{p.quantity.toLocaleString('fr-FR')}</td>
                    <td className="py-2 text-right font-mono text-slate-300">{formatMoney(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ComparisonBar({ data }: { data: StoreComparisonResult }) {
  const rows: Array<{ label: string; pick: (m: StoreComparisonMetrics) => number; money?: boolean; suffix?: string }> = [
    { label: "Chiffre d'affaires", pick: (m) => m.totalRevenue, money: true },
    { label: 'Nombre de ventes', pick: (m) => m.salesCount },
    { label: 'Panier moyen', pick: (m) => m.averageBasket, money: true },
    { label: 'Marge brute', pick: (m) => m.grossMargin, money: true },
    { label: 'Dépenses', pick: (m) => m.totalExpenses, money: true },
    { label: 'Résultat net', pick: (m) => m.netResult, money: true },
  ];

  const fmt = (v: number, money?: boolean) => (money ? formatMoney(v) : v.toLocaleString('fr-FR'));

  return (
    <div className="mt-6 overflow-x-auto rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
      <h3 className="mb-4 text-lg font-bold text-white">Synthèse côte à côte</h3>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-[10px] uppercase tracking-[0.16em] text-slate-500">
            <th className="py-2">Métrique</th>
            <th className="py-2 text-right">{STORE_META.DAKAR.label}</th>
            <th className="py-2 text-right">{STORE_META.ABIDJAN.label}</th>
            <th className="py-2 text-right">Écart (Dakar − Abidjan)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {rows.map((r) => {
            const dk = r.pick(data.stores.DAKAR);
            const ab = r.pick(data.stores.ABIDJAN);
            const delta = dk - ab;
            return (
              <tr key={r.label} className="text-slate-200">
                <td className="py-2.5">{r.label}</td>
                <td className="py-2.5 text-right font-mono">{fmt(dk, r.money)}</td>
                <td className="py-2.5 text-right font-mono">{fmt(ab, r.money)}</td>
                <td
                  className={`py-2.5 text-right font-mono ${
                    delta > 0 ? 'text-emerald-300' : delta < 0 ? 'text-rose-300' : 'text-slate-400'
                  }`}
                >
                  {delta > 0 ? '+' : ''}
                  {fmt(delta, r.money)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {(data.stores.DAKAR.grossMarginIsEstimated || data.stores.ABIDJAN.grossMarginIsEstimated) && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5" />
          Marge brute / résultat net partiellement estimés (voir détail par boutique).
        </p>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  strong = false,
  estimated = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  estimated?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/50 px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-slate-300">
        {label}
        {estimated ? <EstimationBadge /> : null}
      </span>
      <span className={strong ? 'font-black text-white' : 'font-bold text-white'}>{value}</span>
    </div>
  );
}
