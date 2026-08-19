"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_CONDITION_ALLOWED,
  ITEM_CONDITIONS,
  POLICY_RULE_TEMPLATE,
  REFUND_REASONS,
  type RefundPolicyRule,
  type RefundPolicyRuleCode,
} from "@/domain/refunds/policy";
import { StatusBadge } from "@/components/ui/StatusBadge";
import styles from "@/app/(admin)/admin/policy/page.module.css";

interface PolicyRecord {
  id: string;
  version: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  refundWindowDays: number;
  rules: RefundPolicyRule[];
  createdAt: string;
  publishedAt: string | null;
}

interface PolicyManagerProps {
  initialPolicies: PolicyRecord[];
  activePolicyId: string | null;
}

const RULE_LABELS: Record<RefundPolicyRuleCode, string> = {
  ACCOUNT_ACTIVE: "Account active",
  RISK_NOT_HIGH: "Risk gate",
  ORDER_OWNERSHIP: "Order ownership",
  ORDER_DELIVERED: "Delivered only",
  WITHIN_WINDOW: "Return window",
  ITEM_REFUNDABLE: "Refundable item",
  NOT_FINAL_SALE: "No final sale",
  VALID_QUANTITY: "Valid quantity",
  CONDITION_ALLOWED: "Condition matrix",
  REMAINING_BALANCE: "Remaining balance",
};

function conditionConfig(rule: RefundPolicyRule) {
  const configured = rule.config?.allowedConditionsByReason;
  if (configured && typeof configured === "object" && !Array.isArray(configured)) {
    return { ...DEFAULT_CONDITION_ALLOWED, ...(configured as Record<string, string[]>) };
  }
  return { ...DEFAULT_CONDITION_ALLOWED };
}

function cloneRules(rules: RefundPolicyRule[]) {
  return rules.map((rule) => ({
    ...rule,
    config: rule.config ? JSON.parse(JSON.stringify(rule.config)) as Record<string, unknown> : undefined,
  }));
}

