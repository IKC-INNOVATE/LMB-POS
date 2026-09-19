'use client';

import PrimaryButton from '@/components/ui/PrimaryButton';
import SecondaryButton from '@/components/ui/SecondaryButton';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CalendarRange,
  Download,
  DollarSign,
  FileDown,
  Printer,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { getFinancialOverview, type FinancialOverview, type FinancialPeriodFilter } from '@/lib/services/finance';
import { type StoreKey } from '@/lib/services/store-comparison';
import { downloadFinanceReportPdf } from '@/lib/pdf/finance-report-pdf';

const PERIOD_OPTIONS: Array<{ value: FinancialPeriodFilter; label: string }> = [
  { value: 'TODAY', label: 'Aujourd’hui' },
  { value: 'LAST_7_DAYS', label: '7 derniers jours' },
  { value: 'THIS_MONTH', label: 'Ce mois-ci' },
];

export type StoreFilter = StoreKey | 'ALL';

const STORE_OPTIONS: Array<{ value: StoreFilter; label: string }> = [
  { value: 'ALL', label: 'Toutes les boutiques' },
  { value: 'DAKAR', label: 'Dakar' },
  { value: 'ABIDJAN', label: 'Abidjan' },
];

const STORE_LABELS: Record<StoreFilter, string> = {
  ALL: 'Toutes les boutiques (Dakar + Abidjan)',
  DAKAR: 'Dakar',
  ABIDJAN: 'Abidjan',
};

const formatMoney = (value: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));

const formatDate = (date: string | Date) =>
  new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const getPeriodRange = (period: FinancialPeriodFilter) => {
  const now = new Date();
  const endDate = new Date(now);
  endDate.setHours(23, 59, 59, 999);

  const startDate = new Date(now);

  if (period === 'TODAY') {
    startDate.setHours(0, 0, 0, 0);
  } else if (period === 'LAST_7_DAYS') {
    startDate.setDate(now.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);
  } else {
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);
  }

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
};

