import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function normalizeDistrict(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "";
  let s = raw.trim().toLocaleLowerCase("tr-TR");
  s = s
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/û/g, "u");
  s = s.replace(/[^a-z0-9]+/g, "");
  const aliases: Record<string, string> = {
    efesselcuk: "selcuk",
  };
  return aliases[s] ?? s;
}

export function normalizeCityKey(raw: string | null | undefined): string {
  const k = normalizeDistrict(raw);
  if (k.includes("istanbul")) return "istanbul";
  if (k.includes("izmir")) return "izmir";
  return k;
}

function istanbulSlugFallbackEmail(districtKey: string): string | null {
  if (!districtKey) return null;
  return `info@${districtKey}.bel.tr`;
}

export type RoutingKind =
  | "metropolitan"
  | "district_table"
  | "district_row_fallback_province"
  | "istanbul_slug";

export type ResolvedEmailRoute = {
  toEmail: string;
  routing: RoutingKind;
};

type MunicipalityRow = { email: string | null; city: string | null };

/**
 * Resolves the destination inbox for a report, matching single-report notify
 * behavior (municipalities + municipality_district_emails + Istanbul fallback).
 */
export async function resolveMunicipalityReportEmail(
  supabase: SupabaseClient,
  municipalityId: string,
  muni: MunicipalityRow,
  report: { city: string | null; district: string | null },
): Promise<ResolvedEmailRoute | null> {
  if (!muni.email?.trim()) {
    return null;
  }
  const districtKey = normalizeDistrict(report.district);
  let toEmail = muni.email as string;
  let routing: RoutingKind = "metropolitan";

  if (districtKey) {
    const { data: row } = await supabase
      .from("municipality_district_emails")
      .select("email")
      .eq("municipality_id", municipalityId)
      .eq("district_key", districtKey)
      .maybeSingle();

    if (row?.email) {
      toEmail = row.email;
      routing = "district_table";
    } else if (row) {
      routing = "district_row_fallback_province";
    } else {
      const cityKey = normalizeCityKey(muni.city || report.city || "");
      if (cityKey === "istanbul") {
        const fb = istanbulSlugFallbackEmail(districtKey);
        if (fb) {
          toEmail = fb;
          routing = "istanbul_slug";
        }
      }
    }
  }

  return { toEmail, routing };
}

export function getCategoryNameTr(cat: string | null | undefined): string {
  switch (cat) {
    case "garbage":
      return "Çöp";
    case "broken_road":
      return "Bozuk Yol";
    default:
      return cat && String(cat) ? String(cat) : "Çöp";
  }
}
