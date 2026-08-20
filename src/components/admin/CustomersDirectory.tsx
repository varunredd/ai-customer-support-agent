"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { avatarColor, formatDate, getInitials } from "@/lib/format";
import type { AccountStatus, Customer, RiskLevel } from "@/domain/refunds/types";
import clsx from "clsx";

type StatusFilter = "ALL" | AccountStatus;
type RiskFilter = "ALL" | RiskLevel;

export function CustomersDirectory({ customers }: { customers: Customer[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [risk, setRisk] = useState<RiskFilter>("ALL");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return customers.filter((customer) => {
      const matchesQuery =
        !needle ||
        customer.name.toLowerCase().includes(needle) ||
        customer.email.toLowerCase().includes(needle) ||
        customer.id.toLowerCase().includes(needle);
      const matchesStatus = status === "ALL" || customer.accountStatus === status;
      const matchesRisk = risk === "ALL" || customer.riskLevel === risk;
      return matchesQuery && matchesStatus && matchesRisk;
    });
  }, [query, status, risk]);

  return (
    <div className="admin-page">
      <div className="admin-stack">
        <PageHeader title="Customers" />

        <div className="toolbar">
          <label className="search-field">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search customers"
            />
          </label>
          {(["ALL", "ACTIVE", "SUSPENDED"] as StatusFilter[]).map((value) => (
            <button
              key={value}
              className={clsx("filter-chip", status === value && "filter-chip-active")}
              onClick={() => setStatus(value)}
            >
              {value === "ALL" ? "All statuses" : value.toLowerCase()}
            </button>
          ))}
          {(["ALL", "LOW", "MEDIUM", "HIGH"] as RiskFilter[]).map((value) => (
            <button
              key={value}
              className={clsx("filter-chip", risk === value && "filter-chip-active")}
              onClick={() => setRisk(value)}
            >
              {value === "ALL" ? "All risk" : `${value.toLowerCase()} risk`}
            </button>
          ))}
        </div>

        <div className="panel">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Email</th>
                  <th>Account</th>
                  <th>Risk</th>
                  <th>Orders</th>
                  <th>Refunds</th>
                  <th>Joined</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length ? (
                  filtered.map((customer) => (
                    <tr key={customer.id}>
                      <td>
                        <div className="person-cell">
                          <span className="avatar" style={{ background: avatarColor(customer.id) }}>
                            {getInitials(customer.name)}
                          </span>
                          <div className="text-strong" title={customer.id}>{customer.name}</div>
                        </div>
                      </td>
                      <td>{customer.email}</td>
                      <td>
                        <StatusBadge status={customer.accountStatus === "ACTIVE" ? "SUCCESS" : "FAILED"}>
                          {customer.accountStatus}
                        </StatusBadge>
                      </td>
                      <td>
                        <StatusBadge status={customer.riskLevel}>{customer.riskLevel}</StatusBadge>
                      </td>
                      <td className="text-strong">{customer.lifetimeOrders}</td>
                      <td>{customer.lifetimeRefunds}</td>
                      <td>{formatDate(customer.createdAt)}</td>
                      <td className="actions">
                        <Link href={`/admin/customers/${customer.id}`} className="table-link">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", padding: "40px 16px" }}>
                      No customers match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
