export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureEcommerceSyncSchedulerStarted } = await import("@/services/integrations/ecommerce-sync-scheduler");
    ensureEcommerceSyncSchedulerStarted();
  }
}
