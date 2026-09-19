import { jsPDF } from 'jspdf';
import type { FinancialOverview } from '@/lib/services/finance';

// Même technique que lib/pdf/payslip-pdf.ts : toLocaleString('fr-FR') insère une
// espace fine insécable (U+202F) que la police standard jsPDF/Helvetica affiche
// mal (caractère parasite). On la remplace par une espace normale.
const fmt = (n: number) => {
  const formatted = Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
  return formatted + ' FCFA';
};

const fmtDate = (date: string | Date) =>
  new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

const PERIOD_LABELS: Record<string, string> = {
  TODAY: "Aujourd'hui",
  LAST_7_DAYS: '7 derniers jours',
  THIS_MONTH: 'Ce mois-ci',
};

const STORE_LABELS: Record<string, string> = {
  ALL: 'Toutes les boutiques (Dakar + Abidjan)',
  DAKAR: 'Dakar',
  ABIDJAN: 'Abidjan',
};

/**
 * Génère le PDF du rapport financier (format A4) et déclenche le téléchargement.
 *
 * Reprend exactement les chiffres déjà calculés et affichés sur l'écran
 * Finance & Reporting (voir lib/services/finance.ts) : ce fichier ne recalcule
 * rien, il met simplement en forme un rapport déjà à l'écran, comme le fait
 * lib/pdf/payslip-pdf.ts pour les bulletins de paie.
 *
 * @param storeFilter 'ALL' (par défaut) | 'DAKAR' | 'ABIDJAN' — doit correspondre
 *   à la boutique déjà sélectionnée pour calculer `overview` (voir page Finance).
 */
export function downloadFinanceReportPdf(overview: FinancialOverview, periodFilter: string, storeFilter: string = 'ALL') {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const left = 18;
  const right = 192;
  let y = 20;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('LUXURY MAGIC BUTTER SKIN', left, y);
  y += 6;
  doc.setFontSize(11);
  doc.text('RAPPORT FINANCIER', left, y);
  y += 10;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  // Note : on évite la flèche "→" ici — ce caractère n'existe pas dans le jeu
  // de caractères standard (WinAnsi) de la police Helvetica intégrée à jsPDF ;
  // son usage faisait planter le rendu de toute la ligne (lettres espacées,
  // caractère "!" à la place de la flèche). "du ... au ..." est du texte
  // standard, donc s'affiche proprement.
  doc.text(`Période (${PERIOD_LABELS[periodFilter] ?? periodFilter}) : du ${fmtDate(overview.startDate)} au ${fmtDate(overview.endDate)}`, left, y);
  y += 5;
  doc.text(`Boutique : ${STORE_LABELS[storeFilter] ?? storeFilter}`, left, y);
  y += 5;
  doc.text(`Édité le : ${fmtDate(new Date())}`, left, y);
  y += 6;
  doc.line(left, y, right, y);
  y += 8;

  const row = (label: string, value: string, bold = false) => {
    if (bold) doc.setFont('helvetica', 'bold');
    doc.text(label, left, y);
    doc.text(value, right, y, { align: 'right' });
    if (bold) doc.setFont('helvetica', 'normal');
    y += 6;
  };

  doc.setFont('helvetica', 'bold');
  doc.text('Chiffres clés', left, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  row('Chiffre d’affaires total', fmt(overview.totalRevenue));
  row('Nombre de ventes', String(overview.salesCount));
  row('Panier moyen', fmt(overview.averageBasket));
  row('Dépenses de caisse', fmt(overview.totalCashExpenses));
  row('Charges d’exploitation', fmt(overview.totalOperatingCharges));
  row(
    'Bénéfice théorique',
    fmt(Math.max(0, overview.grossMarginEstimate - overview.totalCashExpenses - overview.totalOperatingCharges)),
    true,
  );
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.text('Ventilation des paiements', left, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  const pct = (value: number) => (overview.totalRevenue > 0 ? `${((value / overview.totalRevenue) * 100).toFixed(1)} %` : '0.0 %');
  row('Espèces', `${fmt(overview.paymentBreakdown.cash)}  (${pct(overview.paymentBreakdown.cash)})`);
  row('Mobile Money / CB', `${fmt(overview.paymentBreakdown.mobile_money)}  (${pct(overview.paymentBreakdown.mobile_money)})`);
  row('Paiements mixtes', `${fmt(overview.paymentBreakdown.mixed)}  (${pct(overview.paymentBreakdown.mixed)})`);
  row('Acomptes', `${fmt(overview.paymentBreakdown.deposit)}  (${pct(overview.paymentBreakdown.deposit)})`);
  row('Autres', `${fmt(overview.paymentBreakdown.other)}  (${pct(overview.paymentBreakdown.other)})`);
  doc.line(left, y, right, y);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.text('Synthèse financière', left, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  row('CA total', fmt(overview.totalRevenue));
  row('Panier moyen', fmt(overview.averageBasket));
  row(overview.grossMarginIsEstimated ? 'Marge brute (partiellement estimée)' : 'Marge brute réelle', fmt(overview.grossMarginEstimate));
  row('Taux de marge', `${overview.grossMarginRate.toFixed(1)} %`);
  row('Dépenses de caisse', fmt(overview.totalCashExpenses));
  row('Charges d’exploitation', fmt(overview.totalOperatingCharges));
  row(
    'Bénéfice théorique',
    fmt(Math.max(0, overview.grossMarginEstimate - overview.totalCashExpenses - overview.totalOperatingCharges)),
    true,
  );
  y += 4;

  if (overview.grossMarginIsEstimated) {
    doc.setFontSize(8);
    doc.setTextColor(120);
    const note = `${overview.estimatedRevenueShare.toFixed(0)} % du chiffre d'affaires repose sur une estimation de coût`
      + ' (65 % du prix de vente), faute de coût d’achat réel renseigné pour certains produits.';
    const lines = doc.splitTextToSize(note, right - left);
    doc.text(lines, left, y);
    y += lines.length * 4 + 2;
    doc.setTextColor(0);
  }

  doc.setFontSize(7.5);
  doc.setTextColor(120);
  doc.text('Document généré automatiquement à partir des données enregistrées à la date d’édition.', left, 285);

  const periodTag = (PERIOD_LABELS[periodFilter] ?? periodFilter).toLowerCase().replace(/\s+/g, '-');
  const storeTag = (STORE_LABELS[storeFilter] ?? storeFilter).toLowerCase().replace(/\s+/g, '-').replace(/[()+]/g, '');
  doc.save(`lmb-rapport-finance-${storeTag}-${periodTag}.pdf`);
}
