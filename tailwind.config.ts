import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}', './lib/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        luxury: {
          gold: '#D4AF37',
          goldStrong: '#C5A059',
          charcoal: '#111111',
          onyx: '#1A1A1A',
          cream: '#F9F9FB',
          mist: '#F3F4F6',
          champagne: '#F5E3B3',
          soft: '#EFE7D1',
        },
      },
      boxShadow: {
        luxury: '0 18px 40px -22px rgba(212, 175, 55, 0.38)',
        gold: '0 10px 30px rgba(212, 175, 55, 0.2)',
      },
      borderRadius: {
        luxe: '1.25rem',
      },
    },
  },
  plugins: [],
};

export default config;
