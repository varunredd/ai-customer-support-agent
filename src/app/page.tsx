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
          <p className={styles.eyebrow}>AI refund support for commerce</p>
          <h1>
            <span>Jobform talks to customers.</span>
            <span>Policy decides the money.</span>
          </h1>
          <p className={styles.lead}>
            Look up an order, explain what went wrong, and get a clear refund answer. The agent runs the conversation.
            A deterministic policy engine owns eligibility, amount, and the ledger — the model never gets financial authority.
          </p>
          <div className={styles.actions}>
            <Link href="/support" className={styles.primary}>
              Try the support portal
              <ArrowRight size={16} />
            </Link>
            <Link href="/login" className={styles.secondary}>Staff console</Link>
          </div>
        </section>

        <section className={styles.grid} aria-label="Product highlights">
          <article className={styles.card}>
            <span className={styles.icon}><MessageSquare size={18} /></span>
            <h2>Order-locked chat</h2>
            <p>Customers start with email, pick an owned order, and stay bound to that account for the whole session.</p>
          </article>
          <article className={styles.card}>
            <span className={styles.icon}><Workflow size={18} /></span>
            <h2>Store-launched help</h2>
            <p>A signed-in storefront can open support for the authenticated shopper and the order they already own.</p>
          </article>
          <article className={styles.card}>
            <span className={styles.icon}><ShieldCheck size={18} /></span>
            <h2>Policy before payout</h2>
            <p>Fifty machine-checkable rules decide approve, deny, or escalate. Ledger writes re-check policy in a transaction.</p>
          </article>
          <article className={styles.card}>
            <span className={styles.icon}><Sparkles size={18} /></span>
            <h2>Voice, same rules</h2>
            <p>Microphone turns are transcribed into the same agent path — same tools, same policy, same refund ledger.</p>
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
