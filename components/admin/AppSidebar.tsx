"use client";

// Nouvelle barre de navigation latérale (remplace AdminTopNav) — Phase A du
// chantier de nouveau design (roadmap-implementation-nouveau-design-2026-09-15.md).
// Regroupe en un seul endroit les écrans /admin/* qui aujourd'hui nécessitent
// plusieurs clics (barre horizontale + onglets internes au tableau de bord).
// Aucune route existante n'est supprimée ni modifiée : chaque lien pointe
// vers une URL déjà fonctionnelle. Le contrôle d'accès réel reste géré par
// isPathForbiddenForRole (lib/services/auth.ts) / AuthGuard — ce fichier ne
// fait que masquer par confort les liens qu'un GÉRANT ne pourrait de toute
// façon pas ouvrir.

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, getCurrentStaff, StaffRole } from "@/lib/services/auth";
import ThemeToggle from "@/components/theme/ThemeToggle";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  Users,
  Tag,
  CreditCard,
  Scale,
  Landmark,
  Truck,
  QrCode,
  Receipt,
  Clock,
  Handshake,
  Radio,
  Settings,
  LogOut,
} from "lucide-react";

interface NavItem {
  key: string;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  directionOnly?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    label: "OPÉRATIONS",
    items: [
      { key: "dashboard", href: "/admin", label: "Tableau de bord", icon: LayoutDashboard },
      { key: "caisse", href: "/", label: "Caisse", icon: ShoppingCart },
      { key: "stock", href: "/admin?tab=STOCK", label: "Stocks & Transferts", icon: Package },
      { key: "audits", href: "/admin/audits", label: "Inventaires & Audits", icon: Boxes },
    ],
  },
  {
    label: "COMMERCIAL",
    items: [
      { key: "clients", href: "/admin/customers", label: "Clients", icon: Users },
      { key: "promo", href: "/admin/pricing#promotions", label: "Codes promo", icon: Tag },
      { key: "pricing", href: "/admin/pricing", label: "Grille Tarifaire", icon: CreditCard },
      { key: "comparative", href: "/admin/comparative", label: "Comparatif Boutiques", icon: Scale },
    ],
  },
  {
    label: "FINANCE",
    items: [
      { key: "finance", href: "/admin/finance", label: "Comptabilité", icon: Landmark },
      { key: "suppliers", href: "/admin/purchases", label: "Fournisseurs", icon: Truck },
      { key: "merchant", href: "/admin/merchant-accounts", label: "Comptes Marchands", icon: QrCode, directionOnly: true },
      { key: "ledger", href: "/admin?tab=SALES_AUDIT", label: "Grand Livre des Ventes", icon: Receipt },
    ],
  },
  {
    label: "DIRECTION",
    items: [
      { key: "hr", href: "/admin/hr", label: "Registre RH", icon: Clock, directionOnly: true },
      { key: "providers", href: "/admin/service-providers", label: "Prestataires", icon: Handshake, directionOnly: true },
      { key: "surveillance", href: "/admin/surveillance", label: "Vidéosurveillance", icon: Radio, directionOnly: true },
    ],
  },
];

function isItemActive(pathname: string, href: string): boolean {
  const hrefPath = href.split("?")[0].split("#")[0] || "/";
  if (hrefPath === "/admin") return pathname === "/admin";
  if (hrefPath === "/") return pathname === "/";
  return pathname === hrefPath || pathname.startsWith(hrefPath + "/");
}

export default function AppSidebar() {
  const pathname = usePathname() || "/";
  const [staffName, setStaffName] = useState<string>("…");
  const [staffRole, setStaffRole] = useState<StaffRole | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const current = await getCurrentStaff();
        if (cancelled || !current) return;
        setStaffName(current.staff.full_name);
        setStaffRole(current.staff.role);
      } catch (err) {
        console.warn("AppSidebar: lecture du profil impossible", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      console.warn("signOut failed", err);
    } finally {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login";
    }
  };

  const initials = staffName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "…";

  return (
    <aside className="w-60 shrink-0 border-r border-slate-800 bg-slate-900 flex flex-col p-4 font-lmb-body">
      <div className="flex items-center gap-2.5 px-2 pb-5 mb-4 border-b border-slate-800">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-lmb-heading font-bold text-sm shrink-0"
          style={{ background: "linear-gradient(135deg, var(--lmb-accent-300), var(--lmb-accent-500))" }}
        >
          LM
        </div>
        <div className="min-w-0">
          <div className="font-lmb-heading font-bold text-[13px] leading-tight text-slate-100 truncate">
            Luxury Magic Butter
          </div>
          <div className="text-[11px] text-slate-400">Dakar &amp; Abidjan</div>
        </div>
      </div>

      <nav className="flex-1 flex flex-col gap-0.5 overflow-y-auto">
        {GROUPS.map((group) => {
          const visibleItems = group.items.filter(
            (item) => !item.directionOnly || staffRole === "DIRECTION"
          );
          if (visibleItems.length === 0) return null;
          return (
            <React.Fragment key={group.label}>
              <div className="text-[9.5px] font-bold tracking-wider text-slate-500 px-3 pt-3 pb-1">
                {group.label}
              </div>
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const active = isItemActive(pathname, item.href);
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-[10px] text-[12.5px] transition ${
                      active
                        ? "font-semibold"
                        : "text-slate-400 hover:text-slate-100 hover:bg-slate-800 font-medium"
                    }`}
                    style={
                      active
                        ? {
                            backgroundColor: "color-mix(in oklab, var(--accent-lmb) 14%, transparent)",
                            color: "var(--accent-lmb)",
                          }
                        : undefined
                    }
                  >
                    <Icon className="w-[17px] h-[17px] shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </React.Fragment>
          );
        })}
      </nav>

      <div className="pt-3 mt-2 border-t border-slate-800">
        <button
          type="button"
          onClick={handleSignOut}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[10px] text-[12.5px] font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
        >
          <LogOut className="w-[17px] h-[17px] shrink-0" />
          Se déconnecter
        </button>
        <div className="px-3 pt-1 pb-2 flex items-center gap-2.5">
          <Settings className="w-[15px] h-[15px] text-slate-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <ThemeToggle />
          </div>
        </div>
        <div className="flex items-center gap-2.5 p-2.5 mt-1 rounded-xl bg-slate-800/60">
          <div
            className="w-[30px] h-[30px] rounded-full flex items-center justify-center font-bold text-[11px] shrink-0"
            style={{ backgroundColor: "color-mix(in oklab, var(--accent-lmb) 18%, transparent)", color: "var(--accent-lmb)" }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-slate-100 truncate">{staffName}</div>
            {staffRole && (
              <div className="text-[9.5px] font-bold text-emerald-400 mt-0.5">{staffRole}</div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
