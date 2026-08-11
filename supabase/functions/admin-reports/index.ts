import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_PANEL_PASSWORD = Deno.env.get("ADMIN_PANEL_PASSWORD") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-password",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type AdminAction =
  | "list"
  | "list_queued"
  | "list_rejected"
  | "list_reports"
  | "get_report"
  | "stats"
  | "list_municipalities"
  | "update_municipality"
  | "create_municipality"
  | "list_district_emails"
  | "upsert_district_email"
  | "list_users"
  | "update_user"
  | "approve"
  | "reject"
  | "ping";

interface AdminRequestBody {
  action?: AdminAction;
  report_id?: string;
  municipality_id?: string;
  user_id?: string;
  page?: number;
  page_size?: number;
  pipeline?: string;
  city?: string;
  q?: string;
  email_notifications_enabled?: boolean | null;
  missing_email?: boolean | null;
  is_active?: boolean | null;
  role?: string;
  user_type?: string;
  // municipality create/update
  name?: string;
  district?: string;
  email?: string | null;
  whatsapp_number?: string | null;
  parent_municipality_id?: string | null;
  // district email
  district_key?: string;
  kep_email?: string | null;
  // user update
  municipality_id_for_user?: string | null;
}

const REPORT_SELECT =
  "id, created_at, updated_at, approved_at, notified_at, category, description, address, city, district, photo_urls, municipality_id, user_id, approval_status, status, email_notify_outcome, latitude, longitude, municipalities:municipality_id ( id, name, email, city, district, email_notifications_enabled, is_active )";

function pageParams(body: AdminRequestBody, defaultSize = 20) {
  const page = Math.max(1, Math.floor(Number(body.page) || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(body.page_size) || defaultSize)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return { page, pageSize, from, to };
}

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function countEq(
  supabase: SupabaseClient,
  column: string,
  value: string,
) {
  const { count, error } = await supabase
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq(column, value);
  if (error) throw error;
  return count ?? 0;
}

async function handleStats(supabase: SupabaseClient) {
  const [
    totalRes,
    pending,
    rejected,
    deliveredRes,
    notDeliveredRes,
    queuedRes,
    created7Res,
    approved7Res,
    notified7Res,
    created30Res,
  ] = await Promise.all([
    supabase.from("reports").select("id", { count: "exact", head: true }),
    countEq(supabase, "approval_status", "pending"),
    countEq(supabase, "approval_status", "rejected"),
    supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("email_notify_outcome", "sent"),
    supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .or(
        "status.eq.not_delivered,email_notify_outcome.eq.skipped_no_recipient,email_notify_outcome.eq.skipped_opt_out",
      ),
    supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("approval_status", "approved")
      .is("notified_at", null),
    supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .gte("created_at", daysAgoIso(7)),
    supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .gte("approved_at", daysAgoIso(7)),
    supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("email_notify_outcome", "sent")
      .gte("notified_at", daysAgoIso(7)),
    supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .gte("created_at", daysAgoIso(30)),
  ]);

  for (const r of [totalRes, deliveredRes, notDeliveredRes, queuedRes, created7Res, approved7Res, notified7Res, created30Res]) {
    if (r.error) throw r.error;
  }

  const { data: recentDelivered, error: rdErr } = await supabase
    .from("reports")
    .select(REPORT_SELECT)
    .eq("email_notify_outcome", "sent")
    .order("notified_at", { ascending: false, nullsFirst: false })
    .limit(8);
  if (rdErr) throw rdErr;

  const { data: recentPending, error: rpErr } = await supabase
    .from("reports")
    .select(REPORT_SELECT)
    .eq("approval_status", "pending")
    .order("created_at", { ascending: false })
    .limit(8);
  if (rpErr) throw rpErr;

  const { count: muniTotal, error: mtErr } = await supabase
    .from("municipalities")
    .select("id", { count: "exact", head: true });
  if (mtErr) throw mtErr;

  const { count: muniOptOut, error: moErr } = await supabase
    .from("municipalities")
    .select("id", { count: "exact", head: true })
    .eq("email_notifications_enabled", false);
  if (moErr) throw moErr;

  const { count: muniMissingEmail, error: mmErr } = await supabase
    .from("municipalities")
    .select("id", { count: "exact", head: true })
    .or("email.is.null,email.eq.");
  if (mmErr) throw mmErr;

  const { count: userTotal, error: utErr } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true });
  if (utErr) throw utErr;

  return json({
    stats: {
      total: totalRes.count ?? 0,
      pending,
      queued: queuedRes.count ?? 0,
      delivered: deliveredRes.count ?? 0,
      not_delivered: notDeliveredRes.count ?? 0,
      rejected,
      created_7d: created7Res.count ?? 0,
      approved_7d: approved7Res.count ?? 0,
      delivered_7d: notified7Res.count ?? 0,
      created_30d: created30Res.count ?? 0,
      municipalities_total: muniTotal ?? 0,
      municipalities_opt_out: muniOptOut ?? 0,
      municipalities_missing_email: muniMissingEmail ?? 0,
      users_total: userTotal ?? 0,
    },
    recent_delivered: recentDelivered ?? [],
    recent_pending: recentPending ?? [],
  });
}

