// components/ui/LoadingState.tsx
//
// Indicateur de chargement unique pour toute l'application (remplace les
// styles disparates d'un écran à l'autre — texte seul, tailles et couleurs
// différentes). Un même petit rond animé + le message, centrés, partout.
import React from 'react';

export default function LoadingState({
  label = 'Chargement…',
  className = '',
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-center gap-2 py-10 text-sm text-slate-400 ${className}`}>
      <span
        aria-hidden="true"
        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
      />
      <span>{label}</span>
    </div>
  );
}
