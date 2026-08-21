import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { checkAdminAuth } from "../_shared/adminAuth.ts";
import { currentMonth, daysBetween, pathAfter, randomToken } from "../_shared/helpers.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// GET /rooms — all rooms with computed status + latest confirmation (admin only)
// POST /rooms  body: { room_number } (admin only)
// PUT /rooms/:id  body: { status } (admin only)
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!(await checkAdminAuth(req))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const [id] = pathAfter(req, "rooms");

  try {
    if (req.method === "GET" && !id) {
      const { data: rooms, error: roomsError } = await supabase
        .from("rooms")
        .select("id, room_number, status, token, created_at, status_changed_at")
        .order("room_number", { ascending: true });

      if (roomsError) return json({ error: roomsError.message }, 500);

      const { data: confirmations, error: confError } = await supabase
        .from("confirmations")
        .select("room_id, confirmed_at, month")
        .order("confirmed_at", { ascending: false });

      if (confError) return json({ error: confError.message }, 500);

      const latestByRoom = new Map();
      for (const c of confirmations) {
        if (!latestByRoom.has(c.room_id)) latestByRoom.set(c.room_id, c);
      }

      const now = new Date();
      const month = currentMonth();

      const result = rooms.map((room) => {
        const latest = latestByRoom.get(room.id) || null;
        const confirmedThisMonth = latest && latest.month === month;

        let status: string;
        if (room.status === "vacant") status = "danger";
        else if (room.status === "blocked") status = "blocked";
        else if (confirmedThisMonth) status = "ok";
        else status = "warn";

        const referenceDate = room.status === "vacant"
          ? (room.status_changed_at || room.created_at)
          : (latest ? latest.confirmed_at : room.created_at);

        return {
          id: room.id,
          room_number: room.room_number,
          status,
          raw_status: room.status,
          token: room.token,
          last_confirmation: latest ? latest.confirmed_at : null,
          status_changed_at: room.status_changed_at,
          days_since: referenceDate ? daysBetween(referenceDate, now) : null,
        };
      });

      return json(result);
    }

    if (req.method === "POST" && !id) {
      const { room_number } = await req.json();
      if (!room_number || !String(room_number).trim()) {
        return json({ error: "Zimmernummer erforderlich" }, 400);
      }

      const token = randomToken();

      const { data, error } = await supabase
        .from("rooms")
        .insert({ room_number: String(room_number).trim(), token })
        .select()
        .single();

      if (error) return json({ error: error.message }, 500);

      return json(data, 201);
    }

    if (req.method === "PUT" && id) {
      const { status } = await req.json();
      if (!["active", "vacant", "blocked"].includes(status)) {
        return json({ error: "Ungültiger Status" }, 400);
      }

      const { data, error } = await supabase
        .from("rooms")
        .update({ status, status_changed_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) return json({ error: error.message }, 500);

      return json(data);
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
