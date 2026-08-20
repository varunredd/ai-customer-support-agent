"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { avatarColor, formatDate, formatStaffRole, getInitials } from "@/lib/format";
import { TENANT_ASSIGNABLE_ROLES } from "@/security/rbac";
import type { StaffRole, StaffUser, StaffUserStatus } from "@/domain/auth/types";
import type { StaffPermission } from "@/security/rbac";

interface SessionPayload {
  email: string;
  role: StaffRole;
  userId: string;
  permissions: StaffPermission[];
}

export function TeamDirectory() {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<(typeof TENANT_ASSIGNABLE_ROLES)[number]>("SUPPORT_AGENT");

  const canManageTeam = session?.permissions.includes("team:manage") ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sessionResponse = await fetch("/api/admin/login", { cache: "no-store" });
      if (!sessionResponse.ok) throw new Error("Staff sign-in is required.");
      const sessionPayload = await sessionResponse.json() as SessionPayload;
      setSession(sessionPayload);

      if (!sessionPayload.permissions.includes("team:manage")) {
        setUsers([]);
        setError("You do not have permission to manage team members.");
        return;
      }

      const usersResponse = await fetch("/api/admin/users", { cache: "no-store" });
      const usersPayload = await usersResponse.json() as { users?: StaffUser[]; error?: { message: string } };
      if (!usersResponse.ok) throw new Error(usersPayload.error?.message ?? "Unable to load team members.");
      setUsers(usersPayload.users ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load team members.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createMember(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role }),
      });
      const payload = await response.json() as { user?: StaffUser; error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to add team member.");
      setEmail("");
      setPassword("");
      setRole("SUPPORT_AGENT");
      setMessage(`Added ${payload.user?.email ?? "team member"}.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add team member.");
    } finally {
      setBusy(false);
    }
  }

  async function updateMember(userId: string, patch: { role?: StaffRole; status?: StaffUserStatus }) {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = await response.json() as { error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to update team member.");
      setMessage("Team member updated.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update team member.");
    } finally {
      setBusy(false);
    }
  }

  const isSelf = (userId: string) => session?.userId === userId;

  return (
    <div className="admin-page">
      <div className="admin-stack">
        <PageHeader title="Team" />

        {message ? <p className="panel-subtitle">{message}</p> : null}
        {error ? <p className="panel-subtitle" style={{ color: "var(--danger, #b42318)" }}>{error}</p> : null}

        {canManageTeam ? (
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Add team member</h2>
            </div>
            <form className="panel-body panel-form" onSubmit={(event) => void createMember(event)}>
              <label className="field">
                <span className="field-label">Email</span>
                <input
                  className="field-input"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="ops@company.com"
                  required
                />
              </label>
              <label className="field">
                <span className="field-label">Temporary password</span>
                <input
                  className="field-input"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="12+ characters"
                  minLength={12}
                  required
                />
              </label>
              <label className="field">
                <span className="field-label">Role</span>
                <select
                  className="field-select"
                  value={role}
                  onChange={(event) => setRole(event.target.value as typeof role)}
                >
                  {TENANT_ASSIGNABLE_ROLES.map((value) => (
                    <option key={value} value={value}>{formatStaffRole(value)}</option>
                  ))}
                </select>
              </label>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Add member
              </button>
            </form>
          </section>
        ) : null}

        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Staff accounts</h2>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Added</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5}>Loading team members…</td></tr>
                ) : users.length ? users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="person-cell">
                        <span className="avatar" style={{ background: avatarColor(user.id) }} title={user.id}>
                          {getInitials(user.email.split("@")[0] ?? user.email)}
                        </span>
                        <div className="text-strong" title={user.id}>{user.email}</div>
                      </div>
                    </td>
                    <td>
                      {canManageTeam && !isSelf(user.id) ? (
                        <select
                          className="field-select"
                          value={user.role}
                          disabled={busy}
                          onChange={(event) => void updateMember(user.id, { role: event.target.value as StaffRole })}
                          style={{ minWidth: 160, height: 36 }}
                        >
                          {TENANT_ASSIGNABLE_ROLES.map((value) => (
                            <option key={value} value={value}>{formatStaffRole(value)}</option>
                          ))}
                        </select>
                      ) : formatStaffRole(user.role)}
                    </td>
                    <td>
                      <StatusBadge status={user.status === "ACTIVE" ? "SUCCESS" : "FAILED"}>
                        {user.status}
                      </StatusBadge>
                    </td>
                    <td>{formatDate(user.createdAt)}</td>
                    <td className="actions">
                      {canManageTeam && !isSelf(user.id) ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busy}
                          onClick={() => void updateMember(user.id, {
                            status: user.status === "ACTIVE" ? "DISABLED" : "ACTIVE",
                          })}
                        >
                          {user.status === "ACTIVE" ? "Disable" : "Enable"}
                        </button>
                      ) : isSelf(user.id) ? (
                        <span className="muted">You</span>
                      ) : null}
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={5}>No team members found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
