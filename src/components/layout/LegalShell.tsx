import type { ReactNode } from "react";
import Link from "next/link";
import { Bot } from "lucide-react";
import styles from "@/app/legal.module.css";

export function LegalShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <Link href="/" className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            <Bot size={22} />
          </span>
          Jobform
        </Link>
        <nav className={styles.links}>
          <Link href="/support">Customer support</Link>
          <Link href="/login">Staff sign in</Link>
        </nav>
      </header>
      <article className={styles.doc}>
        <p className={styles.kicker}>Jobform</p>
        <h1>{title}</h1>
        <p className={styles.updated}>Effective 19 August 2026</p>
        {children}
        <Link href="/" className={styles.back}>Back to home</Link>
      </article>
    </div>
  );
}
