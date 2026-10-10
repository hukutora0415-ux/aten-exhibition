/**
 * supabase.js
 * ------------------------------------------------------------------
 * Supabase クライアントの初期化と、展示データ／通報データへの
 * アクセスをまとめたモジュール。
 * ------------------------------------------------------------------
 */

import { CONFIG } from "./config.js";

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

let client = null;
let configured = false;

export function getClient() {
  if (client) return client;

  const { URL, ANON_KEY } = CONFIG.SUPABASE;
  if (!URL || URL.startsWith("YOUR_") || !ANON_KEY || ANON_KEY.startsWith("YOUR_")) {
    configured = false;
    return null;
  }

  client = createClient(URL, ANON_KEY, {
    realtime: { params: { eventsPerSecond: 5 } },
  });
  configured = true;
  return client;
}

export function isConfigured() {
  getClient();
  return configured;
}

export async function getNextDisplayNumber() {
  const supabase = getClient();
  if (!supabase) return "A-0000";

  const { count, error } = await supabase
    .from(CONFIG.SUPABASE.TABLE)
    .select("id", { count: "exact", head: true });

  if (error) {
    console.error("[supabase] 展示数の取得に失敗:", error);
    return "A-0000";
  }
  const next = (count ?? 0) + 1;
  return `A-${String(next).padStart(4, "0")}`;
}

export async function insertExhibit({
  display_number,
  title,
  description,
  original_text,
  category,
  tags,
}) {
  const supabase = getClient();
  if (!supabase) {
    throw new Error(
      "Supabaseが未設定です。config.js の SUPABASE.URL / ANON_KEY を設定してください。"
    );
  }

  const { data, error } = await supabase
    .from(CONFIG.SUPABASE.TABLE)
    .insert([
      {
        display_number,
        title,
        description,
        original_text,
        category,
        tags,
        empathy_count: 0,
        report_count: 0,
        hidden: false,
        deleted: false,
        status: "published",
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function fetchExhibits({
  sort = "new",
  category = null,
  includeHidden = false,
  includeDeleted = false,
  limit = 200,
} = {}) {
  const supabase = getClient();
  if (!supabase) return [];

  let query = supabase.from(CONFIG.SUPABASE.TABLE).select("*").limit(limit);

  if (!includeDeleted) query = query.eq("deleted", false);
  if (!includeHidden) {
    query = query.eq("hidden", false).eq("status", "published");
  }
  if (category) query = query.eq("category", category);

  if (sort === "popular") {
    query = query.order("empathy_count", { ascending: false });
  } else if (sort === "category") {
    query = query.order("category", { ascending: true }).order("created_at", {
      ascending: false,
    });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const { data, error } = await query;
  if (error) {
    console.error("[supabase] 展示一覧の取得に失敗:", error);
    return [];
  }
  return data ?? [];
}

export async function fetchRanking(limit = 10) {
  return fetchExhibits({ sort: "popular", limit });
}

export async function incrementEmpathy(id) {
  const supabase = getClient();
  if (!supabase) throw new Error("Supabase未設定");

  const { data, error } = await supabase.rpc("increment_empathy", { row_id: id });
  if (!error) return data;

  console.warn("[supabase] RPC未使用、フォールバックで加算します:", error.message);
  const { data: row, error: fetchErr } = await supabase
    .from(CONFIG.SUPABASE.TABLE)
    .select("empathy_count")
    .eq("id", id)
    .single();
  if (fetchErr) throw fetchErr;

  const newCount = (row?.empathy_count ?? 0) + 1;
  const { data: updated, error: updateErr } = await supabase
    .from(CONFIG.SUPABASE.TABLE)
    .update({ empathy_count: newCount })
    .eq("id", id)
    .select()
    .single();
  if (updateErr) throw updateErr;
  return updated;
}

export async function decrementEmpathy(id) {
  const supabase = getClient();
  if (!supabase) throw new Error("Supabase未設定");

  const { data, error } = await supabase.rpc("decrement_empathy", { row_id: id });
  if (!error) return data;

  console.warn("[supabase] RPC未使用、フォールバックで減算します:", error.message);
  const { data: row, error: fetchErr } = await supabase
    .from(CONFIG.SUPABASE.TABLE)
    .select("empathy_count")
    .eq("id", id)
    .single();
  if (fetchErr) throw fetchErr;

  const newCount = Math.max(0, (row?.empathy_count ?? 0) - 1);
  const { data: updated, error: updateErr } = await supabase
    .from(CONFIG.SUPABASE.TABLE)
    .update({ empathy_count: newCount })
    .eq("id", id)
    .select()
    .single();
  if (updateErr) throw updateErr;
  return updated;
}

export async function reportExhibit(exhibitId, reason) {
  const supabase = getClient();
  if (!supabase) throw new Error("Supabase未設定");

  const { error: insertErr } = await supabase
    .from(CONFIG.SUPABASE.REPORTS_TABLE)
    .insert([{ exhibit_id: exhibitId, reason }]);
  if (insertErr) throw insertErr;

  const { count, error: countErr } = await supabase
    .from(CONFIG.SUPABASE.REPORTS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("exhibit_id", exhibitId);
  if (countErr) throw countErr;

  const threshold = 5;
  if ((count ?? 0) >= threshold) {
    await supabase
      .from(CONFIG.SUPABASE.TABLE)
      .update({ status: "under_review" })
      .eq("id", exhibitId);
  }

  return count ?? 0;
}

export async function fetchReports() {
  const supabase = getClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(CONFIG.SUPABASE.REPORTS_TABLE)
    .select("*, exhibits:exhibit_id(display_number, title, status)")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[supabase] 通報一覧の取得に失敗:", error);
    return [];
  }
  return data ?? [];
}

export async function setExhibitVisibility(id, hidden) {
  const supabase = getClient();
  if (!supabase) throw new Error("Supabase未設定");
  const { data, error } = await supabase
    .from(CONFIG.SUPABASE.TABLE)
    .update({ hidden, status: hidden ? "hidden" : "published" })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function softDeleteExhibit(id, deleted = true) {
  const supabase = getClient();
  if (!supabase) throw new Error("Supabase未設定");
  const { data, error } = await supabase
    .from(CONFIG.SUPABASE.TABLE)
    .update({ deleted })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchDashboardStats() {
  const supabase = getClient();
  if (!supabase) {
    return { total: 0, todayCount: 0, todayEmpathy: 0, reportCount: 0, top5: [] };
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [{ count: total }, { data: todayRows }, { count: reportCount }, top5] =
    await Promise.all([
      supabase
        .from(CONFIG.SUPABASE.TABLE)
        .select("id", { count: "exact", head: true })
        .eq("deleted", false),
      supabase
        .from(CONFIG.SUPABASE.TABLE)
        .select("id, empathy_count, created_at")
        .gte("created_at", todayStart.toISOString()),
      supabase
        .from(CONFIG.SUPABASE.REPORTS_TABLE)
        .select("id", { count: "exact", head: true }),
      fetchRanking(5),
    ]);

  const todayCount = todayRows?.length ?? 0;
  const todayEmpathy = todayRows?.reduce((sum, r) => sum + (r.empathy_count ?? 0), 0) ?? 0;

  return {
    total: total ?? 0,
    todayCount,
    todayEmpathy,
    reportCount: reportCount ?? 0,
    top5,
  };
}

export function subscribeExhibits(onChange) {
  const supabase = getClient();
  if (!supabase) return () => {};

  const channel = supabase
    .channel("exhibits-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: CONFIG.SUPABASE.TABLE },
      (payload) => onChange(payload)
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}
