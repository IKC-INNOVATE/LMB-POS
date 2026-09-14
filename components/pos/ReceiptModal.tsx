'use client';

import { jsPDF } from 'jspdf';

// jsPDF (police helvetica standard) ne sait pas afficher l'espace fine
// insecable (U+202F) que toLocaleString('fr-FR') utilise comme separateur de
// milliers : ce caractere est alors rendu comme un "/" illisible dans le PDF.
// On le remplace par un espace normal, uniquement pour le texte injecte dans
// le PDF -- l'affichage a l'ecran (qui gere tres bien l'Unicode) n'est pas
// concerne.
const fmtPdf = (n: number) => Math.round(n).toLocaleString('fr-FR').replace(/[\u202F\u00A0]/g, ' ');
import { Customer } from '@/types';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SecondaryButton from '@/components/ui/SecondaryButton';

export type ReceiptItem = {
  id: string;
  sku?: string;
  name: string;
  quantity: number;
  unit_price_xof: number;
  total_price_xof: number;
};

export type ReceiptModalProps = {
  isOpen: boolean;
  onClose: () => void;
  receipt: {
    receiptNumber: string;
    createdAt: string;
    cashierName: string;
    storeName: string;
    customer?: Partial<Customer>;
    customerName?: string;
    customerPhone?: string;
    items: ReceiptItem[];
    subtotalXof: number;
    discountXof: number;
    totalXof: number;
    paymentMethod: string;
    paymentReference?: string;
      paymentDetails?: Record<string, unknown> | null;
      notes?: string;
    pointsEarned?: number;
    pointsBalance?: number;
    vipStatus?: string;
  } | null;
};

const paymentLabel: Record<string, string> = {
  ESPECES: 'Espèces',
  CASH: 'Espèces',
  CB: 'Carte bancaire',
  CARTE_BANCAIRE: 'Carte bancaire',
  WAVE: 'Wave / Mobile',
  WAVE_SN: 'Wave',
  OM: 'Orange Money',
  ORANGE_MONEY_SN: 'Orange Money',
  MOBILE_MONEY: 'Mobile Money',
  SPLIT: 'Paiement mixte',
  PARTIAL_PAYMENT: 'Acompte / Réservation',
};

const getVipBadgeClass = (vipStatus: string) => {
  switch (vipStatus) {
    case 'VIP_PREMIUM':
      return 'border border-amber-300 bg-gradient-to-r from-amber-600 to-yellow-500 text-white shadow-sm';
    case 'VIP':
      return 'border border-amber-300 bg-amber-100 text-amber-800 shadow-sm';
    default:
      return 'border border-slate-200 bg-slate-100/80 text-slate-700';
  }
};

const vipLabel: Record<string, string> = {
  STANDARD: 'Standard',
  VIP: 'VIP',
  VIP_PREMIUM: 'VIP Premium',
};

const getVipIcon = (vipStatus: string) => {
  switch (vipStatus) {
    case 'VIP_PREMIUM':
      return '👑';
    case 'VIP':
      return '★';
    default:
      return '•';
  }
};

