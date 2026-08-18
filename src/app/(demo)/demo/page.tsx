import Link from "next/link";
import { ArrowRight, CheckCircle2, RotateCcw, ShieldX } from "lucide-react";
import { DEMO_SCENARIOS } from "@/config/demo-scenarios";
import { PageHeader } from "@/components/layout/PageHeader";

const DEMO_CARDS = [
  {
    scenario: DEMO_SCENARIOS.approve,
    description: "Maya Patel requests a refund for Studio Headphones. The deterministic policy allows the request.",
    icon: <CheckCircle2 size={18} />,
    button: "Open approval demo",
  },
  {
    scenario: DEMO_SCENARIOS.deny,
    description: "Noah Williams requests a refund for a final-sale item. The policy engine blocks the refund.",
    icon: <ShieldX size={18} />,
    button: "Open denial demo",
  },
  {
    scenario: DEMO_SCENARIOS.retry,
    description: "Inject one guarded order-lookup failure so the persisted run shows failure → retry → success.",
    icon: <RotateCcw size={18} />,
    button: "Open retry demo",
  },
] as const;

export default function DemoControlPage() {
  return (
    <div className="admin-page">
      <div className="admin-stack">
        <PageHeader
          title="Demo Control"
          description="Deterministic evaluator shortcuts. The normal product flow remains available at /support without query parameters."
        >
          <Link href="/support" className="primary-link">
            Normal support flow <ArrowRight size={14} />
          </Link>
        </PageHeader>

        <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          {DEMO_CARDS.map(({ scenario, description, icon, button }, index) => (
            <article key={scenario.key} className="panel panel-body">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {icon}
                <h2 className="panel-title">{scenario.label}</h2>
              </div>
              <p className="panel-subtitle" style={{ margin: "8px 0 8px" }}>{description}</p>
              <p className="panel-subtitle" style={{ margin: "0 0 16px" }}>
                Expected: <strong>{scenario.expectedOutcome}</strong>
              </p>
              <Link
                href={`/support?scenario=${scenario.key}`}
                className={index === 0 ? "primary-link" : "table-link"}
              >
                {button}
              </Link>
            </article>
          ))}
        </div>

        <div className="panel panel-body">
          <h2 className="panel-title">Retry demo configuration</h2>
          <p className="panel-subtitle" style={{ marginTop: 8 }}>
            The retry scenario only injects a failure when <code>ENABLE_DEMO_FAILURES=true</code>. It is disabled by default so normal support traffic cannot trigger synthetic failures.
          </p>
        </div>
      </div>
    </div>
  );
}
