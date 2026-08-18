"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Bot, FileText, LayoutDashboard, MessageSquare, Receipt, Users } from "lucide-react";
import clsx from "clsx";
import styles from "./AppSidebar.module.css";

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <Bot size={18} />
          </div>
          <div>
            <span className={styles.logoText}>Jobform Automator</span>
            <span className={styles.logoSub}>Support operations</span>
          </div>
        </div>
      </div>

      <nav className={styles.nav}>
        <div className={styles.navSection}>
          <p className={styles.sectionLabel}>Support</p>
          <Link href="/support" className={clsx(styles.navItem, pathname.startsWith("/support") && styles.navItemActive)}>
            <MessageSquare size={16} />
            Support Chat
          </Link>
        </div>

        <div className={styles.navSection}>
          <p className={styles.sectionLabel}>Admin</p>
          <Link href="/admin" className={clsx(styles.navItem, pathname === "/admin" && styles.navItemActive)}>
            <LayoutDashboard size={16} />
            Overview
          </Link>
          <Link href="/admin/runs" className={clsx(styles.navItem, pathname.startsWith("/admin/runs") && styles.navItemActive)}>
            <Activity size={16} />
            Agent Runs
          </Link>
          <Link href="/admin/customers" className={clsx(styles.navItem, pathname.startsWith("/admin/customers") && styles.navItemActive)}>
            <Users size={16} />
            Customers
          </Link>
          <Link href="/admin/refunds" className={clsx(styles.navItem, pathname.startsWith("/admin/refunds") && styles.navItemActive)}>
            <Receipt size={16} />
            Refunds Ledger
          </Link>
          <Link href="/admin/policy" className={clsx(styles.navItem, pathname.startsWith("/admin/policy") && styles.navItemActive)}>
            <FileText size={16} />
            Refund Policy
          </Link>
        </div>
      </nav>

      <div className={styles.footer}>
        <div className={styles.user}>
          <div className={styles.avatar}>AU</div>
          <div className={styles.userInfo}>
            <span className={styles.userName}>Admin User</span>
            <span className={styles.userRole}>Workspace Owner</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
