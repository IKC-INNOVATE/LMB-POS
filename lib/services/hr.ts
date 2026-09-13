import { supabase } from '@/lib/supabase';
import type { StaffProfile } from '@/lib/services/auth';

// =====================================================================
// Pointages (lmb_attendance) + suivi des heures — LECTURE SEULE.
//
// Colonnes réelles : cashier_name, store_city, type ('ARRIVEE'|'DEPART'),
// timestamp, camera_reference.
//
// Rattachement pointage ↔ employé : sur cashier_name (texte), comparé au
// full_name de lmb_staff (trim + minuscules + espaces normalisés). Pas de FK
// staff_id pour l'instant (décision actée).
//
// PAS de notion de "retard" : aucune heure de référence par employé en base.
// On expose uniquement présence/absence et heures pointées (première ARRIVEE,
// dernier DEPART, amplitude) par jour et par période.
// =====================================================================

export type AttendanceType = 'ARRIVEE' | 'DEPART';

export interface AttendanceRow {
  id: string;
  cashier_name: string;
  store_city: string | null;
  type: string;
  timestamp: string;
  camera_reference: string | null;
}

export interface AttendanceQuery {
  startISO: string;
  endISO: string;
  /** Filtre exact (insensible à la casse) sur cashier_name. */
  cashierName?: string | null;
  /** 'DAKAR' | 'ABIDJAN' — filtre sur store_city normalisé. */
  storeCity?: string | null;
}

const normName = (v: unknown) =>
  String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const normStore = (v: unknown): string => {
  const s = String(v ?? '').trim().toUpperCase();
  if (s.includes('DAKAR')) return 'DAKAR';
  if (s.includes('ABIDJAN')) return 'ABIDJAN';
  return s || '—';
};

/** yyyy-mm-dd dans le fuseau local du navigateur. */
const dayKey = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export async function listAttendance(query: AttendanceQuery): Promise<AttendanceRow[]> {
  let req = supabase
    .from('lmb_attendance')
    .select('id, cashier_name, store_city, type, timestamp, camera_reference')
    .gte('timestamp', query.startISO)
    .lte('timestamp', query.endISO)
    .order('timestamp', { ascending: false });

  if (query.cashierName) req = req.ilike('cashier_name', query.cashierName);

  const { data, error } = await req;
  if (error) throw new Error(error.message);

  let rows = (data ?? []) as AttendanceRow[];
  if (query.storeCity) {
    const target = normStore(query.storeCity);
    rows = rows.filter((r) => normStore(r.store_city) === target);
  }
  return rows;
}

export interface DaySummary {
  date: string;
  firstArrivee: string | null;
  lastDepart: string | null;
  /** Amplitude en heures (dernier DEPART − première ARRIVEE), null si incalculable. */
  amplitudeHours: number | null;
  punchCount: number;
  stores: string[];
}

export interface EmployeeHours {
  cashierName: string;
  /** Ligne lmb_staff rattachée, ou null si le pointage ne correspond à aucun employé. */
  staff: StaffProfile | null;
  matched: boolean;
  daysWorked: number;
  totalHours: number;
  totalPunches: number;
  days: DaySummary[];
}

export interface HoursSummary {
  employees: EmployeeHours[];
  /** cashier_name présents dans les pointages sans employé lmb_staff correspondant. */
  unmatchedNames: string[];
}

function summarizeDays(rows: AttendanceRow[]): DaySummary[] {
  const byDay = new Map<string, AttendanceRow[]>();
  for (const r of rows) {
    const k = dayKey(r.timestamp);
    const arr = byDay.get(k) ?? [];
    arr.push(r);
    byDay.set(k, arr);
  }

  return [...byDay.entries()]
    .map(([date, dayRows]) => {
      const sorted = dayRows.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const arrivees = sorted.filter((r) => String(r.type).toUpperCase() === 'ARRIVEE');
      const departs = sorted.filter((r) => String(r.type).toUpperCase() === 'DEPART');

      const firstArrivee = (arrivees[0] ?? sorted[0])?.timestamp ?? null;
      const lastDepart = (departs[departs.length - 1] ?? sorted[sorted.length - 1])?.timestamp ?? null;

      let amplitudeHours: number | null = null;
      if (firstArrivee && lastDepart) {
        const ms = new Date(lastDepart).getTime() - new Date(firstArrivee).getTime();
        amplitudeHours = ms > 0 ? Math.round((ms / 3_600_000) * 100) / 100 : null;
      }

      return {
        date,
        firstArrivee,
        lastDepart,
        amplitudeHours,
        punchCount: sorted.length,
        stores: [...new Set(sorted.map((r) => normStore(r.store_city)))],
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Construit la synthèse heures par employé sur la période.
 * `staff` : annuaire complet (les employés SANS pointage apparaissent avec 0 jour
 * = absence sur la période).
 */
export function buildHoursSummary(rows: AttendanceRow[], staff: StaffProfile[]): HoursSummary {
  const staffByName = new Map(staff.map((s) => [normName(s.full_name), s]));

  // Regroupe les pointages par nom normalisé.
  const rowsByName = new Map<string, AttendanceRow[]>();
  for (const r of rows) {
    const k = normName(r.cashier_name);
    const arr = rowsByName.get(k) ?? [];
    arr.push(r);
    rowsByName.set(k, arr);
  }

  const employees: EmployeeHours[] = [];
  const unmatchedNames: string[] = [];

  // 1. Une entrée par employé de l'annuaire (avec ou sans pointage).
  for (const s of staff) {
    const key = normName(s.full_name);
    const empRows = rowsByName.get(key) ?? [];
    const days = summarizeDays(empRows);
    employees.push({
      cashierName: s.full_name,
      staff: s,
      matched: true,
      daysWorked: days.length,
      totalHours: Math.round(days.reduce((sum, d) => sum + (d.amplitudeHours ?? 0), 0) * 100) / 100,
      totalPunches: empRows.length,
      days,
    });
  }

  // 2. Pointages orphelins (cashier_name sans employé correspondant).
  for (const [key, empRows] of rowsByName.entries()) {
    if (staffByName.has(key)) continue;
    const displayName = empRows[0]?.cashier_name ?? key;
    unmatchedNames.push(displayName);
    const days = summarizeDays(empRows);
    employees.push({
      cashierName: displayName,
      staff: null,
      matched: false,
      daysWorked: days.length,
      totalHours: Math.round(days.reduce((sum, d) => sum + (d.amplitudeHours ?? 0), 0) * 100) / 100,
      totalPunches: empRows.length,
      days,
    });
  }

  employees.sort((a, b) => {
    if (a.matched !== b.matched) return a.matched ? -1 : 1;
    return b.totalPunches - a.totalPunches || a.cashierName.localeCompare(b.cashierName);
  });

  return { employees, unmatchedNames };
}
