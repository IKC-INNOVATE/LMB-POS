import type { NextConfig } from "next";

// En-têtes de sécurité HTTP appliqués à toutes les pages.
// Filet de sécurité standard : n'affecte aucune fonctionnalité, seulement
// des règles supplémentaires appliquées par le navigateur.
const securityHeaders = [
  {
    // Empêche l'application d'être chargée dans un cadre invisible sur un
    // autre site (protection contre le piégeage de clics / "clickjacking").
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Empêche le navigateur de deviner le type d'un fichier différemment de
    // ce que le serveur a annoncé (protection contre certaines attaques par
    // upload de fichier détourné).
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Limite les informations envoyées à un autre site quand on clique un
    // lien sortant depuis l'application.
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Désactive l'accès à la caméra/micro/géolocalisation par défaut pour
    // cette application (aucun de ces usages n'existe dans le code actuel).
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
