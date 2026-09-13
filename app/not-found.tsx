// app/not-found.tsx
//
// Page affichée automatiquement par Next.js quand une adresse ne correspond
// à aucune page de l'application (lien cassé, faute de frappe dans l'URL).
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F9F9FB] px-6 text-center text-[#111111]">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#D4AF37]">LMBS</p>
      <h1 className="text-2xl font-bold">Page introuvable</h1>
      <p className="max-w-md text-sm text-[#5c5a55]">
        L&apos;adresse demandée n&apos;existe pas ou plus. Vérifiez le lien, ou revenez à la Caisse.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-xl bg-[#D4AF37] px-5 py-2.5 text-sm font-bold text-[#111111] transition hover:brightness-95"
      >
        Retour à la Caisse
      </Link>
    </main>
  );
}
