import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCategoryNameTr, resolveMunicipalityReportEmail } from "../_shared/municipality-email-routing.ts";
import { escapeHtml } from "../_shared/html-escape.ts";
import { makeUnsubscribeToken } from "../_shared/unsubscribe-token.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM =
  Deno.env.get("RESEND_FROM") ?? "Çöp Avcısı <onboarding@resend.dev>";
const CRON_SECRET = Deno.env.get("CRON_SECRET");
const PREF_SECRET = Deno.env.get("MUNICIPALITY_EMAIL_PREFERENCES_SECRET") ??
  Deno.env.get("UNSUBSCRIBE_SIGNING_SECRET");

type MuniRow = {
  id: string;
  name: string | null;
  email: string | null;
  city: string | null;
  email_notifications_enabled: boolean | null;
};

type ReportRow = {
  id: string;
  address: string | null;
  city: string | null;
  district: string | null;
  category: string | null;
  description: string | null;
  photo_urls: unknown;
  approved_at: string | null;
  municipality_id: string;
  municipalities: MuniRow | MuniRow[] | null;
};

function corsJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function extractMuni(r: ReportRow): MuniRow | null {
  const m = r.municipalities;
  if (!m) return null;
  return Array.isArray(m) ? m[0] ?? null : m;
}

