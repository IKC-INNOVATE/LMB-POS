 // app/admin/layout.tsx
import React from 'react';
import AppSidebar from '../../components/admin/AppSidebar';
import AuthGuard from '../../components/auth/AuthGuard';

export const metadata = {
  title: 'Direction & Supervision • Luxury Magic Butter',
  description: 'ERP & POS Multi-Boutiques Luxury Magic Butter - Dakar & Abidjan',
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-[#0A0F1D] text-slate-100 flex">
        <AppSidebar />
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </AuthGuard>
  );
}
