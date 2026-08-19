export function publicAppBaseUrl() {
  const configured = process.env.APP_BASE_URL?.trim() || process.env.RENDER_EXTERNAL_URL?.trim() || "";
  return configured.replace(/\/$/, "");
}
