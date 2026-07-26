-- تقييم اختياري؛ لا يحتوي نص البحث أو اسم الملف أو النتيجة.
create table if not exists public.rafid_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  rating text not null check (rating in ('very_helpful','partly_helpful','not_helpful')),
  note text null check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);
alter table public.rafid_feedback enable row level security;
revoke all on public.rafid_feedback from anon;
grant insert on public.rafid_feedback to authenticated;
drop policy if exists "rafid_insert_own_feedback" on public.rafid_feedback;
create policy "rafid_insert_own_feedback" on public.rafid_feedback for insert to authenticated with check (auth.uid() = user_id);
-- لا يمنح هذا migration قراءة عامة أو تحديثًا أو حفظًا للتحليل.
