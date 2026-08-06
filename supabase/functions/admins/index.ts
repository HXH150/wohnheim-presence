import { createClient } from "npm:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";
import { corsHeaders, json } from "../_shared/cors.ts";
import { checkAdminAuth } from "../_shared/adminAuth.ts";
import { pathAfter } from "../_shared/helpers.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// GET /admins — list admins (username, created_at — never password_hash)
// POST /admins  body: { username, password } — creates a new admin account
// DELETE /admins/:id — deletes an admin (refused if it's the last one left)
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!(await checkAdminAuth(req))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const [id] = pathAfter(req, "admins");

  try {
    if (req.method === "GET" && !id) {
      const { data, error } = await supabase
        .from("admins")
        .select("id, username, created_at")
        .order("created_at", { ascending: true });

      if (error) return json({ error: error.message }, 500);
      return json(data);
    }

    if (req.method === "POST" && !id) {
      const { username, password } = await req.json();
      if (!username || !String(username).trim() || !password) {
        return json({ error: "Benutzername und Passwort erforderlich" }, 400);
      }
      if (String(password).length < 8) {
        return json({ error: "Passwort muss mindestens 8 Zeichen lang sein" }, 400);
      }

      const password_hash = await bcrypt.hash(password, 10);
      const { data, error } = await supabase
        .from("admins")
        .insert({ username: String(username).trim(), password_hash })
        .select("id, username, created_at")
        .single();

      if (error) {
        const message = error.code === "23505"
          ? "Dieser Benutzername existiert bereits"
          : error.message;
        return json({ error: message }, 500);
      }

      return json(data, 201);
    }

    if (req.method === "DELETE" && id) {
      const { count, error: countError } = await supabase
        .from("admins")
        .select("id", { count: "exact", head: true });

      if (countError) return json({ error: countError.message }, 500);
      if ((count ?? 0) <= 1) {
        return json({ error: "Der letzte Admin kann nicht gelöscht werden" }, 400);
      }

      const { error } = await supabase.from("admins").delete().eq("id", id);
      if (error) return json({ error: error.message }, 500);

      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
