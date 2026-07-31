# あ。展 ｜ 日常的絶望屋敷

「展示は、来場者によって完成する。」— 投稿された「あ。」の体験がAIによって展示作品に生まれ変わり、オンライン展示室へ永続的に加わっていく仕組みです。

## ディレクトリ構成

```
index.html          投稿ページ（トップ）
gallery.html         ONLINE GALLERY（展示一覧・ランキング・共感・通報）
admin.html            管理画面（要ログイン）
login.html            管理者ログイン
style.css              共通スタイル
config.js             設定（Supabase接続情報・AIエンドポイントなど）
supabase.js           Supabaseアクセス層（他のJSはここ経由でのみDBに触る）
auth.js                管理者認証（試作パスワード認証・独立モジュール）
ai-generator.js     AI展示生成（外部エンドポイント呼び出し＋ローカル簡易生成フォールバック）
script.js             index.html のロジック
gallery.js            gallery.html のロジック
admin.js               admin.html のロジック
login.js                login.html のロジック
supabase-schema.sql テーブル定義・RLS・RPC（Supabase SQL Editorで実行）
supabase/functions/generate-exhibit/index.ts  AI展示生成 Edge Function（Claude API呼び出し）
assets/                画像等の静的ファイル置き場
```

## セットアップ手順

### 1. Supabaseプロジェクトを作成

1. https://supabase.com でプロジェクトを作成
2. SQL Editor で `supabase-schema.sql` の内容を実行
   - `exhibits` / `reports` テーブル、共感加算RPC、通報しきい値トリガー、RLSポリシーが作成されます
3. Project Settings → API から `Project URL` と `anon public key` を取得

### 2. config.js を設定

```js
SUPABASE: {
  URL: "https://xxxxxxxxxxxx.supabase.co",
  ANON_KEY: "実際のanon key",
  ...
}
```

これだけで、投稿保存・展示一覧・共感ボタン・ランキング・通報・管理画面の一覧/公開/非表示/削除/復元がすべて動作します。

### 3. AI展示生成を接続する（実装済み・デプロイのみでOK）

`config.js` の `AI.ENDPOINT` が空の間は、`ai-generator.js` 内のキーワード辞書によるローカル簡易生成で代替されます（デモ用・本物のAI生成ではありません）。

本物のAI生成（Claude API）を使うためのEdge Functionは `supabase/functions/generate-exhibit/index.ts` に実装済みです。**Anthropic APIキーはこのサーバー側関数の環境変数にのみ保管され、ブラウザには一切渡りません。**

デプロイ手順:

```bash
# 1. Supabase CLIをインストール（未導入の場合）
npm install -g supabase

# 2. ログイン & プロジェクトをリンク
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>

# 3. Anthropic APIキーをシークレットとして登録
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxxxxx

# 4. デプロイ
supabase functions deploy generate-exhibit --no-verify-jwt
```

デプロイ後に発行されるURL（例: `https://xxxxxxxxxxxx.supabase.co/functions/v1/generate-exhibit`）を `config.js` の `AI.ENDPOINT` に設定すれば、投稿フォームからの生成が自動的に本物のClaudeによる生成に切り替わります（コード変更は不要）。

リクエスト/レスポンス形式:

```
POST { "text": "レポートを書き終えて保存しようとしたら全部消えた。" }
→ 200 {
  "title": "保存したつもり。",
  "description": "完成という安心感ほど、\n人を油断させるものはない。",
  "category": "大学生活",
  "tags": ["#レポート", "#締切", "#保存忘れ"]
}
```

`--no-verify-jwt` を付けているのは、未ログインの来場者が投稿するたびに呼ばれる公開エンドポイントのためです。スパム対策として、必要に応じてSupabase側のレート制限の強化を検討してください（400文字超のリクエストは関数側で拒否する実装済みです）。

### 4. 管理画面

- `login.html` にアクセスし、パスワード `0823` でログイン（`config.js` の `ADMIN.PASSWORD` で変更可能）
- これは試作実装です。本番運用前に必ずパスワードを変更するか、`auth.js` を Supabase Authentication に置き換えてください（`auth.js` 冒頭のコメントに移行手順を記載）
- 認証まわりは `auth.js` に完全に隔離してあるため、他のファイルを変更せずに認証方式だけ差し替えられます

### 5. GitHub Pagesへのデプロイ

このプロジェクトはビルドステップ不要の素のES6モジュール構成です。リポジトリ直下にこれらのファイルを置き、GitHub Pagesを有効化するだけで動作します。

## 今後、本番運用前にやっておきたいこと

- [ ] `supabase-schema.sql` 内の「temporary anon ...」ポリシーを、Supabase Authenticationのadminロール限定ポリシーに置き換える（現状は管理画面の更新・全件読み取りをanonキーで許可しているため、URLとanon keyが漏れると誰でも管理操作のAPIを叩けてしまいます）
- [ ] `ADMIN.PASSWORD` を固定値から撤廃し、`auth.js` をSupabase Authに置き換える
- [ ] `supabase functions deploy` でEdge Functionをデプロイし、`config.js` の `AI.ENDPOINT` に設定する（コードは実装済み・デプロイ待ち）
- [ ] 投稿フォームにレート制限・簡易NGワードフィルタを追加する（現状はRLSで誰でもinsertできる設計のため、スパム対策が必要です）
