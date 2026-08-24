import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import styles from "./HostedSupportPanel.module.css";

export function HostedSupportPanel() {
  return (
    <div className={styles.panel}>
      <section className={styles.section}>
        <p className="eyebrow">Support access</p>
        <h3>Opened from the store</h3>
        <p className={styles.muted}>
          The storefront chooses which signed-in customer and order may start this chat.
        </p>
      </section>

      <section className={styles.section}>
        <div className={styles.row}>
          <KeyRound size={17} />
          <div>
            <strong>One-time launch</strong>
            <span>Launch links expire quickly and can be used only once.</span>
          </div>
        </div>
        <div className={styles.row}>
          <LockKeyhole size={17} />
          <div>
            <strong>Tab-bound session</strong>
            <span>This browser tab keeps the session credential so a reload can resume the same chat.</span>
          </div>
        </div>
        <div className={styles.row}>
          <ShieldCheck size={17} />
          <div>
            <strong>Checked on every turn</strong>
            <span>Chat, session reads, microphone access, and voice playback all re-verify the session.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
