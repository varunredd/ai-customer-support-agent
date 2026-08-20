export interface TenantBranding {
  name: string;
  logoUrl: string | null;
  accent: string | null;
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function readString(settings: Record<string, unknown>, key: string, maxLength: number): string | null {
  const value = settings[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

function readLogoUrl(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//") && value.length <= 512) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return url.toString();
  } catch {
    return null;
  }
  return null;
}

export function tenantBrandingFromRecord(tenant: { name: string; settings: Record<string, unknown> }): TenantBranding {
  const brandName = readString(tenant.settings, "brandName", 80);
  const accent = readString(tenant.settings, "accent", 16);
  return {
    name: brandName ?? tenant.name,
    logoUrl: readLogoUrl(readString(tenant.settings, "logoUrl", 512)),
    accent: accent && HEX_COLOR.test(accent) ? accent : null,
  };
}
