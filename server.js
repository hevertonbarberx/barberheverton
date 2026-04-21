const express = require('express');
const session = require('express-session');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const publicDir = path.join(__dirname, 'public');
const dataFile = path.join(__dirname, 'agendamentos.json');
const SALON_WHATSAPP = '557598078753';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Heverton7'; 

app.use(express.json());
app.use(
  session({
    secret: 'barber-duo-session-secret',
    resave: false,
    saveUninitialized: false,
  })
);

app.use(express.static(publicDir));

async function ensureDataFile() {
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, '[]', 'utf-8');
  }
}

async function readBookings() {
  await ensureDataFile();
  const raw = await fs.readFile(dataFile, 'utf-8');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeBookings(bookings) {
  await fs.writeFile(dataFile, JSON.stringify(bookings, null, 2), 'utf-8');
}

function normalizeText(value) {
  return String(value || '').trim();
}

function matchQuery(bookings, query = {}) {
  const search = normalizeText(query.search).toLowerCase();
  const date = normalizeText(query.date);
  const barber = normalizeText(query.barber).toLowerCase();

  return bookings.filter((item) => {
    const haystack = [
      item.client_name,
      item.client_phone,
      item.client_email,
      item.service,
      item.date,
      item.time,
      item.barber,
      item.notes,
    ].join(' ').toLowerCase();

    if (search && !haystack.includes(search)) return false;
    if (date && item.date !== date) return false;
    if (barber && barber !== 'todos' && item.barber.toLowerCase() !== barber) return false;
    return true;
  });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.adminLoggedIn) return next();
  return res.redirect('/login');
}

app.get('/login', (req, res) => {
  res.sendFile(path.join(publicDir, 'login.html'));
});

app.post('/login', (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) {
    req.session.adminLoggedIn = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'Senha incorreta.' });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

app.get('/admin.html', requireAdmin, (req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

app.get('/api/agendamentos', async (req, res) => {
  try {
    const bookings = await readBookings();
    const filtered = matchQuery(bookings, req.query).sort((a, b) => {
      const dateA = new Date(`${a.date}T${a.time || '00:00'}`);
      const dateB = new Date(`${b.date}T${b.time || '00:00'}`);
      return dateB - dateA;
    });

    res.json(filtered);
  } catch {
    res.status(500).json({ error: 'Não foi possível ler os agendamentos.' });
  }
});

app.post('/api/agendamentos', async (req, res) => {
  try {
    const {
      client_name,
      client_phone,
      client_email = '',
      service,
      date,
      time,
      barber = 'Indiferente',
      barber_phone = SALON_WHATSAPP,
      notes = '',
    } = req.body || {};

    if (!client_name || !client_phone || !service || !date || !time) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando.' });
    }

    const bookings = await readBookings();

    const newBooking = {
      id: Date.now().toString(),
      client_name: normalizeText(client_name),
      client_phone: normalizeText(client_phone),
      client_email: normalizeText(client_email),
      service: normalizeText(service),
      date: normalizeText(date),
      time: normalizeText(time),
      barber: normalizeText(barber) || 'Indiferente',
      barber_phone: normalizeText(barber_phone),
      notes: normalizeText(notes),
      createdAt: new Date().toISOString(),
    };

    bookings.unshift(newBooking);
    await writeBookings(bookings);

    res.status(201).json({ ok: true, booking: newBooking });
  } catch {
    res.status(500).json({ error: 'Erro ao salvar o agendamento.' });
  }
});

app.delete('/api/agendamentos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const bookings = await readBookings();
    const next = bookings.filter((item) => item.id !== id);

    if (next.length === bookings.length) {
      return res.status(404).json({ error: 'Agendamento não encontrado.' });
    }

    await writeBookings(next);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Erro ao excluir o agendamento.' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});