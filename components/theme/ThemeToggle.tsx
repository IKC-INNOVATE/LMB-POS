'use client';

import React from 'react';
import { useTheme } from './ThemeProvider';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? 'Passer au thème clair' : 'Passer au thème sombre'}
      className="inline-flex items-center gap-1.5 rounded-xl border border-gray-700 bg-[#1A1A1A] px-3 py-2 text-sm font-semibold text-white transition hover:border-[#D4AF37]"
    >
      <span aria-hidden="true">{isDark ? '🌙' : '☀️'}</span>
      <span>{isDark ? 'Sombre' : 'Clair'}</span>
    </button>
  );
}
