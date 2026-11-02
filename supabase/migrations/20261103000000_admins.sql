-- Who can use the review pages (dev-deals, dev-recipes) on the live site
-- (Anabelle, 2026-11-02: review and approve deals from her phone when
-- she's away from home). Every review Edge Function checks the caller's
-- own sign-in against this table (functions/_shared/admin.ts); the pages
-- read it only to decide whether to show themselves.
--
-- Signed-in users can see their own row and nothing else, so the app can
-- ask "am I an admin?" without listing anyone. Only the service role
-- adds or removes admins.
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

create policy "admins can read their own row"
  on public.admins for select
  to authenticated
  using (user_id = auth.uid());

-- Anabelle's two accounts.
insert into public.admins (user_id)
select id from auth.users
where email in ('anabelle.dubois@icloud.com', 'admin@extradesigners.com')
on conflict do nothing;
