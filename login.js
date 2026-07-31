/**
 * login.js
 * ------------------------------------------------------------------
 * login.html のロジック。auth.js の login() を呼ぶだけの薄い層。
 * 認証の実体を差し替える場合も、このファイルの変更は不要。
 * ------------------------------------------------------------------
 */
import { login, isAuthenticated } from "./auth.js";

const input = document.getElementById("password-input");
const btn = document.getElementById("login-btn");
const status = document.getElementById("login-status");

if (isAuthenticated()) {
  window.location.href = "admin.html";
}

btn.addEventListener("click", attemptLogin);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") attemptLogin();
});

async function attemptLogin() {
  const pw = input.value.trim();
  if (!pw) {
    status.textContent = "パスワードを入力してください。";
    status.classList.add("error");
    return;
  }

  btn.disabled = true;
  status.classList.remove("error");
  status.textContent = "確認中…";

  const ok = await login(pw);
  if (ok) {
    status.textContent = "認証成功。移動します…";
    window.location.href = "admin.html";
  } else {
    status.textContent = "パスワードが違います。";
    status.classList.add("error");
    input.value = "";
    btn.disabled = false;
  }
}
