import { createHash } from "node:crypto";
import type { AppDatabase } from "@/db/database";
import type { ItemCondition, RefundReason, RefundRequest } from "@/domain/refunds/types";
import { RefundPolicyRepository } from "@/repositories/refund-policy.repository";
import { SupportEscalationRepository } from "@/repositories/support-escalation.repository";
import { createSqliteCustomerRepository, createSqliteOrderRepository } from "@/repositories/sqlite";
import { evaluateRefundEligibility } from "@/services/refund-eligibility.service";
import { executeRefundAtomically } from "@/services/refund-execution.service";
import { resolveTenantId } from "@/services/tenant/tenant-context.service";
import type { AgentTool } from "@/tools/agent/types";
import {
  AgentToolError,
  expectEnum,
  expectObject,
  expectPositiveInteger,
  expectString,
  rejectUnknownKeys,
} from "@/tools/agent/validation";

const REFUND_REASONS = ["CHANGED_MIND", "DAMAGED", "WRONG_ITEM", "NOT_AS_DESCRIBED", "LATE_DELIVERY"] as const;
const ITEM_CONDITIONS = ["UNOPENED", "OPENED", "USED", "DAMAGED"] as const;
const ESCALATION_REASONS = ["HIGH_RISK", "POLICY_EXCEPTION", "TOOL_FAILURE", "CUSTOMER_REQUEST", "OTHER"] as const;

export interface CreateRefundToolRegistryOptions {
  failOnceTool?: string;
  authenticatedCustomerEmail?: string;
  requestTimestamp?: string;
}

function normalizeTimestamp(value: string | undefined) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error("requestTimestamp must be a valid ISO-8601 timestamp.");
  return date.toISOString();
}

function refundRequestFromArgs(args: unknown, requestedAt: string): RefundRequest {
  const input = expectObject(args);
  const allowed = ["customerId", "orderId", "itemId", "quantity", "reason", "condition"] as const;
  rejectUnknownKeys(input, allowed);
  return {
    customerId: expectString(input.customerId, "customerId"),
    orderId: expectString(input.orderId, "orderId"),
    itemId: expectString(input.itemId, "itemId"),
    quantity: expectPositiveInteger(input.quantity, "quantity"),
    reason: expectEnum(input.reason, "reason", REFUND_REASONS) as RefundReason,
    condition: expectEnum(input.condition, "condition", ITEM_CONDITIONS) as ItemCondition,
    requestedAt,
  };
}

function refundRequestSchemaProperties() {
  return {
    customerId: { type: "string", description: "CRM customer ID returned by lookup_customer_by_email." },
    orderId: { type: "string", description: "Order ID that belongs to the customer." },
    itemId: { type: "string", description: "Order item ID to evaluate." },
    quantity: { type: "integer", minimum: 1, description: "Quantity requested for refund." },
    reason: { type: "string", enum: [...REFUND_REASONS], description: "Customer refund reason." },
    condition: { type: "string", enum: [...ITEM_CONDITIONS], description: "Current item condition." },
  };
}

function buildAgentIdempotencyKey(runId: string, request: RefundRequest) {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        runId,
        customerId: request.customerId,
        orderId: request.orderId,
        itemId: request.itemId,
        quantity: request.quantity,
        reason: request.reason,
        condition: request.condition,
      }),
    )
    .digest("hex");
  return `agent-refund:${digest}`;
}

