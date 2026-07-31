-- ==================================================================
-- supabase-schema.sql
-- 「あ。展」データベーススキーマ
--
-- 使い方:
--   Supabaseプロジェクトの SQL Editor にこの内容を貼り付けて実行してください。
--   実行後、config.js に発行された URL / anon key を設定します。
-- ==================================================================

-- 拡張機能（UUID生成用）
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------
-- exhibits: 展示（投稿）テーブル
-- ------------------------------------------------------------------
create table if not exists public.exhibits (
  id             uuid primary key default gen_random_uuid(),
  display_number text not null,               -- 例: "A-0047"
  title          text not null,
  description    text not null default '',
  original_text  text not null,               -- 投稿された元テキスト
  category       text not null default 'その他',
  tags           text[] not null default '{}',
  empathy_count  integer not null default 0,
  report_count   integer not null default 0,  -- 参考値。実カウントは reports テーブル
  status         text not null default 'published'
                   check (status in ('published', 'under_review', 'hidden')),
  hidden         boolean not null default false,
  deleted        boolean not null default false,
  created_at     timestamptz not null default now()
);

create index if not exists idx_exhibits_created_at on public.exhibits (created_at desc);
create index if not exists idx_exhibits_empathy on public.exhibits (empathy_count desc);
create index if not exists idx_exhibits_category on public.exhibits (category);
create index if not exists idx_exhibits_visible
  on public.exhibits (hidden, deleted, status);

-- ------------------------------------------------------------------
-- reports: 通報テーブル
-- ------------------------------------------------------------------
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  exhibit_id  uuid not null references public.exhibits (id) on delete cascade,
  reason      text not null
                check (reason in ('不適切', '誹謗中傷', '個人情報', 'その他')),
  created_at  timestamptz not null default now()
);

create index if not exists idx_reports_exhibit on public.reports (exhibit_id);

-- ------------------------------------------------------------------
-- 共感（あ。）のアトミック加算用RPC
-- クライアントからは read-modify-write ではなくこのRPCを呼ぶことで
-- 同時アクセス時の競合を避ける。
-- ------------------------------------------------------------------
create or replace function public.increment_empathy(row_id uuid)
returns public.exhibits
language plpgsql
security definer
as $$
declare
  updated_row public.exhibits;
begin
  update public.exhibits
     set empathy_count = empathy_count + 1
   where id = row_id
  returning * into updated_row;

  return updated_row;
end;
$$;

-- ------------------------------------------------------------------
-- 通報5件以上で自動的に「審査中」にするトリガー
-- （client側 reportExhibit() でも同等のチェックを行うが、DB側でも
--   保険として担保しておく）
-- ------------------------------------------------------------------
create or replace function public.check_report_threshold()
returns trigger
language plpgsql
security definer
as $$
declare
  total_reports integer;
begin
  select count(*) into total_reports
    from public.reports
   where exhibit_id = new.exhibit_id;

  if total_reports >= 5 then
    update public.exhibits
       set status = 'under_review'
     where id = new.exhibit_id
       and status = 'published';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_report_threshold on public.reports;
create trigger trg_check_report_threshold
  after insert on public.reports
  for each row execute function public.check_report_threshold();

-- ------------------------------------------------------------------
-- Row Level Security
-- 試作段階の方針:
--   - 一般ユーザー（anon）は「公開・非表示でない・削除されていない」
--     展示のみ SELECT できる
--   - 一般ユーザーは INSERT（投稿）と 通報INSERT ができる
--   - UPDATE / DELETE は anon には許可しない
--     （admin.js は anon キーのまま更新しているため、本番では
--      Supabase Authenticationでadminロールを発行し、
--      管理系の更新はそのロールのみ許可するポリシーに置き換えること。
--      auth.js のコメント参照）
-- ------------------------------------------------------------------
alter table public.exhibits enable row level security;
alter table public.reports enable row level security;

drop policy if exists "public can read visible exhibits" on public.exhibits;
create policy "public can read visible exhibits"
  on public.exhibits for select
  using (hidden = false and deleted = false and status = 'published');

drop policy if exists "public can insert exhibits" on public.exhibits;
create policy "public can insert exhibits"
  on public.exhibits for insert
  with check (true);

-- 【暫定】管理画面からの更新を anon キーで許すポリシー。
-- 本番では Supabase Authentication 移行後、
-- 「admin ロールのみ update 可」に絞り込むこと。
drop policy if exists "temporary anon update for admin console" on public.exhibits;
create policy "temporary anon update for admin console"
  on public.exhibits for update
  using (true)
  with check (true);

drop policy if exists "public can insert reports" on public.reports;
create policy "public can insert reports"
  on public.reports for insert
  with check (true);

-- 【暫定】管理画面が通報一覧を読めるように anon read を許可。
-- 本番では admin ロールのみに絞り込むこと。
drop policy if exists "temporary anon read reports" on public.reports;
create policy "temporary anon read reports"
  on public.reports for select
  using (true);

-- 管理画面（非表示・削除済みを含む）用の read も暫定的に anon 許可。
-- 本番では admin ロール専用ポリシーに置き換える。
drop policy if exists "temporary anon read all exhibits for admin" on public.exhibits;
create policy "temporary anon read all exhibits for admin"
  on public.exhibits for select
  using (true);

-- ------------------------------------------------------------------
-- Realtime有効化（gallery.js の subscribeExhibits で使用）
-- Supabaseダッシュボード > Database > Replication からも設定可能
-- ------------------------------------------------------------------
alter publication supabase_realtime add table public.exhibits;
