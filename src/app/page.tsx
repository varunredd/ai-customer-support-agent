import Link from "next/link";
import { ArrowRight, Bot, MessageSquare, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import styles from "./page.module.css";

export default function Home() {
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

      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>AI customer support for refunds</p>
          <h1>
            <span>Policy decides the money.</span>
            <span>The agent handles the conversation.</span>
          </h1>
          <p className={styles.lead}>
            Customers look up an order. The agent investigates. A policy engine approves or denies the refund.
            The model never gets financial authority.
          </p>
          <div className={styles.actions}>
            <Link href="/support" className={styles.primary}>
              Open support portal
              <ArrowRight size={16} />
            </Link>
            <Link href="/login" className={styles.secondary}>Staff console</Link>
          </div>
        </section>

        <section className={styles.grid} aria-label="Product highlights">
          <article className={styles.card}>
            <span className={styles.icon}><MessageSquare size={18} /></span>
            <h2>Customer portal</h2>
            <p>Start support with the email and order ID on the account. Chat stays locked to that order.</p>
          </article>
          <article className={styles.card}>
            <span className={styles.icon}><Workflow size={18} /></span>
            <h2>Store launch</h2>
            <p>A signed-in store can open support for the authenticated customer and owned order.</p>
          </article>
          <article className={styles.card}>
            <span className={styles.icon}><ShieldCheck size={18} /></span>
            <h2>Policy engine</h2>
            <p>Eligibility, amount, and ledger writes stay in server code. The model cannot bypass them.</p>
          </article>
          <article className={styles.card}>
            <span className={styles.icon}><Sparkles size={18} /></span>
            <h2>Voice included</h2>
            <p>Spoken turns use the same support agent and the same refund path as typed chat.</p>
          </article>
        </section>
      </main>

      <footer className={styles.footer}>
        <span className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            <Bot size={16} />
          </span>
          Jobform
        </span>
        <div className={styles.links}>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/admin">Operations</Link>
        </div>
      </footer>
    </div>
  );
}
