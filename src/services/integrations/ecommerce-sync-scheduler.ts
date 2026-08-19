import { isEcommercePullConfigured, runEcommercePullSync } from "@/services/integrations/ecommerce-pull-sync.service";

let started = false;
let running = false;

function syncIntervalMs() {
  const configured = Number(process.env.ECOMMERCE_SYNC_INTERVAL_MS);
  if (Number.isFinite(configured) && configured >= 60_000) return configured;
  return 5 * 60_000;
}

async function guardedPull(trigger: string) {
  if (running) return;
  running = true;
  try {
    await runEcommercePullSync(trigger);
  } finally {
    running = false;
  }
}

export function ensureEcommerceSyncSchedulerStarted() {
  if (started || process.env.NODE_ENV === "test") return;
  if (!isEcommercePullConfigured()) return;
  started = true;

  void guardedPull("startup");
  setInterval(() => {
    void guardedPull("scheduled");
  }, syncIntervalMs()).unref?.();
}
