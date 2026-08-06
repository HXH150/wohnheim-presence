import { corsHeaders, json } from "../_shared/cors.ts";

// POST /admin-login  body: { password } — returns ok so the frontend knows
// the password is correct before storing it for subsequent x-admin-password headers.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Not found" }, 404);
  }

  try {
    const { password } = await req.json();
    if (password && password === Deno.env.get("ADMIN_PASSWORD")) {
      return json({ ok: true });
    }
    return json({ error: "Falsches Passwort" }, 401);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
