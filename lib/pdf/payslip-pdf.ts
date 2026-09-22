import { jsPDF } from 'jspdf';
import type { Payslip, PayrollEmployee } from '@/lib/services/payroll';

// =====================================================================
// Bulletin de paie PDF — mise en forme "professionnelle" (couleurs,
// tableaux, encadrés) alignée sur lib/pdf/finance-report-pdf.ts (22/09) :
// même palette de marque (voir app/globals.css : --lmb-ink, --lmb-sage-*,
// --lmb-amber-*), même police 'times' (plutôt que 'helvetica' standard,
// jugée moins élégante), même technique de tableau dessiné à la main
// (drawTable) sans dépendance externe.
//
// ⚠️ Ce fichier ne recalcule rien : il met en forme les montants déjà
// calculés et enregistrés dans `computed_breakdown` au moment de la
// génération (voir lib/services/payroll.ts).
// =====================================================================

type RGB = [number, number, number];

const COLOR = {
  ink: [39, 36, 31] as RGB, // --lmb-ink
  inkSoft: [117, 113, 106] as RGB, // --lmb-ink-soft
  border: [225, 220, 210] as RGB,
  rowAlt: [244, 240, 231] as RGB,
  gold: [184, 134, 11] as RGB, // couleur de marque LMB (#D4AF37 assombri pour rester lisible sur fond blanc)
  sage: [62, 107, 76] as RGB, // --lmb-sage-700 (net à payer)
  sageTint: [231, 241, 231] as RGB,
  amber: [182, 122, 32] as RGB, // --lmb-amber-600 (charges patronales, indicatif)
  amberTint: [251, 237, 214] as RGB,
  white: [255, 255, 255] as RGB,
};

const fmt = (n: number) => {
  // toLocaleString('fr-FR') insère un espace fine insécable (U+202F) entre les
  // milliers ; les polices standard intégrées à jsPDF ne savent pas l'afficher
  // (elles rendent un caractère parasite, ex. « 90 /000 » au lieu de « 90 000 »).
  // On la remplace par une espace normale pour un rendu propre dans le PDF.
  const formatted = Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
  return formatted + ' FCFA';
};

const monthLabel = (periodMonth: string) => {
  const d = new Date(`${periodMonth}T00:00:00`);
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
};

type TableColumn = { header: string; width: number; align?: 'left' | 'right' };
type TableRow = { cells: string[]; bold?: boolean; valueColor?: RGB; rowBg?: RGB };

/**
 * Dessine un tableau "à la main" (rectangles + texte positionné), sans
 * dépendance externe — même approche que lib/pdf/finance-report-pdf.ts.
 * En-tête fond sombre + texte blanc, lignes alternées beige clair, une
 * ligne peut être mise en avant (fond + couleur de valeur). Retourne la
 * position Y juste après le tableau.
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
 * Génère le PDF du bulletin de paie (format A4) et déclenche le téléchargement.
 *
 * ⚠️ Ce bulletin reprend les montants déjà calculés et enregistrés dans
 * `computed_breakdown` au moment de la génération (voir lib/services/payroll.ts) :
 * il ne recalcule rien, il met simplement en forme un calcul déjà tracé.
 */
