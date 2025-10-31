import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const PORT = process.env.PORT || 3000;
const API_PREFIX = '/api';
const TOKEN_TTL_SECONDS = Number(process.env.JWT_TTL_SECONDS || 900); // 15 min par defaut
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
if (!process.env.JWT_SECRET) {
  console.warn('[auth] JWT_SECRET is not defined. Using insecure default. Set JWT_SECRET in production.');
}
const ROLLING_SESSION = process.env.JWT_ROLLING !== 'false';
const isProd = process.env.NODE_ENV === 'production';
const cookieSecureEnv = process.env.JWT_COOKIE_SECURE;
const cookieSecure =
  cookieSecureEnv === 'true' ? true : cookieSecureEnv === 'false' ? false : isProd;
const cookieSameSite = process.env.JWT_COOKIE_SAMESITE || 'lax';
const cookieTtlSecondsRaw = Number(process.env.JWT_COOKIE_TTL_SECONDS);
const cookieTtlSeconds =
  Number.isFinite(cookieTtlSecondsRaw) && cookieTtlSecondsRaw > 0
    ? cookieTtlSecondsRaw
    : TOKEN_TTL_SECONDS;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const dataDir = path.resolve(projectRoot, process.env.DB_DIR || 'data');
const dbFile = path.join(dataDir, process.env.DB_FILE || 'schemas.db');

await fs.mkdir(dataDir, { recursive: true });
let hasBuiltClient = false;
const indexHtmlPath = path.join(distDir, 'index.html');
try {
  await fs.access(indexHtmlPath);
  hasBuiltClient = true;
} catch {
  console.warn('Aucun build statique detecte. Le serveur REST tournera sans contenu statique.');
}

const db = new Database(dbFile);
db.pragma('journal_mode = WAL');

