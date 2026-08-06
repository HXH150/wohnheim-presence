const express = require('express');
const supabase = require('../db/supabase');

const router = express.Router();

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// GET /api/confirm/:token — look up room by token (used by confirm page on load)
router.get('/:token', async (req, res) => {
  const { data: room, error } = await supabase
    .from('rooms')
    .select('room_number, status')
    .eq('token', req.params.token)
    .single();

  if (error || !room) {
    return res.status(404).json({ error: 'Zimmer nicht gefunden' });
  }

  res.json({ room_number: room.room_number, status: room.status, month: currentMonth() });
});

// POST /api/confirm  body: { token, action: "confirm" | "moved_out" }
router.post('/', async (req, res) => {
  const { token, action } = req.body;

  if (!token || !['confirm', 'moved_out'].includes(action)) {
    return res.status(400).json({ error: 'Ungültige Anfrage' });
  }

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('id, room_number')
    .eq('token', token)
    .single();

  if (roomError || !room) {
    return res.status(404).json({ error: 'Zimmer nicht gefunden' });
  }

  if (action === 'moved_out') {
    const { error } = await supabase
      .from('rooms')
      .update({ status: 'vacant' })
      .eq('id', room.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true, room_number: room.room_number });
  }

  // action === 'confirm' — duplicate confirmation for same room + month is silently ignored
  const { error } = await supabase
    .from('confirmations')
    .upsert(
      { room_id: room.id, month: currentMonth() },
      { onConflict: 'room_id,month', ignoreDuplicates: true }
    );

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, room_number: room.room_number, month: currentMonth() });
});

module.exports = router;
