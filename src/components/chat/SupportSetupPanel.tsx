import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { SupportCustomerOption, SupportOrderOption } from "@/domain/support/context";
import { formatDate, formatMoney, getInitials } from "@/lib/format";
import styles from "./SupportSetupPanel.module.css";

interface SupportSetupPanelProps {
  customer: SupportCustomerOption | null;
  order: SupportOrderOption | null;
}

export function SupportSetupPanel({ customer, order }: SupportSetupPanelProps) {
  return (
    <div className={styles.panel}>
      <section className={styles.section}>
        <p className="eyebrow">Session context</p>
        {customer ? (
          <div className={styles.customer}>
            <div className={styles.avatar}>{getInitials(customer.name)}</div>
            <div>
              <h3 className={styles.name}>{customer.name}</h3>
              <p className={styles.meta}>{customer.email}</p>
            </div>
          </div>
        ) : (
          <p className={styles.empty}>Choose a customer to preview account context here.</p>
        )}
        {customer ? (
          <div className={styles.badges}>
            <StatusBadge status={customer.accountStatus === "ACTIVE" ? "SUCCESS" : "FAILED"}>
              {customer.accountStatus}
            </StatusBadge>
            <StatusBadge status={customer.riskLevel}>{customer.riskLevel} RISK</StatusBadge>
          </div>
        ) : null}
      </section>

      <section className={styles.section}>
        <p className="eyebrow">Selected order</p>
        {order ? (
          <div className={styles.order}>
            <div className={styles.orderHeader}>
              <strong className={styles.orderId}>{order.id}</strong>
              <StatusBadge status={order.status === "DELIVERED" ? "SUCCESS" : "WARNING"}>{order.status}</StatusBadge>
            </div>
            <p className={styles.meta}>{order.itemNames.join(", ")}</p>
            <dl className={styles.facts}>
              <div>
                <dt>Paid</dt>
                <dd>{formatMoney(order.totalPaidCents, order.currency)}</dd>
              </div>
              <div>
                <dt>Placed</dt>
                <dd>{formatDate(order.placedAt)}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className={styles.empty}>Orders load only after a customer is selected.</p>
        )}
      </section>

      <section className={styles.section}>
        <p className="eyebrow">Before the agent runs</p>
        <ol className={styles.steps}>
          <li className={customer ? styles.done : undefined}>Select a CRM customer</li>
          <li className={order ? styles.done : undefined}>Pick one owned order</li>
          <li>Start a server-bound session</li>
        </ol>
      </section>

      <div className={styles.note}>
        <ShieldCheck size={16} />
        <div>
          <strong>Server-bound identity</strong>
          <span>The agent cannot switch customer or order after the session is created.</span>
        </div>
      </div>

      <Link href="/demo" className={styles.demoLink}>
        Open deterministic demo shortcuts
      </Link>
    </div>
  );
}