db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS schemas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`).run();

const selectAllSchemasStmt = db.prepare(
  'SELECT id, name, created_at, updated_at FROM schemas ORDER BY updated_at DESC, id DESC'
);
const getSchemaByIdStmt = db.prepare(
  'SELECT id, name, payload, created_at, updated_at FROM schemas WHERE id = ?'
);
const getSchemaByNameStmt = db.prepare('SELECT id FROM schemas WHERE LOWER(name) = LOWER(?)');
const insertSchemaStmt = db.prepare(
  'INSERT INTO schemas (name, payload, created_at, updated_at) VALUES (?, ?, ?, ?)'
);
const updateSchemaStmt = db.prepare(
  'UPDATE schemas SET name = ?, payload = ?, updated_at = ? WHERE id = ?'
);
const deleteSchemaStmt = db.prepare('DELETE FROM schemas WHERE id = ?');

const getUserByUsernameStmt = db.prepare(
  'SELECT id, username, password_hash, created_at FROM users WHERE LOWER(username) = LOWER(?)'
);
const getUserByIdStmt = db.prepare(
  'SELECT id, username, created_at FROM users WHERE id = ?'
);
const insertUserStmt = db.prepare(
  'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)'
);

const app = express();
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    return callback(null, origin);
  },
  credentials: true
};

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

const cookieOptions = {
  httpOnly: true,
  sameSite: cookieSameSite,
  secure: cookieSecure,
  maxAge: Math.max(60, cookieTtlSeconds) * 1000,
  path: '/'
};

const clearCookieOptions = {
  httpOnly: true,
  sameSite: cookieSameSite,
  secure: cookieSecure,
  path: '/'
};

function normalizeName(name) {
  return String(name || '').trim();
}

async function ensureBootstrapUser() {
  const usernameEnv = process.env.BOOTSTRAP_USERNAME;
  const passwordEnv = process.env.BOOTSTRAP_PASSWORD;
  if (!usernameEnv && !passwordEnv) return;
  if (!usernameEnv || !passwordEnv) {
    console.warn('[auth] BOOTSTRAP_USERNAME et BOOTSTRAP_PASSWORD doivent etre definis ensemble.');
    return;
  }
  const username = normalizeName(usernameEnv);
  const password = String(passwordEnv);
  if (!username) {
    console.warn('[auth] BOOTSTRAP_USERNAME est vide apres normalisation. Aucun utilisateur cree.');
    return;
  }
  if (password.length < 6) {
    console.warn('[auth] BOOTSTRAP_PASSWORD doit contenir au moins 6 caracteres. Aucun utilisateur cree.');
    return;
  }
  const existing = getUserByUsernameStmt.get(username);
  if (existing) {
    console.log(`[auth] Utilisateur bootstrap "${username}" deja present.`);
    return;
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const createdAt = new Date().toISOString();
    insertUserStmt.run(username, hash, createdAt);
    console.log(`[auth] Utilisateur bootstrap "${username}" cree.`);
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE')) {
      console.log(`[auth] Utilisateur bootstrap "${username}" existe deja (conflit UNIQUE).`);
      return;
    }
    console.error('[auth] Echec creation utilisateur bootstrap:', err);
  }
}

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username
    },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL_SECONDS }
  );
}

function attachUser(req, res, next) {
  const token = req.cookies?.auth_token;
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = getUserByIdStmt.get(decoded.sub);
    if (!user) {
      res.clearCookie('auth_token', clearCookieOptions);
      req.user = null;
      return next();
    }
    req.user = user;
    if (ROLLING_SESSION) {
      res.cookie('auth_token', signToken(user), cookieOptions);
    }
    return next();
  } catch (err) {
    res.clearCookie('auth_token', clearCookieOptions);
    req.user = null;
    return next();
  }
}

function requireAuth(req, res, next) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentification requise' });
    return;
  }
  next();
}

await ensureBootstrapUser();

app.use(attachUser);

app.post(`${API_PREFIX}/auth/login`, async (req, res) => {
  const { username, password } = req.body || {};
  const userInput = normalizeName(username);
  const passwordInput = String(password || '');

  if (!userInput || !passwordInput) {
    res.status(400).json({ error: 'Identifiants manquants' });
    return;
  }

  const record = getUserByUsernameStmt.get(userInput);
  if (!record) {
    res.status(401).json({ error: 'Identifiant ou mot de passe invalide' });
    return;
  }

  const ok = await bcrypt.compare(passwordInput, record.password_hash);
  if (!ok) {
    res.status(401).json({ error: 'Identifiant ou mot de passe invalide' });
    return;
  }

  const user = { id: record.id, username: record.username };
  const token = signToken(user);
  res.cookie('auth_token', token, cookieOptions);
  res.json({ user });
});

app.post(`${API_PREFIX}/auth/logout`, (req, res) => {
  res.clearCookie('auth_token', clearCookieOptions);
  res.status(204).end();
});


app.post(`${API_PREFIX}/auth/users`, requireAuth, async (req, res) => {
  const { username, password } = req.body || {};
  const trimmed = normalizeName(username);
  const passwordInput = String(password || '');

  if (!trimmed || !passwordInput) {
    res.status(400).json({ error: 'Nom utilisateur et mot de passe requis.' });
    return;
  }
  if (passwordInput.length < 6) {
    res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caracteres.' });
    return;
  }
  const existing = getUserByUsernameStmt.get(trimmed);
  if (existing) {
    res.status(409).json({ error: 'Ce nom utilisateur existe deja.' });
    return;
  }
  const hash = await bcrypt.hash(passwordInput, 12);
  const createdAt = new Date().toISOString();
  insertUserStmt.run(trimmed, hash, createdAt);
  res.status(201).json({ user: { username: trimmed, created_at: createdAt } });
});

app.get(`${API_PREFIX}/auth/me`, (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'Non authentifie' });
    return;
  }
  res.json({ user: req.user });
});

app.get(`${API_PREFIX}/schemas`, (_req, res) => {
  const rows = selectAllSchemasStmt.all();
  res.json({ items: rows });
});

app.get(`${API_PREFIX}/schemas/:id`, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Identifiant invalide' });
    return;
  }
  const row = getSchemaByIdStmt.get(id);
  if (!row) {
    res.status(404).json({ error: 'Schema introuvable' });
    return;
  }
  res.json({
    id: row.id,
    name: row.name,
    created_at: row.created_at,
    updated_at: row.updated_at,
    payload: JSON.parse(row.payload)
  });
});

app.post(`${API_PREFIX}/schemas`, requireAuth, (req, res) => {
  const { id: rawId, name, payload } = req.body || {};
  const trimmed = normalizeName(name);
  if (!trimmed) {
    res.status(400).json({ error: 'Le nom du schema est obligatoire' });
    return;
  }
  if (typeof payload !== 'object' || payload === null) {
    res.status(400).json({ error: 'Payload manquant ou invalide' });
    return;
  }

  const now = new Date().toISOString();
  const stringified = JSON.stringify(payload);
  const id = Number(rawId) > 0 ? Number(rawId) : null;
  let targetId = id;

  if (!targetId) {
    const existing = getSchemaByNameStmt.get(trimmed);
    targetId = existing?.id || null;
  }

  if (targetId) {
    updateSchemaStmt.run(trimmed, stringified, now, targetId);
    const updated = getSchemaByIdStmt.get(targetId);
    res.json({
      id: updated.id,
      name: updated.name,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
      status: 'updated'
    });
    return;
  }

  const info = insertSchemaStmt.run(trimmed, stringified, now, now);
  res.status(201).json({
    id: info.lastInsertRowid,
    name: trimmed,
    created_at: now,
    updated_at: now,
    status: 'created'
  });
});

app.put(`${API_PREFIX}/schemas/:id`, requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Identifiant invalide' });
    return;
  }
  const { name, payload } = req.body || {};
  const trimmed = normalizeName(name);
  if (!trimmed) {
    res.status(400).json({ error: 'Le nom du schema est obligatoire' });
    return;
  }
  if (typeof payload !== 'object' || payload === null) {
    res.status(400).json({ error: 'Payload manquant ou invalide' });
    return;
  }
  const now = new Date().toISOString();
  const target = getSchemaByIdStmt.get(id);
  if (!target) {
    res.status(404).json({ error: 'Schema introuvable' });
    return;
  }
  updateSchemaStmt.run(trimmed, JSON.stringify(payload), now, id);
  res.json({
    id,
    name: trimmed,
    created_at: target.created_at,
    updated_at: now,
    status: 'updated'
  });
});

app.delete(`${API_PREFIX}/schemas/:id`, requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Identifiant invalide' });
    return;
  }
  const target = getSchemaByIdStmt.get(id);
  if (!target) {
    res.status(404).json({ error: 'Schema introuvable' });
    return;
  }
  deleteSchemaStmt.run(id);
  res.status(204).end();
});

if (hasBuiltClient) {
  app.use(express.static(distDir, { extensions: ['html'] }));
  app.get('*', (_req, res, next) => {
    if (!hasBuiltClient) {
      next();
      return;
    }
    res.sendFile(indexHtmlPath);
  });
}

app.listen(PORT, () => {
  console.log(`Graph_Cond server up on port ${PORT}`);
});
