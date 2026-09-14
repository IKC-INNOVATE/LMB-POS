// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReceiptModal, { type ReceiptModalProps } from '@/components/pos/ReceiptModal';

// Le ticket de caisse est le document remis au client à la fin de chaque
// vente : un mauvais total, une mauvaise ventilation de paiement mixte ou un
// receipt manquant qui plante l'écran sont des régressions visibles
// immédiatement par le personnel en boutique.

const baseReceipt: NonNullable<ReceiptModalProps['receipt']> = {
  receiptNumber: 'LMB-1000',
  createdAt: '2026-09-14T10:00:00.000Z',
  cashierName: 'Awa',
  storeName: 'Dakar Plateau',
  customerName: 'Fatou Diop',
  customerPhone: '+221770000000',
  items: [
    { id: 'i1', sku: 'SKU-1', name: 'Beurre de karité 250g', quantity: 2, unit_price_xof: 5000, total_price_xof: 10000 },
    { id: 'i2', sku: 'SKU-2', name: 'Savon noir', quantity: 1, unit_price_xof: 2000, total_price_xof: 2000 },
  ],
  subtotalXof: 12000,
  discountXof: 500,
  totalXof: 11500,
  paymentMethod: 'ESPECES',
  pointsEarned: 115,
  pointsBalance: 900,
  vipStatus: 'VIP',
};

describe('ReceiptModal', () => {
  it("n'affiche rien quand isOpen est false ou quand receipt est null", () => {
    const { container: c1 } = render(
      <ReceiptModal isOpen={false} onClose={vi.fn()} receipt={baseReceipt} />,
    );
    expect(c1).toBeEmptyDOMElement();

    const { container: c2 } = render(<ReceiptModal isOpen={true} onClose={vi.fn()} receipt={null} />);
    expect(c2).toBeEmptyDOMElement();
  });

  it('affiche les articles, les totaux et le statut VIP du ticket', () => {
    render(<ReceiptModal isOpen={true} onClose={vi.fn()} receipt={baseReceipt} />);

    expect(screen.getAllByText('Beurre de karité 250g').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Savon noir').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Fatou Diop').length).toBeGreaterThan(0);
    // Le total apparaît deux fois (aperçu écran + version impression cachée) :
    // on vérifie qu'il apparaît bien au moins une fois avec le bon montant.
    expect(screen.getAllByText(/11[\s ]500 FCFA/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('115').length).toBeGreaterThan(0);
  });

  it('appelle onClose au clic sur « Fermer »', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ReceiptModal isOpen={true} onClose={onClose} receipt={baseReceipt} />);

    await user.click(screen.getAllByRole('button', { name: 'Fermer' })[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ventile correctement un paiement mixte (SPLIT) sans planter sur les clés dynamiques', () => {
    render(
      <ReceiptModal
        isOpen={true}
        onClose={vi.fn()}
        receipt={{
          ...baseReceipt,
          paymentMethod: 'SPLIT',
          paymentDetails: { cash: 4000, WAVE: 7500 },
        }}
      />,
    );

    expect(screen.getAllByText(/4[\s ]000 FCFA/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/WAVE : 7[\s ]500 FCFA/).length).toBeGreaterThan(0);
  });

  it('calcule le solde restant sur un acompte (PARTIAL_PAYMENT) sans montant "balance" explicite', () => {
    render(
      <ReceiptModal
        isOpen={true}
        onClose={vi.fn()}
        receipt={{
          ...baseReceipt,
          totalXof: 11500,
          paymentMethod: 'PARTIAL_PAYMENT',
          paymentDetails: { paid: 5000 },
        }}
      />,
    );

    // balance = max(0, totalXof - paid) = max(0, 11500 - 5000) = 6500, calculé
    // côté composant (paymentDetails.balance non fourni ici).
    expect(screen.getAllByText(/6[\s ]500 FCFA/).length).toBeGreaterThan(0);
  });
});
