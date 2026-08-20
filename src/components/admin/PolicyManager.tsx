"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import {
  DEFAULT_CONDITION_ALLOWED,
  ITEM_CONDITIONS,
  REFUND_REASONS,
  mergePolicyRulesWithCatalog,
  type RefundPolicyRule,
  type RefundPolicyRuleCode,
} from "@/domain/refunds/policy";
import {
  POLICY_CATALOG,
  POLICY_RULE_CATEGORIES,
  catalogEntry,
  catalogRulesByCategory,
  type PolicyRuleCategory,
} from "@/domain/refunds/policy-catalog";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { validatePolicyForPublish, type PolicyValidationResult } from "@/services/policy/policy-lifecycle.service";
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
  initialPolicy: PolicyRecord | null;
  initialPolicies: PolicyRecord[];
}

const RULE_LABELS = Object.fromEntries(
  POLICY_CATALOG.map((entry) => [entry.code, entry.title]),
) as Record<RefundPolicyRuleCode, string>;

const RULES_BY_CATEGORY = catalogRulesByCategory();

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

function initialRules(policy: PolicyRecord | null) {
  return cloneRules(mergePolicyRulesWithCatalog(policy?.rules ?? []));
}

function statusBadge(status: PolicyRecord["status"]) {
  if (status === "ACTIVE") return <StatusBadge status="SUCCESS">Live</StatusBadge>;
  if (status === "DRAFT") return <StatusBadge status="WARNING">Draft</StatusBadge>;
  return <StatusBadge status="NEUTRAL">Archived</StatusBadge>;
}

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export function PolicyManager({ initialPolicy, initialPolicies }: PolicyManagerProps) {
  const [policies, setPolicies] = useState<PolicyRecord[]>(initialPolicies);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialPolicies.find((policy) => policy.status === "DRAFT")?.id
      ?? initialPolicy?.id
      ?? initialPolicies[0]?.id
      ?? null,
  );
  const [rules, setRules] = useState<RefundPolicyRule[]>(() => {
    const selected = initialPolicies.find((policy) => policy.id === (
      initialPolicies.find((entry) => entry.status === "DRAFT")?.id
      ?? initialPolicy?.id
      ?? initialPolicies[0]?.id
    )) ?? null;
    return initialRules(selected);
  });
  const [versionLabel, setVersionLabel] = useState(() => {
    const selected = initialPolicies.find((policy) => policy.id === selectedId) ?? null;
    return selected?.version ?? "";
  });
  const [refundWindow, setRefundWindow] = useState(() => {
    const selected = initialPolicies.find((policy) => policy.id === selectedId) ?? null;
    return selected?.refundWindowDays ?? 30;
  });
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [validation, setValidation] = useState<PolicyValidationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [canEditPolicy, setCanEditPolicy] = useState(false);
  const [canPublishPolicy, setCanPublishPolicy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/login", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { permissions?: unknown } | null) => {
        if (!active || !payload || !Array.isArray(payload.permissions)) return;
        setCanEditPolicy(payload.permissions.includes("policy:edit"));
        setCanPublishPolicy(payload.permissions.includes("policy:publish"));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const selected = useMemo(
    () => policies.find((policy) => policy.id === selectedId) ?? null,
    [policies, selectedId],
  );
  const editable = selected?.status === "DRAFT" && canEditPolicy;
  const enabledCount = rules.filter((rule) => rule.enabled).length;
  const visiblePolicies = policies.filter((policy) => showArchived || policy.status !== "ARCHIVED");
  const livePolicy = policies.find((policy) => policy.status === "ACTIVE") ?? null;

  function applySelection(policy: PolicyRecord | null, nextPolicies?: PolicyRecord[]) {
    if (nextPolicies) setPolicies(nextPolicies);
    setSelectedId(policy?.id ?? null);
    setRules(initialRules(policy));
    setVersionLabel(policy?.version ?? "");
    setRefundWindow(policy?.refundWindowDays ?? 30);
    setValidation(null);
  }

  async function refresh(selectId?: string | null) {
    const response = await fetch("/api/admin/policies", { cache: "no-store" });
    const payload = await response.json() as { policies?: PolicyRecord[]; policy?: PolicyRecord | null };
    const next = payload.policies ?? [];
    setPolicies(next);
    const preferred = (selectId ? next.find((policy) => policy.id === selectId) : null)
      ?? next.find((policy) => policy.status === "DRAFT")
      ?? next.find((policy) => policy.status === "ACTIVE")
      ?? next[0]
      ?? null;
    applySelection(preferred, next);
    return preferred;
  }

  async function createDraft(fromLive: boolean) {
    setBusy(true);
    setMessage(null);
    setValidation(null);
    try {
      const response = await fetch("/api/admin/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refundWindowDays: livePolicy?.refundWindowDays ?? 30,
          sourcePolicyId: fromLive && livePolicy ? livePolicy.id : undefined,
        }),
      });
      const payload = await response.json() as {
        policy?: PolicyRecord;
        policies?: PolicyRecord[];
        error?: { message: string };
      };
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to create draft.");
      if (payload.policies) setPolicies(payload.policies);
      applySelection(payload.policy ?? null, payload.policies);
      setMessage(fromLive
        ? "Draft created from the live policy. Edit, validate, then publish."
        : "Draft created. Configure rules, validate, then publish.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create draft.");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!selected || selected.status !== "DRAFT") return;
    if (enabledCount === 0) {
      setMessage("Enable at least one check before saving.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/policies/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: versionLabel,
          refundWindowDays: refundWindow,
          rules,
        }),
      });
      const payload = await response.json() as {
        policy?: PolicyRecord;
        policies?: PolicyRecord[];
        error?: { message: string };
      };
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to save draft.");
      if (payload.policies) setPolicies(payload.policies);
      applySelection(payload.policy ?? selected, payload.policies);
      setMessage("Draft saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save draft.");
    } finally {
      setBusy(false);
    }
  }

  async function validateDraft() {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      if (selected.status === "DRAFT") {
        const saveResponse = await fetch(`/api/admin/policies/${selected.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version: versionLabel,
            refundWindowDays: refundWindow,
            rules,
          }),
        });
        const savePayload = await saveResponse.json() as {
          policy?: PolicyRecord;
          policies?: PolicyRecord[];
          error?: { message: string };
        };
        if (!saveResponse.ok) throw new Error(savePayload.error?.message ?? "Unable to save draft before validate.");
        if (savePayload.policies) setPolicies(savePayload.policies);
        if (savePayload.policy) applySelection(savePayload.policy, savePayload.policies);
      }

      const response = await fetch(`/api/admin/policies/${selected.id}/validate`, { method: "POST" });
      const payload = await response.json() as {
        validation?: PolicyValidationResult;
        error?: { message: string };
      };
      if (!response.ok && !payload.validation) {
        throw new Error(payload.error?.message ?? "Unable to validate policy.");
      }
      const result = payload.validation ?? validatePolicyForPublish({
        version: versionLabel,
        refundWindowDays: refundWindow,
        rules,
      });
      setValidation(result);
      setMessage(result.ok
        ? "Validation passed. This draft is ready to publish."
        : result.errors.join(" "));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to validate policy.");
    } finally {
      setBusy(false);
    }
  }

  async function publishDraft() {
    if (!selected || selected.status !== "DRAFT") return;
    setBusy(true);
    setMessage(null);
    try {
      const saveResponse = await fetch(`/api/admin/policies/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: versionLabel,
          refundWindowDays: refundWindow,
          rules,
        }),
      });
      const savePayload = await saveResponse.json() as { error?: { message: string } };
      if (!saveResponse.ok) throw new Error(savePayload.error?.message ?? "Unable to save draft before publish.");

      const response = await fetch(`/api/admin/policies/${selected.id}/publish`, { method: "POST" });
      const payload = await response.json() as {
        policy?: PolicyRecord;
        policies?: PolicyRecord[];
        validation?: PolicyValidationResult;
        error?: { message: string; validation?: PolicyValidationResult };
      };
      if (!response.ok) {
        if (payload.error?.validation) setValidation(payload.error.validation);
        throw new Error(payload.error?.message ?? "Unable to publish policy.");
      }
      if (payload.policies) setPolicies(payload.policies);
      applySelection(payload.policy ?? null, payload.policies);
      if (payload.validation) setValidation(payload.validation);
      setMessage("Policy published. Prior live version was archived.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to publish policy.");
    } finally {
      setBusy(false);
    }
  }

  async function discardDraft() {
    if (!selected || selected.status !== "DRAFT") return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/policies/${selected.id}`, { method: "DELETE" });
      const payload = await response.json() as { policies?: PolicyRecord[]; error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to discard draft.");
      await refresh(livePolicy?.id ?? null);
      setMessage("Draft discarded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to discard draft.");
    } finally {
      setBusy(false);
    }
  }

  function selectVersion(policy: PolicyRecord) {
    applySelection(policy);
  }

  function updateRule(index: number, patch: Partial<RefundPolicyRule>) {
    setRules((current) => current.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  }

  function toggleCondition(reason: string, condition: string, index: number) {
    const rule = rules[index];
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

  function renderRule(rule: RefundPolicyRule, index: number) {
    const isOpen = expandedRule === rule.code;
    return (
      <div key={rule.code} className={styles.ruleRow}>
        <div className={styles.ruleSummary}>
          <label className={styles.ruleToggle} onClick={(event) => event.stopPropagation()}>
            <input
              type="checkbox"
              checked={rule.enabled}
              disabled={!editable}
              onChange={(event) => updateRule(index, { enabled: event.target.checked })}
            />
          </label>
          <button type="button" className={styles.ruleSummaryMain} onClick={() => setExpandedRule(isOpen ? null : rule.code)}>
            <span className={styles.ruleTitle}>{rule.title || RULE_LABELS[rule.code] || catalogEntry(rule.code).title}</span>
            {!isOpen ? <span className={styles.rulePreview}>{rule.text}</span> : null}
          </button>
          <button type="button" className={styles.ruleExpand} aria-label={isOpen ? "Collapse" : "Expand"} onClick={() => setExpandedRule(isOpen ? null : rule.code)}>
            <ChevronDown size={16} className={clsx(styles.chevron, isOpen && styles.chevronOpen)} />
          </button>
        </div>
        {isOpen ? (
          <div className={styles.ruleBody}>
            <p className={styles.ruleCode}><code>{rule.code}</code></p>
            <input className={styles.input} value={rule.title} disabled={!editable} onChange={(event) => updateRule(index, { title: event.target.value })} />
            <textarea className={styles.textarea} value={rule.text} disabled={!editable} onChange={(event) => updateRule(index, { text: event.target.value })} rows={2} />
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
                              <input type="checkbox" checked={checked} disabled={!editable} onChange={() => toggleCondition(reason, condition, index)} />
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

  function renderCategory(category: PolicyRuleCategory) {
    return (
      <div key={category} className={styles.categoryGroup}>
        <h3 className={styles.categoryHeader}>{category}</h3>
        {RULES_BY_CATEGORY[category].map((entry) => {
          const index = rules.findIndex((rule) => rule.code === entry.code);
          const rule = rules[index];
          if (!rule) return null;
          return renderRule(rule, index);
        })}
      </div>
    );
  }

  if (!selected && policies.length === 0) {
    return (
      <div className={styles.manager}>
        {message ? <div className={styles.notice}>{message}</div> : null}
        <section className={styles.main}>
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>
              Create a draft refund policy, enable the checks your store enforces, validate, then publish.
              The support agent follows the live published version exactly.
            </p>
            <button type="button" className={styles.button} disabled={busy || !canEditPolicy} onClick={() => void createDraft(false)}>
              Create draft policy
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.manager}>
      {message ? <div className={styles.notice}>{message}</div> : null}
      {validation && selected?.status === "DRAFT" ? (
        <div className={styles.notice}>
          {validation.ok
            ? `Ready to publish · ${validation.enabledCount}/${validation.totalCatalogRules} checks enabled`
            : validation.errors.join(" ")}
          {validation.warnings.length ? (
            <div className={styles.mainSubtitle}>{validation.warnings.join(" ")}</div>
          ) : null}
        </div>
      ) : null}

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>Versions</div>
          <ul className={styles.versionList}>
            {visiblePolicies.map((policy) => (
              <li key={policy.id}>
                <button
                  type="button"
                  className={clsx(styles.versionItem, selected?.id === policy.id && styles.versionItemActive)}
                  onClick={() => selectVersion(policy)}
                >
                  <span className={styles.versionLabel}>{policy.version}</span>
                  <span className={styles.versionMeta}>
                    {policy.status}
                    {" · "}
                    {policy.status === "ACTIVE" ? formatWhen(policy.publishedAt) : formatWhen(policy.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className={styles.sidebarFooter}>
            <label className={styles.showArchived}>
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
              />
              {" "}Show archived
            </label>
            {canEditPolicy ? (
              <div className={styles.createOptions}>
                <button
                  type="button"
                  className={styles.buttonSecondary}
                  disabled={busy}
                  onClick={() => void createDraft(Boolean(livePolicy))}
                >
                  {livePolicy ? "New draft from live" : "New draft"}
                </button>
              </div>
            ) : null}
          </div>
        </aside>

        <section className={styles.main}>
          {selected ? (
            <>
              <div className={styles.mainHeader}>
                <div>
                  <h2 className={styles.mainTitle}>{selected.version}</h2>
                  <p className={styles.mainSubtitle}>
                    {selected.status === "DRAFT"
                      ? "Edit this draft, validate, then publish to replace the live policy."
                      : selected.status === "ACTIVE"
                        ? "Live policy used by the support agent. Create a draft to make changes."
                        : "Archived version kept for audit. Read-only."}
                  </p>
                </div>
                <div className={styles.topActions}>
                  {statusBadge(selected.status)}
                  {editable ? (
                    <>
                      <button type="button" className={styles.buttonSecondary} disabled={busy} onClick={() => void saveDraft()}>
                        Save draft
                      </button>
                      <button type="button" className={styles.buttonSecondary} disabled={busy} onClick={() => void validateDraft()}>
                        Validate
                      </button>
                      <button type="button" className={styles.button} disabled={busy || !canPublishPolicy} onClick={() => void publishDraft()}>
                        Publish
                      </button>
                      <button type="button" className={styles.buttonGhost} disabled={busy} onClick={() => void discardDraft()}>
                        Discard
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className={styles.settingsRow}>
                <label className={styles.fieldLabel}>
                  Version label
                  <input
                    className={styles.input}
                    value={versionLabel}
                    disabled={!editable}
                    onChange={(event) => setVersionLabel(event.target.value)}
                  />
                </label>
                <label className={styles.fieldLabel}>
                  Return window (days)
                  <input
                    className={styles.input}
                    type="number"
                    min={1}
                    max={365}
                    value={refundWindow}
                    disabled={!editable}
                    onChange={(event) => setRefundWindow(Number(event.target.value))}
                  />
                </label>
              </div>

              <div className={styles.rulesToolbar}>
                <span className={styles.rulesCount}>
                  <strong>{enabledCount}</strong>/{POLICY_CATALOG.length} enabled
                  {selected.status === "DRAFT" ? " · checked rules are enforced after publish" : ""}
                </span>
              </div>

              <div className={styles.ruleList}>
                {POLICY_RULE_CATEGORIES.map((category) => renderCategory(category))}
              </div>
            </>
          ) : (
            <div className={styles.emptyRules}>Select a policy version to inspect.</div>
          )}
        </section>
      </div>
    </div>
  );
}
