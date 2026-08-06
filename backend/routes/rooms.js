const express = require('express');
const crypto = require('crypto');
const supabase = require('../db/supabase');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function daysBetween(from, to) {
  const ms = to.getTime() - new Date(from).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

router.use(adminAuth);

// GET /api/rooms — all rooms with computed status + latest confirmation
router.get('/', async (req, res) => {
  const { data: rooms, error: roomsError } = await supabase
    .from('rooms')
    .select('id, room_number, status, token, created_at')
    .order('room_number', { ascending: true });

  if (roomsError) return res.status(500).json({ error: roomsError.message });

  const { data: confirmations, error: confError } = await supabase
    .from('confirmations')
    .select('room_id, confirmed_at, month')
    .order('confirmed_at', { ascending: false });

  if (confError) return res.status(500).json({ error: confError.message });

  const latestByRoom = new Map();
  for (const c of confirmations) {
    if (!latestByRoom.has(c.room_id)) latestByRoom.set(c.room_id, c);
  }

  const now = new Date();
  const month = currentMonth();

  const result = rooms.map((room) => {
    const latest = latestByRoom.get(room.id) || null;
    const confirmedThisMonth = latest && latest.month === month;

    let status;
    if (room.status === 'vacant') status = 'danger';
    else if (confirmedThisMonth) status = 'ok';
    else status = 'warn';

    const referenceDate = latest ? latest.confirmed_at : room.created_at;

    return {
      id: room.id,
      room_number: room.room_number,
      status,
      token: room.token,
      last_confirmation: latest ? latest.confirmed_at : null,
      days_since: referenceDate ? daysBetween(referenceDate, now) : null,
    };
  });

  res.json(result);
});

// POST /api/rooms  body: { room_number }
router.post('/', async (req, res) => {
  const { room_number } = req.body;
  if (!room_number || !String(room_number).trim()) {
    return res.status(400).json({ error: 'Zimmernummer erforderlich' });
  }

  const token = crypto.randomBytes(16).toString('hex');

  const { data, error } = await supabase
    .from('rooms')
    .insert({ room_number: String(room_number).trim(), token })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.status(201).json(data);
});

// PUT /api/rooms/:id  body: { status }
router.put('/:id', async (req, res) => {
  const { status } = req.body;
  if (!['active', 'vacant'].includes(status)) {
    return res.status(400).json({ error: 'Ungültiger Status' });
  }

  const { data, error } = await supabase
    .from('rooms')
    .update({ status })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json(data);
});

module.exports = router;