function photoFirstUrl(photo_urls: unknown): string {
  if (Array.isArray(photo_urls) && photo_urls[0] && typeof photo_urls[0] === "string") {
    return photo_urls[0];
  }
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
    });
  }

  if (req.method === "GET") {
    return corsJson({
      ok: true,
      message: "POST with Authorization: Bearer CRON_SECRET or X-Cron-Secret",
    });
  }

  if (req.method !== "POST") {
    return corsJson({ error: "method_not_allowed" }, 405);
  }

  if (!CRON_SECRET) {
    return corsJson({ error: "server_not_configured", detail: "CRON_SECRET" }, 500);
  }

  const h = req.headers.get("X-Cron-Secret");
  const auth = req.headers.get("Authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (h !== CRON_SECRET && bearer !== CRON_SECRET) {
    return corsJson({ error: "unauthorized" }, 401);
  }

  if (!RESEND_API_KEY) {
    return corsJson({ error: "RESEND_API_KEY not configured" }, 500);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: orphanRows, error: orphanErr } = await supabase
    .from("reports")
    .select("id")
    .eq("approval_status", "approved")
    .is("notified_at", null)
    .is("municipality_id", null);
  if (orphanErr) {
    console.error("orphan reports query", orphanErr);
  }
  const orphanIds = (orphanRows ?? []).map((r) => r.id);
  if (orphanIds.length > 0) {
    const t = new Date().toISOString();
    const { error: orphanUpd } = await supabase
      .from("reports")
      .update({
        notified_at: t,
        email_notify_outcome: "skipped_no_recipient",
        email_notify_to: null,
        email_notify_routing: "skipped_no_recipient",
        status: "not_delivered",
      })
      .in("id", orphanIds);
    if (orphanUpd) console.error("orphan reports update", orphanUpd);
  }

  const { data: rows, error: qErr } = await supabase
    .from("reports")
    .select(
      "id, address, city, district, category, description, photo_urls, approved_at, municipality_id, municipalities!inner ( id, name, email, city, email_notifications_enabled )",
    )
    .eq("approval_status", "approved")
    .is("notified_at", null)
    .order("created_at", { ascending: true })
    .limit(2000);

  if (qErr) {
    console.error("digest query", qErr);
    return corsJson({ error: "query_failed", details: qErr.message }, 500);
  }

  const list = (rows ?? []) as unknown as ReportRow[];
  if (list.length === 0) {
    return corsJson({
      ok: true,
      processed: 0,
      message: orphanIds.length > 0
        ? "no digest queue; optional orphan rows closed"
        : "no pending reports",
      closed_orphan_no_municipality: orphanIds,
      groups: 0,
      sent_report_ids: [],
      skipped_opt_out: [],
      skipped_no_recipient: [],
      errors: [],
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!.replace(/\/$/, "");
  const preferenceFnUrl =
    `${supabaseUrl}/functions/v1/municipality-email-preferences`;

  const groups = new Map<
    string,
    {
      municipalityId: string;
      toEmail: string;
      routing: string;
      muniName: string;
      enabled: boolean;
      reports: ReportRow[];
    }
  >();

  const noRecipient: string[] = [];
  for (const r of list) {
    const muni = extractMuni(r);
    if (!muni) {
      noRecipient.push(r.id);
      continue;
    }
    const resolved = await resolveMunicipalityReportEmail(
      supabase,
      r.municipality_id,
      { email: muni.email, city: muni.city },
      { city: r.city, district: r.district },
    );
    if (!resolved) {
      noRecipient.push(r.id);
      continue;
    }
    const key = `${r.municipality_id}|${resolved.toEmail.toLowerCase()}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        municipalityId: r.municipality_id,
        toEmail: resolved.toEmail,
        routing: resolved.routing,
        muniName: muni.name ?? "Belediye",
        enabled: muni.email_notifications_enabled !== false,
        reports: [],
      };
      groups.set(key, g);
    }
    g.reports.push(r);
  }

  if (noRecipient.length > 0) {
    const now = new Date().toISOString();
    await supabase
      .from("reports")
      .update({
        notified_at: now,
        email_notify_outcome: "skipped_no_recipient",
        email_notify_to: null,
        email_notify_routing: "skipped_no_recipient",
        status: "not_delivered",
      })
      .in("id", noRecipient);
  }

  const sentBatches: string[] = [];
  const skippedOpt: string[] = [];
  const errors: { key: string; error: string }[] = [];

  for (const [, g] of groups) {
    const ids = g.reports.map((x) => x.id);
    const now = new Date().toISOString();

    if (!g.enabled) {
      await supabase
        .from("reports")
        .update({
          notified_at: now,
          email_notify_outcome: "skipped_opt_out",
          email_notify_to: g.toEmail,
          email_notify_routing: "skipped_opt_out",
          status: "not_delivered",
        })
        .in("id", ids);
      skippedOpt.push(...ids);
      continue;
    }

    const tableRows = g.reports.map((r) => {
      const cat = getCategoryNameTr(r.category);
      const photo = photoFirstUrl(r.photo_urls);
      const when = r.approved_at
        ? new Date(r.approved_at).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })
        : "-";
      return `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;vertical-align:top;">${escapeHtml(when)}</td>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;vertical-align:top;">${escapeHtml(cat)}</td>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;vertical-align:top;">${escapeHtml(r.district || "")}</td>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;vertical-align:top;">${escapeHtml((r.address || "-").slice(0, 200))}</td>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;vertical-align:top;max-width:220px;">${escapeHtml((r.description || "-").slice(0, 300))}</td>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;vertical-align:top;font-size:12px;">${photo ? `<a href="${escapeHtml(photo)}">foto</a>` : "-"}</td>
        </tr>`;
    }).join("");

    let unsubBlock = "";
    let listUnsubHeader: string | undefined;
    if (PREF_SECRET) {
      const token = await makeUnsubscribeToken(g.municipalityId, PREF_SECRET);
      const rawUrl =
        `${preferenceFnUrl}?token=${encodeURIComponent(token)}&action=unsubscribe`;
      const resubUrl =
        `${preferenceFnUrl}?token=${encodeURIComponent(token)}&action=resubscribe`;
      unsubBlock = `
        <p style="margin:16px 0 0 0; font-size:12px; color:#64748b;">
          Bu e-posta adresine Çöp Avcısı üzerinden gelen belediye bildirimlerini almak istemiyorsanız
          <a href="${rawUrl}">bildirimleri kapat</a>.
        </p>
        <p style="margin:8px 0 0 0; font-size:12px; color:#64748b;">
          Daha önce kapattıysanız: <a href="${resubUrl}">bildirimleri yeniden aç</a>.
        </p>`;
      listUnsubHeader = `<${rawUrl}>`;
    } else {
      unsubBlock = `
        <p style="margin:16px 0 0 0; font-size:12px; color:#64748b;">
          Bildirim tercihleri: Secret yapılandırılmadığından bu e-posta altında tercih bağlantısı üretilmedi.
        </p>`;
    }

    const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Helvetica,Arial,sans-serif;background:#f6f8f7;color:#0f172a;padding:20px;">
  <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
    <div style="background:#1a7f4b;color:#fff;padding:24px;">
      <h1 style="margin:0;font-size:20px;">Günlük rapor özeti</h1>
      <p style="margin:8px 0 0 0;opacity:0.95;font-size:14px;">${escapeHtml(g.muniName)}</p>
    </div>
    <div style="padding:20px 16px 24px 16px;">
      <p style="margin:0 0 12px 0; font-size:14px; color:#475569;">Onaylanmış ve bekleme kuyruğundaki adet: <strong>${g.reports.length}</strong></p>
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="background:#f1f5f9;text-align:left;">
              <th style="padding:8px;">Onay (TR)</th>
              <th style="padding:8px;">Kategori</th>
              <th style="padding:8px;">İlçe</th>
              <th style="padding:8px;">Adres (kısa)</th>
              <th style="padding:8px;">Açıklama (kısa)</th>
              <th style="padding:8px;">Foto</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      ${unsubBlock}
    </div>
    <div style="text-align:center;padding:16px;font-size:11px;color:#94a3b8;background:#f8fafc;">
      Çöp Avcısı — otomatik özet. Lütfen yanıtlamayınız.
    </div>
  </div>
</body>
</html>`;

    const resBody: Record<string, unknown> = {
      from: RESEND_FROM,
      to: g.toEmail,
      subject: `Çöp Avcısı — günlük rapor özeti (${g.reports.length} kayıt) — ${g.muniName.slice(0, 40)}`,
      html: emailHtml,
    };
    if (listUnsubHeader) {
      resBody.headers = { "List-Unsubscribe": listUnsubHeader };
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify(resBody),
    });
    const resText = await res.text();
    let resJson: Record<string, unknown> = {};
    try {
      resJson = JSON.parse(resText) as Record<string, unknown>;
    } catch {
      errors.push({ key: g.municipalityId, error: resText });
      continue;
    }
    if (!res.ok) {
      console.error("Resend error", resJson);
      errors.push({ key: g.municipalityId, error: String(resJson.message ?? resText) });
      continue;
    }

    const { count: officialCount, error: officialErr } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("municipality_id", g.municipalityId)
      .eq("role", "municipality_official");
    if (officialErr) {
      console.error("official count error", officialErr);
    }
    const hasOfficial = officialErr ? true : (officialCount ?? 0) > 0;

    await supabase
      .from("reports")
      .update({
        notified_at: now,
        email_notify_outcome: "sent",
        email_notify_to: g.toEmail,
        email_notify_routing: g.routing,
        status: hasOfficial ? "pending" : "forwarded",
      })
      .in("id", ids);
    sentBatches.push(...ids);
  }

  return corsJson({
    ok: true,
    groups: groups.size,
    sent_report_ids: sentBatches,
    skipped_opt_out: skippedOpt,
    skipped_no_recipient: noRecipient,
    closed_orphan_no_municipality: orphanIds,
    errors,
  });
});
