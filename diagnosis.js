/**
 * diagnosis.js
 * ------------------------------------------------------------------
 * diagnosis.html のロジック。
 *
 * 進行: イントロ → Stage A(Q1〜4・タイプ判定) → Stage B(確定タイプの
 * 専用3問) → Stage C(共通2問) → 結果画面
 *
 * 結果画面の「あなたの「あ。」を展示する」ボタンを押すと、診断結果
 * (タイプ・スコア・レベル)を sessionStorage に保存して index.html へ
 * 遷移する。index.html 側(script.js)はこれを読み取り、
 *   - 投稿フォームの上に診断結果バナーを表示
 *   - 投稿時に生成されるタグへ自動的に「#タイプ名」を追加
 * という形で前回のプロジェクト(投稿→AI生成→展示室)に接続する。
 * ------------------------------------------------------------------
 */

import {
  STAGE_A,
  STAGE_B,
  STAGE_C,
  LEVELS,
  RESULT_COMMENTS,
  TYPE_LABELS,
} from "./diagnosis-data.js";

const TOTAL_QUESTIONS = STAGE_A.length + 3 /* Stage B は常に3問 */ + STAGE_C.length;
const SCORE_MIN = TOTAL_QUESTIONS * 1;
const SCORE_MAX = TOTAL_QUESTIONS * 3;

const panel = document.getElementById("quiz-panel");

// ── 進行状態 ──────────────────────────────────────────────
const state = {
  stage: "intro", // intro | A | B | C | result
  indexInStage: 0,
  typeScores: { forget: 0, ruminate: 0, dull: 0, sensitive: 0, accumulate: 0, detached: 0 },
  totalScore: 0,
  confirmedType: null,
  answeredCount: 0,
};

renderIntro();

/* ------------------------------------------------------------------
 * イントロ画面
 * ------------------------------------------------------------------ */
function renderIntro() {
  panel.innerHTML = `
    <div class="quiz-intro fade-in">
      <div class="kicker" style="margin-bottom: var(--space-2);">DIAGNOSIS</div>
      <h2 style="font-family: var(--font-display); font-size:1.4rem; margin-bottom: var(--space-2);">
        あなたの「あ。度」を測る
      </h2>
      <p>
        全9問。直感で答えてください。<br />
        診断の最後に、あなた自身の「あ。」を展示室へ投稿できます。
      </p>
      <button class="btn btn-primary" id="start-btn">診断をはじめる</button>
    </div>
  `;
  document.getElementById("start-btn").addEventListener("click", () => {
    state.stage = "A";
    state.indexInStage = 0;
    renderQuestion();
  });
}

/* ------------------------------------------------------------------
 * 質問画面の描画(共通)
 * ------------------------------------------------------------------ */
function renderQuestion() {
  const { question, options } = getCurrentQuestion();

  panel.innerHTML = `
    <div class="quiz-progress">
      <span>Q${state.answeredCount + 1} / ${TOTAL_QUESTIONS}</span>
      <span>${stageLabel()}</span>
    </div>
    <div class="quiz-progress-bar">
      <div class="fill" style="width:${(state.answeredCount / TOTAL_QUESTIONS) * 100}%;"></div>
    </div>
    <div class="quiz-question fade-in">${escapeHtml(question)}</div>
    <div class="quiz-options">
      ${options
        .map(
