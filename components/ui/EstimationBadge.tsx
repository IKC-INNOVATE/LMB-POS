import { AlertTriangle } from 'lucide-react';

/**
 * Badge « estimation » — affiché partout où une marge est calculée avec le repli
 * de coût à 65 % du prix de vente, faute de coût d'achat réel (`cost_price_xof`).
 * Extrait de app/admin/comparative/page.tsx (Tâche 3.1) pour être réutilisé par
 * la Grille Tarifaire (Tâche 3.2). Ne pas dupliquer : importer ce composant.
 */
export default function EstimationBadge() {
  return (
    <span
      title="Coût d'achat réel non renseigné pour ce produit : marge calculée avec une estimation de coût à 65 % du prix de vente."
      className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300"
    >
      <AlertTriangle className="h-3 w-3" />
      estimation
    </span>
  );
}
