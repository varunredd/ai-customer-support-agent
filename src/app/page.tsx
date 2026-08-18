import { customers } from "@/data/customers";
import { orders } from "@/data/orders";
import { REFUND_POLICY } from "@/domain/refunds/policy";

export default function Home() {
  return (
    <main>
      <div className="eyebrow">Jobform Automator · Take-home</div>
      <h1>Policy-grounded AI customer support agent.</h1>
      <p>
        Phase 1 establishes the deterministic refund domain that the LLM agent will be required to call in Phase 2.
        The model will never be the source of truth for refund eligibility.
      </p>
      <span className="badge">Phase 1 foundation ready</span>

      <section className="grid">
        <article className="card"><strong>CRM fixtures</strong><p>{customers.length} customer profiles with risk and account state.</p></article>
        <article className="card"><strong>Order fixtures</strong><p>{orders.length} e-commerce orders, including demo approval and denial cases.</p></article>
        <article className="card"><strong>Policy engine</strong><p>{REFUND_POLICY.rules.length} explicit machine-checkable refund rules.</p></article>
        <article className="card"><strong>Next</strong><p>OpenAI function-calling loop, audit log persistence, chat API, then UI.</p></article>
      </section>
    </main>
  );
}
