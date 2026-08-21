import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { currentMonth, pathAfter } from "../_shared/helpers.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// GET /confirm/:token — look up room by token (used by confirm page on load)
// POST /confirm  body: { token, action: "confirm" | "moved_out" }
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method === "GET") {
      const [token] = pathAfter(req, "confirm");
      if (!token) return json({ error: "Ungültige Anfrage" }, 400);

      const { data: room, error } = await supabase
        .from("rooms")
        .select("room_number, status")
        .eq("token", token)
        .single();

      if (error || !room) {
        return json({ error: "Zimmer nicht gefunden" }, 404);
      }

      return json({ room_number: room.room_number, status: room.status, month: currentMonth() });
    }

    if (req.method === "POST") {
      const { token, action } = await req.json();

      if (!token || !["confirm", "moved_out"].includes(action)) {
        return json({ error: "Ungültige Anfrage" }, 400);
      }

      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .select("id, room_number")
        .eq("token", token)
        .single();

      if (roomError || !room) {
        return json({ error: "Zimmer nicht gefunden" }, 404);
      }

      if (action === "moved_out") {
        const { error } = await supabase.from("rooms").update({
          status: "vacant",
          status_changed_at: new Date().toISOString(),
        }).eq(
          "id",
          room.id,
        );
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, room_number: room.room_number });
      }

      // action === "confirm" — duplicate confirmation for same room + month is silently ignored
      const { error } = await supabase
        .from("confirmations")
        .upsert(
          { room_id: room.id, month: currentMonth() },
          { onConflict: "room_id,month", ignoreDuplicates: true },
        );

      if (error) return json({ error: error.message }, 500);

      return json({ ok: true, room_number: room.room_number, month: currentMonth() });
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
