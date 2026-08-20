import styles from "./ContextPanel.module.css";
import type { Customer, Order } from "@/domain/refunds/types";
import type { SupportWorkspace } from "@/domain/support/types";
import { StatusBadge } from "../ui/StatusBadge";
import { Card } from "../ui/Card";
import { formatDate, formatMoney, getInitials } from "@/lib/format";

interface ContextPanelProps {
  customer: Customer;
  order: Order;
  workspace: SupportWorkspace;
}

function returnStatusLabel(status: SupportWorkspace["returnStatus"]) {
  if (status === "REFUND_APPROVED") return "Refund approved";
  if (status === "PARTIAL_REFUND") return "Partial refund";
  if (status === "PENDING_APPROVAL") return "Awaiting approval";
  return "No return yet";
}

function windowCopy(window: SupportWorkspace["policyWindow"]) {
  if (!window.deliveredAt) return "Starts when this order is delivered.";
  if (window.daysRemaining === null) return "Refund window is unavailable.";
  if (window.daysRemaining < 0) return `Closed ${Math.abs(window.daysRemaining)} day${Math.abs(window.daysRemaining) === 1 ? "" : "s"} ago.`;
  if (window.daysRemaining === 0) return "Last day of the refund window.";
  return `${window.daysRemaining} day${window.daysRemaining === 1 ? "" : "s"} remaining.`;
}

export function ContextPanel({ customer, order, workspace }: ContextPanelProps) {
  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <p className="eyebrow">Customer</p>
        <div className={styles.customerHeader}>
          <div className={styles.avatar}>{getInitials(customer.name)}</div>
          <div>
            <h3 className={styles.name}>{customer.name}</h3>
            <p className={styles.email}>{customer.email}</p>
          </div>
        </div>
        <div className={styles.detailsGrid}>
          <div>
            <span className={styles.label}>Account</span>
            <StatusBadge status={customer.accountStatus === "ACTIVE" ? "SUCCESS" : "FAILED"}>
              {customer.accountStatus}
            </StatusBadge>
          </div>
          <div>
            <span className={styles.label}>Orders</span>
            <span className={styles.value}>{customer.lifetimeOrders}</span>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <p className="eyebrow">Return & refund</p>
        <Card className={styles.trackerCard}>
          <div className={styles.trackerHeader}>
            <span className={styles.label}>Status</span>
            <StatusBadge status={workspace.returnStatus === "NONE" ? "NEUTRAL" : workspace.returnStatus === "PENDING_APPROVAL" ? "WARNING" : "SUCCESS"}>
              {returnStatusLabel(workspace.returnStatus)}
            </StatusBadge>
          </div>
          <div className={styles.orderDates}>
            <div>
              <span className={styles.label}>Refunded</span>
              <span className={styles.value}>{formatMoney(workspace.refundedCents)}</span>
            </div>
            <div>
              <span className={styles.label}>Remaining</span>
              <span className={styles.value}>{formatMoney(workspace.remainingCents)}</span>
            </div>
          </div>
          <div>
            <span className={styles.label}>Policy window</span>
            <span className={styles.value}>{windowCopy(workspace.policyWindow)}</span>
          </div>
        </Card>
      </div>

      <div className={styles.section}>
        <p className="eyebrow">Active order</p>
        <Card className={styles.orderCard}>
          <div className={styles.orderHeader}>
            <span className={styles.orderId}>{order.id}</span>
            <StatusBadge status={order.status === "DELIVERED" ? "SUCCESS" : "NEUTRAL"}>
              {order.status}
            </StatusBadge>
          </div>
          <div className={styles.orderDates}>
            <div>
              <span className={styles.label}>Placed</span>
              <span className={styles.value}>{formatDate(order.placedAt)}</span>
            </div>
            <div>
              <span className={styles.label}>Delivered</span>
              <span className={styles.value}>{order.deliveredAt ? formatDate(order.deliveredAt) : "Pending"}</span>
            </div>
          </div>
          <div className={styles.itemsList}>
            {order.items.map((item) => (
              <div key={item.id} className={styles.item}>
                <div className={styles.itemInfo}>
                  <span className={styles.itemName}>{item.name}</span>
                  <span className={styles.itemSku}>{item.sku} · Qty {item.quantity}</span>
                </div>
                <div className={styles.itemPrice}>
                  {formatMoney(item.unitPriceCents)}
                  {item.finalSale ? <span className={styles.finalSaleBadge}>Final sale</span> : null}
                </div>
              </div>
            ))}
          </div>
          <div className={styles.orderTotal}>
            <span>Total paid</span>
            <span>{formatMoney(order.totalPaidCents)}</span>
          </div>
        </Card>
      </div>

      <div className={styles.section}>
        <p className="eyebrow">Policy checks</p>
        {workspace.policyChecks.length ? (
          <ul className={styles.checkList}>
            {workspace.policyChecks.map((check) => (
              <li key={check.code} className={check.passed ? styles.checkPass : styles.checkFail}>
                <span>{check.passed ? "Pass" : "Blocked"}</span>
                <p>{check.summary}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.emptyChecks}>Policy results appear here after the agent evaluates a refund request.</p>
        )}
        {workspace.policyVersion ? <p className={styles.policyVersion}>Policy {workspace.policyVersion}</p> : null}
      </div>
    </div>
  );
}
