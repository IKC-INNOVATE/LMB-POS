import { jsPDF } from 'jspdf';
import type { FinancialOverview } from '@/lib/services/finance';

// =====================================================================
// Rapport financier PDF — mise en forme "professionnelle" (couleurs,
// tableaux, mise en page) inspirée d'un modèle de rapport trimestriel
// fourni par Ibrahim (27/09). Reprend la charte visuelle déjà utilisée
// dans l'application (voir app/globals.css : --lmb-ink, --lmb-sage-*,
// --lmb-amber-*) plutôt que d'inventer de nouvelles couleurs, pour que
// le PDF ressemble à l'app.
//
// Ce fichier ne recalcule rien : il met en forme les chiffres déjà
// calculés et affichés sur l'écran Finance & Reporting (voir
// lib/services/finance.ts), comme avant.
// =====================================================================

type RGB = [number, number, number];

const COLOR = {
  ink: [39, 36, 31] as RGB, // --lmb-ink (texte principal, fond des en-têtes de tableau)
  inkSoft: [117, 113, 106] as RGB, // --lmb-ink-soft (texte secondaire)
  border: [225, 220, 210] as RGB, // proche de --lmb-border, légèrement assombri pour rester visible à l'impression
  rowAlt: [244, 240, 231] as RGB, // ligne alternée beige clair (style "tableau bancaire")
  gold: [184, 134, 11] as RGB, // couleur de marque LMB (#D4AF37 assombri pour rester lisible sur fond blanc)
  sage: [62, 107, 76] as RGB, // --lmb-sage-700 (valeurs positives, bénéfice)
  sageTint: [231, 241, 231] as RGB, // --lmb-sage-100 (fond de la ligne "Bénéfice théorique")
  amber: [182, 122, 32] as RGB, // --lmb-amber-600 (avertissement estimation)
  amberTint: [251, 237, 214] as RGB, // --lmb-amber-100
  white: [255, 255, 255] as RGB,
};

// Même technique que lib/pdf/payslip-pdf.ts : toLocaleString('fr-FR') insère une
// espace fine insécable (U+202F) que les polices standard intégrées à jsPDF
// affichent mal (caractère parasite). On la remplace par une espace normale.
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

type TableColumn = { header: string; width: number; align?: 'left' | 'right' };
type TableRow = { cells: string[]; bold?: boolean; valueColor?: RGB; rowBg?: RGB };

/**
 * Dessine un tableau "à la main" (rectangles + texte positionné), sans
 * dépendance externe — même approche que le reste du fichier. En-tête
 * fond sombre + texte blanc, lignes alternées beige clair, une ligne
 * peut être mise en avant (fond + couleur de valeur) pour le total.
 * Retourne la position Y juste après le tableau.
 */
