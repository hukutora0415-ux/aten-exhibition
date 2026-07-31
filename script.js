/**
 * script.js
 * ------------------------------------------------------------------
 * index.html（投稿ページ）のロジック。
 * 1. ユーザーが体験を入力
 * 2. ai-generator.js で展示データ（タイトル/説明/カテゴリ/タグ）を生成
 * 3. supabase.js 経由で保存
 * 4. 生成結果をその場でカード表示（"生きた展示会"の実感を演出）
 * ------------------------------------------------------------------
 */

import { generateExhibit } from "./ai-generator.js";
import { insertExhibit, getNextDisplayNumber, isConfigured } from "./supabase.js";

const textInput = document.getElementById("text-input");
const submitBtn = document.getElementById("submit-btn");
const statusEl = document.getElementById("form-status");
const resultSlot = document.getElementById("result-slot");

submitBtn.addEventListener("click", handleSubmit);
textInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
});

async function handleSubmit() {
  const text = textInput.value.trim();

  if (!text) {
    setStatus("あなたの「あ。」を、一文でいいので書いてください。", true);
    return;
  }
  if (text.length < 3) {
    setStatus("もう少しだけ、詳しく書いてください。", true);
    return;
  }

  toggleLoading(true);
  setStatus("展示を生成しています…");

  try {
    const generated = await generateExhibit(text);

    if (!isConfigured()) {
      // Supabase未設定時は保存せず、生成プレビューのみ表示する
      setStatus(
        "※ Supabase未接続のため、これはプレビューです。config.jsを設定すると展示室に永続保存されます。"
      );
      renderResult({
        display_number: "A-????",
        ...generated,
      });
      return;
    }

    const display_number = await getNextDisplayNumber();
    const saved = await insertExhibit({
      display_number,
      title: generated.title,
      description: generated.description,
      original_text: text,
      category: generated.category,
      tags: generated.tags,
    });

    setStatus("展示室に追加されました。");
    renderResult(saved);
    textInput.value = "";
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
  submitBtn.textContent = loading ? "生成中…" : "この「あ。」を展示する";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
