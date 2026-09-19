'use client';

import LoadingState from '@/components/ui/LoadingState';
import { useEffect, useMemo, useState } from 'react';
import SecondaryButton from '@/components/ui/SecondaryButton';
import PrimaryButton from '@/components/ui/PrimaryButton';
import EstimationBadge from '@/components/ui/EstimationBadge';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import {
  AlertTriangle,
  ArrowLeft,
  BadgePercent,
  Check,
  Loader2,
  Plus,
  Power,
  Search,
  Tag,
} from 'lucide-react';
import {
  listProducts,
  updateProductPrice,
  uploadProductPhoto,
  removeProductPhoto,
  type EditablePriceField,
  type PosProduct,
} from '@/lib/services/products';
import { buildCostByKey, resolveUnitCost } from '@/lib/services/cost';
import {
  createPromotion,
  listPromotions,
  togglePromotionStatus,
  type Promotion,
} from '@/lib/services/promotions';

const formatMoney = (value: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));

const digitsToNumber = (raw: string): number => {
  const digits = raw.replace(/\D/g, '');
  return digits === '' ? 0 : parseInt(digits, 10);
};

// Initiales de repli tant qu'aucune photo n'est déposée (même logique que la
// Caisse, cf. `productInitials` dans app/page.tsx).
const productInitials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

type CellStatus = 'saving' | 'saved' | { error: string };

// ============================================================================
// PAGE
// ============================================================================

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-8 lmb-pricing">
      <div className="mb-6 flex items-center gap-3">
        <SecondaryButton
          href="/admin"
          className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.18em]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour
        </SecondaryButton>
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-300">Direction • Pilotage des prix</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-white">
            <Tag className="h-6 w-6 text-[#D4AF37]" />
            Grille Tarifaire & Promotions
          </h1>
        </div>
      </div>

      <PriceGridSection />
      <PromotionsSection />
    </main>
  );
}

// ============================================================================
// PARTIE 1 — GRILLE DES PRIX
// ============================================================================

