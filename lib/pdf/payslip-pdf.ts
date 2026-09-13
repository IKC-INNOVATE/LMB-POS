import { jsPDF } from 'jspdf';
import type { Payslip, PayrollEmployee } from '@/lib/services/payroll';

const fmt = (n: number) => {
  // toLocaleString('fr-FR') insère un espace fine insécable (U+202F) entre les
  // milliers ; la police standard jsPDF/Helvetica ne sait pas l'afficher (elle
  // rend un caractère parasite, ex. « 90 /000 » au lieu de « 90 000 »).
  // On la remplace par une espace normale pour un rendu propre dans le PDF.
  const formatted = Math.round(n).toLocaleString('fr-FR').replace(/[\u202F\u00A0]/g, ' ');
  return formatted + ' FCFA';
};

const monthLabel = (periodMonth: string) => {
  const d = new Date(`${periodMonth}T00:00:00`);
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
};

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
  let y = 20;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('LUXURY MAGIC BUTTER SKIN', left, y);
  y += 6;
  doc.setFontSize(11);
  doc.text('BULLETIN DE PAIE', left, y);
  y += 10;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Période : ${monthLabel(payslip.period_month)}`, left, y);
  doc.text(`Édité le : ${new Date(payslip.generated_at).toLocaleDateString('fr-FR')}`, 130, y);
  y += 6;
  doc.line(left, y, 192, y);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.text('Salarié', left, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text(`Nom : ${employee.full_name}`, left, y);
  y += 5;
  doc.text(`Contrat : ${employee.contract_type} — depuis le ${new Date(employee.contract_start_date).toLocaleDateString('fr-FR')}`, left, y);
  y += 5;
  doc.text(`Parts fiscales (quotient familial) : ${employee.family_parts}`, left, y);
  y += 10;

  doc.setFont('helvetica', 'bold');
  doc.text('Éléments de rémunération', left, y);
  y += 6;
  doc.setFont('helvetica', 'normal');

  const row = (label: string, value: string, bold = false) => {
    if (bold) doc.setFont('helvetica', 'bold');
    doc.text(label, left, y);
    doc.text(value, 192, y, { align: 'right' });
    if (bold) doc.setFont('helvetica', 'normal');
    y += 6;
  };

  row('Salaire de base', fmt(employee.base_salary_xof));
  if (employee.sursalaire_xof) row('Sursalaire', fmt(employee.sursalaire_xof));
  if (employee.prime_transport_xof) row('Prime de transport', fmt(employee.prime_transport_xof));
  (employee.other_primes ?? []).forEach((p) => row(p.label, fmt(p.amount_xof)));
  doc.line(left, y, 192, y);
  y += 2;
  row('SALAIRE BRUT', fmt(payslip.gross_salary_xof), true);
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.text('Retenues salariales', left, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  row('IPRES (retraite, part salariale)', `- ${fmt(payslip.ipres_employee_xof)}`);
  row('Impôt sur le revenu (IRPP)', `- ${fmt(payslip.ir_xof)}`);
  doc.line(left, y, 192, y);
  y += 2;
  row('NET À PAYER', fmt(payslip.net_salary_xof), true);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.text('Charges patronales (à titre indicatif, non déduites du net)', left, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  row('IPRES (retraite, part employeur)', fmt(payslip.ipres_employer_xof));
  row('CSS (prestations familiales, accidents du travail)', fmt(payslip.css_employer_xof));
  y += 6;

  doc.setFontSize(7.5);
  doc.setTextColor(120);
  doc.text('Document généré automatiquement à partir des paramètres de paie enregistrés à la date de génération.', left, 275);
  doc.text('Hypothèses de calcul appliquées — à faire vérifier par un comptable avant usage officiel :', left, 279);
  (payslip.computed_breakdown?.assumptions ?? []).forEach((a, i) => {
    doc.text(`• ${a}`, left, 283 + i * 3.5);
  });

  doc.save(`bulletin-${employee.full_name.replace(/\s+/g, '-')}-${payslip.period_month}.pdf`);
}