function drawTable(doc: jsPDF, x: number, y: number, columns: TableColumn[], rows: TableRow[]): number {
  const headerHeight = 7.5;
  const rowHeight = 6.6;
  const tableWidth = columns.reduce((sum, c) => sum + c.width, 0);

  doc.setFillColor(...COLOR.ink);
  doc.rect(x, y, tableWidth, headerHeight, 'F');
  doc.setTextColor(...COLOR.white);
  doc.setFont('times', 'bold');
  doc.setFontSize(8.5);
  let cx = x;
  columns.forEach((col) => {
    const align = col.align === 'right' ? 'right' : 'left';
    const tx = align === 'right' ? cx + col.width - 2.5 : cx + 2.5;
    doc.text(col.header, tx, y + headerHeight - 2.6, { align });
    cx += col.width;
  });

  let ry = y + headerHeight;
  rows.forEach((row, i) => {
    const bg = row.rowBg ?? (i % 2 === 1 ? COLOR.rowAlt : COLOR.white);
    doc.setFillColor(...bg);
    doc.rect(x, ry, tableWidth, rowHeight, 'F');

    doc.setFont('times', row.bold ? 'bold' : 'normal');
    doc.setFontSize(8.5);

    let cx2 = x;
    row.cells.forEach((cell, ci) => {
      const col = columns[ci];
      const align = col.align === 'right' ? 'right' : 'left';
      const isLastCol = ci === row.cells.length - 1;
      doc.setTextColor(...(isLastCol && row.valueColor ? row.valueColor : COLOR.ink));
      const tx = align === 'right' ? cx2 + col.width - 2.5 : cx2 + 2.5;
      doc.text(cell, tx, ry + rowHeight - 2.2, { align });
      cx2 += col.width;
    });

    ry += rowHeight;
  });

  doc.setDrawColor(...COLOR.border);
  doc.setLineWidth(0.25);
  doc.rect(x, y, tableWidth, ry - y);

  doc.setFont('times', 'normal');
  doc.setTextColor(...COLOR.ink);

  return ry;
}

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
  const tableWidth = right - left;
  let y = 20;

  const theoreticalProfit = Math.max(
    0,
    overview.grossMarginEstimate - overview.totalCashExpenses - overview.totalOperatingCharges - overview.totalPayroll,
  );
  const pct = (value: number) => (overview.totalRevenue > 0 ? `${((value / overview.totalRevenue) * 100).toFixed(1)} %` : '0.0 %');

  // ---- En-tête / bandeau de marque ----
  doc.setFontSize(16);
  doc.setFont('times', 'bold');
  doc.setTextColor(...COLOR.gold);
  doc.text('LUXURY MAGIC BUTTER SKIN', left, y);
  y += 6.5;

  doc.setFontSize(11);
  doc.setTextColor(...COLOR.ink);
  doc.text('RAPPORT FINANCIER', left, y);
  y += 3.5;

  doc.setDrawColor(...COLOR.gold);
  doc.setLineWidth(0.6);
  doc.line(left, y, right, y);
  y += 7;

  // ---- Bloc méta-informations (Période / Boutique / Édité le) ----
  // Encadré avec libellés en gras + texte agrandi, en remplacement du simple
  // texte gris clair sans structure d'origine — demande d'Ibrahim (22/09) :
  // "corriges ces écritures ainsi que la police afin qu'ils soient mieux
  // lisibles et toujours pro". Même logique de boîte que l'encart
  // d'avertissement plus bas (fond teinté + bordure), mais en neutre.
  const metaRows: Array<[string, string]> = [
    ['Période', `(${PERIOD_LABELS[periodFilter] ?? periodFilter}) du ${fmtDate(overview.startDate)} au ${fmtDate(overview.endDate)}`],
    ['Boutique', STORE_LABELS[storeFilter] ?? storeFilter],
    ['Édité le', fmtDate(new Date())],
  ];
  const metaLabelWidth = 26;
  const metaLineHeight = 6.2;
  const metaBoxHeight = metaRows.length * metaLineHeight + 5;

  doc.setFillColor(...COLOR.rowAlt);
  doc.setDrawColor(...COLOR.border);
  doc.setLineWidth(0.3);
  doc.rect(left, y, tableWidth, metaBoxHeight, 'FD');

  doc.setFontSize(9.5);
  let metaY = y + 6.8;
  // Note : on évite la flèche "→" ici — ce caractère n'existe pas dans le jeu
  // de caractères standard (WinAnsi) des polices intégrées à jsPDF ;
  // "du ... au ..." est du texte standard, donc s'affiche proprement partout.
  metaRows.forEach(([label, value]) => {
    doc.setFont('times', 'bold');
    doc.setTextColor(...COLOR.ink);
    doc.text(`${label} :`, left + 4, metaY);
    doc.setFont('times', 'normal');
    doc.setTextColor(...COLOR.ink);
    doc.text(value, left + 4 + metaLabelWidth, metaY);
    metaY += metaLineHeight;
  });

  doc.setFont('times', 'normal');
  doc.setTextColor(...COLOR.ink);
  y += metaBoxHeight + 8;

  // ---- Tableau : Synthèse financière ----
  doc.setFont('times', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...COLOR.ink);
  doc.text('1. Synthèse financière', left, y);
  y += 5;

  const synthColumns: TableColumn[] = [
    { header: 'Indicateur', width: tableWidth * 0.62 },
    { header: 'Valeur', width: tableWidth * 0.38, align: 'right' },
  ];

  const marginLabel = overview.grossMarginIsEstimated ? 'Marge brute (partiellement estimée)' : 'Marge brute réelle';

  const synthRows: TableRow[] = [
    { cells: ['Chiffre d’affaires total', fmt(overview.totalRevenue)] },
    { cells: ['Nombre de ventes', String(overview.salesCount)] },
    { cells: ['Panier moyen', fmt(overview.averageBasket)] },
    { cells: [marginLabel, fmt(overview.grossMarginEstimate)] },
    { cells: ['Taux de marge', `${overview.grossMarginRate.toFixed(1)} %`] },
    { cells: ['Dépenses de caisse', fmt(overview.totalCashExpenses)] },
    { cells: ['Charges d’exploitation', fmt(overview.totalOperatingCharges)] },
    { cells: ['Masse salariale', fmt(overview.totalPayroll)] },
    {
      cells: ['Bénéfice théorique', fmt(theoreticalProfit)],
      bold: true,
      valueColor: COLOR.sage,
      rowBg: COLOR.sageTint,
    },
  ];

  y = drawTable(doc, left, y, synthColumns, synthRows) + 8;

  // ---- Tableau : Ventilation des paiements ----
  doc.setFont('times', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...COLOR.ink);
  doc.text('2. Ventilation des paiements', left, y);
  y += 5;

  const paymentColumns: TableColumn[] = [
    { header: 'Mode de paiement', width: tableWidth * 0.42 },
    { header: 'Montant', width: tableWidth * 0.33, align: 'right' },
    { header: 'Part du CA', width: tableWidth * 0.25, align: 'right' },
  ];

  const paymentRows: TableRow[] = [
    { cells: ['Espèces', fmt(overview.paymentBreakdown.cash), pct(overview.paymentBreakdown.cash)] },
    { cells: ['Mobile Money / CB', fmt(overview.paymentBreakdown.mobile_money), pct(overview.paymentBreakdown.mobile_money)] },
    { cells: ['Paiements mixtes', fmt(overview.paymentBreakdown.mixed), pct(overview.paymentBreakdown.mixed)] },
    { cells: ['Acomptes', fmt(overview.paymentBreakdown.deposit), pct(overview.paymentBreakdown.deposit)] },
    { cells: ['Autres', fmt(overview.paymentBreakdown.other), pct(overview.paymentBreakdown.other)] },
    { cells: ['TOTAL', fmt(overview.totalRevenue), '100.0 %'], bold: true, rowBg: COLOR.rowAlt },
  ];

  y = drawTable(doc, left, y, paymentColumns, paymentRows) + 8;

  // ---- Encart d'avertissement (marge partiellement estimée) ----
  if (overview.grossMarginIsEstimated) {
    const note = `${overview.estimatedRevenueShare.toFixed(0)} % du chiffre d'affaires repose sur une estimation de coût`
      + ' (65 % du prix de vente), faute de coût d’achat réel renseigné pour certains produits.';
    doc.setFontSize(8);
    doc.setFont('times', 'normal');
    const lines = doc.splitTextToSize(note, tableWidth - 8);
    const boxHeight = lines.length * 4 + 5;

    doc.setFillColor(...COLOR.amberTint);
    doc.setDrawColor(...COLOR.amber);
    doc.setLineWidth(0.3);
    doc.rect(left, y, tableWidth, boxHeight, 'FD');

    doc.setTextColor(...COLOR.amber);
    doc.text(lines, left + 4, y + 5);
    doc.setTextColor(...COLOR.ink);
    y += boxHeight + 6;
  }

  // ---- Pied de page ----
  doc.setFontSize(7.5);
  doc.setFont('times', 'normal');
  doc.setTextColor(...COLOR.inkSoft);
  doc.text('Document généré automatiquement à partir des données enregistrées à la date d’édition.', left, 282);
  doc.setDrawColor(...COLOR.border);
  doc.setLineWidth(0.2);
  doc.line(left, 285, right, 285);
  doc.text('LUXURY MAGIC BUTTER SKIN — Rapport financier', left, 289);
  doc.text('Page 1 / 1', right, 289, { align: 'right' });

  const slugify = (s: string) => s.toLowerCase().replace(/['’]/g, '').replace(/\s+/g, '-').replace(/[()+]/g, '');
  const periodTag = slugify(PERIOD_LABELS[periodFilter] ?? periodFilter);
  const storeTag = slugify(STORE_LABELS[storeFilter] ?? storeFilter);
  doc.save(`lmb-rapport-finance-${storeTag}-${periodTag}.pdf`);
}