async function handleListReports(supabase: SupabaseClient, body: AdminRequestBody) {
  const { page, pageSize, from, to } = pageParams(body, 20);
  const pipeline = (body.pipeline || "all").trim();
  const idFilter = typeof body.report_id === "string" ? body.report_id.trim() : "";
  const city = typeof body.city === "string" ? body.city.trim() : "";
  const q = typeof body.q === "string" ? body.q.trim() : "";
  const municipalityId =
    typeof body.municipality_id === "string" ? body.municipality_id.trim() : "";

  let query = supabase
    .from("reports")
    .select(REPORT_SELECT, { count: "exact" })
    .order("created_at", { ascending: false });

  if (idFilter) query = query.eq("id", idFilter);
  if (city) query = query.ilike("city", `%${city}%`);
  if (municipalityId) query = query.eq("municipality_id", municipalityId);
  if (q) query = query.or(`address.ilike.%${q}%,description.ilike.%${q}%`);

  switch (pipeline) {
    case "pending":
      query = query.eq("approval_status", "pending");
      break;
    case "queued":
      query = query.eq("approval_status", "approved").is("notified_at", null);
      break;
    case "delivered":
      query = query.eq("email_notify_outcome", "sent");
      break;
    case "not_delivered":
      query = query.or(
        "status.eq.not_delivered,email_notify_outcome.eq.skipped_no_recipient,email_notify_outcome.eq.skipped_opt_out",
      );
      break;
    case "rejected":
      query = query.eq("approval_status", "rejected");
      break;
    case "all":
    default:
      break;
  }

  const { data, error, count } = await query.range(from, to);
  if (error) {
    console.error("list_reports error", error);
    return json({ error: "list_reports_failed", details: error.message }, 500);
  }

  const total = count ?? 0;
  return json({
    reports: data ?? [],
    total,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

async function handleGetReport(supabase: SupabaseClient, body: AdminRequestBody) {
  const reportId = body.report_id;
  if (!reportId || typeof reportId !== "string") {
    return json({ error: "report_id_required" }, 400);
  }
  const { data, error } = await supabase
    .from("reports")
    .select(REPORT_SELECT)
    .eq("id", reportId)
    .maybeSingle();
  if (error) {
    console.error("get_report error", error);
    return json({ error: "get_report_failed", details: error.message }, 500);
  }
  if (!data) return json({ error: "report_not_found" }, 404);
  return json({ report: data });
}

async function handleListMunicipalities(supabase: SupabaseClient, body: AdminRequestBody) {
  const { page, pageSize, from, to } = pageParams(body, 25);
  const q = typeof body.q === "string" ? body.q.trim() : "";

  let query = supabase
    .from("municipalities")
    .select(
      "id, name, city, district, email, whatsapp_number, is_active, subscription_status, parent_municipality_id, email_notifications_enabled, email_unsubscribed_at, created_at",
      { count: "exact" },
    )
    .order("city", { ascending: true })
    .order("district", { ascending: true })
    .order("name", { ascending: true });

  if (q) {
    query = query.or(
      `name.ilike.%${q}%,city.ilike.%${q}%,district.ilike.%${q}%,email.ilike.%${q}%`,
    );
  }
  if (typeof body.email_notifications_enabled === "boolean") {
    query = query.eq("email_notifications_enabled", body.email_notifications_enabled);
  }
  if (typeof body.is_active === "boolean") {
    query = query.eq("is_active", body.is_active);
  }
  if (body.missing_email === true) {
    query = query.or("email.is.null,email.eq.");
  }

  const { data, error, count } = await query.range(from, to);
  if (error) {
    console.error("list_municipalities error", error);
    return json({ error: "list_municipalities_failed", details: error.message }, 500);
  }
  const total = count ?? 0;
  return json({
    municipalities: data ?? [],
    total,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

async function handleUpdateMunicipality(supabase: SupabaseClient, body: AdminRequestBody) {
  const id = typeof body.municipality_id === "string" ? body.municipality_id.trim() : "";
  if (!id) return json({ error: "municipality_id_required" }, 400);

  const patch: Record<string, unknown> = {};
  if ("email" in body) patch.email = body.email === "" ? null : body.email ?? null;
  if ("whatsapp_number" in body) {
    patch.whatsapp_number = body.whatsapp_number === "" ? null : body.whatsapp_number ?? null;
  }
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;

  if (typeof body.email_notifications_enabled === "boolean") {
    patch.email_notifications_enabled = body.email_notifications_enabled;
    patch.email_unsubscribed_at = body.email_notifications_enabled
      ? null
      : new Date().toISOString();
  }

  if (Object.keys(patch).length === 0) {
    return json({ error: "no_fields_to_update" }, 400);
  }

  const { data, error } = await supabase
    .from("municipalities")
    .update(patch)
    .eq("id", id)
    .select(
      "id, name, city, district, email, whatsapp_number, is_active, email_notifications_enabled, email_unsubscribed_at",
    )
    .maybeSingle();

  if (error) {
    console.error("update_municipality error", error);
    return json({ error: "update_municipality_failed", details: error.message }, 500);
  }
  if (!data) return json({ error: "municipality_not_found" }, 404);
  return json({ success: true, municipality: data });
}

async function handleCreateMunicipality(supabase: SupabaseClient, body: AdminRequestBody) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const city = typeof body.city === "string" ? body.city.trim() : "";
  const district = typeof body.district === "string" ? body.district.trim() : "";
  if (!name || !city || !district) {
    return json({ error: "name_city_district_required" }, 400);
  }

  const row: Record<string, unknown> = {
    name,
    city,
    district,
    email: body.email === "" || body.email == null ? null : String(body.email).trim(),
    whatsapp_number:
      body.whatsapp_number === "" || body.whatsapp_number == null
        ? null
        : String(body.whatsapp_number).trim(),
    is_active: true,
    email_notifications_enabled: true,
  };
  if (body.parent_municipality_id) {
    row.parent_municipality_id = body.parent_municipality_id;
  }

  const { data, error } = await supabase
    .from("municipalities")
    .insert(row)
    .select(
      "id, name, city, district, email, whatsapp_number, is_active, email_notifications_enabled",
    )
    .single();

  if (error) {
    console.error("create_municipality error", error);
    return json({ error: "create_municipality_failed", details: error.message }, 500);
  }
  return json({ success: true, municipality: data });
}

async function handleListDistrictEmails(supabase: SupabaseClient, body: AdminRequestBody) {
  const municipalityId =
    typeof body.municipality_id === "string" ? body.municipality_id.trim() : "";
  if (!municipalityId) return json({ error: "municipality_id_required" }, 400);

  const { data, error } = await supabase
    .from("municipality_district_emails")
    .select("id, municipality_id, district_key, email, kep_email, created_at")
    .eq("municipality_id", municipalityId)
    .order("district_key", { ascending: true });

  if (error) {
    console.error("list_district_emails error", error);
    return json({ error: "list_district_emails_failed", details: error.message }, 500);
  }
  return json({ district_emails: data ?? [] });
}

async function handleUpsertDistrictEmail(supabase: SupabaseClient, body: AdminRequestBody) {
  const municipalityId =
    typeof body.municipality_id === "string" ? body.municipality_id.trim() : "";
  const districtKey =
    typeof body.district_key === "string" ? body.district_key.trim() : "";
  if (!municipalityId || !districtKey) {
    return json({ error: "municipality_id_and_district_key_required" }, 400);
  }

  const row = {
    municipality_id: municipalityId,
    district_key: districtKey,
    email: body.email === "" || body.email == null ? null : String(body.email).trim(),
    kep_email:
      body.kep_email === "" || body.kep_email == null
        ? null
        : String(body.kep_email).trim(),
  };

  const { data, error } = await supabase
    .from("municipality_district_emails")
    .upsert(row, { onConflict: "municipality_id,district_key" })
    .select("id, municipality_id, district_key, email, kep_email, created_at")
    .single();

  if (error) {
    console.error("upsert_district_email error", error);
    return json({ error: "upsert_district_email_failed", details: error.message }, 500);
  }
  return json({ success: true, district_email: data });
}

async function handleListUsers(supabase: SupabaseClient, body: AdminRequestBody) {
  const { page, pageSize, from, to } = pageParams(body, 25);
  const q = typeof body.q === "string" ? body.q.trim() : "";
  const role = typeof body.role === "string" ? body.role.trim() : "";
  const userType = typeof body.user_type === "string" ? body.user_type.trim() : "";

  let query = supabase
    .from("profiles")
    .select(
      "id, username, full_name, role, user_type, municipality_id, city, district, total_points, level, created_at, updated_at, municipalities:municipality_id ( id, name )",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (q) query = query.or(`username.ilike.%${q}%,full_name.ilike.%${q}%`);
  if (role) query = query.eq("role", role);
  if (userType) query = query.eq("user_type", userType);

  const { data, error, count } = await query.range(from, to);
  if (error) {
    console.error("list_users error", error);
    return json({ error: "list_users_failed", details: error.message }, 500);
  }
  const total = count ?? 0;
  return json({
    users: data ?? [],
    total,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

async function handleUpdateUser(supabase: SupabaseClient, body: AdminRequestBody) {
  const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
  if (!userId) return json({ error: "user_id_required" }, 400);

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.role === "string" && body.role.trim()) patch.role = body.role.trim();
  if (typeof body.user_type === "string" && body.user_type.trim()) {
    patch.user_type = body.user_type.trim();
  }
  if ("municipality_id" in body || "municipality_id_for_user" in body) {
    const mid = body.municipality_id_for_user !== undefined
      ? body.municipality_id_for_user
      : body.municipality_id;
    patch.municipality_id = mid === "" || mid == null ? null : mid;
  }

  const allowedKeys = Object.keys(patch).filter((k) => k !== "updated_at");
  if (allowedKeys.length === 0) {
    return json({ error: "no_fields_to_update" }, 400);
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select(
      "id, username, full_name, role, user_type, municipality_id, city, district, total_points, level, created_at, updated_at",
    )
    .maybeSingle();

  if (error) {
    console.error("update_user error", error);
    return json({ error: "update_user_failed", details: error.message }, 500);
  }
  if (!data) return json({ error: "user_not_found" }, 404);
  return json({ success: true, user: data });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  if (!ADMIN_PANEL_PASSWORD) {
    console.error("ADMIN_PANEL_PASSWORD is not configured");
    return json({ error: "server_not_configured" }, 500);
  }

  const providedPwd = req.headers.get("x-admin-password") ?? "";
  if (providedPwd !== ADMIN_PANEL_PASSWORD) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: AdminRequestBody;
  try {
    body = (await req.json()) as AdminRequestBody;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const action = body.action ?? "list";
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (action === "ping") {
      return json({ ok: true });
    }

    if (action === "stats") {
      return await handleStats(supabase);
    }

    if (action === "list_reports") {
      return await handleListReports(supabase, body);
    }

    if (action === "get_report") {
      return await handleGetReport(supabase, body);
    }

    if (action === "list_municipalities") {
      return await handleListMunicipalities(supabase, body);
    }

    if (action === "update_municipality") {
      return await handleUpdateMunicipality(supabase, body);
    }

    if (action === "create_municipality") {
      return await handleCreateMunicipality(supabase, body);
    }

    if (action === "list_district_emails") {
      return await handleListDistrictEmails(supabase, body);
    }

    if (action === "upsert_district_email") {
      return await handleUpsertDistrictEmail(supabase, body);
    }

    if (action === "list_users") {
      return await handleListUsers(supabase, body);
    }

    if (action === "update_user") {
      return await handleUpdateUser(supabase, body);
    }

    if (action === "list") {
      const { data, error } = await supabase
        .from("reports")
        .select(
          "id, created_at, category, description, address, city, district, photo_urls, municipality_id, user_id, approval_status, municipalities:municipality_id ( id, name, email, city, district )",
        )
        .eq("approval_status", "pending")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) {
        console.error("list error", error);
        return json({ error: "list_failed", details: error.message }, 500);
      }

      return json({ reports: data ?? [] });
    }

    if (action === "list_queued") {
      const { data, error } = await supabase
        .from("reports")
        .select(
          "id, created_at, approved_at, category, description, address, city, district, photo_urls, municipality_id, user_id, approval_status, email_notify_outcome, municipalities:municipality_id ( id, name, email, city, district )",
        )
        .eq("approval_status", "approved")
        .is("notified_at", null)
        .order("approved_at", { ascending: true, nullsFirst: false })
        .limit(500);

      if (error) {
        console.error("list_queued error", error);
        return json({ error: "list_queued_failed", details: error.message }, 500);
      }

      return json({ queued_reports: data ?? [] });
    }

    if (action === "list_rejected") {
      const { page, pageSize, from, to } = pageParams(body, 20);
      const idFilter = typeof body.report_id === "string" ? body.report_id.trim() : "";

      let query = supabase
        .from("reports")
        .select(
          "id, created_at, updated_at, category, description, address, city, district, photo_urls, municipality_id, user_id, approval_status, status, municipalities:municipality_id ( id, name, email, city, district )",
          { count: "exact" },
        )
        .eq("approval_status", "rejected")
        .order("updated_at", { ascending: false, nullsFirst: false });

      if (idFilter) query = query.eq("id", idFilter);

      const { data, error, count } = await query.range(from, to);

      if (error) {
        console.error("list_rejected error", error);
        return json(
          { error: "list_rejected_failed", details: error.message },
          500,
        );
      }

      const total = count ?? 0;
      const total_pages = Math.max(1, Math.ceil(total / pageSize));

      return json({
        rejected_reports: data ?? [],
        total,
        page,
        page_size: pageSize,
        total_pages,
      });
    }

    if (action === "approve" || action === "reject") {
      const reportId = body.report_id;
      if (!reportId || typeof reportId !== "string") {
        return json({ error: "report_id_required" }, 400);
      }

      const { data: reportRow, error: repErr } = await supabase
        .from("reports")
        .select(
          "id, municipality_id, address, city, district, category, description, photo_urls, user_id, approval_status",
        )
        .eq("id", reportId)
        .maybeSingle();

      if (repErr) {
        console.error("fetch report error", repErr);
        return json({ error: "fetch_failed", details: repErr.message }, 500);
      }
      if (!reportRow) {
        return json({ error: "report_not_found" }, 404);
      }
      if (reportRow.approval_status !== "pending") {
        return json(
          {
            error: "already_processed",
            approval_status: reportRow.approval_status,
          },
          409,
        );
      }

      if (action === "reject") {
        const { error: updErr } = await supabase
          .from("reports")
          .update({
            approval_status: "rejected",
            status: "rejected",
            updated_at: new Date().toISOString(),
          })
          .eq("id", reportId);
        if (updErr) {
          console.error("reject update error", updErr);
          return json(
            { error: "update_failed", details: updErr.message },
            500,
          );
        }
        return json({ success: true, action: "rejected" });
      }

      const nowIso = new Date().toISOString();
      const hasMunicipality = Boolean(reportRow.municipality_id);

      const approvePayload = hasMunicipality
        ? {
          approval_status: "approved" as const,
          approved_at: nowIso,
          updated_at: nowIso,
          status: "queued_for_dispatch",
        }
        : {
          approval_status: "approved" as const,
          approved_at: nowIso,
          updated_at: nowIso,
          status: "not_delivered",
          notified_at: nowIso,
          email_notify_outcome: "skipped_no_recipient" as const,
        };

      const { error: approveErr } = await supabase
        .from("reports")
        .update(approvePayload)
        .eq("id", reportId);
      if (approveErr) {
        console.error("approve update error", approveErr);
        return json(
          { error: "update_failed", details: approveErr.message },
          500,
        );
      }

      if (!hasMunicipality) {
        return json({
          success: true,
          action: "approved",
          email_queued_for_digest: false,
          reason: "municipality_id missing on report",
        });
      }

      return json({
        success: true,
        action: "approved",
        email_queued_for_digest: true,
      });
    }

    return json({ error: "unknown_action", action }, 400);
  } catch (err) {
    console.error("admin-reports error", err);
    return json({ error: (err as Error).message }, 500);
  }
});