function PriceGridSection() {
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Record<string, CellStatus>>({});

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await listProducts('DAKAR');
      setProducts(rows);
      if (rows.length === 0) setLoadError('Aucun produit dans le catalogue (lmb_products).');
    } catch (err) {
      console.error('listProducts', err);
      setLoadError('Impossible de charger le catalogue produits.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const costByKey = useMemo(() => buildCostByKey(products), [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.category_name ?? '').toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q),
    );
  }, [products, search]);

  const incoherentCount = useMemo(
    () => products.filter((p) => Number(p.floor_price_xof) > Number(p.standard_retail_price_xof)).length,
    [products],
  );

  const handleEdit = (id: string, field: EditablePriceField, raw: string) => {
    const num = digitsToNumber(raw);
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: num } : p)));
  };

  const persist = async (id: string, field: EditablePriceField) => {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    const key = `${id}:${field}`;
    setStatus((s) => ({ ...s, [key]: 'saving' }));
    try {
      await updateProductPrice(id, field, Number((product as unknown as Record<string, unknown>)[field] ?? 0));
      setStatus((s) => ({ ...s, [key]: 'saved' }));
      setTimeout(() => {
        setStatus((s) => {
          if (s[key] !== 'saved') return s;
          const next = { ...s };
          delete next[key];
          return next;
        });
      }, 2000);
    } catch (err) {
      setStatus((s) => ({
        ...s,
        [key]: { error: err instanceof Error ? err.message : 'Sauvegarde impossible.' },
      }));
    }
  };

  return (
    <section className="mb-10 rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
      <div className="mb-4 flex flex-col gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <Tag className="h-4 w-4 text-cyan-400" />
            Grille des prix ({filtered.length}/{products.length})
          </h2>
          <p className="text-xs text-slate-400">
            Prix standard, prix plancher et coût d&apos;achat éditables. La sauvegarde se déclenche en quittant la
            case.
          </p>
        </div>
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrer par nom, catégorie ou SKU…"
            className="pl-9 sm:w-72"
          />
        </label>
      </div>

      {incoherentCount > 0 && (
        <p className="mb-4 flex items-center gap-2 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {incoherentCount} produit(s) ont un <strong>prix plancher supérieur au prix standard</strong> —
          incohérence de configuration à corriger (lignes surlignées ci-dessous).
        </p>
      )}

      {loading ? (
        <LoadingState label="Chargement du catalogue…" />
      ) : loadError && products.length === 0 ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">
          {loadError}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                <th className="py-2.5 pr-3">Photo</th>
                <th className="py-2.5 pr-3">Produit</th>
                <th className="py-2.5 px-3">Catégorie</th>
                <th className="py-2.5 px-3 text-right">Prix standard</th>
                <th className="py-2.5 px-3 text-right">Prix plancher</th>
                <th className="py-2.5 px-3 text-right">Coût d&apos;achat</th>
                <th className="py-2.5 px-3 text-right">Marge %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((p) => {
                const standard = Number(p.standard_retail_price_xof ?? 0);
                const incoherent = Number(p.floor_price_xof ?? 0) > standard;
                const { cost, estimated } = resolveUnitCost(
                  { id: p.id, sku: p.sku, unit_price_xof: standard },
                  costByKey,
                );
                const marginPct = standard > 0 ? ((standard - cost) / standard) * 100 : 0;

                return (
                  <tr
                    key={p.id}
                    className={incoherent ? 'bg-rose-500/10' : 'hover:bg-slate-800/40'}
                  >
                    <td className="py-2.5 pr-3">
                      <ProductPhotoCell
                        product={p}
                        onChange={(photoUrl) =>
                          setProducts((prev) =>
                            prev.map((row) => (row.id === p.id ? { ...row, photo_url: photoUrl } : row)),
                          )
                        }
                      />
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="font-semibold text-slate-100">{p.name}</div>
                      <div className="text-[10px] font-mono text-slate-500">{p.sku}</div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">{p.category_name ?? '—'}</td>
                    <PriceCell
                      value={standard}
                      status={status[`${p.id}:standard_retail_price_xof`]}
                      onChange={(v) => handleEdit(p.id, 'standard_retail_price_xof', v)}
                      onCommit={() => persist(p.id, 'standard_retail_price_xof')}
                    />
                    <PriceCell
                      value={Number(p.floor_price_xof ?? 0)}
                      status={status[`${p.id}:floor_price_xof`]}
                      warn={incoherent}
                      onChange={(v) => handleEdit(p.id, 'floor_price_xof', v)}
                      onCommit={() => persist(p.id, 'floor_price_xof')}
                    />
                    <PriceCell
                      value={Number(p.cost_price_xof ?? 0)}
                      status={status[`${p.id}:cost_price_xof`]}
                      placeholder
                      onChange={(v) => handleEdit(p.id, 'cost_price_xof', v)}
                      onCommit={() => persist(p.id, 'cost_price_xof')}
                    />
                    <td className="py-2.5 px-3 text-right">
                      <span
                        className={`font-mono font-bold ${
                          marginPct < 0 ? 'text-rose-300' : 'text-emerald-300'
                        }`}
                      >
                        {marginPct.toFixed(1)} %
                      </span>
                      {estimated && (
                        <div className="mt-0.5 flex justify-end">
                          <EstimationBadge />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ProductPhotoCell({
  product,
  onChange,
}: {
  product: PosProduct;
  onChange: (photoUrl: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputId = `product-photo-${product.id}`;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const photoUrl = await uploadProductPhoto(product.id, file);
      onChange(photoUrl);
    } catch (err) {
      alert(String(err instanceof Error ? err.message : err));
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setUploading(true);
    try {
      await removeProductPhoto(product.id);
      onChange(null);
    } catch (err) {
      alert(String(err instanceof Error ? err.message : err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor={inputId}
        className="relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-slate-700 bg-slate-800 text-[11px] font-bold text-slate-300 hover:border-[#D4AF37]"
        title="Déposer une photo"
      >
        {product.photo_url ? (
          // Photo hébergée sur Supabase Storage (URL dynamique) : <img> classique,
          // pas de next/image (domaine non connu à la compilation).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.photo_url} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          productInitials(product.name)
        )}
        {uploading && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/60">
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          </span>
        )}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={uploading}
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {product.photo_url && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={uploading}
          className="text-[10px] font-semibold text-slate-500 hover:text-rose-300 disabled:opacity-40"
        >
          Retirer
        </button>
      )}
    </div>
  );
}

function PriceCell({
  value,
  status,
  warn = false,
  placeholder = false,
  onChange,
  onCommit,
}: {
  value: number;
  status?: CellStatus;
  warn?: boolean;
  placeholder?: boolean;
  onChange: (raw: string) => void;
  onCommit: () => void;
}) {
  const hasError = typeof status === 'object';
  const empty = placeholder && (!value || value === 0);

  return (
    <td className="py-2.5 px-3 text-right align-top">
      <div className="flex flex-col items-end gap-1">
        <Input
          type="text"
          inputMode="numeric"
          value={empty ? '' : String(value)}
          placeholder={placeholder ? '—' : undefined}
          onFocus={(e) => e.target.select()}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          className={`w-24 p-1 text-right font-mono font-bold ${
            hasError
              ? 'border-rose-500 text-rose-300'
              : warn
                ? 'border-rose-500/60 text-rose-200'
                : empty
                  ? 'border-amber-600/60 text-amber-300 placeholder-amber-500/50'
                  : 'text-white'
          }`}
        />
        {status === 'saving' && (
          <span className="flex items-center gap-1 text-[10px] text-slate-400">
            <Loader2 className="h-3 w-3 animate-spin" /> …
          </span>
        )}
        {status === 'saved' && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400">
            <Check className="h-3 w-3" /> enregistré
          </span>
        )}
        {hasError && (
          <span className="max-w-[10rem] text-[10px] leading-tight text-rose-400">
            {(status as { error: string }).error}
          </span>
        )}
      </div>
    </td>
  );
}

// ============================================================================
// PARTIE 2 — PROMOTIONS
// ============================================================================

const emptyForm = {
  code: '',
  discount_type: 'PERCENT' as 'PERCENT' | 'FIXED',
  discount_value: '10',
  min_order_amount: '0',
  start_date: new Date().toISOString().slice(0, 16),
  end_date: '',
  usage_limit: '0',
};

function PromotionsSection() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    setListError(null);
    try {
      setPromotions(await listPromotions());
    } catch (err) {
      console.error('listPromotions', err);
      setListError('Impossible de charger les codes promo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const setField = (key: keyof typeof emptyForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleCreate = async () => {
    setFormError(null);
    const code = form.code.trim().toUpperCase();
    const value = Number(form.discount_value || 0);

    if (!code) {
      setFormError('Le code promo est requis.');
      return;
    }
    if (promotions.some((p) => (p.code ?? '').toUpperCase() === code)) {
      setFormError(`Le code promo « ${code} » existe déjà.`);
      return;
    }
    if (form.discount_type === 'PERCENT' && (value <= 0 || value > 100)) {
      setFormError('Un pourcentage de réduction doit être compris entre 1 et 100.');
      return;
    }
    if (form.discount_type === 'FIXED' && value <= 0) {
      setFormError('Le montant de la réduction (FCFA) doit être supérieur à 0.');
      return;
    }

    setCreating(true);
    try {
      await createPromotion({
        code,
        discount_type: form.discount_type,
        discount_value: value,
        min_order_amount: Number(form.min_order_amount || 0),
        start_date: form.start_date ? new Date(form.start_date).toISOString() : undefined,
        end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
        usage_limit: Number(form.usage_limit || 0) > 0 ? Number(form.usage_limit) : null,
        is_active: true,
      });
      setForm(emptyForm);
      await load();
    } catch (err) {
      console.error('createPromotion', err);
      setFormError(err instanceof Error ? err.message : 'Création de la promotion impossible.');
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (promo: Promotion) => {
    if (!promo.id) return;
    setRowError((prev) => {
      const next = { ...prev };
      delete next[promo.id!];
      return next;
    });
    try {
      await togglePromotionStatus(promo.id, !(promo.is_active ?? true));
      await load();
    } catch (err) {
      console.error('togglePromotionStatus', err);
      setRowError((prev) => ({
        ...prev,
        [promo.id!]: err instanceof Error ? err.message : 'Changement de statut impossible.',
      }));
    }
  };

  return (
    <section id="promotions" className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg scroll-mt-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-white">
        <BadgePercent className="h-4 w-4 text-amber-400" />
        Gestion des promotions
      </h2>

      {/* Formulaire de création */}
      <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
          <Plus className="h-4 w-4 text-[#D4AF37]" />
          Créer un code promo
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="xl:col-span-2">
            <label className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-slate-400">Code</label>
            <Input
              value={form.code}
              onChange={(e) => setField('code', e.target.value)}
              placeholder="EX: BIENVENUE10"
              className="rounded-xl uppercase"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-slate-400">Type</label>
            <Select
              value={form.discount_type}
              onChange={(e) => setField('discount_type', e.target.value)}
              className="rounded-xl"
            >
              <option value="PERCENT">Pourcentage (%)</option>
              <option value="FIXED">Montant fixe (FCFA)</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-slate-400">
              {form.discount_type === 'PERCENT' ? 'Valeur (1-100)' : 'Valeur (FCFA)'}
            </label>
            <Input
              type="number"
              value={form.discount_value}
              onChange={(e) => setField('discount_value', e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-slate-400">
              Min. commande
            </label>
            <Input
              type="number"
              value={form.min_order_amount}
              onChange={(e) => setField('min_order_amount', e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-slate-400">
              Limite d&apos;usage (0 = illimité)
            </label>
            <Input
              type="number"
              value={form.usage_limit}
              onChange={(e) => setField('usage_limit', e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="xl:col-span-3">
            <label className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-slate-400">Début</label>
            <Input
              type="datetime-local"
              value={form.start_date}
              onChange={(e) => setField('start_date', e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="xl:col-span-3">
            <label className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-slate-400">
              Fin (optionnel)
            </label>
            <Input
              type="datetime-local"
              value={form.end_date}
              onChange={(e) => setField('end_date', e.target.value)}
              className="rounded-xl"
            />
          </div>
        </div>

        {formError && (
          <p className="mt-3 flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {formError}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <PrimaryButton onClick={handleCreate} disabled={creating} className="text-xs">
            {creating ? 'Enregistrement…' : 'Créer le code promo'}
          </PrimaryButton>
        </div>
      </div>

      {/* Liste */}
      {listError && (
        <p className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-200">
          {listError}
        </p>
      )}

      {loading ? (
        <LoadingState label="Chargement des codes promo…" className="py-8" />
      ) : promotions.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-400">Aucun code promo enregistré.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                <th className="py-2.5 pr-3">Code</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3 text-right">Valeur</th>
                <th className="py-2.5 px-3 text-right">Min.</th>
                <th className="py-2.5 px-3">Validité</th>
                <th className="py-2.5 px-3 text-right">Usage</th>
                <th className="py-2.5 px-3">Statut</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {promotions.map((promo) => (
                <tr key={promo.id} className="hover:bg-slate-800/40">
                  <td className="py-2.5 pr-3 font-bold text-white">{promo.code}</td>
                  <td className="py-2.5 px-3 text-cyan-300">{promo.discount_type}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-emerald-300">
                    {promo.discount_type === 'PERCENT'
                      ? `${promo.discount_value} %`
                      : formatMoney(Number(promo.discount_value))}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                    {formatMoney(Number(promo.min_order_amount ?? 0))}
                  </td>
                  <td className="py-2.5 px-3 text-slate-300">
                    {promo.start_date ? new Date(promo.start_date).toLocaleDateString('fr-FR') : '—'}
                    <span className="text-slate-500">
                      {' → '}
                      {promo.end_date ? new Date(promo.end_date).toLocaleDateString('fr-FR') : 'sans fin'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                    {promo.usage_limit
                      ? `${Number(promo.usage_count ?? 0)}/${promo.usage_limit}`
                      : `${Number(promo.usage_count ?? 0)}/∞`}
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                        promo.is_active
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {promo.is_active ? 'ACTIF' : 'INACTIF'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleToggle(promo)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-[#1A1A1A] px-3 py-1.5 text-[11px] font-bold text-white hover:border-[#D4AF37]"
                    >
                      <Power className="h-3.5 w-3.5" />
                      {promo.is_active ? 'Désactiver' : 'Activer'}
                    </button>
                    {promo.id && rowError[promo.id] && (
                      <p className="mt-1 text-[10px] text-rose-400">{rowError[promo.id]}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
