require('dotenv').config();

const express = require('express');
const cors = require('cors');

const confirmRoutes = require('./routes/confirm');
const roomsRoutes = require('./routes/rooms');
const qrRoutes = require('./routes/qr');
const adminRoutes = require('./routes/admin');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/confirm', confirmRoutes);
app.use('/api/rooms', roomsRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/admin', adminRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Wohnheim Präsenzbestätigung API läuft auf Port ${PORT}`);
});
