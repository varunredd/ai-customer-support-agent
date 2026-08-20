import { ExternalLink, LockKeyhole, ShieldCheck } from "lucide-react";
import styles from "./HostedSupportGate.module.css";

export function HostedSupportGate({ error }: { error?: string | null }) {
  return (
    <section className={styles.shell} aria-labelledby="secure-support-title">
      <div className={styles.icon} aria-hidden="true">
        <LockKeyhole size={22} />
      </div>
      <div className={styles.copy}>
        <p className={styles.eyebrow}>Store-launched support</p>
        <h2 id="secure-support-title">Open support from your order</h2>
        <p>
          This workspace accepts support only from a signed-in store or account page. Customer directories are not public.
        </p>
      </div>

      {error ? (
        <div className={styles.error} role="alert">
          <strong>Support link could not be opened</strong>
          <span>{error}</span>
        </div>
      ) : null}

      <div className={styles.note}>
        <ShieldCheck size={17} />
        <div>
          <strong>Identity stays server-bound</strong>
          <span>A short-lived launch is exchanged once for a support-session credential kept in this browser tab.</span>
        </div>
      </div>

      <p className={styles.help}>
        Return to your order and choose Get help to start a new session.
        <ExternalLink size={13} aria-hidden="true" />
      </p>
    </section>
  );
}
