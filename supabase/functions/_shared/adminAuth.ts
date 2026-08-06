import { createClient } from "npm:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Each admin logs in with their own username/password (bcrypt-hashed in the
// `admins` table) instead of a single shared password. The credentials are
// re-sent as headers on every request and verified fresh each time — this
// app has no session/token infrastructure elsewhere, so this keeps the same
// simple per-request auth pattern the rest of the API already uses.
export async function checkAdminAuth(req: Request): Promise<boolean> {
  const username = req.headers.get("x-admin-username");
  const password = req.headers.get("x-admin-password");
  if (!username || !password) return false;

  const { data: admin, error } = await supabase
    .from("admins")
    .select("password_hash")
    .eq("username", username)
    .single();

  if (error || !admin) return false;

  return await bcrypt.compare(password, admin.password_hash);
}
