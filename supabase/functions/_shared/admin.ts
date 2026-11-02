// Shared gate for the review Edge Functions behind dev-deals and
// dev-recipes. They used to accept anyone holding the public app key,
// which was fine while those pages only ran on localhost; with the pages
// on the live site (2026-11-02) every one of them must check that the
// caller is signed in as an admin (public.admins, see
// migrations/20261103000000_admins.sql).
//
// Same token check as delete-account: the user always comes from the
// caller's own token, never from the request body.

// deno-lint-ignore no-explicit-any
type AdminClient = any;

// Returns null when the caller is an admin, otherwise the response to
// send back (401 not signed in, 403 signed in but not an admin).
export async function requireAdmin(req: Request, supabaseAdmin: AdminClient): Promise<Response | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }
  const { data: admin, error: adminError } = await supabaseAdmin
    .from("admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (adminError) {
    return Response.json({ error: adminError.message }, { status: 500 });
  }
  if (!admin) {
    return Response.json({ error: "Not allowed." }, { status: 403 });
  }
  return null;
}
