'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import SecondaryButton from '@/components/ui/SecondaryButton';
import PrimaryButton from '@/components/ui/PrimaryButton';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  Loader2,
  Power,
  UserPlus,
  Users,
  CalendarClock,
  Wallet,
  Settings as SettingsIcon,
} from 'lucide-react';
import type { StaffProfile } from '@/lib/services/auth';
import { listStaff, setStaffActive, createStaffAccount, type CreateStaffInput } from '@/lib/services/staff';
import {
  listAttendance,
  buildHoursSummary,
  type AttendanceRow,
  type HoursSummary,
} from '@/lib/services/hr';
import {
  listPayrollEmployees,
  createPayrollEmployee,
  updatePayrollEmployee,
  generatePayslip,
  listPayslips,
  getPayrollSettings,
  updatePayrollSettings,
  listContributionPayments,
  recordContributionPayment,
  type PayrollEmployee,
  type CreatePayrollEmployeeInput,
  type Payslip,
  type PayrollSettings,
  type SocialContributionPayment,
} from '@/lib/services/payroll';
import { downloadPayslipPdf } from '@/lib/pdf/payslip-pdf';
import LoadingState from '@/components/ui/LoadingState';

type Section = 'STAFF' | 'CREATE' | 'ATTENDANCE' | 'SUMMARY' | 'PAYROLL' | 'PAYROLL_SETTINGS';

const ROLE_LABEL: Record<string, string> = {
  DIRECTION: 'Direction',
  GERANT: 'Gérant(e)',
  CAISSIER: 'Caissier(ère)',
};

const toDateInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const defaultRange = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 29); // 30 derniers jours
  return { start: toDateInput(start), end: toDateInput(end) };
};

const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';