export function createRefundToolRegistry(db: AppDatabase, options: CreateRefundToolRegistryOptions = {}) {
  const customerRepository = createSqliteCustomerRepository(db);
  const orderRepository = createSqliteOrderRepository(db);
  const policyRepository = new RefundPolicyRepository(db);
  const authenticatedEmail = options.authenticatedCustomerEmail?.trim().toLowerCase() || null;
  const requestTimestamp = normalizeTimestamp(options.requestTimestamp);
  let failOnceConsumed = false;
  let authenticatedCustomerPromise: ReturnType<typeof customerRepository.findByEmail> | null = null;

  const maybeFailOnce = (toolName: string) => {
    if (options.failOnceTool === toolName && !failOnceConsumed) {
      failOnceConsumed = true;
      throw new AgentToolError("DEMO_TRANSIENT_FAILURE", `Injected transient failure for ${toolName}.`, true);
    }
  };

  const getAuthenticatedCustomer = async () => {
    if (!authenticatedEmail) return null;
    authenticatedCustomerPromise ??= customerRepository.findByEmail(authenticatedEmail);
    const customer = await authenticatedCustomerPromise;
    if (!customer) {
      throw new AgentToolError(
        "AUTHENTICATED_CUSTOMER_NOT_FOUND",
        "The authenticated customer context does not map to a CRM record.",
        false,
      );
    }
    return customer;
  };

  const assertAuthorizedCustomer = async (customerId: string) => {
    const authenticatedCustomer = await getAuthenticatedCustomer();
    if (authenticatedCustomer && authenticatedCustomer.id !== customerId) {
      throw new AgentToolError(
        "AUTHORIZATION_FAILED",
        "The requested customer does not match the authenticated support session.",
        false,
      );
    }
  };

  const tools: AgentTool[] = [
    {
      definition: {
        type: "function",
        name: "lookup_customer_by_email",
        description:
          "Find the CRM customer for the authenticated support email. The server enforces that the tool cannot switch identities.",
        strict: true,
        parameters: {
          type: "object",
          properties: { email: { type: "string", description: "Authenticated customer email from support context." } },
          required: ["email"],
          additionalProperties: false,
        },
      },
      async execute(args, context) {
        maybeFailOnce("lookup_customer_by_email");
        const input = expectObject(args);
        rejectUnknownKeys(input, ["email"]);
        const requestedEmail = expectString(input.email, "email");
        if (authenticatedEmail && requestedEmail.toLowerCase() !== authenticatedEmail) {
          throw new AgentToolError(
            "AUTHORIZATION_FAILED",
            "The model attempted to look up a customer outside the authenticated support session.",
            false,
          );
        }
        const customer = await customerRepository.findByEmail(authenticatedEmail ?? requestedEmail);
        if (customer) context.runRepository.setContext(context.runId, { customerId: customer.id });
        return customer;
      },
    },
    {
      definition: {
        type: "function",
        name: "lookup_order",
        description: "Load a specific order only when it belongs to the authenticated customer.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            orderId: { type: "string", description: "Order ID supplied by the customer or support context." },
            customerId: { type: "string", description: "CRM customer ID returned by lookup_customer_by_email." },
          },
          required: ["orderId", "customerId"],
          additionalProperties: false,
        },
      },
      async execute(args, context) {
        maybeFailOnce("lookup_order");
        const input = expectObject(args);
        rejectUnknownKeys(input, ["orderId", "customerId"]);
        const orderId = expectString(input.orderId, "orderId");
        const customerId = expectString(input.customerId, "customerId");
        await assertAuthorizedCustomer(customerId);
        const order = await orderRepository.findForCustomer(orderId, customerId);
        if (order) context.runRepository.setContext(context.runId, { customerId, orderId });
        return order;
      },
    },
    {
      definition: {
        type: "function",
        name: "get_refund_policy",
        description: "Return the authoritative machine-checkable refund policy and active rule codes.",
        strict: true,
        parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
      },
      async execute(args) {
        maybeFailOnce("get_refund_policy");
        const input = expectObject(args);
        rejectUnknownKeys(input, []);
        return policyRepository.getActive();
      },
    },
    {
      definition: {
        type: "function",
        name: "validate_refund_request",
        description:
          "Run the deterministic refund engine. This tool, not the language model, decides approval or denial and refund amount. The request timestamp is server-owned.",
        strict: true,
        parameters: {
          type: "object",
          properties: refundRequestSchemaProperties(),
          required: ["customerId", "orderId", "itemId", "quantity", "reason", "condition"],
          additionalProperties: false,
        },
      },
      async execute(args, context) {
        maybeFailOnce("validate_refund_request");
        const request = refundRequestFromArgs(args, requestTimestamp);
        await assertAuthorizedCustomer(request.customerId);
        const customer = await customerRepository.findById(request.customerId);
        const order = await orderRepository.findById(request.orderId);
        context.runRepository.setContext(context.runId, { customerId: request.customerId, orderId: request.orderId });

        if (!customer || !order) {
          return {
            decision: "DENY" as const,
            refundAmountCents: 0,
            checks: [],
            denialReasons: [!customer ? "CUSTOMER_NOT_FOUND" : "ORDER_NOT_FOUND"],
          };
        }

        const refunded = db
          .prepare("SELECT COALESCE(SUM(quantity), 0) AS quantity FROM refunds WHERE tenant_id = ? AND item_id = ?")
          .get(resolveTenantId(db), request.itemId) as { quantity: number };
        const policy = policyRepository.getActive();
        const evaluation = evaluateRefundEligibility(customer, order, request, {
          alreadyRefundedItemQuantity: refunded.quantity,
          policy,
        });
        return { ...evaluation, policyVersion: policy.version };
      },
    },
    {
      definition: {
        type: "function",
        name: "execute_refund",
        description:
          "Execute a refund atomically and idempotently. The service re-runs deterministic eligibility inside the database transaction; the server owns the idempotency key and request timestamp.",
        strict: true,
        parameters: {
          type: "object",
          properties: refundRequestSchemaProperties(),
          required: ["customerId", "orderId", "itemId", "quantity", "reason", "condition"],
          additionalProperties: false,
        },
      },
      async execute(args, context) {
        maybeFailOnce("execute_refund");
        const request = refundRequestFromArgs(args, requestTimestamp);
        await assertAuthorizedCustomer(request.customerId);
        context.runRepository.setContext(context.runId, { customerId: request.customerId, orderId: request.orderId });
        return executeRefundAtomically(db, {
          idempotencyKey: buildAgentIdempotencyKey(context.runId, request),
          runId: context.runId,
          request,
        });
      },
    },
    {
      definition: {
        type: "function",
        name: "escalate_to_human",
        description: "Create a durable human-support escalation when automation is unsafe, unsupported, or explicitly requested by the customer.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            customerId: { type: "string" },
            orderId: { type: "string" },
            reasonCode: { type: "string", enum: [...ESCALATION_REASONS] },
            summary: { type: "string", minLength: 1, maxLength: 1000 },
          },
          required: ["customerId", "orderId", "reasonCode", "summary"],
          additionalProperties: false,
        },
      },
      async execute(args, context) {
        const input = expectObject(args);
        rejectUnknownKeys(input, ["customerId", "orderId", "reasonCode", "summary"]);
        const customerId = expectString(input.customerId, "customerId");
        const orderId = expectString(input.orderId, "orderId");
        const reasonCode = expectEnum(input.reasonCode, "reasonCode", ESCALATION_REASONS);
        const summary = expectString(input.summary, "summary");
        await assertAuthorizedCustomer(customerId);
        const order = await orderRepository.findForCustomer(orderId, customerId);
        if (!order) throw new AgentToolError("AUTHORIZATION_FAILED", "Escalation order does not belong to the authenticated customer.", false);
        context.runRepository.setContext(context.runId, { customerId, orderId });
        const customer = await customerRepository.findById(customerId);
        const priority = customer?.riskLevel === "HIGH" || reasonCode === "HIGH_RISK" || reasonCode === "TOOL_FAILURE" ? "HIGH" : "NORMAL";
        return new SupportEscalationRepository(db).createOrGet({
          runId: context.runId,
          customerId,
          orderId,
          reasonCode,
          summary,
          priority,
        });
      },
    },
  ];

  return new Map(tools.map((tool) => [tool.definition.name, tool]));
}