export function PolicyManager({ initialPolicies, activePolicyId }: PolicyManagerProps) {
  const initialSelected = initialPolicies.find((policy) => policy.status === "DRAFT")
    ?? initialPolicies.find((policy) => policy.id === activePolicyId)
    ?? initialPolicies[0]
    ?? null;
  const [policies, setPolicies] = useState(initialPolicies);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelected?.id ?? null);
  const [draftRules, setDraftRules] = useState<RefundPolicyRule[]>(() => cloneRules(initialSelected?.rules ?? []));
  const [draftVersion, setDraftVersion] = useState(initialSelected?.version ?? "");
  const [draftWindow, setDraftWindow] = useState(initialSelected?.refundWindowDays ?? 30);
  const [newVersion, setNewVersion] = useState("");
  const [newWindow, setNewWindow] = useState(30);
  const [customerId, setCustomerId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => policies.find((policy) => policy.id === selectedId) ?? null,
    [policies, selectedId],
  );

  const active = useMemo(
    () => policies.find((policy) => policy.id === activePolicyId) ?? policies.find((policy) => policy.status === "ACTIVE") ?? null,
    [policies, activePolicyId],
  );

  const availableRuleCodes = useMemo(() => {
    const used = new Set((selected?.status === "DRAFT" ? draftRules : selected?.rules ?? []).map((rule) => rule.code));
    return POLICY_RULE_TEMPLATE.map((rule) => rule.code).filter((code) => !used.has(code));
  }, [selected, draftRules]);

  function selectPolicy(policy: PolicyRecord) {
    setSelectedId(policy.id);
    setDraftRules(cloneRules(policy.rules));
    setDraftVersion(policy.version);
    setDraftWindow(policy.refundWindowDays);
    setMessage(null);
  }

  async function refreshPolicies(nextSelectedId?: string) {
    const response = await fetch("/api/admin/policies", { cache: "no-store" });
    const payload = await response.json() as { policies: PolicyRecord[]; activePolicyId: string | null };
    setPolicies(payload.policies);
    const target = payload.policies.find((policy) => policy.id === (nextSelectedId ?? selectedId))
      ?? payload.policies.find((policy) => policy.status === "DRAFT")
      ?? payload.policies.find((policy) => policy.id === payload.activePolicyId)
      ?? payload.policies[0]
      ?? null;
    if (target) selectPolicy(target);
  }

  async function createDraft(fromActive = false) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: newVersion.trim(),
          refundWindowDays: newWindow,
          sourcePolicyId: fromActive ? active?.id : undefined,
        }),
      });
      const payload = await response.json() as { policy?: PolicyRecord; error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to create draft.");
      setNewVersion("");
      await refreshPolicies(payload.policy?.id);
      setMessage("Draft policy created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create draft.");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!selected || selected.status !== "DRAFT") return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/policies/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: draftVersion.trim(),
          refundWindowDays: draftWindow,
          rules: draftRules,
        }),
      });
      const payload = await response.json() as { error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to save draft.");
      await refreshPolicies(selected.id);
      setMessage("Draft saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save draft.");
    } finally {
      setBusy(false);
    }
  }

  async function publishDraft() {
    if (!selected || selected.status !== "DRAFT") return;
    setBusy(true);
    setMessage(null);
    try {
      await saveDraftInternal(selected.id);
      const response = await fetch(`/api/admin/policies/${selected.id}/publish`, { method: "POST" });
      const payload = await response.json() as { error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to publish policy.");
      await refreshPolicies(selected.id);
      setMessage("Policy published and is now enforced.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to publish policy.");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraftInternal(policyId: string) {
    const response = await fetch(`/api/admin/policies/${policyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: draftVersion.trim(),
        refundWindowDays: draftWindow,
        rules: draftRules,
      }),
    });
    const payload = await response.json() as { error?: { message: string } };
    if (!response.ok) throw new Error(payload.error?.message ?? "Unable to save draft.");
  }

  async function deleteDraft() {
    if (!selected || selected.status !== "DRAFT") return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/policies/${selected.id}`, { method: "DELETE" });
      const payload = await response.json() as { error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to delete draft.");
      await refreshPolicies();
      setMessage("Draft deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete draft.");
    } finally {
      setBusy(false);
    }
  }

  async function syncFromEcommerce() {
    if (!customerId.trim()) {
      setMessage("Enter a store customer ID to sync from the e-commerce app.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/integrations/ecommerce/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: customerId.trim() }),
      });
      const payload = await response.json() as { error?: { message: string }; syncedOrders?: number };
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to sync from e-commerce.");
      setMessage(`Synced ${payload.syncedOrders ?? 0} orders from the e-commerce store.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sync from e-commerce.");
    } finally {
      setBusy(false);
    }
  }

  function updateRule(index: number, patch: Partial<RefundPolicyRule>) {
    setDraftRules((current) => current.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  }

  function removeRule(index: number) {
    setDraftRules((current) => current.filter((_, i) => i !== index));
  }

  function addRule(code: RefundPolicyRuleCode) {
    const template = POLICY_RULE_TEMPLATE.find((rule) => rule.code === code);
    if (!template) return;
    setDraftRules((current) => [...current, cloneRules([template])[0]!]);
  }

  function toggleCondition(reason: string, condition: string, index: number) {
    const rule = draftRules[index];
    if (!rule) return;
    const matrix = conditionConfig(rule);
    const current = matrix[reason as keyof typeof matrix] ?? [];
    const next = current.includes(condition as never)
      ? current.filter((entry) => entry !== condition)
      : [...current, condition as never];
    updateRule(index, {
      config: {
        ...rule.config,
        allowedConditionsByReason: {
          ...matrix,
          [reason]: next,
        },
      },
    });
  }

  const editingDraft = selected?.status === "DRAFT";
  const visibleRules = editingDraft ? draftRules : selected?.rules ?? [];

  return (
    <div className="admin-stack">
      {message ? <div className={styles.notice}>{message}</div> : null}

      {!active ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">No active policy</h2>
              <p className="panel-subtitle">Refund decisions are blocked until you publish a policy version.</p>
            </div>
          </div>
        </section>
      ) : null}

      <div className="content-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">{active ? "Active rules" : "Policy rules"}</h2>
              <p className="panel-subtitle">
                {active
                  ? `Version ${active.version} · ${active.refundWindowDays}-day return window.`
                  : "Create and publish a draft to enforce refund decisions."}
              </p>
            </div>
            {active ? <StatusBadge status="SUCCESS">ENFORCED</StatusBadge> : <StatusBadge status="WARNING">MISSING</StatusBadge>}
          </div>
          <div className={styles.rules}>
            {(active?.rules ?? []).map((rule) => (
              <article key={rule.code} className={styles.rule}>
                <span className={styles.code}>{rule.code}</span>
                <div>
                  <h3 className={styles.title}>{rule.title}</h3>
                  <p className={styles.text}>{rule.text}</p>
                </div>
                <StatusBadge status={rule.enabled ? "SUCCESS" : "NEUTRAL"}>{rule.enabled ? "ACTIVE" : "OFF"}</StatusBadge>
              </article>
            ))}
          </div>
        </section>

        <aside className="panel">
          <div className="panel-header"><h2 className="panel-title">Store sync</h2></div>
          <div className={`panel-body ${styles.meta}`}>
            <p className={styles.helpText}>Pull a customer and their recent orders from the e-commerce app into Jobform.</p>
            <label className={styles.fieldLabel}>
              Store customer ID
              <input className={styles.input} value={customerId} onChange={(event) => setCustomerId(event.target.value)} placeholder="MongoDB user _id" />
            </label>
            <button type="button" className={styles.button} disabled={busy} onClick={() => void syncFromEcommerce()}>
              Sync from e-commerce
            </button>
          </div>
        </aside>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Create draft</h2>
            <p className="panel-subtitle">Drafts can be edited, published, or deleted. Publishing archives the previous active version.</p>
          </div>
        </div>
        <div className={`panel-body ${styles.formRow}`}>
          <label className={styles.fieldLabel}>
            Version
            <input className={styles.input} value={newVersion} onChange={(event) => setNewVersion(event.target.value)} placeholder="2026-08-20" />
          </label>
          <label className={styles.fieldLabel}>
            Window (days)
            <input className={styles.input} type="number" min={1} max={365} value={newWindow} onChange={(event) => setNewWindow(Number(event.target.value))} />
          </label>
          <button type="button" className={styles.button} disabled={busy || !newVersion.trim()} onClick={() => void createDraft(false)}>
            Create blank draft
          </button>
          <button type="button" className={styles.buttonSecondary} disabled={busy || !newVersion.trim() || !active} onClick={() => void createDraft(true)}>
            Clone active draft
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Version history</h2>
            <p className="panel-subtitle">Select a draft to edit rules, then publish when ready.</p>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr><th>Version</th><th>Status</th><th>Window</th><th>Rules</th><th>Created</th><th>Published</th><th /></tr>
            </thead>
            <tbody>
              {policies.map((policy) => (
                <tr key={policy.id}>
                  <td><code>{policy.version}</code></td>
                  <td><StatusBadge status={policy.status === "ACTIVE" ? "SUCCESS" : policy.status === "DRAFT" ? "WARNING" : "NEUTRAL"}>{policy.status}</StatusBadge></td>
                  <td>{policy.refundWindowDays} days</td>
                  <td>{policy.rules.filter((rule) => rule.enabled).length}/{policy.rules.length}</td>
                  <td>{new Date(policy.createdAt).toLocaleString()}</td>
                  <td>{policy.publishedAt ? new Date(policy.publishedAt).toLocaleString() : "—"}</td>
                  <td><button type="button" className={styles.linkButton} onClick={() => selectPolicy(policy)}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Edit {selected.version}</h2>
              <p className="panel-subtitle">{editingDraft ? "Draft changes stay inactive until published." : "Archived and active versions are read-only. Clone active to make changes."}</p>
            </div>
            {editingDraft ? (
              <div className={styles.actions}>
                <button type="button" className={styles.buttonSecondary} disabled={busy} onClick={() => void deleteDraft()}>Delete</button>
                <button type="button" className={styles.buttonSecondary} disabled={busy} onClick={() => void saveDraft()}>Save draft</button>
                <button type="button" className={styles.button} disabled={busy} onClick={() => void publishDraft()}>Publish</button>
              </div>
            ) : null}
          </div>

          {editingDraft ? (
            <div className={`panel-body ${styles.formRow}`}>
              <label className={styles.fieldLabel}>
                Version
                <input className={styles.input} value={draftVersion} onChange={(event) => setDraftVersion(event.target.value)} />
              </label>
              <label className={styles.fieldLabel}>
                Window (days)
                <input className={styles.input} type="number" min={1} max={365} value={draftWindow} onChange={(event) => setDraftWindow(Number(event.target.value))} />
              </label>
            </div>
          ) : null}

          <div className={styles.rules}>
            {visibleRules.map((rule, index) => (
              <article key={`${rule.code}-${index}`} className={styles.ruleEditor}>
                <div className={styles.ruleEditorHeader}>
                  <span className={styles.code}>{rule.code}</span>
                  {editingDraft ? (
                    <div className={styles.actions}>
                      <label className={styles.toggleLabel}>
                        <input type="checkbox" checked={rule.enabled} onChange={(event) => updateRule(index, { enabled: event.target.checked })} />
                        Enabled
                      </label>
                      <button type="button" className={styles.linkButton} onClick={() => removeRule(index)}>Remove</button>
                    </div>
                  ) : (
                    <StatusBadge status={rule.enabled ? "SUCCESS" : "NEUTRAL"}>{rule.enabled ? "ACTIVE" : "OFF"}</StatusBadge>
                  )}
                </div>
                {editingDraft ? (
                  <>
                    <input className={styles.input} value={rule.title} onChange={(event) => updateRule(index, { title: event.target.value })} />
                    <textarea className={styles.textarea} value={rule.text} onChange={(event) => updateRule(index, { text: event.target.value })} rows={3} />
                  </>
                ) : (
                  <>
                    <h3 className={styles.title}>{rule.title}</h3>
                    <p className={styles.text}>{rule.text}</p>
                  </>
                )}
                {rule.code === "CONDITION_ALLOWED" ? (
                  <div className={styles.matrix}>
                    <p className={styles.helpText}>Allowed item conditions per refund reason.</p>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Reason</th>
                          {ITEM_CONDITIONS.map((condition) => <th key={condition}>{condition}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {REFUND_REASONS.map((reason) => (
                          <tr key={reason}>
                            <td><code>{reason}</code></td>
                            {ITEM_CONDITIONS.map((condition) => {
                              const allowed = conditionConfig(rule)[reason] ?? [];
                              const checked = allowed.includes(condition);
                              return (
                                <td key={condition}>
                                  {editingDraft ? (
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleCondition(reason, condition, index)}
                                    />
                                  ) : checked ? "Yes" : "—"}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          {editingDraft && availableRuleCodes.length > 0 ? (
            <div className={`panel-body ${styles.formRow}`}>
              <label className={styles.fieldLabel}>
                Add rule
                <select
                  className={styles.input}
                  defaultValue=""
                  onChange={(event) => {
                    const code = event.target.value as RefundPolicyRuleCode;
                    if (!code) return;
                    addRule(code);
                    event.target.value = "";
                  }}
                >
                  <option value="">Select rule…</option>
                  {availableRuleCodes.map((code) => <option key={code} value={code}>{RULE_LABELS[code]}</option>)}
                </select>
              </label>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
