import { supabase } from '@/lib/supabase';

// =====================================================================
// Statut « Vidéosurveillance & Pointage caméra ».
//
// Pas d'intégration caméra active à ce jour (caméras installées mais pas
// d'internet à la boutique de Dakar ; capacité API/reconnaissance faciale
// des caméras non vérifiée avec le fournisseur). Cette page ne prétend
// donc PAS afficher un flux vidéo ou un pointage automatique : c'est un
// suivi honnête des 2 points bloquants, éditable par la DIRECTION au fur
// et à mesure de l'avancement (ex : le jour où l'internet arrive à Dakar),
// sans nécessiter de nouveau déploiement de code.
//
// Table singleton lmb_surveillance_status (une seule ligne, id = 1).
// =====================================================================

export type SurveillanceStatus = {
  internetDakarReady: boolean;
  internetDakarNotes: string | null;
  cameraApiReady: boolean;
  cameraApiNotes: string | null;
  updatedBy: string | null;
  updatedAt: string;
};

type SurveillanceStatusRow = {
  internet_dakar_ready: boolean | null;
  internet_dakar_notes: string | null;
  camera_api_ready: boolean | null;
  camera_api_notes: string | null;
  updated_by: string | null;
  updated_at: string;
};

function mapRow(row: SurveillanceStatusRow): SurveillanceStatus {
  return {
    internetDakarReady: !!row.internet_dakar_ready,
    internetDakarNotes: row.internet_dakar_notes ?? null,
    cameraApiReady: !!row.camera_api_ready,
    cameraApiNotes: row.camera_api_notes ?? null,
    updatedBy: row.updated_by ?? null,
    updatedAt: row.updated_at,
  };
}

/**
 * Lit l'état courant. La ligne singleton (id=1) est créée par la migration
 * 20260915_create_surveillance_status.sql ; si jamais elle manquait (base
 * non migrée), on remonte une erreur explicite plutôt qu'un faux état par
 * défaut silencieux.
 */
export async function getSurveillanceStatus(): Promise<SurveillanceStatus> {
  const { data, error } = await supabase
    .from('lmb_surveillance_status')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    throw new Error(`Impossible de lire le statut vidéosurveillance : ${error.message}`);
  }
  if (!data) {
    throw new Error(
      "Aucune ligne de statut trouvée (table lmb_surveillance_status vide). La migration 20260915_create_surveillance_status.sql a-t-elle bien été appliquée ?"
    );
  }
  return mapRow(data);
}

export type UpdateSurveillanceStatusInput = {
  internetDakarReady: boolean;
  internetDakarNotes: string;
  cameraApiReady: boolean;
  cameraApiNotes: string;
  updatedBy: string;
};

export async function updateSurveillanceStatus(
  input: UpdateSurveillanceStatusInput
): Promise<SurveillanceStatus> {
  const { data, error } = await supabase
    .from('lmb_surveillance_status')
    .update({
      internet_dakar_ready: input.internetDakarReady,
      internet_dakar_notes: input.internetDakarNotes.trim() || null,
      camera_api_ready: input.cameraApiReady,
      camera_api_notes: input.cameraApiNotes.trim() || null,
      updated_by: input.updatedBy.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Échec de la mise à jour du statut vidéosurveillance : ${error.message}`);
  }
  return mapRow(data);
}
