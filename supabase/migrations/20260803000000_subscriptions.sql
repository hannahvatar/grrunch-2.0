-- Free vs. paid tier, made real: free tier is simply not having an active
-- subscription row (which by definition means guests -- no account, no
-- row, no lookup needed -- are always free). References auth.users
-- directly rather than public.users, since subscribing is a standalone
-- action that shouldn't require the "only created once the user saves
-- something" profile row to exist first (see public.users' own comment).
--
-- No payment processor is integrated yet (Settings > Payment is still a
-- stub) -- this models the 30-day free trial only. 'active' exists for
-- once real recurring billing exists; nothing sets it yet.
create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'trialing' check (status in ('trialing', 'active', 'expired')),
  trial_ends_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "users can view their own subscription" on public.subscriptions
  for select using (auth.uid() = user_id);

create policy "users can start their own trial" on public.subscriptions
  for insert with check (auth.uid() = user_id);
