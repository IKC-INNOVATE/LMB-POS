// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CashExpenseButton from '@/components/pos/CashExpenseButton';
import { addCashExpense } from '@/lib/services/register';

// Écran critique de la Caisse : une sortie de caisse (dépense payée en
// espèces depuis le tiroir-caisse) modifie directement le solde théorique
// vérifié à la clôture — un montant ou un motif mal transmis fausse le
// rapport Z de fin de journée.

vi.mock('@/lib/services/register', () => ({
  addCashExpense: vi.fn(),
}));

const mockedAddCashExpense = vi.mocked(addCashExpense);

describe('CashExpenseButton', () => {
  beforeEach(() => {
    mockedAddCashExpense.mockReset();
  });

  it('refuse un montant nul ou négatif sans appeler le service', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<CashExpenseButton cashierName="Awa" storeCode="DAKAR" />);

    await user.click(screen.getByRole('button', { name: 'Sortie de caisse' }));
    const amountInput = await screen.findByLabelText('Montant');
    await user.clear(amountInput);
    await user.type(amountInput, '0');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Montant invalide'));
    expect(mockedAddCashExpense).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('enregistre la dépense avec le montant, le motif, le caissier et la boutique saisis', async () => {
    mockedAddCashExpense.mockResolvedValue({
      id: 'exp-1',
      register_id: 'reg-1',
      amount: 2500,
      reason: 'Achat fournitures',
    });
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<CashExpenseButton cashierName="Awa" storeCode="DAKAR" onSuccess={onSuccess} />);

    await user.click(screen.getByRole('button', { name: 'Sortie de caisse' }));
    const amountInput = await screen.findByLabelText('Montant');
    await user.clear(amountInput);
    await user.type(amountInput, '2500');
    await user.type(screen.getByLabelText('Motif'), 'Achat fournitures');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(mockedAddCashExpense).toHaveBeenCalledTimes(1));
    expect(mockedAddCashExpense).toHaveBeenCalledWith(2500, 'Achat fournitures', 'Awa', 'DAKAR');
    expect(alertSpy).toHaveBeenCalledWith('Dépense enregistrée');
    expect(onSuccess).toHaveBeenCalledTimes(1);

    // La modale se referme et réinitialise ses champs après un succès.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument(),
    );

    alertSpy.mockRestore();
  });

  it('utilise un motif par défaut quand le champ est laissé vide', async () => {
    mockedAddCashExpense.mockResolvedValue({ id: 'exp-2', amount: 1000 });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<CashExpenseButton cashierName="Awa" storeCode="DAKAR" />);

    await user.click(screen.getByRole('button', { name: 'Sortie de caisse' }));
    const amountInput = await screen.findByLabelText('Montant');
    await user.clear(amountInput);
    await user.type(amountInput, '1000');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(mockedAddCashExpense).toHaveBeenCalledTimes(1));
    expect(mockedAddCashExpense).toHaveBeenCalledWith(1000, 'Dépense caisse', 'Awa', 'DAKAR');
  });
});
