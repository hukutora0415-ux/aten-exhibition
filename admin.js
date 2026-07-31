/**
 * admin.js
 * ------------------------------------------------------------------
 * admin.html のロジック。requireAuth() で未認証アクセスを弾いたうえで、
 * ダッシュボード統計・展示一覧管理（公開/非表示/削除/復元）・
 * 通報一覧を表示する。
 * ------------------------------------------------------------------
 */

import { requireAuth, logout } from "./auth.js";
import {
  fetchDashboardStats,
  fetchExhibits,
  fetchReports,
  setExhibitVisibility,
  softDeleteExhibit,
  isConfigured,
} from "./supabase.js";

// ── 認証ガード（未認証なら login.html へリダイレクトして以降停止） ──
requireAuth();

document.getElementById("logout-link").addEventListener("click", async (e) => {
  e.preventDefault();
  await logout();
  window.location.href = "login.html";
});

const tbody = document.getElementById("admin-tbody");
const reportsTbody = document.getElementById("reports-tbody");
const searchBox = document.getElementById("admin-search");
const adminSort = document.getElementById("admin-sort");
const tabs = document.querySelectorAll(".admin-tabs button");

let allExhibits = [];
let currentSort = "new";

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("tab-exhibits").style.display =
      tab.dataset.tab === "exhibits" ? "block" : "none";
    document.getElementById("tab-reports").style.display =
      tab.dataset.tab === "reports" ? "block" : "none";
    if (tab.dataset.tab === "reports") loadReports();
  });
});

adminSort.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-sort]");
  if (!btn) return;
  currentSort = btn.dataset.sort;
  [...adminSort.querySelectorAll("button")].forEach((b) => b.classList.toggle("active", b === btn));
  loadExhibits();
});

searchBox.addEventListener("input", () => renderTable(filterExhibits()));

init();

async function init() {
  if (!isConfigured()) {
    tbody.innerHTML = `<tr><td colspan="7">Supabaseが未設定です。config.js を設定してください。</td></tr>`;
    return;
  }
  await Promise.all([loadStats(), loadExhibits()]);
}

async function loadStats() {
  const stats = await fetchDashboardStats();
  const cells = document.querySelectorAll("#dashboard-stats .value");
  cells[0].textContent = stats.total;
  cells[1].textContent = stats.todayCount;
  cells[2].textContent = stats.todayEmpathy;
  cells[3].textContent = stats.reportCount;

  const top5 = document.getElementById("top5-list");
  const medals = ["🥇", "🥈", "🥉", "4.", "5."];
  top5.innerHTML =
    stats.top5.length === 0
      ? `<li class="empty-state" style="grid-column:1/-1;">データがありません</li>`
      : stats.top5
          .map(
            (ex, i) => `
      <li>
        <span class="rank-medal">${medals[i]}</span>
        <span class="rank-num">${escapeHtml(ex.display_number)}</span>
        <span class="rank-title">${escapeHtml(ex.title)}</span>
        <span class="rank-count">あ。 ${ex.empathy_count ?? 0}</span>
      </li>`
          )
          .join("");
}

async function loadExhibits() {
  tbody.innerHTML = `<tr><td colspan="7">読み込み中…</td></tr>`;
  allExhibits = await fetchExhibits({
    sort: currentSort,
    includeHidden: true,
    includeDeleted: true,
  });
  renderTable(filterExhibits());
}

function filterExhibits() {
  const q = searchBox.value.trim().toLowerCase();
  if (!q) return allExhibits;
  return allExhibits.filter(
    (ex) =>
      ex.title?.toLowerCase().includes(q) ||
      ex.original_text?.toLowerCase().includes(q) ||
      ex.display_number?.toLowerCase().includes(q)
  );
}

function renderTable(data) {
  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7">該当する展示がありません。</td></tr>`;
    return;
  }

  tbody.innerHTML = data
    .map((ex) => {
      const statusLabel = ex.deleted
        ? "削除済み"
        : ex.status === "under_review"
        ? "審査中"
        : ex.hidden
        ? "非表示"
        : "公開";

      return `
      <tr data-id="${ex.id}">
        <td>${escapeHtml(ex.display_number)}</td>
        <td>
          <strong>${escapeHtml(ex.title)}</strong><br />
          <span style="color:var(--text-faint); font-size:.78rem;">${escapeHtml(
            truncate(ex.original_text, 60)
          )}</span>
        </td>
        <td>${escapeHtml(ex.category)}</td>
        <td>${formatDateTime(ex.created_at)}</td>
        <td>${ex.empathy_count ?? 0}</td>
        <td>${statusLabel}</td>
        <td class="actions">
          ${
            ex.deleted
              ? `<button data-action="restore">復元</button>`
              : `
              <button data-action="publish" ${!ex.hidden ? "disabled" : ""}>公開</button>
              <button data-action="hide" ${ex.hidden ? "disabled" : ""}>非表示</button>
              <button data-action="delete">削除</button>
            `
          }
        </td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => handleAction(btn));
  });
}

async function handleAction(btn) {
  const row = btn.closest("tr");
  const id = row.dataset.id;
  const action = btn.dataset.action;

  const confirmMap = {
    delete: "この展示を削除（論理削除）しますか？あとから復元できます。",
    hide: "この展示を非表示にしますか？",
    publish: "この展示を公開しますか？",
    restore: "この展示を復元しますか？",
  };
  if (!window.confirm(confirmMap[action] ?? "実行しますか？")) return;

  try {
    if (action === "hide") await setExhibitVisibility(id, true);
    if (action === "publish") await setExhibitVisibility(id, false);
    if (action === "delete") await softDeleteExhibit(id, true);
    if (action === "restore") await softDeleteExhibit(id, false);
    await Promise.all([loadStats(), loadExhibits()]);
  } catch (err) {
    console.error(err);
    window.alert("操作に失敗しました: " + err.message);
  }
}

async function loadReports() {
  reportsTbody.innerHTML = `<tr><td colspan="4">読み込み中…</td></tr>`;
  const reports = await fetchReports();
  if (reports.length === 0) {
    reportsTbody.innerHTML = `<tr><td colspan="4">通報はありません。</td></tr>`;
    return;
  }
  reportsTbody.innerHTML = reports
    .map(
      (r) => `
    <tr>
      <td>${escapeHtml(r.exhibits?.display_number ?? "-")} ${escapeHtml(r.exhibits?.title ?? "")}</td>
      <td>${escapeHtml(r.reason)}</td>
      <td>${formatDateTime(r.created_at)}</td>
      <td>${escapeHtml(r.exhibits?.status ?? "-")}</td>
    </tr>`
    )
    .join("");
}

/* ── ユーティリティ ───────────────────────────────────── */
function truncate(str, len) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "…" : str;
}
function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate()
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(
    2,
    "0"
  )}`;
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
