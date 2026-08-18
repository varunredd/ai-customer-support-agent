import styles from "./ContextPanel.module.css";
import { customers } from "../../data/customers";
import { orders } from "../../data/orders";
import { StatusBadge } from "../ui/StatusBadge";
import { Card } from "../ui/Card";
import { formatDate, formatMoney, getInitials } from "@/lib/format";

interface ContextPanelProps {
  customerId: string;
  orderId: string;
}

export function ContextPanel({ customerId, orderId }: ContextPanelProps) {
  const customer = customers.find((c) => c.id === customerId);
  const order = orders.find((o) => o.id === orderId);

  if (!customer || !order) return null;

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
            <span className={styles.label}>Risk</span>
            <StatusBadge status={customer.riskLevel}>{customer.riskLevel}</StatusBadge>
          </div>
          <div>
            <span className={styles.label}>Orders</span>
            <span className={styles.value}>{customer.lifetimeOrders}</span>
          </div>
          <div>
            <span className={styles.label}>Refunds</span>
            <span className={styles.value}>{customer.lifetimeRefunds}</span>
          </div>
        </div>
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
    </div>
  );
}
