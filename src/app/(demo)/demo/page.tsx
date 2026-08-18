import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";

export default function DemoControlPage() {
  return (
    <div className="admin-page">
      <div className="admin-stack">
        <PageHeader
          title="Demo Control"
          description="Preset walkthrough scenarios for the hiring evaluation."
        />

        <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <article className="panel panel-body">
            <h2 className="panel-title">Standard approval</h2>
            <p className="panel-subtitle" style={{ margin: "8px 0 16px" }}>
              Maya Patel requests a refund for Studio Headphones. All policy checks pass.
            </p>
            <Link href="/support?scenario=approve">
              <Button>Open chat</Button>
            </Link>
          </article>
          <article className="panel panel-body">
            <h2 className="panel-title">Policy denial</h2>
            <p className="panel-subtitle" style={{ margin: "8px 0 16px" }}>
              Noah Williams requests a refund for a final-sale item. Engine denies RF-002.
            </p>
            <Link href="/support?scenario=deny">
              <Button variant="secondary">Open denial chat</Button>
            </Link>
          </article>
          <article className="panel panel-body">
            <h2 className="panel-title">Failure / retry</h2>
            <p className="panel-subtitle" style={{ margin: "8px 0 16px" }}>
              Simulate a tool failure and retry path during agent execution.
            </p>
            <Link href="/support?scenario=retry">
              <Button variant="secondary">Open retry chat</Button>
            </Link>
          </article>
        </div>
      </div>
    </div>
  );
}
