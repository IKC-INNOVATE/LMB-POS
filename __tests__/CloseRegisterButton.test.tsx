// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CloseRegisterButton from '@/components/pos/CloseRegisterButton';
import { closeRegister, getOpenRegister } from '@/lib/services/register';

// Écran critique de la Caisse : la clôture de caisse (billetage) est le seul
// contrôle qui arrête les mouvements de caisse et calcule l'écart réel — une
// régression ici (mauvais montant envoyé, écart mal affiché) impacte
// directement la comptabilité de la boutique.

vi.mock('@/lib/services/register', () => ({
  closeRegister: vi.fn(),
  getOpenRegister: vi.fn(),
}));

const mockedCloseRegister = vi.mocked(closeRegister);
const mockedGetOpenRegister = vi.mocked(getOpenRegister);

describe('CloseRegisterButton', () => {
  beforeEach(() => {
    mockedCloseRegister.mockReset();
    mockedGetOpenRegister.mockReset();
    mockedGetOpenRegister.mockResolvedValue({
      id: 'reg-1',
      store_code: 'DAKAR',
      cashier_name: 'Awa',
      initial_cash: 10000,
      opened_at: '2026-09-14T08:00:00.000Z',
    });
  });

  it("ouvre la modale de billetage au clic sur « Clôture de caisse »", async () => {
    const user = userEvent.setup();
    render(<CloseRegisterButton storeCode="DAKAR" />);

    expect(screen.queryByText('Clôture de caisse (Billetage)')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clôture de caisse' }));

    expect(await screen.findByText('Clôture de caisse (Billetage)')).toBeInTheDocument();
  });

  it('envoie le montant compté saisi et affiche le rapport Z renvoyé par le service', async () => {
    mockedCloseRegister.mockResolvedValue({
      register: {
        store_code: 'DAKAR',
        cashier_name: 'Awa',
        initial_cash: 10000,
        opened_at: '2026-09-14T08:00:00.000Z',
        counted_cash: 52000,
      },
      total_cash_sales: 45000,
      total_expenses: 3000,
      theoretical_cash: 52000,
      variance: 0,
    });

    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<CloseRegisterButton storeCode="DAKAR" onSuccess={onSuccess} />);

    await user.click(screen.getByRole('button', { name: 'Clôture de caisse' }));
    const countedInput = await screen.findByLabelText('Espèces comptées');

    await user.clear(countedInput);
    await user.type(countedInput, '52000');
    await user.click(screen.getByRole('button', { name: 'Clôturer' }));

    await waitFor(() => expect(mockedCloseRegister).toHaveBeenCalledTimes(1));
    expect(mockedCloseRegister).toHaveBeenCalledWith(52000, '', 'DAKAR');
    expect(onSuccess).toHaveBeenCalledTimes(1);

    expect(await screen.findByText(/Espèces théoriques: 52000/)).toBeInTheDocument();
    expect(screen.getByText(/Écart:/)).toHaveTextContent('Écart: Manque 0');
  });

  it('affiche un écart en surplus/manque cohérent avec le signe renvoyé', async () => {
    mockedCloseRegister.mockResolvedValue({
      register: {
        store_code: 'DAKAR',
        cashier_name: 'Awa',
        initial_cash: 10000,
        opened_at: '2026-09-14T08:00:00.000Z',
        counted_cash: 53500,
      },
      total_cash_sales: 45000,
      total_expenses: 3000,
      theoretical_cash: 52000,
      variance: 1500,
    });

    const user = userEvent.setup();
    render(<CloseRegisterButton storeCode="DAKAR" />);

    await user.click(screen.getByRole('button', { name: 'Clôture de caisse' }));
    const countedInput = await screen.findByLabelText('Espèces comptées');
    await user.clear(countedInput);
    await user.type(countedInput, '53500');
    await user.click(screen.getByRole('button', { name: 'Clôturer' }));

    expect(await screen.findByText(/Écart:/)).toHaveTextContent('Écart: Surplus +1500');
  });

  it("affiche une alerte et ne casse pas l'écran si la clôture échoue", async () => {
    mockedCloseRegister.mockRejectedValue(new Error('Réseau indisponible'));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    const user = userEvent.setup();
    render(<CloseRegisterButton storeCode="DAKAR" />);

    await user.click(screen.getByRole('button', { name: 'Clôture de caisse' }));
    await user.click(screen.getByRole('button', { name: 'Clôturer' }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Réseau indisponible'));
    // La modale reste ouverte : l'utilisateur peut réessayer sans perdre sa saisie.
    expect(screen.getByText('Clôture de caisse (Billetage)')).toBeInTheDocument();

    alertSpy.mockRestore();
  });
});