export default function ReceiptModal({ isOpen, onClose, receipt }: ReceiptModalProps) {
  if (!isOpen || !receipt) return null;

  const customerName = receipt.customerName ?? receipt.customer?.full_name ?? 'Client non identifié';
  const customerPhone = receipt.customerPhone ?? receipt.customer?.phone ?? '—';
  const vipStatus = receipt.vipStatus ?? receipt.customer?.vip_status ?? 'STANDARD';
  const pointsBalance = receipt.pointsBalance ?? Number(receipt.customer?.loyalty_points ?? 0);

  const handleDownloadPdf = () => {
    const doc = new jsPDF({ unit: 'mm', format: [80, 220] });
    const margin = 5;
    const lineHeight = 4;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('LUXURY MAGIC BUTTER', margin, 10);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(receipt.storeName, margin, 16);
    doc.text(new Date(receipt.createdAt).toLocaleString('fr-FR'), margin, 20);
    doc.text(`Conseillère: ${receipt.cashierName}`, margin, 24);
    doc.text(`N° Vente: ${receipt.receiptNumber}`, margin, 28);

    doc.line(margin, 31, 75, 31);
    doc.text(`Client: ${customerName}`, margin, 38);
    doc.text(`Tél: ${customerPhone}`, margin, 42);
    doc.text(`VIP: ${vipLabel[vipStatus] ?? vipStatus}`, margin, 46);

    let y = 54;
    receipt.items.forEach((item) => {
      doc.text(`${item.name} x${item.quantity}`, margin, y);
      doc.text(`${fmtPdf(item.total_price_xof)} FCFA`, 52, y, { align: 'right' });
      y += lineHeight;
      doc.text(`${fmtPdf(item.unit_price_xof)} FCFA/uni`, margin, y);
      y += lineHeight;
    });

    doc.line(margin, y + 2, 75, y + 2);
    y += 8;
    doc.text(`Sous-total: ${fmtPdf(receipt.subtotalXof)} FCFA`, margin, y);
    y += lineHeight;
    doc.text(`Remise VIP: - ${fmtPdf(receipt.discountXof)} FCFA`, margin, y);
    y += lineHeight;
    doc.text(`Points: ${receipt.pointsEarned ?? 0}`, margin, y);
    y += lineHeight;
    doc.text(`Solde: ${pointsBalance}`, margin, y);
    y += lineHeight + 2;
    doc.setFont('helvetica', 'bold');
    doc.text(`Total: ${fmtPdf(receipt.totalXof)} FCFA`, margin, y);
    y += lineHeight;
    doc.setFont('helvetica', 'normal');
    doc.text(`Paiement: ${paymentLabel[receipt.paymentMethod] ?? receipt.paymentMethod}`, margin, y);

    // Show paymentDetails for split or partial payments
    if (receipt.paymentDetails) {
      y += lineHeight;
      const pd = receipt.paymentDetails;
      if (receipt.paymentMethod === 'SPLIT') {
        const cash = pd.cash ?? 0;
        const otherKey = Object.keys(pd).find((k) => k !== 'cash') ?? 'other';
        const otherVal = pd[otherKey] ?? 0;
        doc.text(`Espèces: ${fmtPdf(Number(cash))} FCFA`, margin, y);
        y += lineHeight;
        doc.text(`${otherKey}: ${fmtPdf(Number(otherVal))} FCFA`, margin, y);
      } else if (receipt.paymentMethod === 'PARTIAL_PAYMENT') {
        const paid = Number(pd.paid ?? 0);
        const balance = Number(pd.balance ?? Math.max(0, receipt.totalXof - paid));
        doc.text(`Acompte versé: ${fmtPdf(Number(paid))} FCFA`, margin, y);
        y += lineHeight;
        doc.text(`Solde restant: ${fmtPdf(Number(balance))} FCFA`, margin, y);
      }
    }

    y += 10;
    doc.text('Merci pour votre achat !', margin, y);
    doc.text('Retours sous 7 jours selon conditions.', margin, y + 4);
    doc.text(`N° Ticket: ${receipt.receiptNumber}`, margin, y + 8);

    doc.save(`${receipt.receiptNumber}.pdf`);
  };

  const handleWhatsAppShare = () => {
    const cleanPhone = (receipt.customerPhone ?? customerPhone ?? '').replace(/\D/g, '');
    const text = [
      `LUXURY MAGIC BUTTER`,
      `Boutique: ${receipt.storeName}`,
      `N° Vente: ${receipt.receiptNumber}`,
      `Date: ${new Date(receipt.createdAt).toLocaleString('fr-FR')}`,
      `Conseillère: ${receipt.cashierName}`,
      '',
      'Détail des articles:',
      ...receipt.items.map(
        (item) => `- ${item.name} x${item.quantity} - ${item.total_price_xof.toLocaleString('fr-FR')} FCFA`
      ),
      '',
      `Remise VIP: - ${receipt.discountXof.toLocaleString('fr-FR')} FCFA`,
      `Total: ${receipt.totalXof.toLocaleString('fr-FR')} FCFA`,
      `Points gagnés: ${receipt.pointsEarned ?? 0}`,
      `Nouveau solde: ${pointsBalance}`,
      '',
      'Merci pour votre achat chez LUXURY MAGIC BUTTER !',
    ].join('\n');

    if (!cleanPhone) {
      alert('Aucun numéro de téléphone client disponible pour partager le ticket WhatsApp.');
      return;
    }

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 print:hidden">
        <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-slate-950/30">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
            <h3 className="text-lg font-bold text-white">Ticket de caisse</h3>
            <SecondaryButton onClick={onClose} className="rounded-lg px-2 py-1 text-xs text-slate-300 border border-slate-700">
              Fermer
            </SecondaryButton>
          </div>

          <div className="p-5">
              <div className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs text-cyan-100">
                <p className="font-bold uppercase tracking-[0.12em]">LUXURY MAGIC BUTTER</p>
              <p>{receipt.storeName}</p>
              <p>{new Date(receipt.createdAt).toLocaleString('fr-FR')}</p>
              <p>Conseillère: {receipt.cashierName}</p>
            </div>

            <div className="mb-4 text-xs text-slate-300 space-y-2">
              <p>
                <span className="font-semibold text-white">Client:</span> {customerName}
              </p>
              <p>
                <span className="font-semibold text-white">Téléphone:</span> {customerPhone}
              </p>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">VIP:</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${getVipBadgeClass(vipStatus)}`}>
                  <span className="text-[11px] leading-none">{getVipIcon(vipStatus)}</span>
                  {vipLabel[vipStatus] ?? vipStatus}
                </span>
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-200">
              {receipt.items.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-white">{item.name}</span>
                    <span>{item.total_price_xof.toLocaleString('fr-FR')} FCFA</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-slate-400">
                    <span>
                      {item.quantity} × {item.unit_price_xof.toLocaleString('fr-FR')}
                    </span>
                    <span>{item.sku ?? 'SKU'}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2 border-t border-slate-800 pt-3 text-xs text-slate-300">
              <div className="flex items-center justify-between">
                <span>Sous-total</span>
                <span>{receipt.subtotalXof.toLocaleString('fr-FR')} FCFA</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Remise VIP</span>
                <span>- {receipt.discountXof.toLocaleString('fr-FR')} FCFA</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Points gagnés</span>
                <span>{receipt.pointsEarned ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Nouveau solde</span>
                <span>{pointsBalance}</span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-slate-700 pt-2 text-sm font-bold text-white">
                <span>Total</span>
                <span>{receipt.totalXof.toLocaleString('fr-FR')} FCFA</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Paiement</span>
                <span>{paymentLabel[receipt.paymentMethod] ?? receipt.paymentMethod}</span>
              </div>

              {receipt.paymentDetails && receipt.paymentMethod === 'SPLIT' && (
                <div className="mt-2 text-sm text-slate-200">
                  <div>Espèces : {Number(receipt.paymentDetails.cash ?? 0).toLocaleString('fr-FR')} FCFA</div>
                  {Object.keys(receipt.paymentDetails).filter(k => k !== 'cash').map(k => (
                    <div key={k}>{k} : {Number(receipt.paymentDetails?.[k] ?? 0).toLocaleString('fr-FR')} FCFA</div>
                  ))}
                </div>
              )}

              {receipt.paymentDetails && receipt.paymentMethod === 'PARTIAL_PAYMENT' && (
                <div className="mt-2 text-sm text-slate-200">
                  <div>Acompte versé : {Number(receipt.paymentDetails.paid ?? 0).toLocaleString('fr-FR')} FCFA</div>
                  <div>Solde restant à payer : {Number(receipt.paymentDetails.balance ?? Math.max(0, receipt.totalXof - Number(receipt.paymentDetails.paid ?? 0))).toLocaleString('fr-FR')} FCFA</div>
                </div>
              )}

              {receipt.notes && (
                <div className="mt-2 text-xs text-slate-400">{receipt.notes}</div>
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <SecondaryButton onClick={handleWhatsAppShare} className="px-3 py-2 text-xs">
                Partager sur WhatsApp
              </SecondaryButton>
              <PrimaryButton onClick={handleDownloadPdf} className="px-3 py-2 text-xs">
                Télécharger PDF
              </PrimaryButton>
              <SecondaryButton onClick={onClose} className="col-span-2 px-4 py-2 text-sm">
                Fermer
              </SecondaryButton>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @media print {
          body {
            background: #fff !important;
          }

          * {
            visibility: hidden;
          }

          [data-receipt-print] {
            visibility: visible !important;
            position: fixed !important;
            inset: 0 !important;
            width: 80mm !important;
            max-width: 80mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            color: #111827 !important;
            font-size: 11px !important;
            line-height: 1.4 !important;
          }

          [data-receipt-print] * {
            visibility: visible !important;
          }
        }
      `}</style>

      <div
        data-receipt-print
        className="hidden print:block"
        style={{
          width: '80mm',
          maxWidth: '80mm',
          margin: '0 auto',
          padding: '8px',
          fontFamily: 'Arial, sans-serif',
          color: '#111827',
          background: '#fff',
        }}
      >
        <div style={{ textAlign: 'center', borderBottom: '1px dashed #cbd5e1', paddingBottom: '6px', marginBottom: '8px' }}>
          <div style={{ fontWeight: 700, fontSize: '12px' }}>LUXURY MAGIC BUTTER</div>
          <div style={{ fontSize: '10px' }}>{receipt.storeName}</div>
          <div style={{ fontSize: '9px' }}>{new Date(receipt.createdAt).toLocaleString('fr-FR')}</div>
          <div style={{ fontSize: '9px' }}>Caisse: {receipt.cashierName}</div>
        </div>

        <div style={{ fontSize: '10px', marginBottom: '8px' }}>
          <div><strong>Client:</strong> {customerName}</div>
          <div><strong>Tél:</strong> {customerPhone}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            <strong>VIP:</strong>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              borderRadius: '999px',
              padding: '2px 7px',
              fontSize: '8px',
              fontWeight: 800,
              letterSpacing: '0.08em',
              border: vipStatus === 'VIP' ? '1px solid #fbbf24' : vipStatus === 'VIP_PREMIUM' ? '1px solid #fbbf24' : '1px solid #e2e8f0',
              background: vipStatus === 'VIP_PREMIUM' ? 'linear-gradient(90deg, #b45309 0%, #facc15 100%)' : vipStatus === 'VIP' ? '#fef3c7' : '#f8fafc',
              color: vipStatus === 'VIP_PREMIUM' ? '#fff' : vipStatus === 'VIP' ? '#92400e' : '#334155',
            }}>
              <span>{getVipIcon(vipStatus)}</span>
              {vipLabel[vipStatus] ?? vipStatus}
            </span>
          </div>
        </div>

        <div style={{ borderBottom: '1px dashed #cbd5e1', paddingBottom: '6px', marginBottom: '8px' }}>
          {receipt.items.map((item) => (
            <div key={item.id} style={{ marginBottom: '5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px' }}>
                <span>{item.name}</span>
                <span>{item.total_price_xof.toLocaleString('fr-FR')} FCFA</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', color: '#475569' }}>
                <span>{item.quantity} x {item.unit_price_xof.toLocaleString('fr-FR')}</span>
                <span>{item.sku ?? ''}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: '10px', lineHeight: 1.5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Sous-total</span><span>{receipt.subtotalXof.toLocaleString('fr-FR')} FCFA</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Remise VIP</span><span>- {receipt.discountXof.toLocaleString('fr-FR')} FCFA</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Points</span><span>{receipt.pointsEarned ?? 0}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Solde</span><span>{pointsBalance}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: '6px' }}><span>Total</span><span>{receipt.totalXof.toLocaleString('fr-FR')} FCFA</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}><span>Paiement</span><span>{paymentLabel[receipt.paymentMethod] ?? receipt.paymentMethod}</span></div>
          {receipt.paymentDetails && receipt.paymentMethod === 'SPLIT' && (
            <div style={{ marginTop: '4px' }}>
              <div>Espèces: {Number(receipt.paymentDetails.cash ?? 0).toLocaleString('fr-FR')} FCFA</div>
              {Object.keys(receipt.paymentDetails).filter(k => k !== 'cash').map(k => (
                <div key={k}>{k}: {Number(receipt.paymentDetails?.[k] ?? 0).toLocaleString('fr-FR')} FCFA</div>
              ))}
            </div>
          )}
          {receipt.paymentDetails && receipt.paymentMethod === 'PARTIAL_PAYMENT' && (
            <div style={{ marginTop: '4px' }}>
              <div>Acompte versé: {Number(receipt.paymentDetails.paid ?? 0).toLocaleString('fr-FR')} FCFA</div>
              <div>Solde restant: {Number(receipt.paymentDetails.balance ?? Math.max(0, receipt.totalXof - Number(receipt.paymentDetails.paid ?? 0))).toLocaleString('fr-FR')} FCFA</div>
            </div>
          )}
        </div>

        <div style={{ marginTop: '10px', borderTop: '1px dashed #cbd5e1', paddingTop: '8px', textAlign: 'center', fontSize: '9px' }}>
          <div>Merci pour votre achat !</div>
          <div>Retours sous 7 jours selon conditions.</div>
          <div style={{ marginTop: '6px', fontWeight: 700 }}>N° Ticket: {receipt.receiptNumber}</div>
        </div>
      </div>
    </>
  );
}
