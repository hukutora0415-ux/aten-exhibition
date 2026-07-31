/**
 * gallery.js
 * ------------------------------------------------------------------
 * gallery.html（ONLINE GALLERY）のロジック。
 * - 展示一覧の取得・描画・並び替え・カテゴリー絞り込み
 * - 「あ。」共感ボタン（ローカルストレージで1人1回を制御）
 * - 通報モーダル
 * - 人気ランキング TOP10（リアルタイム更新）
 * ------------------------------------------------------------------
 */

import { CONFIG } from "./config.js";
import {
  fetchExhibits,
  fetchRanking,
  incrementEmpathy,
  reportExhibit,
  isConfigured,
  subscribeExhibits,
} from "./supabase.js";

const grid = document.getElementById("exhibit-grid");
const rankingList = document.getElementById("ranking-list");
const sortTabs = document.getElementById("sort-tabs");
const categoryFilter = document.getElementById("category-filter");

let currentSort = "new";
let currentCategory = "";
let cachedExhibits = [];

init();

async function init() {
  if (!isConfigured()) {
    grid.innerHTML = emptyState(
      "Supabaseが未設定です。config.js に接続情報を設定すると、展示がここに表示されます。"
    );
    rankingList.innerHTML = "";
    return;
  }

  sortTabs.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-sort]");
    if (!btn) return;
    currentSort = btn.dataset.sort;
    [...sortTabs.querySelectorAll("button")].forEach((b) =>
      b.classList.toggle("active", b === btn)
    );
    loadExhibits();
  });

  categoryFilter.addEventListener("change", () => {
    currentCategory = categoryFilter.value;
    loadExhibits();
  });

  await loadExhibits();
  await loadRanking();

  // リアルタイム更新（新規投稿・共感数の変化を反映）
  subscribeExhibits(() => {
    loadExhibits();
    loadRanking();
  });
}

async function loadExhibits() {
  const data = await fetchExhibits({ sort: currentSort, category: currentCategory || null });
  cachedExhibits = data;
  renderCategoryOptions(data);
  renderGrid(data);
}

async function loadRanking() {
  const top = await fetchRanking(10);
  renderRanking(top);
}

function renderCategoryOptions(data) {
  const existing = new Set([...categoryFilter.options].map((o) => o.value));
  const categories = [...new Set(data.map((d) => d.category).filter(Boolean))];
  for (const cat of categories) {
    if (!existing.has(cat)) {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      categoryFilter.appendChild(opt);
    }
  }
  categoryFilter.value = currentCategory;
}

function renderGrid(data) {
  if (data.length === 0) {
    grid.innerHTML = emptyState("まだ展示がありません。最初の「あ。」を投稿してみてください。");
    return;
  }

  grid.innerHTML = data.map(cardTemplate).join("");

  grid.querySelectorAll("[data-empathy-id]").forEach((btn) => {
    const id = btn.dataset.empathyId;
    if (hasEmpathized(id)) markEmpathized(btn);
    btn.addEventListener("click", () => handleEmpathy(id, btn));
  });

  grid.querySelectorAll("[data-report-id]").forEach((btn) => {
    btn.addEventListener("click", () => openReportPrompt(btn.dataset.reportId));
  });
}

function cardTemplate(ex) {
  const empathized = hasEmpathized(ex.id);
  const isUnderReview = ex.status === "under_review";
  return `
  <article class="exhibit-card fade-in">
    <div class="num">${escapeHtml(ex.display_number)} ${
      isUnderReview ? '<span class="status-flag">審査中</span>' : ""
    }</div>
    <h3>${escapeHtml(ex.title)}</h3>
    <p class="desc">${escapeHtml(ex.description)}</p>
    <div class="meta">
      <span class="category-badge">${escapeHtml(ex.category)}</span>
      ${(ex.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
    </div>
    <div class="card-footer">
      <span>${formatDate(ex.created_at)}</span>
      <div style="display:flex; align-items:center; gap:.8rem;">
        <button class="report-link" data-report-id="${ex.id}">通報</button>
        <button class="empathy-btn ${empathized ? "done" : ""}" data-empathy-id="${ex.id}" ${
          empathized ? "disabled" : ""
        }>
          あ。 <span class="count">${ex.empathy_count ?? 0}</span>
        </button>
      </div>
    </div>
  </article>`;
}

async function handleEmpathy(id, btn) {
  if (hasEmpathized(id)) return;
  btn.disabled = true;
  try {
    const updated = await incrementEmpathy(id);
    saveEmpathized(id);
    markEmpathized(btn, updated?.empathy_count);
  } catch (err) {
    console.error(err);
    btn.disabled = false;
  }
}

function markEmpathized(btn, count) {
  btn.classList.add("done", "pulse");
  btn.disabled = true;
  if (count !== undefined) {
    btn.querySelector(".count").textContent = count;
  }
  setTimeout(() => btn.classList.remove("pulse"), 500);
}

/* ── 通報 ─────────────────────────────────────────────── */
const REPORT_REASONS = ["不適切", "誹謗中傷", "個人情報", "その他"];

function openReportPrompt(id) {
  const reasonList = REPORT_REASONS.map((r, i) => `${i + 1}. ${r}`).join("\n");
  const input = window.prompt(
    `通報理由を番号で選択してください:\n${reasonList}`,
    "1"
  );
  if (input === null) return;
  const idx = parseInt(input, 10) - 1;
  const reason = REPORT_REASONS[idx];
  if (!reason) {
    window.alert("有効な番号を入力してください。");
    return;
  }
  submitReport(id, reason);
}

async function submitReport(id, reason) {
  try {
    await reportExhibit(id, reason);
    window.alert("通報を受け付けました。ご協力ありがとうございます。");
    loadExhibits();
  } catch (err) {
    console.error(err);
    window.alert("通報の送信に失敗しました。");
  }
}

/* ── ランキング描画 ───────────────────────────────────── */
const MEDALS = ["🥇", "🥈", "🥉"];

function renderRanking(data) {
  if (data.length === 0) {
    rankingList.innerHTML = `<li class="empty-state" style="grid-column:1/-1;">まだランキングデータがありません。</li>`;
    return;
  }
  rankingList.innerHTML = data
    .map(
      (ex, i) => `
    <li>
      <span class="rank-medal">${MEDALS[i] ?? ""}</span>
      <span class="rank-num">${escapeHtml(ex.display_number)}</span>
      <span class="rank-title">${escapeHtml(ex.title)}</span>
      <span class="rank-count">あ。 ${ex.empathy_count ?? 0}</span>
    </li>`
    )
    .join("");
}

/* ── ローカルストレージによる1人1回制御 ─────────────────── */
function getEmpathizedSet() {
  try {
    const raw = localStorage.getItem(CONFIG.EMPATHY.STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}
function hasEmpathized(id) {
  return getEmpathizedSet().has(String(id));
}
function saveEmpathized(id) {
  const set = getEmpathizedSet();
  set.add(String(id));
  localStorage.setItem(CONFIG.EMPATHY.STORAGE_KEY, JSON.stringify([...set]));
}

/* ── ユーティリティ ───────────────────────────────────── */
function emptyState(msg) {
  return `<div class="empty-state" style="grid-column: 1 / -1;">${escapeHtml(msg)}</div>`;
}
function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
