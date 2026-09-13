// app/error.tsx
//
// Page affichée automatiquement par Next.js quand un écran plante de façon
// inattendue (erreur non gérée dans un composant). Sans ce fichier,
// l'utilisateur tombe sur un écran technique générique sans indication.
'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Erreur applicative non gérée :', error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F9F9FB] px-6 text-center text-[#111111]">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#D4AF37]">LMBS</p>
      <h1 className="text-2xl font-bold">Une erreur inattendue s&apos;est produite</h1>
      <p className="max-w-md text-sm text-[#5c5a55]">
        Aucune donnée n&apos;a été perdue. Vous pouvez réessayer, ou revenir à la Caisse si le problème
        persiste.
      </p>
      <div className="mt-2 flex gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-xl bg-[#D4AF37] px-5 py-2.5 text-sm font-bold text-[#111111] transition hover:brightness-95"
        >
          Réessayer
        </button>
        <Link
          href="/"
          className="rounded-xl border border-[#111111]/15 bg-white px-5 py-2.5 text-sm font-medium text-[#111111] transition hover:border-[#D4AF37]"
        >
          Retour à la Caisse
        </Link>
      </div>
    </main>
  );
}
