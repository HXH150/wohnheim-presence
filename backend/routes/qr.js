const express = require('express');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const supabase = require('../db/supabase');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();

function confirmUrl(token) {
  return `${process.env.BASE_URL}/confirm.html?token=${token}`;
}

// GET /api/qr/all/pdf — printable PDF with every room's QR code (admin only)
// Must be registered before /:token so "all" isn't captured as a token.
router.get('/all/pdf', adminAuth, async (req, res) => {
  const { data: rooms, error } = await supabase
    .from('rooms')
    .select('room_number, token')
    .order('room_number', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="qr-codes.pdf"');

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  doc.pipe(res);

  const perRow = 2;
  const cellWidth = 260;
  const cellHeight = 300;
  let col = 0;
  let row = 0;

  for (const room of rooms) {
    const qrDataUrl = await QRCode.toDataURL(confirmUrl(room.token), { width: 300, margin: 1 });
    const qrImage = Buffer.from(qrDataUrl.split(',')[1], 'base64');

    const x = 40 + col * cellWidth;
    const y = 40 + row * cellHeight;

    doc.image(qrImage, x, y, { width: 200 });
    doc.fontSize(16).text(`Zimmer ${room.room_number}`, x, y + 210, { width: 200, align: 'center' });

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
});

// GET /api/qr/:token — QR code PNG for a single room's confirm URL
router.get('/:token', async (req, res) => {
  const { data: room, error } = await supabase
    .from('rooms')
    .select('token')
    .eq('token', req.params.token)
    .single();

  if (error || !room) {
    return res.status(404).json({ error: 'Zimmer nicht gefunden' });
  }

  const buffer = await QRCode.toBuffer(confirmUrl(room.token), { width: 400, margin: 2 });
  res.setHeader('Content-Type', 'image/png');
  res.send(buffer);
});

module.exports = router;
