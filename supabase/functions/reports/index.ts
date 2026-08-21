import { Buffer } from "node:buffer";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";
import PDFDocument from "npm:pdfkit@0.15.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { checkAdminAuth } from "../_shared/adminAuth.ts";
import { currentMonth, daysBetween, pathAfter } from "../_shared/helpers.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function monthLabel(monthStr: string): string {
  const [year, month] = monthStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

// Last instant of the given month, in UTC — used as the "as of" reference
// point for last-confirmed/days-since when reporting on a past month.
function lastMomentOfMonth(monthStr: string): Date {
  const [year, month] = monthStr.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

function formatDateDe(iso: string | null): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function isValidMonth(month: string | null): month is string {
  return Boolean(month) && /^\d{4}-\d{2}$/.test(month!);
}

type ReportRow = {
  room_number: string;
  status: string;
  last_confirmed: string | null;
  days_since: number | null;
  month: string;
};

// For a past month, "last confirmed" / "days since" are computed as of the
// end of that month (not "now"), so retroactive reports stay meaningful.
// "Status" specifically reflects whether a confirmation exists for the
// requested month (room.status active/vacant/blocked is current-state only,
// since the schema doesn't keep a historical log of status changes).
async function buildReportRows(month: string): Promise<ReportRow[]> {
  const referenceDate = month === currentMonth() ? new Date() : lastMomentOfMonth(month);

  const { data: rooms, error: roomsError } = await supabase
    .from("rooms")
    .select("id, room_number, status, status_changed_at, created_at")
    .order("room_number", { ascending: true });
  if (roomsError) throw new Error(roomsError.message);

  const { data: confirmations, error: confError } = await supabase
    .from("confirmations")
    .select("room_id, confirmed_at, month")
    .lte("confirmed_at", referenceDate.toISOString())
    .order("confirmed_at", { ascending: false });
  if (confError) throw new Error(confError.message);

  const latestByRoom = new Map<string, { confirmed_at: string; month: string }>();
  const confirmedThisMonthByRoom = new Set<string>();
  for (const c of confirmations) {
    if (!latestByRoom.has(c.room_id)) latestByRoom.set(c.room_id, c);
    if (c.month === month) confirmedThisMonthByRoom.add(c.room_id);
  }

  return rooms.map((room) => {
    const latest = latestByRoom.get(room.id) || null;

    let status: string;
    if (room.status === "vacant") status = "Ausgezogen";
    else if (room.status === "blocked") status = "Gesperrt";
    else if (confirmedThisMonthByRoom.has(room.id)) status = "Bestätigt";
    else status = "Ausstehend";

    const lastConfirmed = room.status === "vacant"
      ? (room.status_changed_at || room.created_at)
      : (latest ? latest.confirmed_at : null);

    return {
      room_number: room.room_number,
      status,
      last_confirmed: lastConfirmed,
      days_since: lastConfirmed ? daysBetween(lastConfirmed, referenceDate) : null,
      month,
    };
  });
}

function buildXlsx(rows: ReportRow[], month: string): Uint8Array {
  const label = monthLabel(month);
  const sheetData = rows.map((r) => ({
    "Zimmernummer": r.room_number,
    "Status": r.status,
    "Letzte Bestätigung": formatDateDe(r.last_confirmed),
    "Tage seit Bestätigung": r.days_since ?? "–",
    "Monat": label,
  }));
  const ws = XLSX.utils.json_to_sheet(sheetData);
  ws["!cols"] = [{ wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, label.slice(0, 31));
  return new Uint8Array(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

async function buildReportPdf(rows: ReportRow[], month: string): Promise<Uint8Array> {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const chunks: Uint8Array[] = [];
  doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));
  const done = new Promise<void>((resolve, reject) => {
    doc.on("end", () => resolve());
    doc.on("error", reject);
  });

  const label = monthLabel(month);
  const generated = new Date().toLocaleString("de-DE");

  doc.fontSize(18).font("Helvetica-Bold").fillColor("#000000").text(`Monatsbericht — ${label}`);
  doc.fontSize(10).font("Helvetica").fillColor("#6b7280").text(`Erstellt am ${generated}`);
  doc.moveDown(1);

  const colX = [40, 210, 310, 410, 500];
  const colWidths = [165, 95, 95, 85, 55];
  const headers = ["Zimmer", "Status", "Letzte Bestätigung", "Tage seit Bestätigung", "Monat"];

  function drawHeader(y: number) {
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#000000");
    headers.forEach((h, i) => doc.text(h, colX[i], y, { width: colWidths[i] }));
    doc.moveTo(40, y + 14).lineTo(555, y + 14).strokeColor("#dddddd").stroke();
  }

  let y = doc.y + 6;
  drawHeader(y);
  y += 22;

  doc.font("Helvetica").fontSize(9).fillColor("#000000");
  for (const row of rows) {
    if (y > 780) {
      doc.addPage();
      y = 40;
      drawHeader(y);
      y += 22;
    }
    doc.text(row.room_number, colX[0], y, { width: colWidths[0] });
    doc.text(row.status, colX[1], y, { width: colWidths[1] });
    doc.text(formatDateDe(row.last_confirmed), colX[2], y, { width: colWidths[2] });
    doc.text(row.days_since === null ? "–" : String(row.days_since), colX[3], y, { width: colWidths[3] });
    doc.text(label, colX[4], y, { width: colWidths[4] });
    y += 18;
  }

  doc.end();
  await done;
  return new Uint8Array(Buffer.concat(chunks));
}

// GET /reports/xlsx?month=YYYY-MM — Excel export for the given month (admin only)
// GET /reports/pdf?month=YYYY-MM — PDF export for the given month (admin only)
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return json({ error: "Not found" }, 404);
  }
  if (!(await checkAdminAuth(req))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const month = url.searchParams.get("month");
  if (!isValidMonth(month)) {
    return json({ error: "Ungültiger Monat (erwartet YYYY-MM)" }, 400);
  }

  const [kind] = pathAfter(req, "reports");

  try {
    const rows = await buildReportRows(month);

    if (kind === "xlsx") {
      const bytes = buildXlsx(rows, month);
      return new Response(bytes, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="bericht-${month}.xlsx"`,
        },
      });
    }

    if (kind === "pdf") {
      const bytes = await buildReportPdf(rows, month);
      return new Response(bytes, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="bericht-${month}.pdf"`,
        },
      });
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
