'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * La gestion des codes promo a été fusionnée dans l'onglet « Grille Tarifaire »
 * du dashboard Direction (Tâche 3.2). Cette route est conservée uniquement pour
 * ne pas casser un favori éventuel : elle redirige vers /admin/pricing.
 */
export default function PromotionsPageRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/pricing');
  }, [router]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-16 text-center text-sm text-slate-400">
      Redirection vers la Grille Tarifaire…
    </main>
  );
}
