'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createCustomer, searchCustomers, addLoyaltyPoints, listCustomers } from '@/lib/services/customers';
import { createSaleWithCustomer, InsufficientStockError } from '@/lib/services/sales';
import ReceiptModal, { ReceiptModalProps } from '@/components/pos/ReceiptModal';
import { CartItem, Customer, SaleReceipt, ReceiptData } from '@/types';
import CashExpenseButton from '@/components/pos/CashExpenseButton';
import CloseRegisterButton from '@/components/pos/CloseRegisterButton';
import OpenRegisterButton from '@/components/pos/OpenRegisterButton';
import { getOpenRegister, RegisterSession } from '@/lib/services/register';
import AuthGuard from '@/components/auth/AuthGuard';
import { getCurrentStaff, signOut, StaffProfile } from '@/lib/services/auth';
import { PosProduct, listProducts, searchProducts, StoreCity } from '@/lib/services/products';
import { computeCartTotals, MAX_TOTAL_DISCOUNT_RATE } from '@/lib/pricing';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import ThemeToggle from '@/components/theme/ThemeToggle';
import LoadingState from '@/components/ui/LoadingState';

type PosCartItem = Omit<CartItem, 'product'> & { product: PosProduct };

const vipDiscountMap: Record<string, number> = {
  STANDARD: 0,
  VIP: 0.05,
  VIP_PREMIUM: 0.1,
};

