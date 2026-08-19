"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";
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

function todayVersion() {
  return new Date().toISOString().slice(0, 10);
}

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

function statusBadge(status: PolicyRecord["status"]) {
  if (status === "ACTIVE") return "SUCCESS" as const;
  if (status === "DRAFT") return "WARNING" as const;
  return "NEUTRAL" as const;
}

export function PolicyManager({ initialPolicies, activePolicyId }: PolicyManagerProps) {
  const initialSelected = initialPolicies.find((policy) => policy.id === activePolicyId)
    ?? initialPolicies.find((policy) => policy.status === "ACTIVE")
    ?? initialPolicies.find((policy) => policy.status === "DRAFT")
    ?? initialPolicies[0]
    ?? null;

  const [policies, setPolicies] = useState(initialPolicies);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelected?.id ?? null);
  const [draftRules, setDraftRules] = useState<RefundPolicyRule[]>(() => cloneRules(initialSelected?.rules ?? []));
  const [draftVersion, setDraftVersion] = useState(initialSelected?.version ?? "");
  const [draftWindow, setDraftWindow] = useState(initialSelected?.refundWindowDays ?? 30);
  const [showArchived, setShowArchived] = useState(false);
  const [showNewDraft, setShowNewDraft] = useState(false);
  const [newVersion, setNewVersion] = useState(todayVersion());
  const [newWindow, setNewWindow] = useState(30);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
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

  const visiblePolicies = useMemo(() => {
    const live = policies.filter((policy) => policy.status !== "ARCHIVED");
    const archived = policies.filter((policy) => policy.status === "ARCHIVED");
    return { live, archived };
  }, [policies]);

  const isEditable = selected?.status === "DRAFT" || selected?.status === "ACTIVE";

  const availableRuleCodes = useMemo(() => {
    const used = new Set((isEditable ? draftRules : selected?.rules ?? []).map((rule) => rule.code));
    return POLICY_RULE_TEMPLATE.map((rule) => rule.code).filter((code) => !used.has(code));
  }, [selected, draftRules, isEditable]);

  function selectPolicy(policy: PolicyRecord) {
    setSelectedId(policy.id);
    setDraftRules(cloneRules(policy.rules));
    setDraftVersion(policy.version);
    setDraftWindow(policy.refundWindowDays);
    setExpandedRule(null);
    setMessage(null);
  }

  async function refreshPolicies(nextSelectedId?: string) {
    const response = await fetch("/api/admin/policies", { cache: "no-store" });
    const payload = await response.json() as { policies: PolicyRecord[]; activePolicyId: string | null };
    setPolicies(payload.policies);
    const target = payload.policies.find((policy) => policy.id === (nextSelectedId ?? selectedId))
      ?? payload.policies.find((policy) => policy.id === payload.activePolicyId)
      ?? payload.policies.find((policy) => policy.status === "DRAFT")
      ?? payload.policies[0]
      ?? null;
    if (target) selectPolicy(target);
    else setSelectedId(null);
  }

  async function createDraft(fromActive = false, version = newVersion, window = newWindow) {
    const label = version.trim();
    if (!label) {
      setMessage("Enter a version label.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: label,
          refundWindowDays: window,
          sourcePolicyId: fromActive ? active?.id : undefined,
        }),
      });
      const payload = await response.json() as { policy?: PolicyRecord; error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to create draft.");
      setShowNewDraft(false);
      setNewVersion(todayVersion());
      await refreshPolicies(payload.policy?.id);
      setMessage("Draft created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create draft.");
    } finally {
      setBusy(false);
    }
  }

  async function createDefaultPolicy() {
    await createDraft(false, todayVersion(), 30);
  }

  async function savePolicy() {
    if (!selected || !isEditable) return;
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
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to save policy.");
      await refreshPolicies(selected.id);
      setMessage(selected.status === "ACTIVE" ? "Policy saved." : "Draft saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save policy.");
    } finally {
      setBusy(false);
    }
  }

  async function publishDraft() {
    if (!selected || selected.status !== "DRAFT") return;
    setBusy(true);
    setMessage(null);
    try {
      await savePolicyInternal(selected.id);
      const response = await fetch(`/api/admin/policies/${selected.id}/publish`, { method: "POST" });
      const payload = await response.json() as { error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to publish policy.");
      await refreshPolicies(selected.id);
      setMessage("Policy published.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to publish policy.");
    } finally {
      setBusy(false);
    }
  }

  async function savePolicyInternal(policyId: string) {
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
    if (!response.ok) throw new Error(payload.error?.message ?? "Unable to save policy.");
  }

  async function deleteDraft() {
    if (!selected || selected.status !== "DRAFT") return;
    if (!window.confirm("Delete this draft?")) return;
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

  function updateRule(index: number, patch: Partial<RefundPolicyRule>) {
    setDraftRules((current) => current.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  }

  function removeRule(index: number) {
    setDraftRules((current) => current.filter((_, i) => i !== index));
    setExpandedRule(null);
  }

  function addRule(code: RefundPolicyRuleCode) {
    const template = POLICY_RULE_TEMPLATE.find((rule) => rule.code === code);
    if (!template) return;
    setDraftRules((current) => [...current, cloneRules([template])[0]!]);
    setExpandedRule(code);
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
        allowedConditionsByReason: { ...matrix, [reason]: next },
      },
    });
  }

  const visibleRules = isEditable ? draftRules : selected?.rules ?? [];
  const enabledCount = visibleRules.filter((rule) => rule.enabled).length;

  function renderVersionItem(policy: PolicyRecord) {
    const isActive = policy.id === selectedId;
    return (
      <li key={policy.id}>
        <button
          type="button"
          className={clsx(styles.versionItem, isActive && styles.versionItemActive)}
          onClick={() => selectPolicy(policy)}
        >
          <span className={styles.versionLabel}>{policy.version}</span>
          <span className={styles.versionMeta}>
            {policy.status.toLowerCase()} · {policy.refundWindowDays}d · {policy.rules.filter((r) => r.enabled).length}/{policy.rules.length} rules
          </span>
        </button>
      </li>
    );
  }

  function renderRule(rule: RefundPolicyRule, index: number) {
    const isOpen = expandedRule === rule.code;
    const canExpand = true;

    return (
      <div key={rule.code} className={styles.ruleRow}>
        <div className={styles.ruleSummary}>
          {isEditable ? (
            <label className={styles.ruleToggle} onClick={(event) => event.stopPropagation()}>
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={(event) => updateRule(index, { enabled: event.target.checked })}
              />
            </label>
          ) : (
            <StatusBadge status={rule.enabled ? "SUCCESS" : "NEUTRAL"}>{rule.enabled ? "ON" : "OFF"}</StatusBadge>
          )}
          <button
            type="button"
            className={styles.ruleSummaryMain}
            onClick={() => canExpand && setExpandedRule(isOpen ? null : rule.code)}
            disabled={!canExpand}
          >
            <span className={styles.code}>{rule.code}</span>
            <span className={styles.ruleTitle}>{rule.title}</span>
          </button>
          {canExpand ? (
            <button
              type="button"
              className={styles.ruleExpand}
              aria-label={isOpen ? "Collapse rule" : "Expand rule"}
              onClick={() => setExpandedRule(isOpen ? null : rule.code)}
            >
              <ChevronDown size={16} className={clsx(styles.chevron, isOpen && styles.chevronOpen)} />
            </button>
          ) : (
            <span />
          )}
        </div>

        {isOpen ? (
          <div className={styles.ruleBody}>
            {isEditable ? (
              <>
                <textarea
                  className={styles.textarea}
                  value={rule.text}
                  onChange={(event) => updateRule(index, { text: event.target.value })}
                  rows={2}
                />
                <button type="button" className={styles.linkButton} onClick={() => removeRule(index)}>Remove rule</button>
              </>
            ) : (
              <p className={styles.ruleText}>{rule.text}</p>
            )}
            {rule.code === "CONDITION_ALLOWED" ? (
              <div className={styles.matrix}>
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
                              {isEditable ? (
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
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.manager}>
      {message ? <div className={styles.notice}>{message}</div> : null}

      <div className={styles.topBar}>
        <div className={styles.statusLine}>
          {active ? (
            <>
              <StatusBadge status="SUCCESS">Live</StatusBadge>
              <p className={styles.statusText}>
                <strong>{active.version}</strong> · {active.refundWindowDays}-day window · {active.rules.filter((r) => r.enabled).length} rules enforced
              </p>
            </>
          ) : (
            <>
              <StatusBadge status="WARNING">No policy</StatusBadge>
              <p className={styles.statusText}>Refunds blocked until you publish a policy.</p>
            </>
          )}
        </div>

        {selected && isEditable ? (
          <div className={styles.topActions}>
            {selected.status === "DRAFT" ? (
              <>
                <button type="button" className={styles.buttonGhost} disabled={busy} onClick={() => void deleteDraft()}>Delete</button>
                <button type="button" className={styles.buttonSecondary} disabled={busy} onClick={() => void savePolicy()}>Save</button>
                <button type="button" className={styles.button} disabled={busy} onClick={() => void publishDraft()}>Publish</button>
              </>
            ) : (
              <button type="button" className={styles.button} disabled={busy} onClick={() => void savePolicy()}>Save changes</button>
            )}
          </div>
        ) : null}
      </div>

      {policies.length === 0 ? (
        <div className={styles.main}>
          <div className={styles.emptyState}>
            <h2 className={styles.emptyTitle}>Set up your refund policy</h2>
            <p className={styles.emptyText}>
              Create a default policy with standard rules and publish it. Customer and order data sync automatically from NovaShop.
            </p>
            <button type="button" className={styles.button} disabled={busy} onClick={() => void createDefaultPolicy()}>
              Create default policy
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.layout}>
            <aside className={styles.sidebar}>
              <div className={styles.sidebarHeader}>Versions</div>
              <ul className={styles.versionList}>
                {visiblePolicies.live.map(renderVersionItem)}
                {showArchived ? visiblePolicies.archived.map(renderVersionItem) : null}
              </ul>
              {visiblePolicies.archived.length > 0 ? (
                <button
                  type="button"
                  className={clsx(styles.linkButton, styles.showArchived)}
                  onClick={() => setShowArchived((value) => !value)}
                >
                  {showArchived ? "Hide archived" : `Show ${visiblePolicies.archived.length} archived`}
                </button>
              ) : null}
              <div className={styles.sidebarFooter}>
                {showNewDraft ? (
                  <div className={styles.newDraftForm}>
                    <label className={styles.fieldLabel}>
                      Version
                      <input className={styles.input} value={newVersion} onChange={(e) => setNewVersion(e.target.value)} />
                    </label>
                    <label className={styles.fieldLabel}>
                      Window (days)
                      <input className={styles.input} type="number" min={1} max={365} value={newWindow} onChange={(e) => setNewWindow(Number(e.target.value))} />
                    </label>
                    <button type="button" className={styles.button} disabled={busy} onClick={() => void createDraft(false)}>Create</button>
                    {active ? (
                      <button type="button" className={styles.buttonSecondary} disabled={busy} onClick={() => void createDraft(true)}>Clone active</button>
                    ) : null}
                    <button type="button" className={styles.linkButton} onClick={() => setShowNewDraft(false)}>Cancel</button>
                  </div>
                ) : (
                  <button type="button" className={styles.buttonSecondary} disabled={busy} onClick={() => setShowNewDraft(true)}>
                    New draft
                  </button>
                )}
              </div>
            </aside>

            {selected ? (
              <section className={styles.main}>
                <div className={styles.mainHeader}>
                  <div>
                    <h2 className={styles.mainTitle}>{selected.version}</h2>
                    <p className={styles.mainSubtitle}>
                      {selected.status === "ACTIVE"
                        ? "Changes apply immediately to new refund decisions."
                        : selected.status === "DRAFT"
                          ? "Draft — publish to enforce."
                          : "Read-only archived version."}
                    </p>
                  </div>
                  <StatusBadge status={statusBadge(selected.status)}>{selected.status}</StatusBadge>
                </div>

                {isEditable ? (
                  <div className={styles.settingsRow}>
                    <label className={styles.fieldLabel}>
                      Version label
                      <input className={styles.input} value={draftVersion} onChange={(e) => setDraftVersion(e.target.value)} />
                    </label>
                    <label className={styles.fieldLabel}>
                      Return window (days)
                      <input className={styles.input} type="number" min={1} max={365} value={draftWindow} onChange={(e) => setDraftWindow(Number(e.target.value))} />
                    </label>
                  </div>
                ) : null}

                <div className={styles.rulesToolbar}>
                  <span className={styles.rulesCount}>{enabledCount} of {visibleRules.length} rules enabled</span>
                  {isEditable && availableRuleCodes.length > 0 ? (
                    <select
                      className={styles.select}
                      style={{ maxWidth: 220 }}
                      defaultValue=""
                      onChange={(event) => {
                        const code = event.target.value as RefundPolicyRuleCode;
                        if (!code) return;
                        addRule(code);
                        event.target.value = "";
                      }}
                    >
                      <option value="">Add rule…</option>
                      {availableRuleCodes.map((code) => <option key={code} value={code}>{RULE_LABELS[code]}</option>)}
                    </select>
                  ) : null}
                </div>

                <div className={styles.ruleList}>
                  {visibleRules.map((rule, index) => renderRule(rule, index))}
                </div>
              </section>
            ) : null}
          </div>
        )}
    </div>
  );
}
