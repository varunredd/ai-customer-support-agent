"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bot,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Plug,
  Receipt,
  CircleAlert,
  ScrollText,
  ServerCog,
  Shield,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";
import clsx from "clsx";
import { formatStaffRole } from "@/lib/format";
import type { StaffRole } from "@/domain/auth/types";
import type { StaffPermission } from "@/security/rbac";
import styles from "./AppSidebar.module.css";

const PUBLIC_PATHS = ["/", "/support", "/login", "/privacy", "/terms"];

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  exact?: boolean;
  permission?: StaffPermission;
};

const NAV_SECTIONS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Overview",
    items: [{ href: "/admin", label: "Overview", icon: <LayoutDashboard size={16} />, exact: true }],
  },
  {
    label: "Support",
    items: [
      { href: "/admin/conversations", label: "Conversations", icon: <MessageSquare size={16} /> },
      { href: "/admin/customers", label: "Customers", icon: <Users size={16} /> },
      { href: "/admin/refunds", label: "Refunds", icon: <Receipt size={16} /> },
      { href: "/admin/escalations", label: "Escalations", icon: <UserRoundCheck size={16} />, permission: "escalations:manage" },
      { href: "/admin/approvals", label: "Approvals", icon: <ClipboardCheck size={16} />, permission: "refund:approve" },
    ],
  },
  {
    label: "AI ops",
    items: [
      { href: "/admin/runs", label: "Agent runs", icon: <Activity size={16} /> },
      { href: "/admin/failed-runs", label: "Failed runs", icon: <CircleAlert size={16} /> },
      { href: "/admin/decisions", label: "Decisions", icon: <ScrollText size={16} /> },
    ],
  },
  {
    label: "Knowledge",
    items: [{ href: "/admin/policy", label: "Policies", icon: <FileText size={16} /> }],
  },
  {
    label: "Integrations",
    items: [{ href: "/admin/integrations", label: "Integrations", icon: <Plug size={16} />, permission: "integrations:manage" }],
  },
  {
    label: "Analytics",
    items: [{ href: "/admin/analytics", label: "Analytics", icon: <BarChart3 size={16} />, permission: "analytics:view" }],
  },
  {
    label: "Admin",
    items: [
      { href: "/admin/team", label: "Team", icon: <Shield size={16} />, permission: "team:manage" },
      { href: "/admin/audit", label: "Audit log", icon: <ScrollText size={16} />, permission: "audit:view" },
      { href: "/admin/system", label: "Settings", icon: <ServerCog size={16} /> },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<StaffRole | null>(null);
  const [permissions, setPermissions] = useState<StaffPermission[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);

  const publicSurface = PUBLIC_PATHS.some((path) => pathname === path || (path !== "/" && pathname.startsWith(`${path}/`)));

  useEffect(() => {
    if (publicSurface) return;
    let active = true;
    void fetch("/api/admin/login", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { email?: unknown; role?: unknown; permissions?: unknown } | null) => {
        if (!active || !payload) return;
        if (typeof payload.email === "string") setEmail(payload.email);
        if (typeof payload.role === "string") setRole(payload.role as StaffRole);
        if (Array.isArray(payload.permissions)) {
          setPermissions(payload.permissions.filter((entry): entry is StaffPermission => typeof entry === "string"));
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [publicSurface]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  if (publicSurface) return null;

  async function signOut() {
    await fetch("/api/admin/login", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  function isActive(item: NavItem) {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  return (
    <>
      <button
        type="button"
        className={styles.mobileToggle}
        aria-expanded={mobileOpen}
        aria-controls="admin-sidebar"
        onClick={() => setMobileOpen((open) => !open)}
      >
        {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        <span className={styles.srOnly}>{mobileOpen ? "Close navigation" : "Open navigation"}</span>
      </button>

      {mobileOpen ? (
        <button
          type="button"
          className={styles.mobileScrim}
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside id="admin-sidebar" className={clsx(styles.sidebar, mobileOpen && styles.sidebarOpen)}>
        <div className={styles.header}>
          <div className={styles.logo}>
            <div className={styles.logoIcon}>
              <Bot size={18} />
            </div>
            <div>
              <span className={styles.logoText}>Jobform</span>
              <span className={styles.logoSub}>Admin</span>
            </div>
          </div>
        </div>

        <nav className={styles.nav}>
          {NAV_SECTIONS.map((section) => {
            const items = section.items.filter((item) => !item.permission || permissions.includes(item.permission));
            if (items.length === 0) return null;
            return (
              <div key={section.label} className={styles.navSection}>
                {section.label !== "Overview" ? <p className={styles.sectionLabel}>{section.label}</p> : null}
                {items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(styles.navItem, isActive(item) && styles.navItemActive)}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>

        <div className={styles.footer}>
          <div className={styles.user}>
            <div className={styles.avatar}>{(email ?? "ST").slice(0, 2).toUpperCase()}</div>
            <div className={styles.userInfo}>
              <span className={styles.userName}>{email ?? "Staff"}</span>
              <span className={styles.userRole}>{role ? formatStaffRole(role) : "Operations"}</span>
            </div>
          </div>
          <button type="button" className={styles.navItem} onClick={() => void signOut()}>
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
