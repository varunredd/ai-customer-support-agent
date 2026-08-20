import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import styles from "./HostedSupportPanel.module.css";

export function HostedSupportPanel() {
  return (
    <div className={styles.panel}>
      <section className={styles.section}>
        <p className="eyebrow">Support access</p>
        <h3>Opened from the store</h3>
        <p className={styles.muted}>The store decides which signed-in customer and order may start support.</p>
      </section>

      <section className={styles.section}>
        <div className={styles.row}>
          <KeyRound size={17} />
          <div>
            <strong>Short-lived launch</strong>
            <span>Launch tokens expire quickly and can be used only once.</span>
          </div>
        </div>
        <div className={styles.row}>
          <LockKeyhole size={17} />
          <div>
            <strong>Session credential</strong>
            <span>This browser tab keeps the exchanged session credential so you can resume if you reload.</span>
          </div>
        </div>
        <div className={styles.row}>
          <ShieldCheck size={17} />
          <div>
            <strong>Server authorization</strong>
            <span>Chat, session reads, microphone credentials, and voice playback all re-check session access.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
