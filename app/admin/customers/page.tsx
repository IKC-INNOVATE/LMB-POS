'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Customer, CustomerOrder, LoyaltyEvent } from '@/types';
import {
  ArrowLeft,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarClock,
  CreditCard,
  Filter,
  Mail,
  MapPin,
  PencilLine,
  Phone,
  Search,
  Sparkles,
  Star,
  TrendingUp,
  UserCog,
  Users,
} from 'lucide-react';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SecondaryButton from '@/components/ui/SecondaryButton';
import LoadingState from '@/components/ui/LoadingState';

type VipStatus = 'STANDARD' | 'VIP' | 'VIP_PREMIUM';
type SortMode = 'TOTAL_SPENT' | 'LOYALTY_POINTS';
type StatusFilter = 'ALL' | VipStatus;

const vipStyles: Record<VipStatus, string> = {
  STANDARD: 'bg-slate-100/80 text-slate-700 border border-slate-200',
  VIP: 'bg-amber-100 text-amber-800 border border-amber-300 shadow-sm',
  VIP_PREMIUM: 'vip-premium-badge bg-gradient-to-r from-amber-600 to-yellow-500 text-white border border-amber-300 shadow-sm',
};

// `lmb_customers` n'a pas de colonne texte dédiée aux notes esthétiques : elles
// vivent dans la colonne jsonb `notes` sous la clé `beauty`.
const readBeautyNotes = (notes: Customer['notes']): string => {
  if (notes && typeof notes === 'object' && !Array.isArray(notes)) {
    const value = (notes as Record<string, unknown>).beauty;
    return typeof value === 'string' ? value : '';
  }
  return '';
};

const mergeBeautyNotes = (notes: Customer['notes'], beauty: string): Record<string, unknown> => {
  const base = notes && typeof notes === 'object' && !Array.isArray(notes)
    ? { ...(notes as Record<string, unknown>) }
    : {};
  if (beauty) {
    base.beauty = beauty;
  } else {
    delete base.beauty;
  }
  return base;
};

