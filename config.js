/**
 * config.js
 * ------------------------------------------------------------------
 * 「あ。展」サイト全体の設定ファイル。
 *
 * このファイルに Supabase の接続情報や AI 生成エンドポイントを
 * 設定してください。値が未設定の間は、各モジュールが
 * フォールバック動作（ローカル簡易生成・保存無効など）で動きます。
 *
 * 本番運用前にやること：
 *   1. SUPABASE.URL / SUPABASE.ANON_KEY を実際の値に置き換える
 *   2. supabase-schema.sql を Supabase の SQL Editor で実行する
 *   3. AI.ENDPOINT を用意する（推奨：Supabase Edge Function 経由で
 *      Anthropic API を呼び出すプロキシ。API キーをブラウザに
 *      直接置かないこと）
 *   4. ADMIN_PASSWORD を変更する、または auth.js を
 *      Supabase Authentication に置き換える（auth.js 参照）
 * ------------------------------------------------------------------
 */

export const CONFIG = {
  // ── Supabase ──────────────────────────────────────────────
  SUPABASE: {
    // 例: "https://xxxxxxxxxxxx.supabase.co"
    URL: "YOUR_SUPABASE_URL",
    // anon / public key（RLS前提。service_role キーは絶対に使わない）
    ANON_KEY: "YOUR_SUPABASE_ANON_KEY",
    TABLE: "exhibits",
    REPORTS_TABLE: "reports",
  },

  // ── AI展示生成 ────────────────────────────────────────────
  AI: {
    // 未設定（空文字）の場合は ai-generator.js 内のローカル簡易
    // 生成ロジック（キーワード辞書ベース）にフォールバックします。
    // 本番では、Anthropic API キーを隠すためのサーバー/Edge Function
    // の URL をここに設定してください。
    // 例: "https://xxxxxxxxxxxx.supabase.co/functions/v1/generate-exhibit"
    ENDPOINT: "",
    TIMEOUT_MS: 15000,
  },

  // ── 管理者認証（試作実装） ───────────────────────────────
  // auth.js 側で参照。将来的に Supabase Authentication へ移行する際は
  // auth.js の実装だけを差し替えれば良い構成にしてあります。
  ADMIN: {
    PASSWORD: "0823",
    SESSION_KEY: "aten_admin_session",
    SESSION_TTL_MS: 1000 * 60 * 60 * 4, // 4時間
  },

  // ── 通報しきい値 ─────────────────────────────────────────
  REPORT: {
    AUTO_REVIEW_THRESHOLD: 5,
  },

  // ── 共感ボタン制御（ローカルストレージキー） ─────────────
  EMPATHY: {
    STORAGE_KEY: "aten_empathized_ids",
  },
};