export default function HrPage() {
  const [section, setSection] = useState<Section>('STAFF');

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <SecondaryButton
          href="/admin"
          className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.18em]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour
        </SecondaryButton>
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-300">Direction • Ressources humaines</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-white">
            <Clock className="h-6 w-6 text-[#D4AF37]" />
            Registre RH
          </h1>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-800 pb-3 text-xs font-bold">
        {([
          ['STAFF', 'Employés', Users],
          ['CREATE', 'Créer un compte', UserPlus],
          ['ATTENDANCE', 'Pointages', CalendarClock],
          ['SUMMARY', 'Synthèse heures', Clock],
          ['PAYROLL', 'Salaires & Bulletins', Wallet],
          ['PAYROLL_SETTINGS', 'Paramètres de paie', SettingsIcon],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={`inline-flex items-center gap-1.5 rounded-2xl px-3.5 py-2 transition ${
              section === id
                ? 'bg-gradient-to-r from-[#D4AF37] to-[#C5A059] text-black'
                : 'border border-slate-700 bg-slate-900 text-slate-300 hover:text-white'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {section === 'STAFF' && <StaffSection />}
      {section === 'CREATE' && <CreateSection onCreated={() => setSection('STAFF')} />}
      {section === 'ATTENDANCE' && <AttendanceSection />}
      {section === 'SUMMARY' && <SummarySection />}
      {section === 'PAYROLL' && <PayrollSection />}
      {section === 'PAYROLL_SETTINGS' && <PayrollSettingsSection />}
    </main>
  );
}

// ============================================================================
// PARTIE 1 — LISTE DES EMPLOYÉS
// ============================================================================

function StaffSection() {
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStaff(await listStaff());
    } catch (err) {
      console.error('listStaff', err);
      setError(err instanceof Error ? err.message : 'Chargement de l’annuaire impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (s: StaffProfile) => {
    setRowBusy((b) => ({ ...b, [s.id]: true }));
    setRowError((e) => {
      const next = { ...e };
      delete next[s.id];
      return next;
    });
    try {
      await setStaffActive(s.id, !s.is_active);
      setStaff((prev) => prev.map((x) => (x.id === s.id ? { ...x, is_active: !x.is_active } : x)));
    } catch (err) {
      console.error('setStaffActive', err);
      setRowError((e) => ({
        ...e,
        [s.id]: err instanceof Error ? err.message : 'Changement de statut impossible.',
      }));
    } finally {
      setRowBusy((b) => ({ ...b, [s.id]: false }));
    }
  };

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
      <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-white">
          <Users className="h-4 w-4 text-cyan-400" />
          Annuaire des employés ({staff.length})
        </h2>
        <SecondaryButton onClick={load} className="text-xs">
          Rafraîchir
        </SecondaryButton>
      </div>

      {error && (
        <p className="mb-3 flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {loading ? (
        <LoadingState />
      ) : staff.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">Aucun employé enregistré.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                <th className="py-2.5 pr-3">Nom</th>
                <th className="py-2.5 px-3">Rôle</th>
                <th className="py-2.5 px-3">Boutique</th>
                <th className="py-2.5 px-3">Statut</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {staff.map((s) => (
                <tr key={s.id} className="hover:bg-slate-800/40">
                  <td className="py-2.5 pr-3 font-semibold text-slate-100">{s.full_name}</td>
                  <td className="py-2.5 px-3 text-cyan-300">{ROLE_LABEL[s.role] ?? s.role}</td>
                  <td className="py-2.5 px-3 text-slate-300">{s.store_code ?? '— (tout le réseau)'}</td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                        s.is_active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {s.is_active ? 'ACTIF' : 'INACTIF'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => toggle(s)}
                      disabled={rowBusy[s.id]}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-[#1A1A1A] px-3 py-1.5 text-[11px] font-bold text-white hover:border-[#D4AF37] disabled:opacity-50"
                    >
                      {rowBusy[s.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                      {s.is_active ? 'Désactiver' : 'Réactiver'}
                    </button>
                    {rowError[s.id] && <p className="mt-1 text-[10px] text-rose-400">{rowError[s.id]}</p>}
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

// ============================================================================
// PARTIE 2 — CRÉATION D'UN COMPTE EMPLOYÉ
// ============================================================================

const emptyForm: CreateStaffInput = {
  full_name: '',
  email: '',
  password: '',
  role: 'CAISSIER',
  store_code: 'DAKAR',
};

function CreateSection({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState<CreateStaffInput>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const set = <K extends keyof CreateStaffInput>(key: K, value: CreateStaffInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const isDirection = form.role === 'DIRECTION';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.full_name.trim()) return setError('Le nom complet est obligatoire.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setError('Adresse email invalide.');
    if (form.password.length < 8) return setError('Le mot de passe doit contenir au moins 8 caractères.');
    if (!isDirection && !form.store_code) return setError('Choisissez une boutique pour ce rôle.');

    setBusy(true);
    try {
      const created = await createStaffAccount({
        ...form,
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        store_code: isDirection ? null : form.store_code,
      });
      setSuccess(`Compte créé pour ${created.full_name} (${ROLE_LABEL[created.role] ?? created.role}).`);
      setForm(emptyForm);
    } catch (err) {
      console.error('createStaffAccount', err);
      setError(err instanceof Error ? err.message : 'Création impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-white">
        <UserPlus className="h-4 w-4 text-[#D4AF37]" />
        Créer un compte employé
      </h2>
      <p className="mb-4 text-xs text-slate-400">
        Crée le compte de connexion (email + mot de passe) ET la fiche employé. Réservé à la Direction.
      </p>

      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <label className="text-xs">
          <span className="mb-1 block uppercase tracking-[0.16em] text-slate-400">Nom complet</span>
          <Input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="Prénom Nom" />
        </label>
        <label className="text-xs">
          <span className="mb-1 block uppercase tracking-[0.16em] text-slate-400">Email de connexion</span>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="prenom@luxurymagicbutter.com"
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block uppercase tracking-[0.16em] text-slate-400">Mot de passe provisoire</span>
          <Input
            type="text"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            placeholder="8 caractères minimum"
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block uppercase tracking-[0.16em] text-slate-400">Rôle</span>
          <Select value={form.role} onChange={(e) => set('role', e.target.value as CreateStaffInput['role'])}>
            <option value="CAISSIER">Caissier(ère)</option>
            <option value="GERANT">Gérant(e)</option>
            <option value="DIRECTION">Direction</option>
          </Select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block uppercase tracking-[0.16em] text-slate-400">Boutique</span>
          <Select
            value={isDirection ? '' : form.store_code ?? ''}
            disabled={isDirection}
            onChange={(e) => set('store_code', e.target.value)}
          >
            {isDirection ? (
              <option value="">— Tout le réseau (Direction)</option>
            ) : (
              <>
                <option value="DAKAR">Dakar</option>
                <option value="ABIDJAN">Abidjan</option>
              </>
            )}
          </Select>
        </label>

        <div className="md:col-span-2">
          {error && (
            <p className="mb-3 flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </p>
          )}
          {success && (
            <p className="mb-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-200">
              ✅ {success} — communiquez-lui l’email et le mot de passe provisoire.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <SecondaryButton type="button" onClick={onCreated} className="text-xs">
              Voir l’annuaire
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={busy} className="text-xs">
              {busy ? 'Création…' : 'Créer le compte'}
            </PrimaryButton>
          </div>
        </div>
      </form>
    </section>
  );
}

// ============================================================================
// Sélecteur de période partagé (Pointages + Synthèse)
// ============================================================================

function usePeriod() {
  const initial = useMemo(defaultRange, []);
  const [startInput, setStartInput] = useState(initial.start);
  const [endInput, setEndInput] = useState(initial.end);
  const [range, setRange] = useState(initial);

  const apply = () => {
    if (!startInput || !endInput) return;
    const s = startInput <= endInput ? startInput : endInput;
    const e = startInput <= endInput ? endInput : startInput;
    setStartInput(s);
    setEndInput(e);
    setRange({ start: s, end: e });
  };

  const startISO = new Date(`${range.start}T00:00:00`).toISOString();
  const endISO = new Date(`${range.end}T23:59:59.999`).toISOString();

  return { startInput, endInput, setStartInput, setEndInput, apply, range, startISO, endISO };
}

function PeriodPicker({ p }: { p: ReturnType<typeof usePeriod> }) {
  return (
    <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.14em] text-slate-400">
        Du
        <input
          type="date"
          value={p.startInput}
          max={p.endInput}
          onChange={(e) => p.setStartInput(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
        />
      </label>
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.14em] text-slate-400">
        Au
        <input
          type="date"
          value={p.endInput}
          min={p.startInput}
          max={toDateInput(new Date())}
          onChange={(e) => p.setEndInput(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
        />
      </label>
      <PrimaryButton onClick={p.apply} className="text-xs">
        Appliquer
      </PrimaryButton>
    </div>
  );
}

// ============================================================================
// PARTIE 3 — HISTORIQUE DES POINTAGES
// ============================================================================

function AttendanceSection() {
  const p = usePeriod();
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storeFilter, setStoreFilter] = useState<'' | 'DAKAR' | 'ABIDJAN'>('');
  const [nameFilter, setNameFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listAttendance({
          startISO: p.startISO,
          endISO: p.endISO,
          storeCity: storeFilter || null,
          cashierName: nameFilter.trim() || null,
        });
        if (!cancelled) setRows(data);
      } catch (err) {
        console.error('listAttendance', err);
        if (!cancelled) setError(err instanceof Error ? err.message : 'Chargement des pointages impossible.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.startISO, p.endISO, storeFilter, nameFilter]);

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-white">
        <CalendarClock className="h-4 w-4 text-cyan-400" />
        Historique des pointages
      </h2>

      <PeriodPicker p={p} />

      <div className="mb-4 flex flex-wrap gap-3">
        <label className="text-xs">
          <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Boutique</span>
          <Select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value as any)} className="w-44">
            <option value="">Toutes</option>
            <option value="DAKAR">Dakar</option>
            <option value="ABIDJAN">Abidjan</option>
          </Select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Employé (nom exact)</span>
          <Input value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} placeholder="ex: Awa Diop" className="w-56" />
        </label>
      </div>

      {error && (
        <p className="mb-3 flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">Aucun pointage sur cette période / ces filtres.</div>
      ) : (
        <div className="overflow-x-auto">
          <p className="mb-2 text-xs text-slate-400">{rows.length} pointage(s)</p>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                <th className="py-2.5 pr-3">Date & heure</th>
                <th className="py-2.5 px-3">Employé</th>
                <th className="py-2.5 px-3">Boutique</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Caméra</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {rows.map((r) => {
                const type = String(r.type).toUpperCase();
                return (
                  <tr key={r.id} className="hover:bg-slate-800/40">
                    <td className="py-2.5 pr-3 font-mono text-slate-200">{fmtDateTime(r.timestamp)}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-100">{r.cashier_name}</td>
                    <td className="py-2.5 px-3 text-slate-300">{r.store_city ?? '—'}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                          type === 'ARRIVEE'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : type === 'DEPART'
                              ? 'bg-amber-500/15 text-amber-300'
                              : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {type}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">{r.camera_reference ?? '—'}</td>
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

// ============================================================================
// PARTIE 4 — SYNTHÈSE HEURES / PRÉSENCE
// ============================================================================

function SummarySection() {
  const p = usePeriod();
  const [summary, setSummary] = useState<HoursSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [rows, staff] = await Promise.all([
          listAttendance({ startISO: p.startISO, endISO: p.endISO }),
          listStaff(),
        ]);
        if (!cancelled) setSummary(buildHoursSummary(rows, staff));
      } catch (err) {
        console.error('buildHoursSummary', err);
        if (!cancelled) setError(err instanceof Error ? err.message : 'Calcul de la synthèse impossible.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [p.startISO, p.endISO]);

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-white">
        <Clock className="h-4 w-4 text-cyan-400" />
        Synthèse heures & présence
      </h2>
      <p className="mb-4 text-xs text-slate-400">
        Jours travaillés, première ARRIVEE, dernier DEPART et amplitude par jour. Pas de notion de retard (aucune
        heure de référence en base). Rattachement des pointages sur le nom de l’employé.
      </p>

      <PeriodPicker p={p} />

      {error && (
        <p className="mb-3 flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-400">Calcul…</div>
      ) : !summary ? null : (
        <>
          {summary.unmatchedNames.length > 0 && (
            <p className="mb-4 flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200/90">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Pointages non rattachés à un employé connu : <strong>{summary.unmatchedNames.join(', ')}</strong>.
                Vérifiez l’orthographe du nom dans la fiche employé ou dans la configuration du boîtier caméra.
              </span>
            </p>
          )}

          <div className="space-y-3">
            {summary.employees.map((emp) => {
              const key = emp.staff?.id ?? `x-${emp.cashierName}`;
              const isOpen = expanded[key];
              const absent = emp.matched && emp.totalPunches === 0;
              return (
                <div key={key} className="rounded-2xl border border-slate-800 bg-slate-950/40">
                  <button
                    type="button"
                    onClick={() => setExpanded((s) => ({ ...s, [key]: !s[key] }))}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <div>
                      <p className="flex items-center gap-2 text-sm font-bold text-white">
                        {emp.cashierName}
                        {!emp.matched && (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold text-amber-300">
                            NON RATTACHÉ
                          </span>
                        )}
                        {absent && (
                          <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[9px] font-bold text-slate-300">
                            ABSENT SUR LA PÉRIODE
                          </span>
                        )}
                      </p>
                      {emp.staff && (
                        <p className="text-[11px] text-slate-500">
                          {ROLE_LABEL[emp.staff.role] ?? emp.staff.role} • {emp.staff.store_code ?? 'réseau'}
                          {!emp.staff.is_active && ' • compte inactif'}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-4 text-right font-mono text-xs">
                      <div>
                        <p className="text-slate-500">Jours</p>
                        <p className="font-bold text-slate-100">{emp.daysWorked}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Heures</p>
                        <p className="font-bold text-emerald-300">{emp.totalHours.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Pointages</p>
                        <p className="font-bold text-slate-100">{emp.totalPunches}</p>
                      </div>
                    </div>
                  </button>

                  {isOpen && emp.days.length > 0 && (
                    <div className="overflow-x-auto border-t border-slate-800 px-4 py-3">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                            <th className="py-2 pr-3">Jour</th>
                            <th className="py-2 px-3">1re ARRIVEE</th>
                            <th className="py-2 px-3">Dernier DEPART</th>
                            <th className="py-2 px-3 text-right">Amplitude (h)</th>
                            <th className="py-2 px-3 text-right">Pointages</th>
                            <th className="py-2 px-3">Boutique(s)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {emp.days.map((d) => (
                            <tr key={d.date}>
                              <td className="py-2 pr-3 text-slate-200">
                                {new Date(d.date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                              </td>
                              <td className="py-2 px-3 text-emerald-300">{fmtTime(d.firstArrivee)}</td>
                              <td className="py-2 px-3 text-amber-300">{fmtTime(d.lastDepart)}</td>
                              <td className="py-2 px-3 text-right font-bold text-slate-100">
                                {d.amplitudeHours == null ? '—' : d.amplitudeHours.toFixed(2)}
                              </td>
                              <td className="py-2 px-3 text-right text-slate-400">{d.punchCount}</td>
                              <td className="py-2 px-3 font-sans text-slate-400">{d.stores.join(', ')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-2 text-[10px] text-slate-500">
                        Amplitude « — » : impossible à calculer (aucune paire ARRIVEE/DEPART exploitable ce jour-là).
                      </p>
                    </div>
                  )}
                  {isOpen && emp.days.length === 0 && (
                    <p className="border-t border-slate-800 px-4 py-3 text-xs text-slate-500">
                      Aucun pointage sur la période.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}


// ============================================================================
// PARTIE 5 — PAIE : SALARIÉS & BULLETINS
// ============================================================================

const emptyEmployeeForm: CreatePayrollEmployeeInput = {
  full_name: '',
  contract_type: 'CDI',
  contract_start_date: toDateInput(new Date()),
  base_salary_xof: 0,
  sursalaire_xof: 0,
  prime_transport_xof: 0,
  other_primes: [],
  family_parts: 1,
};

function monthLabelFr(periodMonth: string) {
  const d = new Date(`${periodMonth}T00:00:00`);
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

function PayrollSection() {
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PayrollEmployee | null>(null);
  const [form, setForm] = useState<CreatePayrollEmployeeInput>(emptyEmployeeForm);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<PayrollEmployee | null>(null);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [payslipsLoading, setPayslipsLoading] = useState(false);
  const [genMonth, setGenMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genSuccess, setGenSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEmployees(await listPayrollEmployees());
    } catch (err) {
      console.error('listPayrollEmployees', err);
      setError(err instanceof Error ? err.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const loadPayslips = useCallback(async (employeeId: string) => {
    setPayslipsLoading(true);
    try {
      setPayslips(await listPayslips(employeeId));
    } catch (err) {
      console.error('listPayslips', err);
    } finally {
      setPayslipsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (selectedEmployee) {
      (async () => {
        await loadPayslips(selectedEmployee.id);
        if (cancelled) return;
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [selectedEmployee, loadPayslips]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyEmployeeForm);
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (emp: PayrollEmployee) => {
    setEditing(emp);
    setForm({
      staff_id: emp.staff_id,
      full_name: emp.full_name,
      contract_type: emp.contract_type,
      contract_start_date: emp.contract_start_date,
      contract_end_date: emp.contract_end_date,
      base_salary_xof: emp.base_salary_xof,
      sursalaire_xof: emp.sursalaire_xof,
      prime_transport_xof: emp.prime_transport_xof,
      other_primes: emp.other_primes,
      family_parts: emp.family_parts,
    });
    setFormError(null);
    setShowForm(true);
  };

  const set = <K extends keyof CreatePayrollEmployeeInput>(key: K, value: CreatePayrollEmployeeInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.full_name.trim()) return setFormError('Le nom complet est obligatoire.');
    if (!form.base_salary_xof || form.base_salary_xof <= 0) return setFormError('Le salaire de base doit être positif.');

    setBusy(true);
    try {
      if (editing) {
        await updatePayrollEmployee(editing.id, form);
      } else {
        await createPayrollEmployee(form);
      }
      setShowForm(false);
      await load();
    } catch (err) {
      console.error('savePayrollEmployee', err);
      setFormError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (emp: PayrollEmployee) => {
    try {
      await updatePayrollEmployee(emp.id, { is_active: !emp.is_active });
      await load();
    } catch (err) {
      console.error('toggleActive', err);
    }
  };

  const generate = async () => {
    if (!selectedEmployee) return;
    setGenBusy(true);
    setGenError(null);
    setGenSuccess(null);
    try {
      const payslip = await generatePayslip(selectedEmployee.id, genMonth);
      downloadPayslipPdf(payslip, selectedEmployee);
      setGenSuccess(`Bulletin généré et téléchargé pour ${monthLabelFr(genMonth)}.`);
      await loadPayslips(selectedEmployee.id);
    } catch (err) {
      console.error('generatePayslip', err);
      setGenError(err instanceof Error ? err.message : 'Génération impossible.');
    } finally {
      setGenBusy(false);
    }
  };

  const redownload = (payslip: Payslip) => {
    if (!selectedEmployee) return;
    downloadPayslipPdf(payslip, selectedEmployee);
  };

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
      <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-white">
          <Wallet className="h-4 w-4 text-[#D4AF37]" />
          Salariés en paie ({employees.length})
        </h2>
        <PrimaryButton onClick={openCreate} className="text-xs">
          + Ajouter un salarié
        </PrimaryButton>
      </div>

      {error && (
        <p className="mb-3 flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {loading ? (
        <LoadingState />
      ) : employees.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">Aucun salarié en paie pour le moment.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                  <th className="py-2.5 pr-3">Nom</th>
                  <th className="py-2.5 px-3">Contrat</th>
                  <th className="py-2.5 px-3 text-right">Brut estimé</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {employees.map((emp) => {
                  const brut =
                    emp.base_salary_xof +
                    emp.sursalaire_xof +
                    emp.prime_transport_xof +
                    (emp.other_primes ?? []).reduce((s, p) => s + (p.amount_xof || 0), 0);
                  return (
                    <tr
                      key={emp.id}
                      className={`cursor-pointer hover:bg-slate-800/40 ${selectedEmployee?.id === emp.id ? 'bg-slate-800/60' : ''}`}
                      onClick={() => setSelectedEmployee(emp)}
                    >
                      <td className="py-2.5 pr-3 font-semibold text-slate-100">
                        {emp.full_name}
                        {!emp.is_active && (
                          <span className="ml-2 rounded-full bg-slate-700 px-2 py-0.5 text-[9px] text-slate-300">INACTIF</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">{emp.contract_type}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-300">{brut.toLocaleString('fr-FR')}</td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(emp);
                          }}
                          className="mr-2 text-cyan-300 hover:underline"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleActive(emp);
                          }}
                          className="text-slate-400 hover:underline"
                        >
                          {emp.is_active ? 'Désactiver' : 'Réactiver'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            {!selectedEmployee ? (
              <p className="text-sm text-slate-400">Sélectionnez un salarié pour générer un bulletin.</p>
            ) : (
              <>
                <h3 className="mb-3 text-sm font-bold text-white">Bulletins — {selectedEmployee.full_name}</h3>
                <div className="mb-4 flex flex-wrap items-end gap-3">
                  <label className="text-xs">
                    <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Mois</span>
                    <input
                      type="month"
                      value={genMonth.slice(0, 7)}
                      onChange={(e) => setGenMonth(`${e.target.value}-01`)}
                      className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <PrimaryButton onClick={generate} disabled={genBusy} className="text-xs">
                    {genBusy ? 'Génération…' : 'Générer le bulletin du mois'}
                  </PrimaryButton>
                </div>
                {genError && <p className="mb-3 text-xs text-rose-300">{genError}</p>}
                {genSuccess && <p className="mb-3 text-xs text-emerald-300">{genSuccess}</p>}

                {payslipsLoading ? (
                  <LoadingState label="Chargement des bulletins…" className="py-4" />
                ) : payslips.length === 0 ? (
                  <p className="text-xs text-slate-500">Aucun bulletin généré pour ce salarié.</p>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                        <th className="py-2 pr-3">Période</th>
                        <th className="py-2 px-3 text-right">Net</th>
                        <th className="py-2 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {payslips.map((p) => (
                        <tr key={p.id}>
                          <td className="py-2 pr-3 text-slate-200">{monthLabelFr(p.period_month)}</td>
                          <td className="py-2 px-3 text-right font-mono text-emerald-300">
                            {Math.round(p.net_salary_xof).toLocaleString('fr-FR')}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button type="button" onClick={() => redownload(p)} className="text-cyan-300 hover:underline">
                              PDF
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={submit} className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
            <h3 className="mb-4 text-sm font-bold text-white">{editing ? 'Modifier le salarié' : 'Ajouter un salarié'}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs md:col-span-2">
                <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Nom complet</span>
                <Input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
              </label>
              <label className="text-xs">
                <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Type de contrat</span>
                <Select value={form.contract_type} onChange={(e) => set('contract_type', e.target.value as 'CDD' | 'CDI')}>
                  <option value="CDI">CDI</option>
                  <option value="CDD">CDD</option>
                </Select>
              </label>
              <label className="text-xs">
                <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Parts fiscales</span>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  value={form.family_parts ?? 1}
                  onChange={(e) => { if (e.target.value === '') return; set('family_parts', Number(e.target.value)); }}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Début du contrat</span>
                <input
                  type="date"
                  value={form.contract_start_date}
                  onChange={(e) => set('contract_start_date', e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Fin (si CDD)</span>
                <input
                  type="date"
                  value={form.contract_end_date ?? ''}
                  onChange={(e) => set('contract_end_date', e.target.value || null)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Salaire de base (FCFA)</span>
                <input
                  type="number"
                  min="0"
                  value={form.base_salary_xof}
                  onChange={(e) => { if (e.target.value === '') return; set('base_salary_xof', Number(e.target.value)); }}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Sursalaire (FCFA)</span>
                <input
                  type="number"
                  min="0"
                  value={form.sursalaire_xof ?? 0}
                  onChange={(e) => { if (e.target.value === '') return; set('sursalaire_xof', Number(e.target.value)); }}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Prime de transport (FCFA)</span>
                <input
                  type="number"
                  min="0"
                  value={form.prime_transport_xof ?? 0}
                  onChange={(e) => { if (e.target.value === '') return; set('prime_transport_xof', Number(e.target.value)); }}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
              </label>
            </div>

            {formError && <p className="mt-3 text-xs text-rose-300">{formError}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <SecondaryButton type="button" onClick={() => setShowForm(false)} className="text-xs">
                Annuler
              </SecondaryButton>
              <PrimaryButton type="submit" disabled={busy} className="text-xs">
                {busy ? 'Enregistrement…' : 'Enregistrer'}
              </PrimaryButton>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

// ============================================================================
// PARTIE 6 — PARAMÈTRES DE PAIE (taux, plafonds) — DIRECTION uniquement
// ============================================================================

function PayrollSettingsSection() {
  const [settings, setSettings] = useState<PayrollSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{
    ipres_employee_rate: number;
    ipres_employer_rate: number;
    ipres_ceiling_xof: number | '';
    css_employer_rate: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [contributions, setContributions] = useState<SocialContributionPayment[]>([]);
  const [payingContributionId, setPayingContributionId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState<string>('');
  const [payDate, setPayDate] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await getPayrollSettings();
      setSettings(s);
      setForm({
        ipres_employee_rate: s.ipres_employee_rate,
        ipres_employer_rate: s.ipres_employer_rate,
        ipres_ceiling_xof: s.ipres_ceiling_xof ?? '',
        css_employer_rate: s.css_employer_rate,
      });
      setContributions(await listContributionPayments());
    } catch (err) {
      console.error('getPayrollSettings', err);
      setError(err instanceof Error ? err.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings || !form) return;
    setBusy(true);
    setSuccess(null);
    setError(null);
    try {
      await updatePayrollSettings(settings.id, {
        ipres_employee_rate: form.ipres_employee_rate,
        ipres_employer_rate: form.ipres_employer_rate,
        ipres_ceiling_xof: form.ipres_ceiling_xof === '' ? null : Number(form.ipres_ceiling_xof),
        css_employer_rate: form.css_employer_rate,
      });
      setSuccess('Paramètres enregistrés. Les prochains bulletins utiliseront ces taux (les bulletins déjà générés ne changent pas).');
      await load();
    } catch (err) {
      console.error('updatePayrollSettings', err);
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  };

  const openMarkPaid = (c: SocialContributionPayment) => {
    setPayingContributionId(c.id);
    setPayAmount(String(c.amount_due_xof));
    setPayDate(toDateInput(new Date()));
  };

  const confirmMarkPaid = async (c: SocialContributionPayment) => {
    if (!payAmount || !payDate) return;
    try {
      await recordContributionPayment(c.id, Number(payAmount), payDate);
      setContributions(await listContributionPayments());
      setPayingContributionId(null);
    } catch (err) {
      console.error('recordContributionPayment', err);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-5">
        <p className="flex items-start gap-2 text-[12px] text-amber-200/90">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>Point de prudence :</strong> les taux ci-dessous sont des valeurs par défaut usuelles (IPRES,
            CSS). Faites-les confirmer par un comptable ou sur le portail NDAMLI (online.secusociale.sn) avant toute
            déclaration officielle. Une modification ici ne change pas les bulletins déjà générés.
          </span>
        </p>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-white">
          <SettingsIcon className="h-4 w-4 text-[#D4AF37]" />
          Taux de cotisation
        </h2>

        {error && <p className="mb-3 text-xs text-rose-300">{error}</p>}
        {loading || !form ? (
          <LoadingState />
        ) : (
          <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
            <label className="text-xs">
              <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">IPRES — part salariale (%)</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={form.ipres_employee_rate * 100}
                onChange={(e) => { if (e.target.value === '') return; setForm((f) => (f ? { ...f, ipres_employee_rate: Number(e.target.value) / 100 } : f)); }}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">IPRES — part employeur (%)</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={form.ipres_employer_rate * 100}
                onChange={(e) => { if (e.target.value === '') return; setForm((f) => (f ? { ...f, ipres_employer_rate: Number(e.target.value) / 100 } : f)); }}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Plafond IPRES (FCFA, vide = aucun)</span>
              <input
                type="number"
                min="0"
                value={form.ipres_ceiling_xof}
                onChange={(e) =>
                  setForm((f) => (f ? { ...f, ipres_ceiling_xof: e.target.value === '' ? '' : Number(e.target.value) } : f))
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">CSS — part employeur (%)</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={form.css_employer_rate * 100}
                onChange={(e) => { if (e.target.value === '') return; setForm((f) => (f ? { ...f, css_employer_rate: Number(e.target.value) / 100 } : f)); }}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
            </label>

            <div className="md:col-span-2">
              {success && <p className="mb-3 text-xs text-emerald-300">{success}</p>}
              <div className="flex justify-end">
                <PrimaryButton type="submit" disabled={busy} className="text-xs">
                  {busy ? 'Enregistrement…' : 'Enregistrer les taux'}
                </PrimaryButton>
              </div>
            </div>
          </form>
        )}
        <p className="mt-3 text-[10px] text-slate-500">
          Le barème IRPP (impôt progressif par tranches) n&apos;est pas encore éditable depuis cet écran — il est
          configuré en base (lmb_payroll_settings.ir_bareme). Contactez le support pour le faire ajuster.
        </p>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
        <h2 className="mb-4 text-lg font-bold text-white">Versements trimestriels (IPRES / CSS)</h2>
        {contributions.length === 0 ? (
          <p className="text-sm text-slate-400">
            Aucun trimestre suivi pour l&apos;instant. Ajoutez une ligne directement dans Supabase (table
            lmb_social_contribution_payments) pour commencer le suivi.
          </p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                <th className="py-2 pr-3">Trimestre</th>
                <th className="py-2 px-3 text-right">Dû</th>
                <th className="py-2 px-3 text-right">Payé</th>
                <th className="py-2 px-3">Statut</th>
                <th className="py-2 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {contributions.map((c) => (
                <Fragment key={c.id}>
                  <tr>
                    <td className="py-2 pr-3 text-slate-200">{c.quarter_label}</td>
                    <td className="py-2 px-3 text-right font-mono">{Math.round(c.amount_due_xof).toLocaleString('fr-FR')}</td>
                    <td className="py-2 px-3 text-right font-mono">
                      {c.amount_paid_xof != null ? Math.round(c.amount_paid_xof).toLocaleString('fr-FR') : '—'}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                          c.status === 'PAID'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : c.status === 'LATE'
                              ? 'bg-rose-500/15 text-rose-300'
                              : 'bg-amber-500/15 text-amber-300'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      {c.status !== 'PAID' && payingContributionId !== c.id && (
                        <button type="button" onClick={() => openMarkPaid(c)} className="text-cyan-300 hover:underline">
                          Marquer payé
                        </button>
                      )}
                      {c.status !== 'PAID' && payingContributionId === c.id && (
                        <button type="button" onClick={() => setPayingContributionId(null)} className="text-slate-400 hover:underline">
                          Annuler
                        </button>
                      )}
                    </td>
                  </tr>
                  {payingContributionId === c.id && (
                    <tr key={`${c.id}-form`}>
                      <td colSpan={5} className="bg-slate-950/60 px-3 py-3">
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="text-[11px]">
                            <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Montant payé (FCFA)</span>
                            <input
                              type="number"
                              min="0"
                              value={payAmount}
                              onChange={(e) => setPayAmount(e.target.value)}
                              className="w-36 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
                            />
                          </label>
                          <label className="text-[11px]">
                            <span className="mb-1 block uppercase tracking-[0.14em] text-slate-400">Date de paiement</span>
                            <input
                              type="date"
                              value={payDate}
                              onChange={(e) => setPayDate(e.target.value)}
                              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
                            />
                          </label>
                          <PrimaryButton type="button" onClick={() => confirmMarkPaid(c)} className="py-1.5 px-3 text-xs">
                            Valider le paiement
                          </PrimaryButton>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
