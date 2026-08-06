const express = require('express');

const router = express.Router();

// POST /api/admin/login  body: { password } — returns ok so the frontend
// knows the password is correct before storing it for subsequent x-admin-password headers.
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password && password === process.env.ADMIN_PASSWORD) {
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Falsches Passwort' });
});

module.exports = router;
