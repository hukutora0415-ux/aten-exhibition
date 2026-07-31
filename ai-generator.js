/**
 * ai-generator.js
 * ------------------------------------------------------------------
 * 投稿された「あ。」体験のテキストから、展示タイトル・説明・
 * カテゴリー・タグをAIで生成するモジュール。
 *
 * config.js の AI.ENDPOINT が設定されている場合は、そのエンドポイント
 * （推奨: Supabase Edge Function 経由の Anthropic API プロキシ）に
 * POST してJSONで結果を受け取る。
 *
 * 【重要】Anthropic APIキーをブラウザ側コードに直接埋め込まないこと。
 * GitHub Pages のような静的ホスティングから直接AIを呼ぶ構成にする
 * 場合は、必ずサーバーレス関数（Supabase Edge Function / Cloudflare
 * Workers 等）をプロキシとして挟み、キーはそちら側の環境変数に
 * 保管してください。
 *
 * AI.ENDPOINT が未設定の間は、下部のローカル簡易生成ロジック
 * （キーワード辞書ベース）で代替し、デモ・開発を止めない。
 * ------------------------------------------------------------------
 */

import { CONFIG } from "./config.js";

/**
 * 投稿テキストから展示データ（title, description, category, tags）を生成する。
 * @param {string} originalText
 * @returns {Promise<{title:string, description:string, category:string, tags:string[]}>}
 */
export async function generateExhibit(originalText) {
  const endpoint = CONFIG.AI.ENDPOINT?.trim();

  if (endpoint) {
    try {
      return await generateViaEndpoint(originalText, endpoint);
    } catch (err) {
      console.error("[ai-generator] エンドポイント呼び出し失敗、ローカル生成にフォールバック:", err);
      return generateLocally(originalText);
    }
  }

  return generateLocally(originalText);
}

/* ------------------------------------------------------------------
 * 外部AIエンドポイント経由の生成
 * ------------------------------------------------------------------ */
async function generateViaEndpoint(originalText, endpoint) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.AI.TIMEOUT_MS);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: originalText }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`AIエンドポイントがエラーを返しました: ${res.status}`);

    const data = await res.json();
    return normalizeAiResult(data);
  } finally {
    clearTimeout(timer);
  }
}

function normalizeAiResult(data) {
  return {
    title: String(data.title ?? "無題の「あ。」").slice(0, 40),
    description: String(data.description ?? "").slice(0, 200),
    category: String(data.category ?? "その他"),
    tags: Array.isArray(data.tags) ? data.tags.slice(0, 6).map(String) : [],
  };
}

/*
 * 【Edge Function 実装済み】
 * supabase/functions/generate-exhibit/index.ts に、Anthropic API
 * (Claude) を呼び出す実装があります。デプロイ後、そのURLを
 * config.js の AI.ENDPOINT に設定してください（README.md参照）。
 */

/* ------------------------------------------------------------------
 * ローカル簡易生成（AI未接続時のフォールバック）
 * キーワード辞書によるカテゴリー・タグ推定＋簡易な整形のみ。
 * 本物のAI生成の代わりにはならないが、デモ・開発を止めないための
 * 最低限の実装。
 * ------------------------------------------------------------------ */
const CATEGORY_RULES = [
  { category: "大学生活", keywords: ["レポート", "課題", "単位", "授業", "教授", "提出", "テスト", "試験"] },
  { category: "仕事", keywords: ["会社", "上司", "残業", "メール", "会議", "納期", "出社"] },
  { category: "交通", keywords: ["電車", "終電", "バス", "改札", "駅", "遅延", "満員"] },
  { category: "お金", keywords: ["財布", "現金", "残高", "口座", "レジ", "支払い", "料金"] },
  { category: "人間関係", keywords: ["既読", "返信", "既読スルー", "友達", "連絡", "LINE"] },
  { category: "デジタル", keywords: ["保存", "データ", "PC", "スマホ", "充電", "Wi-Fi", "アプリ"] },
  { category: "暮らし", keywords: ["家", "冷蔵庫", "洗濯", "鍵", "電気", "水道"] },
];

function guessCategory(text) {
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((k) => text.includes(k))) return rule.category;
  }
  return "日常";
}

function guessTags(text, category) {
  const tags = new Set();
  for (const rule of CATEGORY_RULES) {
    for (const k of rule.keywords) {
      if (text.includes(k)) tags.add(`#${k}`);
    }
  }
  if (tags.size === 0) tags.add(`#${category}`);
  return Array.from(tags).slice(0, 4);
}

function buildTitle(text) {
  // 文末付近の言葉を拾って「〜たつもり。」「〜がない。」のような
  // 静かな体言止め風タイトルに整形する、簡易ヒューリスティック。
  const trimmed = text.trim().replace(/[。.!！?？\s]+$/g, "");
  const short = trimmed.length > 12 ? trimmed.slice(-12) : trimmed;
  return `${short}。`;
}

function buildDescription() {
  const templates = [
    "完成という安心感ほど、\n人を油断させるものはない。",
    "気づいた時にはもう、\n取り返しがつかない場所にいた。",
    "日常は静かに、\n前触れもなく牙をむく。",
    "誰にでも起こりうる。\nだからこそ、誰にも見えていない。",
    "小さな「あ。」の積み重ねが、\nこの街の体温になっている。",
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateLocally(originalText) {
  const text = originalText.trim();
  const category = guessCategory(text);
  return {
    title: buildTitle(text),
    description: buildDescription(),
    category,
    tags: guessTags(text, category),
  };
}
