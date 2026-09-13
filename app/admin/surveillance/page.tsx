'use client';

import { useCallback, useEffect, useState } from 'react';
import SecondaryButton from '@/components/ui/SecondaryButton';
import PrimaryButton from '@/components/ui/PrimaryButton';
import Textarea from '@/components/ui/Textarea';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Radio,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { getCurrentStaff } from '@/lib/services/auth';
import {
  getSurveillanceStatus,
  updateSurveillanceStatus,
  type SurveillanceStatus,
} from '@/lib/services/surveillance';

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function SurveillancePage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <SecondaryButton
          href="/admin"
          className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.18em]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour
        </SecondaryButton>
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-300">Direction • Sécurité boutiques</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-white">
            <Radio className="h-6 w-6 text-[#D4AF37]" />
            Vidéosurveillance & Pointage caméra
          </h1>
        </div>
      </div>

      <StatusForm />
    </main>
  );
}

// =====================================================================
// Statut éditable (chargement + formulaire) — isolé du conteneur ci-dessus,
// même patron que StaffSection dans app/admin/hr/page.tsx.
// =====================================================================
function StatusForm() {
  const [status, setStatus] = useState<SurveillanceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [staffName, setStaffName] = useState('');

  // Formulaire (édité localement, envoyé seulement au clic sur Enregistrer).
  const [internetReady, setInternetReady] = useState(false);
  const [internetNotes, setInternetNotes] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraNotes, setCameraNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const s = await getSurveillanceStatus();
      setStatus(s);
      setInternetReady(s.internetDakarReady);
      setInternetNotes(s.internetDakarNotes ?? '');
      setCameraReady(s.cameraApiReady);
      setCameraNotes(s.cameraApiNotes ?? '');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Chargement du statut impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getCurrentStaff()
      .then((s) => setStaffName(s?.staff.full_name ?? ''))
      .catch(() => setStaffName(''));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveOk(null);
    try {
      const updated = await updateSurveillanceStatus({
        internetDakarReady: internetReady,
        internetDakarNotes: internetNotes,
        cameraApiReady: cameraReady,
        cameraApiNotes: cameraNotes,
        updatedBy: staffName,
      });
      setStatus(updated);
      setSaveOk('Statut mis à jour.');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Mise à jour impossible.');
    } finally {
      setSaving(false);
    }
  };

  const bothReady = internetReady && cameraReady;

  if (loadError) {
    return (
      <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
        {loadError}
      </div>
    );
  }

  if (loading || !status) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Explication honnête du périmètre actuel */}
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
        <p className="font-bold">Aucun flux vidéo ni pointage automatique par caméra pour l&apos;instant.</p>
        <p className="mt-1 text-amber-200/90">
          Les caméras sont physiquement installées en boutique mais pas encore opérationnelles :
          il manque la connexion internet sur place, et la capacité des caméras à faire de la
          reconnaissance faciale / du contrôle d&apos;accès avec appel API n&apos;a pas encore été vérifiée
          auprès du fournisseur. Cette page sert à suivre ces deux points ; le pointage automatique
          par caméra (en complément du pointage existant du{' '}
          <a href="/admin/hr" className="underline decoration-dotted">
            Registre RH
          </a>
          , jamais en remplacement) ne sera développé qu&apos;une fois les deux au vert.
        </p>
      </div>

      {bothReady && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Les deux points bloquants sont marqués prêts — on peut passer à la conception du
          pointage automatique par caméra dès que tu veux.
        </div>
      )}

      <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        {/* Internet Dakar */}
        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={internetReady}
              onChange={(e) => setInternetReady(e.target.checked)}
              className="h-4 w-4 accent-[#D4AF37]"
            />
            <span className="flex items-center gap-2 text-sm font-bold text-white">
              {internetReady ? (
                <Wifi className="h-4 w-4 text-emerald-400" />
              ) : (
                <WifiOff className="h-4 w-4 text-rose-400" />
              )}
              Connexion internet branchée à la boutique de Dakar
            </span>
          </label>
          <Textarea
            value={internetNotes}
            onChange={(e) => setInternetNotes(e.target.value)}
            placeholder="Notes (ex : date prévue, opérateur, contact...)"
            rows={2}
          />
        </div>

        {/* Capacité API caméra */}
        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={cameraReady}
              onChange={(e) => setCameraReady(e.target.checked)}
              className="h-4 w-4 accent-[#D4AF37]"
            />
            <span className="flex items-center gap-2 text-sm font-bold text-white">
              {cameraReady ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-rose-400" />
              )}
              Caméras confirmées capables de reconnaissance faciale / contrôle d&apos;accès avec appel API
            </span>
          </label>
          <Textarea
            value={cameraNotes}
            onChange={(e) => setCameraNotes(e.target.value)}
            placeholder="Notes (ex : marque/modèle, contact fournisseur, réponse obtenue...)"
            rows={2}
          />
        </div>

        {saveError && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            {saveError}
          </div>
        )}
        {saveOk && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            {saveOk}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500">
            Dernière mise à jour : {fmtDateTime(status.updatedAt)}
            {status.updatedBy ? ` par ${status.updatedBy}` : ''}
          </p>
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}
