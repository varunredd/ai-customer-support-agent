import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { customers } from "@/data/customers";
import { orders } from "@/data/orders";
import { ErrorState } from "@/components/ui/ErrorState";
import { avatarColor, formatDate, formatMoney, getInitials } from "@/lib/format";
import styles from "./page.module.css";

export default async function CustomerDetailPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const customer = customers.find((item) => item.id === customerId);

  if (!customer) {
    return (
      <div className="admin-page">
        <div className="admin-stack">
          <ErrorState
            title="Customer not found"
            description={`No customer record exists for ID: ${customerId}`}
          />
        </div>
      </div>
    );
  }

  const customerOrders = orders.filter((order) => order.customerId === customerId);

  return (
    <div className="admin-page">
      <div className="admin-stack">
        <Link href="/admin/customers" className="back-link">
          <ArrowLeft size={15} /> Back to customers
        </Link>

        <div className={styles.identity}>
          <div className={styles.avatar} style={{ background: avatarColor(customer.id) }}>
            {getInitials(customer.name)}
          </div>
          <div className={styles.titleBlock}>
            <h1>{customer.name}</h1>
            <p className={styles.email}>{customer.email} · {customer.id}</p>
            <div className={styles.badges}>
              <StatusBadge status={customer.accountStatus === "ACTIVE" ? "SUCCESS" : "FAILED"}>
                {customer.accountStatus}
              </StatusBadge>
              <StatusBadge status={customer.riskLevel}>{customer.riskLevel} RISK</StatusBadge>
            </div>
          </div>
        </div>

        <div className={styles.stats}>
          <div className={`panel ${styles.stat}`}>
            <span className={styles.statLabel}>Account status</span>
            <StatusBadge status={customer.accountStatus === "ACTIVE" ? "SUCCESS" : "FAILED"}>
              {customer.accountStatus}
            </StatusBadge>
          </div>
          <div className={`panel ${styles.stat}`}>
            <span className={styles.statLabel}>Risk level</span>
            <StatusBadge status={customer.riskLevel}>{customer.riskLevel}</StatusBadge>
          </div>
          <div className={`panel ${styles.stat}`}>
            <span className={styles.statLabel}>Lifetime orders</span>
            <span className={styles.statValue}>{customer.lifetimeOrders}</span>
          </div>
          <div className={`panel ${styles.stat}`}>
            <span className={styles.statLabel}>Lifetime refunds</span>
            <span className={styles.statValue}>{customer.lifetimeRefunds}</span>
          </div>
        </div>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Order history</h2>
              <p className="panel-subtitle">{customerOrders.length} orders linked to this account.</p>
            </div>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Date</th>
                <th>Status</th>
                <th>Items</th>
                <th>Total paid</th>
                <th>Refunded</th>
              </tr>
            </thead>
            <tbody>
              {customerOrders.length ? (
                customerOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="mono text-strong">{order.id}</td>
                    <td>{formatDate(order.placedAt)}</td>
                    <td>
                      <StatusBadge status={order.status === "DELIVERED" ? "SUCCESS" : "NEUTRAL"}>
                        {order.status}
                      </StatusBadge>
                    </td>
                    <td>{order.items.map((item) => item.name).join(", ")}</td>
                    <td className="text-strong">{formatMoney(order.totalPaidCents)}</td>
                    <td>{formatMoney(order.refundedCents)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "36px 16px" }}>
                    No orders found for this customer.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