export default function HomePage() {
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  // Raccourcis clients (VIP + achats récents) affichés au-dessus de la
  // recherche texte, pour sélectionner un client habituel en un clic.
  const [quickCustomers, setQuickCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState<PosProduct[]>([]);
  const [isSearchingProduct, setIsSearchingProduct] = useState(false);
  // Catalogue complet (pour la grille de vente par gamme) — chargé une fois
  // la boutique connue, indépendamment de la recherche textuelle.
  const [catalogProducts, setCatalogProducts] = useState<PosProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedGamme, setSelectedGamme] = useState<string | null>(null);
  const [selectedStoreCity, setSelectedStoreCity] = useState<StoreCity | null>(null);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [quickCustomer, setQuickCustomer] = useState({
    full_name: '',
    phone: '',
    country: 'SN',
  });
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptModalProps['receipt']>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>('ESPECES');
  const [splitCash, setSplitCash] = useState<string>('0');
  const [splitOther, setSplitOther] = useState<string>('0');
  const [splitOtherLabel, setSplitOtherLabel] = useState<string>('');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [isPartial, setIsPartial] = useState<boolean>(false);
  const [partialAmount, setPartialAmount] = useState<string>('0');
  const [registerSession, setRegisterSession] = useState<RegisterSession | null>(null);
  const [staff, setStaff] = useState<StaffProfile | null>(null);

  const cashierName = staff?.full_name ?? '';
  const storeCode = staff?.store_code ?? '';
  const role = staff?.role ?? null;

  // Boutique de vente active : celle de l'employé si elle vaut DAKAR/ABIDJAN,
  // sinon (compte DIRECTION sans boutique) celle choisie manuellement ci-dessous.
  const staffStoreCity: StoreCity | null =
    storeCode.toUpperCase() === 'DAKAR'
      ? 'DAKAR'
      : storeCode.toUpperCase() === 'ABIDJAN'
        ? 'ABIDJAN'
        : null;
  const activeStoreCity: StoreCity | null = staffStoreCity ?? selectedStoreCity;

  // Code boutique effectif : celui du compte s'il existe, sinon la boutique
  // choisie manuellement dans le sélecteur (compte DIRECTION). Sert AUSSI BIEN
  // à l'enregistrement de la vente qu'au registre de caisse.
  const effectiveStoreCode = activeStoreCity ?? storeCode;

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      console.warn('signOut failed', err);
    } finally {
      // Rechargement complet volontaire (pas de navigation client) : garantit
      // qu'aucun état d'authentification résiduel ne survit à la déconnexion.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/login';
    }
  };

  const refreshRegister = async () => {
    if (!effectiveStoreCode) return;
    try {
      const reg = await getOpenRegister(effectiveStoreCode);
      setRegisterSession(reg ?? null);
    } catch (err) {
      console.warn('refreshRegister failed', err);
    }
  };

  // load connected employee on mount
  useEffect(() => {
    getCurrentStaff()
      .then((current) => setStaff(current?.staff ?? null))
      .catch((err) => console.warn('getCurrentStaff failed', err));
  }, []);

  // load register once we know the employee's store
  useEffect(() => {
    refreshRegister();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveStoreCode]);

  useEffect(() => {
    const delayedSearch = async () => {
      const query = customerQuery.trim();
      if (!query) {
        setCustomerResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const results = await searchCustomers(query);
        setCustomerResults(results);
      } catch (error) {
        console.error('Erreur recherche client:', error);
        setCustomerResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    const timer = setTimeout(delayedSearch, 250);
    return () => clearTimeout(timer);
  }, [customerQuery]);

  // Raccourcis clients (VIP + achats récents), chargés une fois — évite de
  // taper un nom pour un client habituel de la boutique.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await listCustomers();
        if (cancelled) return;

        const vip = all
          .filter((c) => c.vip_status && c.vip_status !== 'STANDARD')
          .sort((a, b) => (b.total_spent_xof ?? 0) - (a.total_spent_xof ?? 0));

        const recent = all
          .filter((c) => c.last_purchase_at)
          .sort(
            (a, b) =>
              new Date(b.last_purchase_at as string).getTime() - new Date(a.last_purchase_at as string).getTime(),
          );

        const seen = new Set<string>();
        const combined: Customer[] = [];
        for (const c of [...vip, ...recent]) {
          const key = c.id ?? `${c.phone}-${c.full_name}`;
          if (seen.has(key)) continue;
          seen.add(key);
          combined.push(c);
          if (combined.length >= 8) break;
        }
        setQuickCustomers(combined);
      } catch (error) {
        console.error('Erreur chargement raccourcis clients:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // recherche produit (debounce identique à la recherche client)
  useEffect(() => {
    const query = productQuery.trim();
    if (!query || !activeStoreCity) {
      setProductResults([]);
      return;
    }

    const delayedSearch = async () => {
      setIsSearchingProduct(true);
      try {
        const results = await searchProducts(query, activeStoreCity);
        setProductResults(results);
      } catch (error) {
        console.error('Erreur recherche produit:', error);
        setProductResults([]);
      } finally {
        setIsSearchingProduct(false);
      }
    };

    const timer = setTimeout(delayedSearch, 250);
    return () => clearTimeout(timer);
  }, [productQuery, activeStoreCity]);

  // Catalogue complet de la boutique active, pour la grille de vente par
  // gamme (cases cliquables) — indépendant de la recherche textuelle.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeStoreCity) {
        if (!cancelled) setCatalogProducts([]);
        return;
      }
      setCatalogLoading(true);
      try {
        const products = await listProducts(activeStoreCity);
        if (!cancelled) setCatalogProducts(products);
      } catch (error) {
        console.error('Erreur chargement catalogue:', error);
        if (!cancelled) setCatalogProducts([]);
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeStoreCity]);

  // Gammes disponibles dans le catalogue (= category_name des produits),
  // triées alphabétiquement, avec un fourre-tout "Sans gamme" en dernier.
  const gammes = useMemo(() => {
    const set = new Set<string>();
    let hasUncategorized = false;
    for (const p of catalogProducts) {
      if (p.category_name && p.category_name.trim()) set.add(p.category_name.trim());
      else hasUncategorized = true;
    }
    const sorted = Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
    return hasUncategorized ? [...sorted, 'Sans gamme'] : sorted;
  }, [catalogProducts]);

  // Produits affichés dans la grille : tous ceux de la gamme sélectionnée
  // (ou tout le catalogue si aucune gamme n'est sélectionnée).
  const gridProducts = useMemo(() => {
    if (!selectedGamme) return catalogProducts;
    if (selectedGamme === 'Sans gamme') {
      return catalogProducts.filter((p) => !p.category_name || !p.category_name.trim());
    }
    return catalogProducts.filter((p) => p.category_name === selectedGamme);
  }, [catalogProducts, selectedGamme]);

  // Initiales affichées dans la case produit tant qu'aucune photo n'est
  // renseignée (`product.photo_url`, déposée depuis Admin → Grille Tarifaire).
  const productInitials = (name: string) => {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  };

  // Couleur de fond stable par gamme (dérivée du nom), pour repérer un
  // rayon d'un coup d'œil dans la grille.
  const GAMME_COLORS = [
    'from-amber-500/30 to-amber-700/30 border-amber-500/40',
    'from-cyan-500/30 to-cyan-700/30 border-cyan-500/40',
    'from-emerald-500/30 to-emerald-700/30 border-emerald-500/40',
    'from-fuchsia-500/30 to-fuchsia-700/30 border-fuchsia-500/40',
    'from-rose-500/30 to-rose-700/30 border-rose-500/40',
    'from-indigo-500/30 to-indigo-700/30 border-indigo-500/40',
  ];
  const gammeColor = (gamme: string | undefined) => {
    if (!gamme) return GAMME_COLORS[GAMME_COLORS.length - 1];
    let hash = 0;
    for (let i = 0; i < gamme.length; i += 1) hash = (hash * 31 + gamme.charCodeAt(i)) % GAMME_COLORS.length;
    return GAMME_COLORS[hash];
  };

  const vipStatus = (selectedCustomer?.vip_status ?? 'STANDARD') as
    | 'STANDARD'
    | 'VIP'
    | 'VIP_PREMIUM';

  const vipDiscountRate = vipDiscountMap[vipStatus] ?? 0;

  useEffect(() => {
    if (!selectedCustomer) return;

    const normalizedCustomer = {
      ...selectedCustomer,
      vip_status: selectedCustomer.vip_status ?? 'STANDARD',
      loyalty_points: Number(selectedCustomer.loyalty_points ?? 0),
      total_spent_xof: Number(selectedCustomer.total_spent_xof ?? 0),
    };

    setSelectedCustomer(normalizedCustomer);
    // selectedCustomer volontairement absent des dépendances : cet effet re-crée
    // un nouvel objet à chaque exécution, l'ajouter provoquerait une boucle infinie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer?.id]);

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity * item.appliedUnitPriceXof, 0),
    [cart]
  );

  // Calcul centralisé dans lib/pricing.ts (testé par __tests__/pricing.test.ts) :
  // sous-total, remise VIP, remise code promo, et plafond sur leur cumul.
  const {
    vipDiscountAmount,
    requestedDiscountAmount,
    discountIsCapped,
    discountAmount,
    total,
  } = computeCartTotals(subtotal, vipDiscountRate, promoDiscount);

  const applyPromoCode = async () => {
    if (!promoCode.trim()) {
      setPromoDiscount(0);
      setPromoError(null);
      return;
    }

    try {
      const { validateAndApplyPromoCode } = await import('@/lib/services/promotions');
      const result = await validateAndApplyPromoCode(promoCode, subtotal);
      if (!result.valid) {
        setPromoDiscount(0);
        setPromoError(result.message);
        return;
      }
      setPromoDiscount(result.discountAmount);
      setPromoError(null);
    } catch (error) {
      console.warn('applyPromoCode failed', error);
      setPromoDiscount(0);
      setPromoError('Code promo invalide ou indisponible.');
    }
  };

  const handleAddProduct = (product: PosProduct) => {
    setMessage(null);
    const existing = cart.find((item) => item.product.id === product.id);
    const desiredQty = (existing?.quantity ?? 0) + 1;

    if (desiredQty > product.stock) {
      setMessage(
        `Stock insuffisant : ${product.stock} disponible(s) pour ${product.name}`
      );
      return;
    }

    setCart((prev) => {
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      const appliedUnitPriceXof = product.standard_retail_price_xof;
      return [
        ...prev,
        {
          product,
          quantity: 1,
          appliedUnitPriceXof,
          isUnderFloorPrice: appliedUnitPriceXof < product.floor_price_xof,
        },
      ];
    });
  };

  // Prix unitaire réellement appliqué à une ligne (le caissier peut négocier).
  // On recalcule `isUnderFloorPrice` à chaque frappe pour l'alerte visuelle.
  const handlePriceChange = (productId: string, raw: string) => {
    setMessage(null);
    // On ne garde que les chiffres. Tant que le champ est vide (l'utilisateur
    // est en train d'effacer pour taper un nouveau prix), on ne touche pas au
    // state : ça évite de forcer un "0" au milieu de la frappe, qui cassait
    // la saisie directe d'un nouveau montant.
    const digitsOnly = raw.replace(/\D/g, '');
    if (digitsOnly === '') return;
    const parsed = Number(digitsOnly);
    setCart((prev) =>
      prev.map((item) => {
        if (item.product.id !== productId) return item;
        const appliedUnitPriceXof = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
        return {
          ...item,
          appliedUnitPriceXof,
          isUnderFloorPrice:
            item.product.floor_price_xof > 0 &&
            appliedUnitPriceXof < item.product.floor_price_xof,
        };
      })
    );
  };

  const handleQuantityChange = (productId: string, delta: number) => {
    setMessage(null);
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id !== productId) return item;
          const nextQty = item.quantity + delta;
          if (delta > 0 && nextQty > item.product.stock) {
            setMessage(
              `Stock insuffisant : ${item.product.stock} disponible(s) pour ${item.product.name}`
            );
            return item;
          }
          return { ...item, quantity: Math.max(0, nextQty) };
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const handleQuickCreateCustomer = async () => {
    const fullName = quickCustomer.full_name.trim();
    const phone = quickCustomer.phone.trim();
    if (!fullName || !phone) {
      setMessage('Nom et téléphone requis pour créer un client.');
      return;
    }

    setIsCreatingCustomer(true);
    try {
      const created = await createCustomer({
        full_name: fullName,
        phone,
        country: quickCustomer.country,
        vip_status: 'STANDARD',
      });

      setSelectedCustomer(created ?? null);
      setCustomerQuery(phone);
      setQuickCustomer({ full_name: '', phone: '', country: 'SN' });
      setMessage(`Client ${fullName} créé avec succès.`);
    } catch (error) {
      console.error('Erreur création client:', error);
      setMessage('Impossible de créer le client.');
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  // Confirmation intégrée (remplace window.confirm) avant une vente sous le
  // prix plancher : on mémorise le message à afficher, la validation reprend
  // au clic sur "Confirmer quand même".
  const [floorWarning, setFloorWarning] = useState<{ lines: string; roleNote: string } | null>(null);

  const handleFinalizeSale = async (skipFloorCheck = false) => {
    setPaymentError(null);
    if (cart.length === 0) {
      setMessage('Ajoutez au moins un produit avant validation.');
      return;
    }

    // Paiement mixte : la somme des montants saisis doit correspondre EXACTEMENT
    // au total de la vente, sinon on bloque avec un message visible près du bouton.
    if (paymentMethod === 'SPLIT') {
      const c = Number(splitCash || 0);
      const o = Number(splitOther || 0);
      const sum = Math.round((c + o) * 100) / 100;
      if (sum !== Math.round(total * 100) / 100) {
        setPaymentError(
          `Le total des montants saisis (${sum.toLocaleString('fr-FR')} FCFA) ne correspond pas au total de la vente (${total.toLocaleString('fr-FR')} FCFA).`
        );
        return;
      }
    }

    // Contrôle du prix plancher : aucune ligne ne doit passer sous
    // `floor_price_xof` sans confirmation explicite du caissier. La vente
    // reste possible (négociation, geste commercial) mais elle est tracée
    // en base pour audit (voir log_floor_price_sale).
    const underFloor = cart.filter(
      (item) => item.isUnderFloorPrice && item.product.floor_price_xof > 0
    );
    if (underFloor.length > 0) {
      const lines = underFloor
        .map(
          (item) =>
            `• ${item.product.name} : ${item.appliedUnitPriceXof.toLocaleString('fr-FR')} FCFA ` +
            `(plancher ${item.product.floor_price_xof.toLocaleString('fr-FR')} FCFA)`
        )
        .join('\n');
      const roleNote =
        role === 'DIRECTION' || role === 'GERANT'
          ? 'Cette dérogation sera enregistrée pour audit.'
          : "Vente sous le prix plancher : elle sera enregistrée ET signalée à la direction pour audit.";

      if (!skipFloorCheck) {
        setFloorWarning({ lines, roleNote });
        return;
      }
    }

    setIsSubmittingSale(true);
    // Resilient flow: try service calls individually and never block the UI
    const paymentReference = `PAY-${Date.now()}`;
    let saleResult: { sale: SaleReceipt; receipt: ReceiptData } | null = null;
    let refreshedCustomer: Customer | null = null;

    try {
      // Validate payment options
      if (isPartial) {
        const paid = Number(partialAmount || 0);
        if (paid <= 0 || paid > total) {
          setMessage('Montant d\u00e9pos\u00e9 invalide pour acompte.');
          setIsSubmittingSale(false);
          return;
        }
      }

      if (paymentMethod === 'SPLIT') {
        const c = Number(splitCash || 0);
        const o = Number(splitOther || 0);
        if (Math.round((c + o) * 100) / 100 !== Math.round(total * 100) / 100) {
          setMessage('La somme des montants pour le paiement mixte doit \'\u00eatre égale au total.');
          setIsSubmittingSale(false);
          return;
        }
      }
      // Build payment payload
      let finalPaymentMethod = 'ESPECES';
      let paymentDetails: Record<string, number> | null = null;

      if (isPartial) {
        finalPaymentMethod = 'PARTIAL_PAYMENT';
        const paid = Number(partialAmount || 0);
        paymentDetails = { paid, balance: Math.max(0, total - paid) };
      } else if (paymentMethod === 'SPLIT') {
        finalPaymentMethod = 'SPLIT';
        // Nom réel de la 2ᵉ méthode saisi par le caissier (ex. « WAVE ») ;
        // « Autre » seulement si le champ est laissé vide.
        const otherLabel = splitOtherLabel.trim() || 'Autre';
        paymentDetails = { cash: Number(splitCash || 0), [otherLabel]: Number(splitOther || 0) };
      } else {
        finalPaymentMethod = paymentMethod ?? 'ESPECES';
      }

      try {
        saleResult = await createSaleWithCustomer({
          customer_id: selectedCustomer?.id ?? null,
          cashier_name: cashierName,
          store_name: effectiveStoreCode,
          payment_method: finalPaymentMethod,
          payment_reference: paymentReference,
          items: cart.map((item) => ({
            id: item.product.id,
            product_id: item.product.id,
            name: item.product.name,
            sku: item.product.sku,
            quantity: item.quantity,
            unit_price_xof: item.appliedUnitPriceXof,
            total_price_xof: item.quantity * item.appliedUnitPriceXof,
            floor_price_xof: item.product.floor_price_xof,
          })),
          subtotal_xof: subtotal,
          discount_xof: discountAmount,
          total_xof: total,
          payment_details: paymentDetails,
          notes: isPartial ? `Acompte: ${paymentDetails?.paid ?? 0} FCFA — Solde: ${paymentDetails?.balance ?? total} FCFA` : undefined,
        });
      } catch (err) {
        // Échec réel de l'enregistrement : PAS de reçu, PAS de vidage du panier.
        // L'utilisateur peut ajuster les quantités et réessayer.
        console.error('Erreur createSaleWithCustomer (bloquante):', err);
        if (err instanceof InsufficientStockError) {
          setMessage(err.message);
        } else {
          setMessage(
            `La vente n'a pas pu être enregistrée : ${err instanceof Error ? err.message : 'erreur inconnue'}. Le panier est conservé.`
          );
        }
        setIsSubmittingSale(false);
        return;
      }

      try {
        if (selectedCustomer?.id) {
          refreshedCustomer = await addLoyaltyPoints(selectedCustomer.id, total);
        }
      } catch (err) {
        console.warn('Erreur addLoyaltyPoints (non bloquante):', err);
      }

      // Ensure a receipt is generated locally even if services failed
      const pointsEarned = Math.floor(total / 1000);
      const customerForReceipt = refreshedCustomer ?? selectedCustomer ?? undefined;

      // Base = reçu construit par le service (mode de paiement réel, détails de
      // paiement, n° de reçu). On n'écrase QUE les champs fidélité calculés ici.
      const serviceReceipt: Partial<ReceiptData> = saleResult?.receipt ?? {};

      const receiptPayload = {
        ...serviceReceipt,
        receiptNumber: serviceReceipt.receiptNumber ?? `LMB-${Date.now()}`,
        createdAt: serviceReceipt.createdAt ?? new Date().toISOString(),
        cashierName: cashierName,
        storeName: effectiveStoreCode,
        customer: customerForReceipt,
        customerName: customerForReceipt?.full_name ?? 'Client non identifié',
        customerPhone: customerForReceipt?.phone ?? '—',
        items: cart.map((item) => ({
          id: item.product.id,
          sku: item.product.sku,
          name: item.product.name,
          quantity: item.quantity,
          unit_price_xof: item.appliedUnitPriceXof,
          total_price_xof: item.quantity * item.appliedUnitPriceXof,
        })),
        subtotalXof: subtotal,
        discountXof: discountAmount,
        totalXof: total,
        paymentMethod: finalPaymentMethod,
        paymentReference,
        paymentDetails,
        pointsEarned,
        pointsBalance: Number(customerForReceipt?.loyalty_points ?? 0),
        vipStatus: customerForReceipt?.vip_status ?? 'STANDARD',
      };

      setReceipt(receiptPayload);
      setIsReceiptOpen(true);

      // À ce stade la vente ET le décrément de stock sont garantis côté base.
      setMessage(`Vente enregistrée. Total payé: ${total.toLocaleString('fr-FR')} FCFA.`);

      // Reset UI/cart in all cases to allow printing and continue operations
      setCart([]);
      setCustomerQuery('');
      setCustomerResults([]);
      setSelectedCustomer(null);
      setFloorWarning(null);
    } finally {
      setIsSubmittingSale(false);
    }
  };

  return (
    <AuthGuard>
      <main className="min-h-screen bg-[#F9F9FB] text-[#111111] print:hidden">
      <header className="border-b border-[#D4AF37]/30 bg-[#111111]/95 px-6 py-4 text-[#F9F9FB] backdrop-blur-sm shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-[#D4AF37]">LMBS</p>
            <h1 className="mt-1 text-xl font-bold text-white">Caisse</h1>
            {/* Removed inline under-title badge — single dynamic badge lives in header right */}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className={`inline-flex items-center gap-2 rounded-full border border-gray-700 bg-[#1A1A1A] px-3 py-1 text-xs font-semibold ${registerSession ? 'text-emerald-200' : 'text-rose-200'}`}>
              {registerSession ? '🟢 Caisse Ouverte' : '🔴 Caisse Fermée'}
            </span>

            {registerSession ? (
              <>
                <CashExpenseButton
                  cashierName={registerSession?.cashier_name ?? cashierName}
                  storeCode={registerSession?.store_code ?? effectiveStoreCode}
                  onSuccess={() => refreshRegister()}
                  onClose={() => refreshRegister()}
                />
                <CloseRegisterButton
                  storeCode={registerSession?.store_code ?? effectiveStoreCode}
                  onSuccess={() => refreshRegister()}
                  onClose={() => refreshRegister()}
                />
              </>
            ) : (
              <OpenRegisterButton
                storeCode={effectiveStoreCode || undefined}
                cashierName={cashierName}
                onSuccess={() => refreshRegister()}
              />
            )}
            <Link
              href="/admin/customers"
              className="rounded-xl border border-gray-700 bg-[#1A1A1A] px-4 py-2 text-sm font-semibold text-white hover:border-[#D4AF37] transition"
            >
              CRM Clients VIP
            </Link>
            {(role === 'GERANT' || role === 'DIRECTION') && (
              <Link
                href="/admin"
                className="px-3 py-2 text-sm font-medium text-[#D4AF37] hover:text-[#F5E3B3]"
              >
                ← Dashboard Admin
              </Link>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-xl border border-gray-700 bg-[#1A1A1A] px-4 py-2 text-sm font-semibold text-white hover:border-[#D4AF37] transition"
            >
              Se déconnecter
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <section className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
        <div className="rounded-2xl border border-[#D4AF37]/30 bg-[#111111] p-6 shadow-luxury shadow-[#D4AF37]/10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-[#D4AF37]">
                {registerSession ? 'Session active' : 'Aucune caisse ouverte'}
              </p>
              <h2 className="mt-1 text-2xl font-bold text-white">Vente / Encaissement</h2>
            </div>
            {/* Même source de vérité que le badge de l'en-tête : l'état réel de
                la caisse lu depuis `lmb_registers` (registerSession). */}
            <span
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                registerSession
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
              }`}
            >
              {registerSession ? 'Caisse ouverte' : 'Caisse fermée'}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-[#D4AF37]/25 bg-[#1A1A1A] p-6 shadow-md shadow-[#D4AF37]/10">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-white">Client</h3>
            {selectedCustomer ? (
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] ${
                    vipStatus === 'VIP_PREMIUM'
                      ? 'border-[#D4AF37] bg-gradient-to-r from-[#D4AF37] to-[#C5A059] text-white shadow-sm'
                      : vipStatus === 'VIP'
                        ? 'border-[#E7D393] bg-[#F5E3B3] text-[#111111] shadow-sm'
                        : 'border-[#D9D9D9] bg-[#F9F9FB] text-[#111111]'
                  }`}
                >
                  <span className="text-sm leading-none">{vipStatus === 'VIP_PREMIUM' ? '👑' : vipStatus === 'VIP' ? '★' : '•'}</span>
                  {vipStatus}
                </span>

                <span className="rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-2.5 py-1 text-[11px] font-bold text-[#F9F9FB]">
                  -{(vipDiscountRate * 100).toFixed(0)}%
                </span>

                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-200">
                  {Number(selectedCustomer.loyalty_points ?? 0)} pts
                </span>
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            {!selectedCustomer && quickCustomers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {quickCustomers.map((customer) => {
                  const isVip = customer.vip_status && customer.vip_status !== 'STANDARD';
                  return (
                    <button
                      key={customer.id ?? `${customer.phone}-${customer.full_name}`}
                      type="button"
                      onClick={() => {
                        setSelectedCustomer(customer);
                        setCustomerQuery('');
                        setCustomerResults([]);
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition hover:brightness-110 ${
                        isVip
                          ? 'border-[#D4AF37]/50 bg-[#D4AF37]/10 text-[#F5E3B3]'
                          : 'border-slate-700 bg-slate-900 text-slate-300'
                      }`}
                    >
                      {isVip && <span>{customer.vip_status === 'VIP_PREMIUM' ? '👑' : '★'}</span>}
                      {customer.full_name || customer.phone}
                    </button>
                  );
                })}
              </div>
            )}

            <Input
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
              placeholder="Rechercher un client par nom, téléphone ou email"
              className="rounded-xl px-4 py-3 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
            />

            {isSearching && <p className="text-xs text-cyan-300">Recherche en cours...</p>}

            {customerResults.length > 0 && !selectedCustomer ? (
              <div className="rounded-xl border border-slate-700 bg-slate-950 p-2">
                {customerResults.map((customer) => (
                  <button
                    key={customer.id ?? `${customer.phone}-${customer.full_name}`}
                    type="button"
                    onClick={() => {
                      setSelectedCustomer(customer);
                      setCustomerQuery('');
                      setCustomerResults([]);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition hover:bg-slate-800"
                  >
                    <div>
                      <p className="font-semibold text-white">{customer.full_name ?? 'Client'}</p>
                      <p className="text-xs text-slate-400">{customer.phone} • {customer.email ?? 'Sans email'}</p>
                    </div>
                    <span className="text-xs text-cyan-300">
                      {customer.vip_status ?? 'STANDARD'}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            {!selectedCustomer ? (
              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/50 p-4">
                <p className="mb-3 text-sm font-medium text-slate-300">Créer rapidement un client</p>
                <div className="grid gap-3 md:grid-cols-3">
                  <Input
                    value={quickCustomer.full_name}
                    onChange={(e) => setQuickCustomer((prev) => ({ ...prev, full_name: e.target.value }))}
                    placeholder="Nom complet"
                    className="rounded-lg"
                  />
                  <Input
                    value={quickCustomer.phone}
                    onChange={(e) => setQuickCustomer((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="Téléphone"
                    className="rounded-lg"
                  />
                  <Select
                    value={quickCustomer.country}
                    onChange={(e) => setQuickCustomer((prev) => ({ ...prev, country: e.target.value }))}
                    className="rounded-lg"
                  >
                    <option value="SN">Sénégal</option>
                    <option value="CI">Côte d’Ivoire</option>
                  </Select>
                </div>
                <button
                  type="button"
                  onClick={handleQuickCreateCustomer}
                  disabled={isCreatingCustomer}
                  className="mt-3 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-60"
                >
                  {isCreatingCustomer ? 'Création...' : 'Créer client'}
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-slate-900 to-slate-950 p-4 text-sm text-emerald-100 shadow-lg shadow-emerald-950/20">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="mb-2 flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-white text-base">{selectedCustomer.full_name}</p>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] ${
                          vipStatus === 'VIP_PREMIUM'
                            ? 'border-amber-300 bg-gradient-to-r from-amber-600 to-yellow-500 text-white shadow-sm'
                            : vipStatus === 'VIP'
                              ? 'border-amber-300 bg-amber-100 text-amber-800 shadow-sm'
                              : 'border-slate-200 bg-slate-100/80 text-slate-700'
                        }`}
                      >
                        <span className="text-sm leading-none">{vipStatus === 'VIP_PREMIUM' ? '👑' : vipStatus === 'VIP' ? '★' : '•'}</span>
                        {vipStatus}
                      </span>
                      <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-cyan-200">
                        -{(vipDiscountRate * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-emerald-200/80">{selectedCustomer.phone}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(null)}
                    className="text-xs font-medium text-emerald-100 underline"
                  >
                    Changer
                  </button>
                </div>
              </div>
            )}

            {message ? (
              <p className="rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-2 text-sm text-[#111111] font-medium">
                {message}
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-[1.4fr_0.6fr]">
          <div className="rounded-2xl border border-[#D4AF37]/25 bg-[#1A1A1A] p-6 shadow-md shadow-[#D4AF37]/10">
            <h3 className="mb-4 text-lg font-semibold text-white">Panier</h3>

            {!activeStoreCity ? (
              <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
                <p className="mb-2 font-semibold">
                  Aucune boutique assignée à votre compte.
                </p>
                <p className="mb-3 text-amber-200/80">
                  Sélectionnez la boutique de vente pour rechercher des produits et
                  encaisser.
                </p>
                <div className="flex gap-2">
                  {(['DAKAR', 'ABIDJAN'] as StoreCity[]).map((city) => (
                    <button
                      key={city}
                      type="button"
                      onClick={() => setSelectedStoreCity(city)}
                      className="rounded-lg border border-amber-400/50 bg-[#111111] px-4 py-2 text-xs font-bold text-amber-100 transition hover:bg-amber-500 hover:text-[#111111]"
                    >
                      {city}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mb-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Input
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    placeholder="Rechercher un produit par nom, SKU ou code-barres"
                    className="rounded-xl px-4 py-3 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  />
                  {!staffStoreCity ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStoreCity(null);
                        setProductQuery('');
                        setProductResults([]);
                      }}
                      className="whitespace-nowrap rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-[#F5E3B3]"
                    >
                      {activeStoreCity} · changer
                    </button>
                  ) : null}
                </div>

                {isSearchingProduct && (
                  <p className="text-xs text-cyan-300">Recherche en cours...</p>
                )}

                {productResults.length > 0 ? (
                  <div className="rounded-xl border border-slate-700 bg-slate-950 p-2">
                    {productResults.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => {
                          handleAddProduct(product);
                          setProductQuery('');
                          setProductResults([]);
                        }}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition hover:bg-slate-800"
                      >
                        <div>
                          <p className="font-semibold text-white">{product.name}</p>
                          <p className="text-xs text-slate-400">
                            {product.sku} • {product.standard_retail_price_xof.toLocaleString('fr-FR')} FCFA
                          </p>
                        </div>
                        <span
                          className={`text-xs font-bold ${
                            product.stock > 0 ? 'text-emerald-300' : 'text-rose-300'
                          }`}
                        >
                          Stock : {product.stock}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {/* Grille de vente par gamme : visible tant qu'aucune recherche
                    texte n'est en cours, pour ajouter un produit en 1 clic
                    sans avoir à taper son nom. */}
                {!productQuery.trim() && (
                  <div className="space-y-3">
                    {catalogLoading ? (
                      <LoadingState label="Chargement du catalogue…" className="py-4" />
                    ) : gammes.length === 0 ? (
                      <p className="text-xs text-slate-500">Aucun produit dans le catalogue de cette boutique.</p>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedGamme(null)}
                            className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition ${
                              selectedGamme === null
                                ? 'bg-gradient-to-r from-[#D4AF37] to-[#C5A059] text-black'
                                : 'border border-slate-700 bg-slate-900 text-slate-300 hover:text-white'
                            }`}
                          >
                            Toutes ({catalogProducts.length})
                          </button>
                          {gammes.map((gamme) => {
                            const count = catalogProducts.filter((p) =>
                              gamme === 'Sans gamme'
                                ? !p.category_name || !p.category_name.trim()
                                : p.category_name === gamme,
                            ).length;
                            return (
                              <button
                                key={gamme}
                                type="button"
                                onClick={() => setSelectedGamme(gamme)}
                                className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition ${
                                  selectedGamme === gamme
                                    ? 'bg-gradient-to-r from-[#D4AF37] to-[#C5A059] text-black'
                                    : 'border border-slate-700 bg-slate-900 text-slate-300 hover:text-white'
                                }`}
                              >
                                {gamme} ({count})
                              </button>
                            );
                          })}
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                          {gridProducts.map((product) => {
                            const outOfStock = product.stock <= 0;
                            return (
                              <button
                                key={product.id}
                                type="button"
                                disabled={outOfStock}
                                onClick={() => handleAddProduct(product)}
                                className={`flex flex-col items-center gap-1.5 rounded-2xl border bg-gradient-to-br p-3 text-center transition hover:scale-[1.02] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 ${gammeColor(
                                  product.category_name,
                                )}`}
                                title={outOfStock ? `${product.name} — rupture de stock` : product.name}
                              >
                                <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-black/30 text-sm font-black text-white">
                                  {product.photo_url ? (
                                    // Photo hébergée sur Supabase Storage (URL dynamique) : <img>
                                    // classique, pas de next/image (domaine non connu à la compilation).
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={product.photo_url}
                                      alt={product.name}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    productInitials(product.name)
                                  )}
                                </span>
                                <span className="line-clamp-2 text-[11px] font-bold leading-tight text-white">
                                  {product.name}
                                </span>
                                <span className="text-[11px] font-semibold text-amber-100">
                                  {product.standard_retail_price_xof.toLocaleString('fr-FR')} FCFA
                                </span>
                                <span className={`text-[10px] font-bold ${outOfStock ? 'text-rose-300' : 'text-emerald-300'}`}>
                                  {outOfStock ? 'Rupture' : `Stock : ${product.stock}`}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3 text-sm text-slate-300">
              {cart.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[#D4AF37]/30 bg-[#111111]/60 p-4 text-center text-[#D7D7D7]">
                  Aucun produit dans le panier.
                </p>
              ) : (
                cart.map((item) => (
                  <div key={item.product.id} className={`rounded-xl border p-3 shadow-sm ${item.isUnderFloorPrice ? 'border-rose-500/60 bg-rose-950/40' : 'border-[#D4AF37]/15 bg-[#111111]/80'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">{item.product.name}</p>
                        <p className="text-xs text-[#CFCFCF]">
                          {item.product.sku} · stock {item.product.stock}
                          {item.product.floor_price_xof > 0 ? (
                            <span className="ml-2 text-[#9a9a9a]">
                              plancher {item.product.floor_price_xof.toLocaleString('fr-FR')} FCFA
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <span className="shrink-0 whitespace-nowrap text-right font-semibold text-[#D4AF37]">
                        {(item.quantity * item.appliedUnitPriceXof).toLocaleString('fr-FR')} FCFA
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] font-medium uppercase tracking-wide text-[#9a9a9a]">Prix unit.</label>
                        <div className="relative">
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={String(item.appliedUnitPriceXof)}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => handlePriceChange(item.product.id, e.target.value)}
                            className={`w-32 rounded-lg py-1.5 pl-2 pr-10 text-sm font-semibold ${item.isUnderFloorPrice ? 'border-rose-500 text-rose-200' : ''}`}
                          />
                          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#9a9a9a]">FCFA</span>
                        </div>
                        {item.isUnderFloorPrice ? (
                          <span className="text-[11px] font-bold text-rose-300">⚠️ sous plancher</span>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(item.product.id, -1)}
                          className="h-8 w-8 rounded-lg bg-[#F3F4F6] text-lg text-[#111111] shadow-sm transition hover:bg-[#D4AF37]"
                        >
                          −
                        </button>
                        <span className="min-w-6 text-center font-semibold text-white">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(item.product.id, 1)}
                          className="h-8 w-8 rounded-lg bg-[#D4AF37] text-lg text-[#111111] shadow-sm transition hover:bg-[#C5A059]"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

                <div className="rounded-2xl border border-[#D4AF37]/30 bg-[#1A1A1A] p-6 shadow-md shadow-[#D4AF37]/10">
            <h3 className="mb-4 text-lg font-semibold text-white">Total</h3>
            <div className="space-y-3 text-sm text-gray-200">
              <div className="flex justify-between">
                <span>Sous-total</span>
                <span>{subtotal.toLocaleString('fr-FR')} FCFA</span>
              </div>
              <div className="flex justify-between">
                <span>Remise VIP</span>
                <span>- {vipDiscountAmount.toLocaleString('fr-FR')} FCFA</span>
              </div>
              <div className="flex justify-between">
                <span>Promo</span>
                <span>- {promoDiscount.toLocaleString('fr-FR')} FCFA</span>
              </div>
              {discountIsCapped ? (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200">
                  Remise plafonnée à {(MAX_TOTAL_DISCOUNT_RATE * 100).toFixed(0)}% du sous-total
                  {' '}(- {discountAmount.toLocaleString('fr-FR')} FCFA appliqués au lieu de
                  {' '}- {requestedDiscountAmount.toLocaleString('fr-FR')} FCFA demandés).
                </div>
              ) : null}
                <div className="mt-3 flex justify-between border-t border-slate-700 pt-3 text-lg font-bold text-white">
                <span>Total</span>
                <span>{total.toLocaleString('fr-FR')} FCFA</span>
              </div>

              <div className="mt-5 space-y-4 border-t border-slate-700/60 pt-4">
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Code Promo</label>
                  <div className="flex gap-2">
                    <Input
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                      placeholder="EX: BIENVENUE10"
                      className="text-sm"
                    />
                    <button
                      type="button"
                      onClick={applyPromoCode}
                      className="shrink-0 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-200 transition hover:bg-amber-500/20"
                    >
                      Appliquer
                    </button>
                  </div>
                  {promoError ? <p className="mt-1.5 text-xs text-rose-300">{promoError}</p> : null}
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Moyen de paiement</label>
                  <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="rounded-lg">
                    <option value="ESPECES">Espèces</option>
                    <option value="CB">Carte (CB)</option>
                    <option value="WAVE">Wave / Mobile</option>
                    <option value="OM">Orange Money</option>
                    <option value="SPLIT">Paiement Mixte</option>
                  </Select>
                </div>

                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2.5">
                  <span className="text-sm text-slate-200">Acompte / Réservation</span>
                  <span className="relative inline-flex h-5 w-9 shrink-0 items-center">
                    <input
                      type="checkbox"
                      checked={isPartial}
                      onChange={(e) => setIsPartial(e.target.checked)}
                      className="peer sr-only"
                    />
                    <span className="absolute inset-0 rounded-full bg-slate-700 transition peer-checked:bg-[#D4AF37]" />
                    <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-4" />
                  </span>
                </label>

                {paymentMethod === 'SPLIT' && (
                  <div className="grid gap-2 rounded-xl border border-slate-700 bg-slate-950/40 p-3 md:grid-cols-2">
                    <div>
                      <label className="text-xs text-slate-400">Montant Espèces</label>
                      <Input type="number" value={splitCash} onChange={(e) => setSplitCash(e.target.value)} className="rounded-lg" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">Montant Autre</label>
                      <Input type="number" value={splitOther} onChange={(e) => setSplitOther(e.target.value)} className="rounded-lg" />
                      <Input type="text" value={splitOtherLabel} onChange={(e) => setSplitOtherLabel(e.target.value)} className="mt-1 rounded-lg text-xs" placeholder="Label (ex: CB, WAVE)" />
                    </div>
                  </div>
                )}

                {isPartial && (
                  <div className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                    <label className="text-xs font-medium text-amber-200">Montant versé aujourd&apos;hui</label>
                    <Input type="number" value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)} className="rounded-lg" />
                    <p className="text-xs text-slate-400">Solde restant: {(Math.max(0, total - Number(partialAmount || 0))).toLocaleString('fr-FR')} FCFA</p>
                  </div>
                )}
              </div>

              {selectedCustomer ? (
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs text-cyan-100">
                  <p className="font-semibold">Client sélectionné</p>
                  <p>{selectedCustomer.full_name}</p>
                  <p>Statut: {vipStatus}</p>
                  <p>Points: {Number(selectedCustomer.loyalty_points ?? 0)}</p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-xs text-slate-400">
                  Aucun client sélectionné : vente standard.
                </div>
              )}

              {cart.some((item) => item.isUnderFloorPrice) ? (
                <div className="rounded-xl border border-rose-500/50 bg-rose-500/10 p-3 text-xs font-semibold text-rose-200">
                  ⚠️ Un ou plusieurs articles sont vendus sous leur prix plancher.
                  Une confirmation sera demandée et la vente sera tracée pour audit.
                </div>
              ) : null}

              {paymentError ? (
                <div className="mt-3 rounded-xl border border-rose-500/50 bg-rose-500/10 p-3 text-xs font-semibold text-rose-200">
                  {paymentError}
                </div>
              ) : null}

              {floorWarning ? (
                <div className="mt-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-100">
                  <p className="mb-1 font-bold">⚠️ Vente sous le prix plancher</p>
                  <p className="whitespace-pre-line">{floorWarning.lines}</p>
                  <p className="mt-2">{floorWarning.roleNote}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setFloorWarning(null);
                        setMessage('Vente annulée : un article est sous le prix plancher.');
                      }}
                      className="flex-1 rounded-lg border border-slate-600 bg-slate-800 py-1.5 text-[11px] font-bold text-slate-200"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFloorWarning(null);
                        handleFinalizeSale(true);
                      }}
                      className="flex-1 rounded-lg bg-amber-500 py-1.5 text-[11px] font-bold text-black"
                    >
                      Confirmer quand même
                    </button>
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => handleFinalizeSale()}
                disabled={isSubmittingSale || cart.length === 0}
                className="mt-3 w-full rounded-xl bg-[#D4AF37] text-black font-bold py-2 px-4 hover:bg-[#C5A059] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmittingSale ? 'Validation en cours...' : 'Valider le paiement'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>

    <ReceiptModal
      isOpen={isReceiptOpen}
      onClose={() => setIsReceiptOpen(false)}
      receipt={receipt}
    />
    </AuthGuard>
  );
}