export function downloadPayslipPdf(payslip: Payslip, employee: PayrollEmployee) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const left = 18;
  const right = 192;
  const tableWidth = right - left;
  let y = 20;

  // ---- En-tête / bandeau de marque ----
  doc.setFontSize(16);
  doc.setFont('times', 'bold');
  doc.setTextColor(...COLOR.gold);
  doc.text('LUXURY MAGIC BUTTER SKIN', left, y);
  y += 6.5;

  doc.setFontSize(11);
  doc.setTextColor(...COLOR.ink);
  doc.text('BULLETIN DE PAIE', left, y);
  y += 3.5;

  doc.setDrawColor(...COLOR.gold);
  doc.setLineWidth(0.6);
  doc.line(left, y, right, y);
  y += 7;

  // ---- Bloc méta-informations (Salarié / Contrat / Période / Édité le) ----
  // Encadré avec libellés en gras + texte agrandi, même traitement que le
  // bloc Période/Boutique du rapport financier — remplace le texte brut
  // sans structure d'origine.
  const metaRows: Array<[string, string]> = [
    ['Salarié', employee.full_name],
    ['Contrat', `${employee.contract_type} — depuis le ${new Date(employee.contract_start_date).toLocaleDateString('fr-FR')}`],
    ['Parts fiscales', `${employee.family_parts} (quotient familial)`],
    ['Période', monthLabel(payslip.period_month)],
    ['Édité le', new Date(payslip.generated_at).toLocaleDateString('fr-FR')],
  ];
  const metaLabelWidth = 30;
  const metaLineHeight = 6.2;
  const metaBoxHeight = metaRows.length * metaLineHeight + 5;

  doc.setFillColor(...COLOR.rowAlt);
  doc.setDrawColor(...COLOR.border);
  doc.setLineWidth(0.3);
  doc.rect(left, y, tableWidth, metaBoxHeight, 'FD');

  doc.setFontSize(9.5);
  let metaY = y + 6.8;
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

  // ---- Tableau : Éléments de rémunération ----
  doc.setFont('times', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...COLOR.ink);
  doc.text('1. Éléments de rémunération', left, y);
  y += 5;

  const remunColumns: TableColumn[] = [
    { header: 'Élément', width: tableWidth * 0.62 },
    { header: 'Montant', width: tableWidth * 0.38, align: 'right' },
  ];

  const remunRows: TableRow[] = [{ cells: ['Salaire de base', fmt(employee.base_salary_xof)] }];
  if (employee.sursalaire_xof) remunRows.push({ cells: ['Sursalaire', fmt(employee.sursalaire_xof)] });
  if (employee.prime_transport_xof) remunRows.push({ cells: ['Prime de transport', fmt(employee.prime_transport_xof)] });
  (employee.other_primes ?? []).forEach((p) => remunRows.push({ cells: [p.label, fmt(p.amount_xof)] }));
  remunRows.push({
    cells: ['SALAIRE BRUT', fmt(payslip.gross_salary_xof)],
    bold: true,
    rowBg: COLOR.rowAlt,
  });

  y = drawTable(doc, left, y, remunColumns, remunRows) + 8;

  // ---- Tableau : Retenues salariales ----
  doc.setFont('times', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...COLOR.ink);
  doc.text('2. Retenues salariales', left, y);
  y += 5;

  const retenuesColumns: TableColumn[] = [
    { header: 'Retenue', width: tableWidth * 0.62 },
    { header: 'Montant', width: tableWidth * 0.38, align: 'right' },
  ];

  const retenuesRows: TableRow[] = [
    { cells: ['IPRES (retraite, part salariale)', `- ${fmt(payslip.ipres_employee_xof)}`] },
    { cells: ['Impôt sur le revenu (IRPP)', `- ${fmt(payslip.ir_xof)}`] },
    {
      cells: ['NET À PAYER', fmt(payslip.net_salary_xof)],
      bold: true,
      valueColor: COLOR.sage,
      rowBg: COLOR.sageTint,
    },
  ];

  y = drawTable(doc, left, y, retenuesColumns, retenuesRows) + 8;

  // ---- Tableau : Charges patronales (indicatif) ----
  doc.setFont('times', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...COLOR.ink);
  doc.text('3. Charges patronales', left, y);
  y += 5;

  doc.setFont('times', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLOR.amber);
  doc.text('À titre indicatif — non déduites du salaire net à payer ci-dessus.', left, y);
  y += 4;

  const chargesColumns: TableColumn[] = [
    { header: 'Charge employeur', width: tableWidth * 0.62 },
    { header: 'Montant', width: tableWidth * 0.38, align: 'right' },
  ];

  const chargesRows: TableRow[] = [
    { cells: ['IPRES (retraite, part employeur)', fmt(payslip.ipres_employer_xof)] },
    { cells: ['CSS (prestations familiales, accidents du travail)', fmt(payslip.css_employer_xof)] },
  ];

  y = drawTable(doc, left, y, chargesColumns, chargesRows) + 6;

  // ---- Pied de page ----
  const assumptions = payslip.computed_breakdown?.assumptions ?? [];
  const footerTop = 297 - 16 - assumptions.length * 3.6;

  doc.setDrawColor(...COLOR.border);
  doc.setLineWidth(0.2);
  doc.line(left, footerTop - 4, right, footerTop - 4);

  doc.setFontSize(7.5);
  doc.setFont('times', 'normal');
  doc.setTextColor(...COLOR.inkSoft);
  doc.text('Document généré automatiquement à partir des paramètres de paie enregistrés à la date de génération.', left, footerTop);
  if (assumptions.length > 0) {
    doc.text('Hypothèses de calcul appliquées — à faire vérifier par un comptable avant usage officiel :', left, footerTop + 4);
    assumptions.forEach((a, i) => {
      doc.text(`• ${a}`, left, footerTop + 8 + i * 3.6);
    });
  }

  doc.save(`bulletin-${employee.full_name.replace(/\s+/g, '-')}-${payslip.period_month}.pdf`);
}
