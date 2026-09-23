-- Waitlist for people outside British Columbia (Anabelle, 2026-09-23):
-- Grrunch is BC only for now, so anyone whose location or postal code
-- lands outside BC gets a "Grrunch isn't in your area yet" modal with a
-- "Join the waitlist" button (app/components/OutsideAreaModal.tsx). This
-- is where those sign-ups land, to email people once their area opens.
--
-- Works for guests too -- the onboarding location step runs before any
-- account exists -- so inserts are open to the anon role. Nothing is
-- readable from the client at all (no select policy): it's a list of
-- email addresses, read only from the dashboard/service role.
create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- Set when a signed-in person joins, null for guests.
  user_id uuid references auth.users (id) on delete set null,
  -- Rounded to one decimal (~10 km) on the client before it's sent --
  -- enough to see which cities/provinces are asking, without storing
  -- anyone's precise location. Null when the person was placed outside
  -- BC by postal code rather than device location.
  approx_lat numeric(4, 1),
  approx_lng numeric(5, 1),
  -- Which screen they joined from: the onboarding location step or the
  -- subscribe screen.
  source text not null check (source in ('onboarding', 'upgrade')),
  created_at timestamptz not null default now()
);

-- One row per address -- joining twice is a no-op (the client treats the
-- resulting unique violation as success), not a duplicate entry.
create unique index waitlist_email_key on public.waitlist (lower(email));

alter table public.waitlist enable row level security;

create policy "anyone can join the waitlist" on public.waitlist
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
