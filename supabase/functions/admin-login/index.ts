import { createClient } from "npm:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";
import { corsHeaders, json } from "../_shared/cors.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// POST /admin-login  body: { username, password } — returns ok so the
// frontend knows the credentials are correct before storing them for
// subsequent x-admin-username / x-admin-password headers.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Not found" }, 404);
  }

  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return json({ error: "Benutzername und Passwort erforderlich" }, 400);
    }

    const { data: admin, error } = await supabase
      .from("admins")
      .select("password_hash")
      .eq("username", username)
      .single();

    if (error || !admin) {
      return json({ error: "Falscher Benutzername oder Passwort" }, 401);
    }

    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) {
      return json({ error: "Falscher Benutzername oder Passwort" }, 401);
    }

    return json({ ok: true });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