export default function CustomersCRMPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loyaltyEvents, setLoyaltyEvents] = useState<LoyaltyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [vipFilter, setVipFilter] = useState<StatusFilter>('ALL');
  const [sortMode, setSortMode] = useState<SortMode>('TOTAL_SPENT');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [reason, setReason] = useState('');
  const QUICK_REASONS = [
    'Compensation SAV',
    'Anniversaire VIP',
    'Erreur de caisse corrigée',
    'Geste commercial fidélité',
    'Ajustement suite retour produit',
  ];
  const [pointsDelta, setPointsDelta] = useState('');
  const [vipDraft, setVipDraft] = useState<VipStatus>('STANDARD');
  const [savingAction, setSavingAction] = useState(false);
  const [customerDraft, setCustomerDraft] = useState({
    full_name: '',
    phone: '',
    email: '',
    notes: '',
  });
  const [savingCustomerInfo, setSavingCustomerInfo] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [customersResult, ordersResult, loyaltyResult] = await Promise.all([
        supabase.from('lmb_customers').select('*').order('created_at', { ascending: false }),
        supabase.from('lmb_customer_orders').select('*').order('created_at', { ascending: false }),
        supabase.from('lmb_customer_loyalty_events').select('*').order('created_at', { ascending: false }),
      ]);

      if (customersResult.error) throw customersResult.error;
      if (ordersResult.error) throw ordersResult.error;
      if (loyaltyResult.error) throw loyaltyResult.error;

      const normalizedCustomers = (customersResult.data ?? []).map((customer) => ({
        ...customer,
        full_name: customer.full_name ?? 'Client sans nom',
        vip_status: (customer.vip_status ?? 'STANDARD') as VipStatus,
        loyalty_points: Number(customer.loyalty_points ?? 0),
        total_spent_xof: Number(customer.total_spent_xof ?? 0),
      }));

      setCustomers(normalizedCustomers);
      setOrders(ordersResult.data ?? []);
      setLoyaltyEvents(loyaltyResult.data ?? []);
    } catch (error) {
      console.error('Erreur CRM clients:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalPointsDistributed = useMemo(
    () => loyaltyEvents.reduce((sum, event) => sum + Math.max(Number(event.points_delta ?? 0), 0), 0),
    [loyaltyEvents]
  );

  const vipPercentage = useMemo(() => {
    if (!customers.length) return 0;
    const vipCount = customers.filter((customer) => customer.vip_status !== 'STANDARD').length;
    return Math.round((vipCount / customers.length) * 100);
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    const list = [...customers];

    const normalize = (value?: string | null) => (value ?? '').trim().toLowerCase();

    const matchingSearch = normalize(search);
    const filtered = list.filter((customer) => {
      const matchesSearch = !matchingSearch || [
        customer.full_name,
        customer.phone,
        customer.email,
      ].some((value) => normalize(value).includes(matchingSearch));

      const matchesVip = vipFilter === 'ALL' || (customer.vip_status ?? 'STANDARD') === vipFilter;
      return matchesSearch && matchesVip;
    });

    filtered.sort((a, b) => {
      if (sortMode === 'LOYALTY_POINTS') {
        return Number(b.loyalty_points ?? 0) - Number(a.loyalty_points ?? 0);
      }
      return Number(b.total_spent_xof ?? 0) - Number(a.total_spent_xof ?? 0);
    });

    return filtered;
  }, [customers, search, vipFilter, sortMode]);

  const openCustomerDetail = (customer: Customer) => {
    setSelectedCustomer(customer);
    setVipDraft((customer.vip_status ?? 'STANDARD') as VipStatus);
    setCustomerDraft({
      full_name: customer.full_name ?? '',
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      notes: readBeautyNotes(customer.notes),
    });
    setReason('');
    setPointsDelta('');
    setDetailOpen(true);
  };

  // Neutralise l'injection de formule CSV : si une valeur commence par
  // =, +, - ou @, Excel/LibreOffice peut l'interpréter comme une formule à
  // l'ouverture. On préfixe d'une apostrophe (convention standard) pour que
  // la valeur reste du texte brut, sans changer ce qui s'affiche à l'écran.
  const sanitizeCsvCell = (value: string): string => {
    if (/^[=+\-@]/.test(value)) {
      return `'${value}`;
    }
    return value;
  };

  const exportCustomersCsv = () => {
    const rows = [
      ['Nom', 'Téléphone', 'Email', 'Pays', 'Statut VIP', 'Total Dépensé (XOF)', 'Total Commandes', 'Solde Points', 'Dernier Achat'],
      ...filteredCustomers.map((customer) => [
        customer.full_name ?? '',
        customer.phone ?? '',
        customer.email ?? '',
        customer.country ?? '',
        customer.vip_status ?? 'STANDARD',
        String(Number(customer.total_spent_xof ?? 0)),
        String(Number(customer.total_orders ?? 0)),
        String(Number(customer.loyalty_points ?? 0)),
        customer.last_purchase_at ? new Date(customer.last_purchase_at).toISOString().slice(0, 10) : '',
      ]),
    ];

    const csv = rows
      .map((row) =>
        row
          .map((value) => `"${sanitizeCsvCell(String(value)).replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'base_clients_lmb.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSaveCustomerInfo = async () => {
    if (!selectedCustomer?.id) return;
    setSavingCustomerInfo(true);

    try {
      const nextNotes = mergeBeautyNotes(selectedCustomer.notes, customerDraft.notes.trim());
      const updatedValues = {
        full_name: customerDraft.full_name.trim() || selectedCustomer.full_name || 'Client',
        phone: customerDraft.phone.trim(),
        email: customerDraft.email.trim() || null,
        notes: nextNotes,
      };

      const { error } = await supabase
        .from('lmb_customers')
        .update({
          full_name: updatedValues.full_name,
          phone: updatedValues.phone,
          email: updatedValues.email,
          notes: updatedValues.notes,
        })
        .eq('id', selectedCustomer.id);

      if (error) throw error;

      setSelectedCustomer((current) => current ? { ...current, ...updatedValues } : current);
      await loadData();
      setDetailOpen(false);
    } catch (error) {
      console.error('Erreur mise à jour client:', error);
      alert('La mise à jour du client a échoué.');
    } finally {
      setSavingCustomerInfo(false);
    }
  };

  const handleUserAction = async () => {
    if (!selectedCustomer) return;
    if (!reason.trim()) {
      alert('Un motif obligatoire est requis pour toute action admin.');
      return;
    }

    setSavingAction(true);
    try {
      if (pointsDelta.trim()) {
        const delta = Number(pointsDelta);
        if (!Number.isFinite(delta)) {
          alert('Le solde de points à ajuster doit être un nombre valide.');
          return;
        }

        const nextValue = Number(selectedCustomer.loyalty_points ?? 0) + delta;

        const { error: loyaltyError } = await supabase.from('lmb_customer_loyalty_events').insert({
          customer_id: selectedCustomer.id,
          event_type: delta >= 0 ? 'PURCHASE' : 'ADJUSTMENT',
          points_delta: delta,
          reason: reason.trim(),
          related_order_id: null,
          metadata: { source: 'admin_adjustment' },
        });

        if (loyaltyError) throw loyaltyError;

        const { error: customerError } = await supabase
          .from('lmb_customers')
          .update({ loyalty_points: nextValue })
          .eq('id', selectedCustomer.id);

        if (customerError) throw customerError;
      }

      if (vipDraft !== (selectedCustomer.vip_status ?? 'STANDARD')) {
        const { error: vipError } = await supabase
          .from('lmb_customers')
          .update({ vip_status: vipDraft })
          .eq('id', selectedCustomer.id);

        if (vipError) throw vipError;

        const { error: eventError } = await supabase.from('lmb_customer_loyalty_events').insert({
          customer_id: selectedCustomer.id,
          event_type: 'VIP_PROMOTION',
          points_delta: 0,
          reason: `${reason.trim()} - Changement statut VIP ${vipDraft}`,
          metadata: { previous_vip_status: selectedCustomer.vip_status ?? 'STANDARD', new_vip_status: vipDraft },
        });

        if (eventError) throw eventError;
      }

      await loadData();
      setSelectedCustomer((current) => {
        if (!current) return current;
        return { ...current, vip_status: vipDraft, loyalty_points: Number(current.loyalty_points ?? 0) + (pointsDelta ? Number(pointsDelta) : 0) };
      });
      setDetailOpen(false);
      setReason('');
      setPointsDelta('');
    } catch (error) {
      console.error('Erreur lors de l’action admin:', error);
      alert('La mise à jour du client a échoué. Vérifiez les règles Supabase et les valeurs saisies.');
    } finally {
      setSavingAction(false);
    }
  };

  const customerOrders = selectedCustomer
    ? orders.filter((order) => order.customer_id === selectedCustomer.id)
    : [];

  const customerEvents = selectedCustomer
    ? loyaltyEvents.filter((event) => event.customer_id === selectedCustomer.id)
    : [];

  return (
    <div className="min-h-screen bg-[#0A0F1D] text-slate-100 lmb-customers">
      <header className="border-b border-slate-800 bg-slate-900/90 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-[1500px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="inline-flex items-center gap-2 text-slate-300 hover:text-cyan-300 transition text-xs font-semibold">
              <ArrowLeft className="w-4 h-4" />
              Retour admin
            </Link>
            <div className="h-5 w-px bg-slate-700" />
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">CRM</p>
              <h1 className="text-xl font-bold text-white">Gestion des clientes</h1>
            </div>
          </div>

          <Link
            href="/admin"
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-300 text-slate-950 text-xs font-bold shadow-lg shadow-cyan-500/20"
          >
            Tableau de bord
          </Link>
        </div>
      </header>

      <main className="max-w-[1500px] mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Clients</p>
              <Users className="w-4 h-4 text-cyan-400" />
            </div>
            <p className="text-3xl font-bold mt-3 font-mono text-white">{customers.length}</p>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Points distribués</p>
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-3xl font-bold mt-3 font-mono text-emerald-300">{totalPointsDistributed.toLocaleString('fr-FR')}</p>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">% clients VIP</p>
              <Star className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-3xl font-bold mt-3 font-mono text-amber-300">{vipPercentage}%</p>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 mb-5">
            <div className="relative w-full xl:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Recherche par nom, téléphone ou email"
                className="rounded-2xl pl-10 pr-4 py-3 text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <SecondaryButton onClick={exportCustomersCsv} className="px-3 py-2 text-xs">
                Exporter la base clients (CSV)
              </SecondaryButton>

              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Filter className="w-4 h-4" />
                Filtre VIP
              </div>

              <Select
                value={vipFilter}
                onChange={(event) => setVipFilter(event.target.value as StatusFilter)}
                className="text-xs"
              >
                <option value="ALL">Tous</option>
                <option value="STANDARD">STANDARD</option>
                <option value="VIP">VIP</option>
                <option value="VIP_PREMIUM">VIP_PREMIUM</option>
              </Select>

              <Select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
                className="text-xs"
              >
                <option value="TOTAL_SPENT">Tri : montant dépensé</option>
                <option value="LOYALTY_POINTS">Tri : solde points</option>
              </Select>
            </div>
          </div>

          {loading ? (
            <LoadingState label="Chargement des clientes…" className="py-16" />
          ) : filteredCustomers.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">Aucune cliente ne correspond aux filtres.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                    <th className="py-3 px-3">Client</th>
                    <th className="py-3 px-3">Contact</th>
                    <th className="py-3 px-3">Pays</th>
                    <th className="py-3 px-3 text-right">Dépenses</th>
                    <th className="py-3 px-3 text-right">Points</th>
                    <th className="py-3 px-3">Dernier achat</th>
                    <th className="py-3 px-3">Statut</th>
                    <th className="py-3 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {filteredCustomers.map((customer) => {
                    const vipStatus = (customer.vip_status ?? 'STANDARD') as VipStatus;
                    return (
                      <tr key={customer.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3 px-3">
                          <div className="font-semibold text-white">{customer.full_name ?? 'Client sans nom'}</div>
                          <div className="text-[10px] text-slate-400">{customer.total_orders ?? 0} commande(s)</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="text-slate-200">{customer.phone ?? '—'}</div>
                          <div className="text-[10px] text-slate-400">{customer.email ?? '—'}</div>
                        </td>
                        <td className="py-3 px-3 text-slate-300">{customer.country ?? '—'}</td>
                        <td className="py-3 px-3 text-right text-slate-100 font-bold font-mono">
                          {Number(customer.total_spent_xof ?? 0).toLocaleString('fr-FR')} FCFA
                        </td>
                        <td className="py-3 px-3 text-right text-emerald-300 font-bold font-mono">
                          {Number(customer.loyalty_points ?? 0).toLocaleString('fr-FR')}
                        </td>
                        <td className="py-3 px-3 text-slate-300">
                          {customer.last_purchase_at ? new Date(customer.last_purchase_at).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          }) : '—'}
                        </td>
                        <td className="py-3 px-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${vipStyles[vipStatus]}`}>
                            {vipStatus}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <SecondaryButton onClick={() => openCustomerDetail(customer)} className="px-3 py-1.5 text-[11px]">
                            Voir fiche
                          </SecondaryButton>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {detailOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] max-w-6xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 border-b border-slate-800 pb-5 mb-6">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300">Fiche cliente</p>
                <h2 className="text-2xl font-bold text-white mt-1">{selectedCustomer.full_name ?? 'Client'}</h2>
              </div>

              <SecondaryButton onClick={() => setDetailOpen(false)} className="px-3 py-2 text-xs rounded-full">
                Fermer
              </SecondaryButton>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
              <div className="space-y-6">
                <section className="bg-slate-950/50 border border-slate-800 rounded-3xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <UserCog className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-200">Infos Générales</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-slate-400"><BadgeCheck className="w-4 h-4" /> Nom</div>
                      <Input
                        value={customerDraft.full_name}
                        onChange={(event) => setCustomerDraft((prev) => ({ ...prev, full_name: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-slate-400"><Phone className="w-4 h-4" /> Téléphone</div>
                      <Input
                        value={customerDraft.phone}
                        onChange={(event) => setCustomerDraft((prev) => ({ ...prev, phone: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-slate-400"><Mail className="w-4 h-4" /> Email</div>
                      <Input
                        value={customerDraft.email}
                        onChange={(event) => setCustomerDraft((prev) => ({ ...prev, email: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-slate-400"><MapPin className="w-4 h-4" /> Pays</div>
                      <div className="text-slate-100 font-medium">{selectedCustomer.country ?? '—'}</div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-slate-400"><Sparkles className="w-4 h-4" /> Statut VIP</div>
                      <div>
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${vipStyles[(selectedCustomer.vip_status ?? 'STANDARD') as VipStatus]}`}>
                          {selectedCustomer.vip_status ?? 'STANDARD'}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-slate-400"><CalendarClock className="w-4 h-4" /> Dernier achat</div>
                      <div className="text-slate-100 font-medium">
                        {selectedCustomer.last_purchase_at
                          ? new Date(selectedCustomer.last_purchase_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
                          : '—'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 border-t border-slate-800 pt-4">
                    <div className="flex items-center justify-between gap-3 text-slate-400 mb-2">
                      <div className="flex items-center gap-2"><PencilLine className="w-4 h-4" /> Notes</div>
                      <SecondaryButton onClick={handleSaveCustomerInfo} disabled={savingCustomerInfo} className="px-3 py-1.5 text-[10px]">
                        {savingCustomerInfo ? 'Enregistrement…' : 'Enregistrer'}
                      </SecondaryButton>
                    </div>
                    <Textarea
                      value={customerDraft.notes}
                      onChange={(event) => setCustomerDraft((prev) => ({ ...prev, notes: event.target.value }))}
                      rows={5}
                    />
                  </div>
                </section>

                <section className="bg-slate-950/50 border border-slate-800 rounded-3xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <BriefcaseBusiness className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-200">Historique des Achats</h3>
                  </div>

                  {customerOrders.length === 0 ? (
                    <div className="text-slate-400 text-sm">Aucune commande enregistrée.</div>
                  ) : (
                    <div className="space-y-3">
                      {customerOrders.slice(0, 8).map((order) => (
                        <div key={order.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
                          <div className="flex items-center justify-between gap-3 text-xs text-slate-300">
                            <span className="font-medium text-slate-100">Commande {order.id?.slice(0, 8) ?? '—'}</span>
                            <span>{order.created_at ? new Date(order.created_at).toLocaleDateString('fr-FR') : '—'}</span>
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-400">
                            <div>
                              <div className="text-slate-500">Montant</div>
                              <div className="text-slate-100 font-mono font-bold">{Number(order.order_total_xof ?? 0).toLocaleString('fr-FR')} FCFA</div>
                            </div>
                            <div>
                              <div className="text-slate-500">Remise</div>
                              <div className="text-amber-300 font-mono font-bold">-{Number(order.discount_applied_xof ?? 0).toLocaleString('fr-FR')} FCFA</div>
                            </div>
                            <div>
                              <div className="text-slate-500">Points</div>
                              <div className="text-emerald-300 font-mono font-bold">+{Number(order.points_earned ?? 0).toLocaleString('fr-FR')}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="bg-slate-950/50 border border-slate-800 rounded-3xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <CreditCard className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-200">Journal de Fidélité</h3>
                  </div>

                  {customerEvents.length === 0 ? (
                    <div className="text-slate-400 text-sm">Aucun événement de fidélité.</div>
                  ) : (
                    <div className="space-y-3">
                      {customerEvents.slice(0, 10).map((event) => (
                        <div key={event.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-semibold text-slate-100">{event.event_type ?? 'EVENT'}</span>
                            <span className={`text-xs font-bold ${Number(event.points_delta ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                              {Number(event.points_delta ?? 0) >= 0 ? '+' : ''}{Number(event.points_delta ?? 0).toLocaleString('fr-FR')}
                            </span>
                          </div>
                          <div className="mt-2 text-[11px] text-slate-400">{event.reason ?? 'Aucun motif détaillé'}</div>
                          <div className="mt-1 text-[10px] text-slate-500">
                            {event.created_at ? new Date(event.created_at).toLocaleString('fr-FR') : '—'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <aside className="bg-slate-950/50 border border-slate-800 rounded-3xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <UserCog className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-200">Actions Administrateur</h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-400 mb-2">Ajuster le solde de points</label>
                    <Input
                      type="number"
                      value={pointsDelta}
                      onChange={(event) => setPointsDelta(event.target.value)}
                      placeholder="Ex: +50 ou -20"
                      className=""
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-400 mb-2">Changer le statut VIP</label>
                    <Select value={vipDraft} onChange={(event) => setVipDraft(event.target.value as VipStatus)}>
                      <option value="STANDARD">STANDARD</option>
                      <option value="VIP">VIP</option>
                      <option value="VIP_PREMIUM">VIP_PREMIUM</option>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-400 mb-2">Motif obligatoire</label>
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {QUICK_REASONS.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setReason(r)}
                          className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-cyan-500/60 hover:text-cyan-200"
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    <Textarea
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      rows={4}
                      placeholder="Indiquez le motif du changement ou de l’ajustement…"
                      className=""
                    />
                  </div>

                  <PrimaryButton onClick={handleUserAction} disabled={savingAction} className="w-full py-3 text-sm">
                    {savingAction ? 'Enregistrement…' : 'Appliquer la mise à jour'}
                  </PrimaryButton>
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
