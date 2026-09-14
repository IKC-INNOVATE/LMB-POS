'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getCurrentStaff, isPathForbiddenForRole } from '@/lib/services/auth';

/**
 * Barrière d'accès côté client :
 *  - utilisateur non connecté            -> redirigé vers /login
 *  - CAISSIER sur une section interdite  -> renvoyé vers / (comportement voulu,
 *    cf. ROADMAP tâche 0.2)
 *  - erreur inattendue de vérification   -> écran d'erreur EXPLICITE (plus de
 *    redirection silencieuse : on veut voir le vrai message, pas se retrouver
 *    sur la caisse sans explication)
 *
 * À placer dans app/admin/layout.tsx (englobe tout /admin/*) et autour de la caisse (/).
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setStatus('loading');
      setErrorMessage(null);
      try {
        const current = await getCurrentStaff();
        if (cancelled) return;

        if (!current) {
          router.replace('/login');
          return;
        }

        if (isPathForbiddenForRole(current.staff.role, pathname)) {
          router.replace('/');
          return;
        }

        setStatus('ok');
      } catch (err) {
        console.error('AuthGuard: vérification de session impossible', err);
        if (cancelled) return;
        setErrorMessage(
          err instanceof Error ? err.message : 'Erreur inconnue lors de la vérification de la session.',
        );
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
        Vérification de l&apos;accès…
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-6 text-center">
        <p className="text-lg font-bold text-rose-300">Impossible de vérifier votre accès</p>
        <p className="max-w-md text-sm text-slate-400">
          {errorMessage ?? 'Une erreur est survenue.'}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.refresh()}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-white hover:border-[#D4AF37] hover:text-[#D4AF37]"
          >
            Réessayer
          </button>
          <button
            type="button"
            onClick={() => router.replace('/login')}
            className="rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-bold text-black hover:bg-[#C5A059]"
          >
            Aller à la connexion
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
