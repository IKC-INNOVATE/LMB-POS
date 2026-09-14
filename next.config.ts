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
  {
    // Force le navigateur à toujours utiliser une connexion sécurisée
    // (https) vers ce domaine pendant 1 an, même si quelqu'un tape
    // l'adresse sans le "s" ou clique un vieux lien en http. Protège
    // contre les attaques d'interception sur réseau non fiable (ex. wifi
    // public). includeSubDomains couvre aussi les éventuels sous-domaines.
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
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
