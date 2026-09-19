"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/services/auth";
import ThemeToggle from "@/components/theme/ThemeToggle";

export default function AdminTopNav() {
  const pathname = usePathname() || "/";

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      console.warn("signOut failed", err);
    } finally {
      window.location.href = "/login";
    }
  };

  const tabs = [
    { href: "/admin", label: "LMBS" },
    { href: "/admin/customers", label: "CRM CLIENTS VIP" },
    { href: "/admin/purchases", label: "ACHATS & FOURNISSEURS" },
    { href: "/admin/customers", label: "CLIENTS & FIDÉLITÉ" },
    { href: "/admin/promotions", label: "PROMOTIONS & OFFRES" },
    { href: "/admin/finance", label: "COMPTABILITÉ & FINANCE" },
    { href: "/admin/charges", label: "CHARGES" },
    { href: "/admin/audits", label: "INVENTAIRES & AUDITS" },
  ];

  return (
    <div className="border-b border-gray-800 bg-[#111111] sticky top-0 z-40">
      <div className="max-w-[1600px] mx-auto px-4 py-2 flex items-center gap-2">
        <nav className="flex items-center gap-2 flex-1 flex-wrap overflow-x-auto">
          {tabs.map((t) => {
            const isActive = pathname === t.href || pathname.startsWith(t.href + "/");
            const base = "text-white font-semibold text-xs tracking-wider uppercase";
            const hover = "hover:text-[#D4AF37] hover:bg-[#222222] px-3 py-1.5 rounded transition";
            const active = "bg-[#222222] text-[#D4AF37] border border-[#D4AF37]/40 px-3 py-1.5 rounded";

            return (
              <Link
                key={t.href + t.label}
                href={t.href}
                className={`${base} ${isActive ? active : hover}`}
                aria-current={isActive ? "page" : undefined}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-shrink-0 flex items-center gap-2">
          <Link href="/" className="bg-[#00D1B2] text-black font-bold px-4 py-1.5 rounded">
            CAISSE
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="border border-gray-700 text-white font-semibold text-xs uppercase tracking-wider px-3 py-1.5 rounded hover:border-[#D4AF37] hover:text-[#D4AF37] transition"
          >
            Se déconnecter
          </button>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
