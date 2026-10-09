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
          (opt, i) =>
            `<button class="quiz-option" data-index="${i}">${escapeHtml(opt.text)}</button>`
        )
        .join("")}
    </div>
  `;

  panel.querySelectorAll(".quiz-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = parseInt(btn.dataset.index, 10);
      handleAnswer(options[i]);
    });
  });
}

function stageLabel() {
  if (state.stage === "A") return "傾向チェック";
  if (state.stage === "B") return `${TYPE_LABELS[state.confirmedType]}・深掘り`;
  if (state.stage === "C") return "最終チェック";
  return "";
}

function getCurrentQuestion() {
  if (state.stage === "A") return STAGE_A[state.indexInStage];
  if (state.stage === "B") return STAGE_B[state.confirmedType][state.indexInStage];
  if (state.stage === "C") return STAGE_C[state.indexInStage];
  return { question: "", options: [] };
}

/* ------------------------------------------------------------------
 * 回答処理
 * ------------------------------------------------------------------ */
function handleAnswer(option) {
  state.totalScore += option.score;
  state.answeredCount += 1;

  if (state.stage === "A") {
    state.typeScores[option.type] += 2; // Stage Aのみタイプ加点(+2固定)
    state.indexInStage += 1;
    if (state.indexInStage >= STAGE_A.length) {
      state.confirmedType = determineType();
      state.stage = "B";
      state.indexInStage = 0;
    }
  } else if (state.stage === "B") {
    state.indexInStage += 1;
    if (state.indexInStage >= 3) {
      state.stage = "C";
      state.indexInStage = 0;
    }
  } else if (state.stage === "C") {
    state.indexInStage += 1;
    if (state.indexInStage >= STAGE_C.length) {
      renderResult();
      return;
    }
  }

  renderQuestion();
}

function determineType() {
  let best = null;
  let bestScore = -1;
  for (const [type, score] of Object.entries(state.typeScores)) {
    if (score > bestScore) {
      bestScore = score;
      best = type;
    }
  }
  return best;
}

/* ------------------------------------------------------------------
 * 結果画面
 * ------------------------------------------------------------------ */
function renderResult() {
  const normalized = Math.round(
    ((state.totalScore - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100
  );
  const clamped = Math.max(0, Math.min(100, normalized));
  const levelIndex = LEVELS.findIndex((l) => clamped <= l.max);
  const level = LEVELS[Math.max(0, levelIndex)];
  const typeId = state.confirmedType;
  const typeLabel = TYPE_LABELS[typeId];
  const comment = RESULT_COMMENTS[typeId][Math.max(0, levelIndex)];

  // 展示ページ（index.html）に引き継ぐための結果データ
  const result = { typeId, typeLabel, score: clamped, levelLabel: level.label };
  sessionStorage.setItem("aten_diagnosis_result", JSON.stringify(result));

  panel.innerHTML = `
    <div class="result-screen fade-in">
      <div class="type-label">YOUR TYPE</div>
      <h2>${escapeHtml(typeLabel)}</h2>
      <div class="level-tag">${escapeHtml(level.label)}</div>
      <div class="score-meter"><div class="fill" style="width:${clamped}%;"></div></div>
      <div class="score-number">${clamped}<span> / 100</span></div>
      <p class="result-comment">${escapeHtml(comment)}</p>
      <a href="index.html" class="btn btn-primary" style="display:block;">
        あなたの「あ。」を展示する →
      </a>
      <p style="margin-top: var(--space-2);">
        <button class="report-link" id="retry-btn">もう一度診断する</button>
      </p>
    </div>
  `;

  document.getElementById("retry-btn").addEventListener("click", () => {
    state.stage = "intro";
    state.indexInStage = 0;
    state.answeredCount = 0;
    state.totalScore = 0;
    state.confirmedType = null;
    state.typeScores = { forget: 0, ruminate: 0, dull: 0, sensitive: 0, accumulate: 0, detached: 0 };
    renderIntro();
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
