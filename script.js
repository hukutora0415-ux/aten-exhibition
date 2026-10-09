/**
 * script.js
 * ------------------------------------------------------------------
 * index.html（投稿ページ）のロジック。
 *
 * 【変更】AI生成(ai-generator.js)は使わない。ユーザーが直接
 * タイトル・説明文・カテゴリー・タグを入力し、そのまま展示として
 * 保存する。
 * ------------------------------------------------------------------
 */

import { insertExhibit, getNextDisplayNumber, isConfigured } from "./supabase.js";

const DIAGNOSIS_KEY = "aten_diagnosis_result";

const titleInput = document.getElementById("title-input");
const descInput = document.getElementById("desc-input");
const categorySelect = document.getElementById("category-select");
const tagsInput = document.getElementById("tags-input");
const submitBtn = document.getElementById("submit-btn");
const statusEl = document.getElementById("form-status");
const resultSlot = document.getElementById("result-slot");
const bannerSlot = document.getElementById("diagnosis-banner-slot");

submitBtn.addEventListener("click", handleSubmit);

renderDiagnosisBanner();

function renderDiagnosisBanner() {
  const result = getDiagnosisResult();
  if (!result) return;

  bannerSlot.innerHTML = `
    <div class="diagnosis-banner fade-in">
      <div class="info">
        診断結果: <strong>${escapeHtml(result.typeLabel)}</strong>
        ／ あ。度 ${result.score}(${escapeHtml(result.levelLabel)})
        ── この結果は投稿時にタグとして付与されます
      </div>
      <button id="clear-diagnosis-btn">結果を使わない</button>
    </div>
  `;

  document.getElementById("clear-diagnosis-btn").addEventListener("click", () => {
    sessionStorage.removeItem(DIAGNOSIS_KEY);
    bannerSlot.innerHTML = "";
  });
}

function getDiagnosisResult() {
  try {
    const raw = sessionStorage.getItem(DIAGNOSIS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function parseTags(raw) {
  if (!raw.trim()) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith("#") ? t : `#${t}`));
}

async function handleSubmit() {
  const title = titleInput.value.trim();
  const description = descInput.value.trim();
  const category = categorySelect.value;

  if (!title) {
    setStatus("展示タイトルを書いてください。", true);
    return;
  }
  if (!description) {
    setStatus("説明文を書いてください。", true);
    return;
  }

  let tags = parseTags(tagsInput.value);

  const diagnosis = getDiagnosisResult();
  if (diagnosis) {
    const typeTag = `#${diagnosis.typeLabel}`;
    if (!tags.includes(typeTag)) tags = [...tags, typeTag];
  }
  tags = tags.slice(0, 6);

  toggleLoading(true);
  setStatus("展示室へ送信しています…");

  try {
    if (!isConfigured()) {
      setStatus(
        "※ Supabase未接続のため、これはプレビューです。config.jsを設定すると展示室に永続保存されます。"
      );
      renderResult({
        display_number: "A-????",
        title,
        description,
        category,
        tags,
      });
      return;
    }

    const display_number = await getNextDisplayNumber();
    const saved = await insertExhibit({
      display_number,
      title,
      description,
      original_text: description,
      category,
      tags,
    });

    setStatus("展示室に追加されました。");
    renderResult(saved);
    titleInput.value = "";
    descInput.value = "";
    tagsInput.value = "";
  } catch (err) {
    console.error(err);
    setStatus(`エラーが発生しました: ${err.message}`, true);
  } finally {
    toggleLoading(false);
  }
}

function renderResult(exhibit) {
  const card = document.createElement("div");
  card.className = "result-card fade-in";
  card.innerHTML = `
    <div class="stamp">EXHIBITED</div>
    <div class="num">${escapeHtml(exhibit.display_number)}</div>
    <h3 style="font-family: var(--font-display); font-size:1.4rem; margin: .6rem 0;">
      ${escapeHtml(exhibit.title)}
    </h3>
    <p class="desc" style="white-space:pre-line;">${escapeHtml(exhibit.description)}</p>
    <div class="meta">
      <span class="category-badge">${escapeHtml(exhibit.category)}</span>
      ${(exhibit.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
    </div>
    <p style="margin-top:1.4rem;">
      <a href="gallery.html" class="btn">ONLINE GALLERYで見る →</a>
    </p>
  `;
  resultSlot.innerHTML = "";
  resultSlot.appendChild(card);
  card.scrollIntoView({ behavior: "smooth", block: "center" });
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function toggleLoading(loading) {
  submitBtn.disabled = loading;
  submitBtn.textContent = loading ? "送信中…" : "この「あ。」を展示する";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
