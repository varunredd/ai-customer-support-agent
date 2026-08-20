"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, Bot, FileText, LayoutDashboard, LogOut, MessageSquare, Receipt, ServerCog, Shield, UserRoundCheck, Users } from "lucide-react";
import clsx from "clsx";
import { formatStaffRole } from "@/lib/format";
import type { StaffRole } from "@/domain/auth/types";
import type { StaffPermission } from "@/security/rbac";
import styles from "./AppSidebar.module.css";

const PUBLIC_PATHS = ["/", "/support", "/login", "/privacy", "/terms"];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<StaffRole | null>(null);
  const [permissions, setPermissions] = useState<StaffPermission[]>([]);

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

  if (publicSurface) return null;

  async function signOut() {
    await fetch("/api/admin/login", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className={styles.sidebar}>
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
        <div className={styles.navSection}>
          <p className={styles.sectionLabel}>Workspace</p>
          <Link href="/support" className={clsx(styles.navItem, pathname.startsWith("/support") && styles.navItemActive)}>
            <MessageSquare size={16} />
            Customer portal
          </Link>
        </div>

        <div className={styles.navSection}>
          <p className={styles.sectionLabel}>Operations</p>
          <Link href="/admin" className={clsx(styles.navItem, pathname === "/admin" && styles.navItemActive)}>
            <LayoutDashboard size={16} />
            Overview
          </Link>
          <Link href="/admin/runs" className={clsx(styles.navItem, pathname.startsWith("/admin/runs") && styles.navItemActive)}>
            <Activity size={16} />
            Runs
          </Link>
          <Link href="/admin/customers" className={clsx(styles.navItem, pathname.startsWith("/admin/customers") && styles.navItemActive)}>
            <Users size={16} />
            Customers
          </Link>
          <Link href="/admin/refunds" className={clsx(styles.navItem, pathname.startsWith("/admin/refunds") && styles.navItemActive)}>
            <Receipt size={16} />
            Refunds
          </Link>
          <Link href="/admin/escalations" className={clsx(styles.navItem, pathname.startsWith("/admin/escalations") && styles.navItemActive)}>
            <UserRoundCheck size={16} />
            Escalations
          </Link>
          <Link href="/admin/policy" className={clsx(styles.navItem, pathname.startsWith("/admin/policy") && styles.navItemActive)}>
            <FileText size={16} />
            Refund Policy
          </Link>
          <Link href="/admin/system" className={clsx(styles.navItem, pathname.startsWith("/admin/system") && styles.navItemActive)}>
            <ServerCog size={16} />
            System
          </Link>
          {permissions.includes("team:manage") ? (
            <Link href="/admin/team" className={clsx(styles.navItem, pathname.startsWith("/admin/team") && styles.navItemActive)}>
              <Shield size={16} />
              Team
            </Link>
          ) : null}
        </div>
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
  );
}
