'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
};

const STORAGE_KEY = 'lmb-theme';

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'dark';
  } catch {
    // localStorage indisponible (mode privé, etc.) : on reste en sombre.
    return 'dark';
  }
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Sombre par défaut : préserve l'apparence actuelle tant qu'aucun choix
  // n'a été mémorisé par l'utilisateur. Le choix mémorisé est lu ici,
  // directement dans l'état initial, plutôt que dans un effet séparé après
  // le montage : l'ancienne version relisait bien le choix mémorisé, mais
  // l'effet ci-dessous (qui réécrit le thème dans le stockage à chaque
  // rendu) pouvait s'exécuter en premier avec la valeur par défaut "dark"
  // et écraser un thème clair déjà mémorisé avant que la relecture n'ait
  // eu le temps de s'appliquer. Résultat concret : après un rechargement
  // de page (par exemple l'écran de Connexion), le thème repassait parfois
  // en sombre même si "clair" avait été choisi juste avant.
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Rien à faire si le stockage n'est pas disponible.
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}