export default function FinancePage() {
  const [period, setPeriod] = useState<FinancialPeriodFilter>('TODAY');
  const [store, setStore] = useState<StoreFilter>('ALL');
  const [overview, setOverview] = useState<FinancialOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadOverview = async () => {
      setLoading(true);
      setError(null);

      try {
        const range = getPeriodRange(period);
        const result = await getFinancialOverview(range.startDate, range.endDate, store === 'ALL' ? null : store);
        setOverview(result);
      } catch (err) {
        console.error('load financial overview', err);
        setError('Impossible de charger la performance financière pour cette période.');
      } finally {
        setLoading(false);
      }
    };

    loadOverview();
  }, [period, store]);

  const metrics = useMemo(() => {
    if (!overview) {
      return {
        totalRevenue: 0,
        cash: 0,
        mobileMoney: 0,
        totalExpenses: 0,
        theoreticalProfit: 0,
      };
    }

    const theoreticalProfit = Math.max(0, overview.grossMarginEstimate - overview.totalCashExpenses);

    return {
      totalRevenue: overview.totalRevenue,
      cash: overview.paymentBreakdown.cash,
      mobileMoney: overview.paymentBreakdown.mobile_money,
      totalExpenses: overview.totalCashExpenses,
      theoreticalProfit,
    };
  }, [overview]);

  const exportCsv = () => {
    if (!overview) return;

    const rows = [
      ['Boutique', STORE_LABELS[store]],
      ['Période', `${formatDate(overview.startDate)} → ${formatDate(overview.endDate)}`],
      ['Chiffre d’affaires total', String(overview.totalRevenue)],
      ['Nombre de ventes', String(overview.salesCount)],
      ['Panier moyen', String(overview.averageBasket)],
      ['Espèces', String(overview.paymentBreakdown.cash)],
      ['Mobile Money / CB', String(overview.paymentBreakdown.mobile_money)],
      ['Paiements mixtes', String(overview.paymentBreakdown.mixed)],
      ['Acomptes', String(overview.paymentBreakdown.deposit)],
      ['Dépenses de caisse', String(overview.totalCashExpenses)],
      [overview.grossMarginIsEstimated ? 'Marge brute (partiellement estimée)' : 'Marge brute réelle', String(overview.grossMarginEstimate)],
      ['Part du CA à marge estimée (%)', overview.estimatedRevenueShare.toFixed(1)],
      ['Bénéfice théorique', String(Math.max(0, overview.grossMarginEstimate - overview.totalCashExpenses))],
    ];

    const csvContent = rows.map((row) => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `lmb-finance-${period.toLowerCase()}-${store.toLowerCase()}.csv`);
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    exportCsv();
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const handleDownloadPdf = () => {
    if (!overview) return;
    downloadFinanceReportPdf(overview, period, store);
  };

  return (
    <div className="min-h-screen bg-[#0A0F1D] text-slate-100 lmb-finance">
      <header className="border-b border-slate-800 bg-slate-900/90 px-6 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <SecondaryButton href="/admin" className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.18em]">
              <ArrowLeft className="h-3.5 w-3.5" />
              Retour
            </SecondaryButton>
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-300">ERP • Comptabilité</p>
              <h1 className="mt-1 text-2xl font-bold text-white">Finance & Reporting</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <SecondaryButton onClick={exportCsv} className="inline-flex items-center gap-2 text-xs">
              <Download className="h-3.5 w-3.5" />
              CSV
            </SecondaryButton>
            <SecondaryButton onClick={exportExcel} className="inline-flex items-center gap-2 text-xs">
              <BarChart3 className="h-3.5 w-3.5" />
              Excel
            </SecondaryButton>
            <SecondaryButton onClick={handlePrint} className="inline-flex items-center gap-2 text-xs">
              <Printer className="h-3.5 w-3.5" />
              Impression
            </SecondaryButton>
            <SecondaryButton onClick={handleDownloadPdf} className="inline-flex items-center gap-2 text-xs">
              <FileDown className="h-3.5 w-3.5" />
              PDF
            </SecondaryButton>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 lmb-print-area">
        <div className="mb-6 rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-2xl shadow-slate-950/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.20em] text-slate-400">Période</p>
              <h2 className="mt-2 text-xl font-bold text-white">
                {overview ? `${formatDate(overview.startDate)} → ${formatDate(overview.endDate)}` : 'Chargement…'}
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Boutique : <span className="font-semibold text-slate-200">{STORE_LABELS[store]}</span>
              </p>
            </div>

            <div className="flex flex-col items-start gap-3 lmb-print-hide lg:items-end">
              <div className="flex flex-wrap gap-2">
                {PERIOD_OPTIONS.map((option) =>
                  period === option.value ? (
                    <PrimaryButton key={option.value} onClick={() => setPeriod(option.value)} className="text-xs">
                      {option.label}
                    </PrimaryButton>
                  ) : (
                    <SecondaryButton key={option.value} onClick={() => setPeriod(option.value)} className="text-xs">
                      {option.label}
                    </SecondaryButton>
                  )
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {STORE_OPTIONS.map((option) =>
                  store === option.value ? (
                    <PrimaryButton key={option.value} onClick={() => setStore(option.value)} className="text-xs">
                      {option.label}
                    </PrimaryButton>
                  ) : (
                    <SecondaryButton key={option.value} onClick={() => setStore(option.value)} className="text-xs">
                      {option.label}
                    </SecondaryButton>
                  )
                )}
              </div>
            </div>
          </div>
        </div>

        {error ? (
          <div className="rounded-3xl border border-rose-500/40 bg-rose-500/10 p-5 text-sm text-rose-200">{error}</div>
        ) : null}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-32 animate-pulse rounded-3xl border border-slate-800 bg-slate-900/70" />
            ))}
          </div>
        ) : overview ? (
          <>
            <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard
                label="Total CA"
                value={formatMoney(metrics.totalRevenue)}
                accent="cyan"
                icon={<DollarSign className="h-5 w-5" />}
              />
              <MetricCard
                label="Espèces"
                value={formatMoney(metrics.cash)}
                accent="emerald"
                icon={<Wallet className="h-5 w-5" />}
              />
              <MetricCard
                label="Mobile Money"
                value={formatMoney(metrics.mobileMoney)}
                accent="violet"
                icon={<TrendingUp className="h-5 w-5" />}
              />
              <MetricCard
                label="Total Dépenses"
                value={formatMoney(metrics.totalExpenses)}
                accent="rose"
                icon={<CalendarRange className="h-5 w-5" />}
              />
              <MetricCard
                label="Bénéfice Théorique"
                value={formatMoney(metrics.theoreticalProfit)}
                accent="amber"
                icon={<BarChart3 className="h-5 w-5" />}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
              <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">Ventilation des paiements</h3>
                  <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
                    {overview.salesCount} ventes
                  </span>
                </div>

                <div className="space-y-4">
                  <PaymentRow label="Espèces" value={overview.paymentBreakdown.cash} total={overview.totalRevenue} tone="emerald" />
                  <PaymentRow label="Mobile Money / CB" value={overview.paymentBreakdown.mobile_money} total={overview.totalRevenue} tone="cyan" />
                  <PaymentRow label="Paiements mixtes" value={overview.paymentBreakdown.mixed} total={overview.totalRevenue} tone="violet" />
                  <PaymentRow label="Acomptes" value={overview.paymentBreakdown.deposit} total={overview.totalRevenue} tone="amber" />
                  <PaymentRow label="Autres" value={overview.paymentBreakdown.other} total={overview.totalRevenue} tone="slate" />
                </div>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
                <h3 className="mb-4 text-lg font-bold text-white">Synthèse financière</h3>
                <div className="space-y-3 text-sm">
                  <SummaryRow label="CA total" value={formatMoney(overview.totalRevenue)} />
                  <SummaryRow label="Panier moyen" value={formatMoney(overview.averageBasket)} />
                  <SummaryRow
                    label={overview.grossMarginIsEstimated ? 'Marge brute (partiellement estimée)' : 'Marge brute réelle'}
                    value={formatMoney(overview.grossMarginEstimate)}
                    estimated={overview.grossMarginIsEstimated}
                  />
                  <SummaryRow
                    label="Taux de marge"
                    value={`${overview.grossMarginRate.toFixed(1)} %`}
                    estimated={overview.grossMarginIsEstimated}
                  />
                  <SummaryRow label="Dépenses de caisse" value={formatMoney(overview.totalCashExpenses)} />
                  <SummaryRow
                    label="Bénéfice théorique"
                    value={formatMoney(Math.max(0, overview.grossMarginEstimate - overview.totalCashExpenses))}
                    estimated={overview.grossMarginIsEstimated}
                  />
                </div>
                {overview.grossMarginIsEstimated ? (
                  <p className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] leading-snug text-amber-200/90">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      {overview.estimatedRevenueShare.toFixed(0)} % du chiffre d&apos;affaires repose sur une
                      <strong> estimation de coût (65 % du prix de vente)</strong>, faute de coût d&apos;achat réel.
                      Renseignez le coût d&apos;achat des produits dans <strong>Admin → Catalogue des Soins</strong> pour une marge exacte.
                    </span>
                  </p>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}

function MetricCard({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string;
  accent: 'cyan' | 'emerald' | 'violet' | 'rose' | 'amber';
  icon: React.ReactNode;
}) {
  const accentMap = {
    cyan: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200',
    emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    violet: 'border-violet-500/30 bg-violet-500/10 text-violet-200',
    rose: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  } as const;

  return (
    <div className={`rounded-3xl border p-5 shadow-lg ${accentMap[accent]}`}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-80">{label}</p>
        <div className="rounded-xl bg-slate-950/40 p-2">{icon}</div>
      </div>
      <p className="mt-4 text-2xl font-black tracking-tight text-white">{value}</p>
    </div>
  );
}

function PaymentRow({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: 'emerald' | 'cyan' | 'violet' | 'amber' | 'slate';
}) {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  const toneMap = {
    emerald: 'bg-emerald-400',
    cyan: 'bg-cyan-400',
    violet: 'bg-violet-400',
    amber: 'bg-amber-400',
    slate: 'bg-slate-400',
  } as const;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-200">{label}</span>
        <span className="font-bold text-white">{formatMoney(value)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${toneMap[tone]}`} style={{ width: `${Math.min(percentage, 100)}%` }} />
      </div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{percentage.toFixed(1)}% du CA</p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  estimated = false,
}: {
  label: string;
  value: string;
  estimated?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-slate-800 bg-slate-950/50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-slate-300">{label}</span>
        <span className="shrink-0 font-bold text-white">{value}</span>
      </div>
      {estimated ? (
        <span
          title="Coût d'achat réel non renseigné pour certains produits : marge calculée avec une estimation de coût à 65 % du prix de vente."
          className="inline-flex w-fit items-center gap-1 self-start rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300"
        >
          <AlertTriangle className="h-3 w-3" />
          estimation
        </span>
      ) : null}
    </div>
  );
}
