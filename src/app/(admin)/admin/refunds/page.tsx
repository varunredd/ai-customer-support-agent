import { Search } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

export default function RefundsLedgerPage() {
  return (
    <div className="admin-page">
      <div className="admin-stack">
        <PageHeader
          title="Refunds Ledger"
          description="Operations view of processed, pending, and denied refunds."
        >
          <Button variant="secondary" disabled>
            Export
          </Button>
        </PageHeader>

        <div className="toolbar">
          <label className="search-field">
            <Search size={15} />
            <input placeholder="Search refund ID, order, or customer" disabled />
          </label>
          <button className="filter-chip filter-chip-active">All</button>
          <button className="filter-chip">Approved</button>
          <button className="filter-chip">Denied</button>
          <button className="filter-chip">Pending</button>
        </div>

        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th>Refund</th>
                <th>Customer</th>
                <th>Order</th>
                <th>Amount</th>
                <th>Decision</th>
                <th>Processed</th>
              </tr>
            </thead>
          </table>
          <EmptyState
            title="No refunds processed yet"
            description="Ledger rows will appear here after the Phase 2 execution loop writes idempotent refund records."
          />
        </div>
      </div>
    </div>
  );
}
