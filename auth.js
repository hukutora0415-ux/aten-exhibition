/**
 * auth.js
 * ------------------------------------------------------------------
 * 管理者認証モジュール（試作実装）。
 *
 * 現在はパスワード一致のみのローカル認証（sessionStorageにトークンを
 * 保持）です。将来 Supabase Authentication に置き換える際は、
 * このファイルの中身だけを差し替えれば admin.js / login.html 側の
 * コードは一切変更不要になるよう、下記3関数のインターフェースを
 * 固定しています:
 *
 *   - login(password)      -> Promise<boolean>
 *   - logout()              -> Promise<void>
 *   - isAuthenticated()     -> boolean
 *
 * 【Supabase Authへの移行手順（将来）】
 *   1. login() の中身を supabase.auth.signInWithPassword(...) に置換
 *   2. isAuthenticated() を supabase.auth.getSession() ベースに置換
 *   3. logout() を supabase.auth.signOut() に置換
 *   4. ADMIN.PASSWORD は不要になるので config.js から削除
 * ------------------------------------------------------------------
 */

import { CONFIG } from "./config.js";

const { SESSION_KEY, SESSION_TTL_MS, PASSWORD } = CONFIG.ADMIN;

/**
 * パスワードを検証し、成功したらセッショントークンを発行する。
 * @param {string} inputPassword
 * @returns {Promise<boolean>}
 */
export async function login(inputPassword) {
  // ここを将来 Supabase Auth の signInWithPassword に置換する。
  const ok = inputPassword === PASSWORD;
  if (ok) {
    const session = {
      issuedAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS,
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
  return ok;
}

/**
 * ログアウトしてセッションを破棄する。
 * @returns {Promise<void>}
 */
export async function logout() {
  sessionStorage.removeItem(SESSION_KEY);
}

/**
 * 現在有効な管理者セッションがあるかどうか。
 * @returns {boolean}
 */
export function isAuthenticated() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return false;

  try {
    const session = JSON.parse(raw);
    if (!session.expiresAt || Date.now() > session.expiresAt) {
      sessionStorage.removeItem(SESSION_KEY);
      return false;
    }
    return true;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return false;
  }
}

/**
 * 管理画面の各ページ先頭で呼ぶガード関数。
 * 未認証なら login.html にリダイレクトする。
 */
export function requireAuth() {
  if (!isAuthenticated()) {
    window.location.href = "login.html";
  }
}
