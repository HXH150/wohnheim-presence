import { Buffer } from "node:buffer";
import { createClient } from "npm:@supabase/supabase-js@2";
import QRCode from "npm:qrcode@1.5.4";
import PDFDocument from "npm:pdfkit@0.15.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { checkAdminAuth } from "../_shared/adminAuth.ts";
import { pathAfter } from "../_shared/helpers.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function confirmUrl(token: string) {
  return `${Deno.env.get("BASE_URL")}/confirm.html?token=${token}`;
}

type RoomForQr = { room_number: string; token: string };

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Builds a single QR code as SVG with the room label printed below it, so a
// printed/downloaded code is still identifiable once it's on the door.
async function buildQrSvg(token: string, roomNumber: string): Promise<string> {
  const size = 300;
  const labelHeight = 50;
  const qrSvg = await QRCode.toString(confirmUrl(token), {
    type: "svg",
    width: size,
    margin: 2,
  });
  const label = escapeXml(`Zimmer ${roomNumber}`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + labelHeight}" viewBox="0 0 ${size} ${size + labelHeight}">
  <rect width="${size}" height="${size + labelHeight}" fill="#ffffff"/>
  ${qrSvg}
  <text x="${size / 2}" y="${size + labelHeight / 2 + 8}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" fill="#000000">${label}</text>
</svg>`;
}

async function buildQrPdf(rooms: RoomForQr[]): Promise<Uint8Array> {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const chunks: Uint8Array[] = [];
  doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));
  const done = new Promise<void>((resolve, reject) => {
    doc.on("end", () => resolve());
    doc.on("error", reject);
  });

  const perRow = 2;
  const cellWidth = 260;
  const cellHeight = 300;
  let col = 0;
  let row = 0;

  for (const room of rooms) {
    const qrDataUrl = await QRCode.toDataURL(confirmUrl(room.token), { width: 300, margin: 1 });
    const qrImage = Buffer.from(qrDataUrl.split(",")[1], "base64");

    const x = 40 + col * cellWidth;
    const y = 40 + row * cellHeight;

    doc.image(qrImage, x, y, { width: 200 });
    doc.fontSize(16).text(`Zimmer ${room.room_number}`, x, y + 210, { width: 200, align: "center" });

    col++;
    if (col >= perRow) {
      col = 0;
      row++;
      if (row >= 2 && rooms.indexOf(room) !== rooms.length - 1) {
        doc.addPage();
        row = 0;
      }
    }
  }

  doc.end();
  await done;
  return new Uint8Array(Buffer.concat(chunks));
}

// GET /qr/all/pdf — printable PDF with every room's QR code (admin only)
// GET /qr/:token — QR code SVG (with room label below it) for a single room's confirm URL (public)
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return json({ error: "Not found" }, 404);
  }

  const rest = pathAfter(req, "qr");

  try {
    if (rest[0] === "all" && rest[1] === "pdf") {
      if (!checkAdminAuth(req)) return json({ error: "Unauthorized" }, 401);

      const { data: rooms, error } = await supabase
        .from("rooms")
        .select("room_number, token")
        .order("room_number", { ascending: true });

      if (error) return json({ error: error.message }, 500);

      const pdfBytes = await buildQrPdf(rooms);
      return new Response(pdfBytes, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="qr-codes.pdf"',
        },
      });
    }

    const token = rest[0];
    if (!token) return json({ error: "Ungültige Anfrage" }, 400);

    const { data: room, error } = await supabase
      .from("rooms")
      .select("token, room_number")
      .eq("token", token)
      .single();

    if (error || !room) {
      return json({ error: "Zimmer nicht gefunden" }, 404);
    }

    const svg = await buildQrSvg(room.token, room.room_number);
    return new Response(svg, {
      headers: { ...corsHeaders, "Content-Type": "image/svg+xml" },
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
