import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const COURT_TYPES = [
  { value: "SC", label: "Supreme Court" },
  { value: "HC", label: "High Court" },
  { value: "DC", label: "District Court" },
  { value: "NCLT", label: "NCLT" },
  { value: "CF", label: "Consumer Forum" },
] as const;

// Bloomberg-terminal badge styles. Returns inline React.CSSProperties so
// the badges align with the rest of the redesigned UI (--bb-* token system,
// no Tailwind dependency for color tokens).

import type { CSSProperties } from "react";

const BADGE_BASE: CSSProperties = {
  display: "inline-block",
  fontFamily: "var(--bb-font, monospace)",
  fontSize: "0.6rem",
  letterSpacing: "0.06em",
  fontWeight: 600,
  textTransform: "uppercase",
  padding: "0.15rem 0.45rem",
  borderRadius: "2px",
  border: "1px solid",
  whiteSpace: "nowrap",
};

function badge(color: string): CSSProperties {
  return { ...BADGE_BASE, color, borderColor: color };
}

export const COURT_TYPE_BADGE: Record<string, CSSProperties> = {
  SC: badge("var(--bb-red)"),
  HC: badge("var(--bb-amber)"),
  DC: badge("var(--bb-green)"),
  NCLT: badge("var(--bb-amber-dim)"),
  CF: badge("var(--bb-gray)"),
};

export const STATUS_BADGE: Record<string, CSSProperties> = {
  Pending: badge("var(--bb-amber)"),
  Disposed: badge("var(--bb-green)"),
  Transferred: badge("var(--bb-amber-dim)"),
  Unknown: badge("var(--bb-gray)"),
};

export function courtTypeBadgeStyle(courtType: string): CSSProperties {
  return COURT_TYPE_BADGE[courtType] ?? badge("var(--bb-gray)");
}

export function statusBadgeStyle(
  status: string | null | undefined,
): CSSProperties {
  return STATUS_BADGE[status ?? "Unknown"] ?? STATUS_BADGE.Unknown;
}

export const INDIAN_STATES = [
  { code: "AP", name: "Andhra Pradesh" },
  { code: "AR", name: "Arunachal Pradesh" },
  { code: "AS", name: "Assam" },
  { code: "BR", name: "Bihar" },
  { code: "CT", name: "Chhattisgarh" },
  { code: "GA", name: "Goa" },
  { code: "GJ", name: "Gujarat" },
  { code: "HR", name: "Haryana" },
  { code: "HP", name: "Himachal Pradesh" },
  { code: "JH", name: "Jharkhand" },
  { code: "KA", name: "Karnataka" },
  { code: "KL", name: "Kerala" },
  { code: "MP", name: "Madhya Pradesh" },
  { code: "MH", name: "Maharashtra" },
  { code: "MN", name: "Manipur" },
  { code: "ML", name: "Meghalaya" },
  { code: "MZ", name: "Mizoram" },
  { code: "NL", name: "Nagaland" },
  { code: "OD", name: "Odisha" },
  { code: "PB", name: "Punjab" },
  { code: "RJ", name: "Rajasthan" },
  { code: "SK", name: "Sikkim" },
  { code: "TN", name: "Tamil Nadu" },
  { code: "TG", name: "Telangana" },
  { code: "TR", name: "Tripura" },
  { code: "UP", name: "Uttar Pradesh" },
  { code: "UK", name: "Uttarakhand" },
  { code: "WB", name: "West Bengal" },
  { code: "DL", name: "Delhi" },
  { code: "JK", name: "Jammu & Kashmir" },
  { code: "LA", name: "Ladakh" },
];
