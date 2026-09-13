// app/layout.tsx
import './globals.css';
import React from 'react';
import ThemeProvider from '../components/theme/ThemeProvider';

export const metadata = {
  title: 'Luxury Magic Butter • ERP & POS',
  description: 'Système ERP & POS Multi-Boutiques Dakar & Abidjan',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-[#F9F9FB] text-[#111111] antialiased selection:bg-[#D4AF37]/30 selection:text-[#111111]">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}