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

// Draws a QR code as vector strokes (reusing qrcode's own SVG path data,
// the same output already proven correct for the single-QR endpoint) rather
// than embedding a raster image. Embedding 288+ raster PNGs into one PDFKit
// document exhausted the Edge Function's memory limit (WORKER_RESOURCE_LIMIT)
// well before finishing — PDFKit decodes each embedded image back into raw
// pixels and keeps it referenced for the life of the document. Vector paths
// have no such per-image pixel buffer, so memory stays flat regardless of
// room count, and print quality is sharper besides.
async function drawQrVector(doc: PDFKit.PDFDocument, token: string, x0: number, y0: number, size: number) {
  const svg = await QRCode.toString(confirmUrl(token), { type: "svg", margin: 2 });
  const viewBoxMatch = svg.match(/viewBox="0 0 (\d+) \d+"/);
  const pathMatch = svg.match(/<path stroke="#000000" d="([^"]+)"/);
  if (!viewBoxMatch || !pathMatch) throw new Error("QR-SVG konnte nicht gelesen werden");
  const viewBoxSize = parseInt(viewBoxMatch[1], 10);
  const scale = size / viewBoxSize;

  doc.rect(x0, y0, size, size).fill("#ffffff");
  doc.save();
  doc.translate(x0, y0);
  doc.scale(scale);
  doc.lineWidth(1);
  doc.path(pathMatch[1]).stroke("#000000");
  doc.restore();
}

// One QR code per page, centered, with the room label printed below it —
// each page is a ready-to-print door sign.
async function buildQrPdf(rooms: RoomForQr[]): Promise<Uint8Array> {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const chunks: Uint8Array[] = [];
  doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));
  const done = new Promise<void>((resolve, reject) => {
    doc.on("end", () => resolve());
    doc.on("error", reject);
  });

  const pageWidth = doc.page.width;
  const qrSize = 320;
  const qrY = 180;

  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i];
    if (i > 0) doc.addPage();

    const x = (pageWidth - qrSize) / 2;
    await drawQrVector(doc, room.token, x, qrY, qrSize);
    doc
      .fontSize(28)
      .font("Helvetica-Bold")
      .fillColor("#000000")
      .text(`Zimmer ${room.room_number}`, 0, qrY + qrSize + 40, { width: pageWidth, align: "center" });
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
      if (!(await checkAdminAuth(req))) return json({ error: "Unauthorized" }, 401);

      const { data: rooms, error } = await supabase
        .from("rooms")
        .select("room_number, token")
        .order("room_number", { ascending: true });

      if (error) return json({ error: error.message }, 500);
      if (!rooms || rooms.length === 0) {
        return json({ error: "Keine Zimmer vorhanden" }, 400);
      }

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
