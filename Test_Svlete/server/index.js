import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const PORT = process.env.PORT || 3000;
const API_PREFIX = '/api';
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
  CREATE TABLE IF NOT EXISTS schemas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`).run();

const selectAllStmt = db.prepare(
  'SELECT id, name, created_at, updated_at FROM schemas ORDER BY updated_at DESC, id DESC'
);
const getByIdStmt = db.prepare(
  'SELECT id, name, payload, created_at, updated_at FROM schemas WHERE id = ?'
);
const getByNameStmt = db.prepare('SELECT id FROM schemas WHERE LOWER(name) = LOWER(?)');
const insertStmt = db.prepare(
  'INSERT INTO schemas (name, payload, created_at, updated_at) VALUES (?, ?, ?, ?)'
);
const updateStmt = db.prepare(
  'UPDATE schemas SET name = ?, payload = ?, updated_at = ? WHERE id = ?'
);
const deleteStmt = db.prepare('DELETE FROM schemas WHERE id = ?');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '10mb' }));

const normalizeName = (name) => String(name || '').trim();

app.get(`${API_PREFIX}/schemas`, (_req, res) => {
  const rows = selectAllStmt.all();
  res.json({ items: rows });
});

app.get(`${API_PREFIX}/schemas/:id`, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Identifiant invalide' });
    return;
  }
  const row = getByIdStmt.get(id);
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

app.post(`${API_PREFIX}/schemas`, (req, res) => {
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
    const existing = getByNameStmt.get(trimmed);
    targetId = existing?.id || null;
  }

  if (targetId) {
    updateStmt.run(trimmed, stringified, now, targetId);
    const updated = getByIdStmt.get(targetId);
    res.json({
      id: updated.id,
      name: updated.name,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
      status: 'updated'
    });
    return;
  }

  const info = insertStmt.run(trimmed, stringified, now, now);
  res.status(201).json({
    id: info.lastInsertRowid,
    name: trimmed,
    created_at: now,
    updated_at: now,
    status: 'created'
  });
});

app.put(`${API_PREFIX}/schemas/:id`, (req, res) => {
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
  const target = getByIdStmt.get(id);
  if (!target) {
    res.status(404).json({ error: 'Schema introuvable' });
    return;
  }
  updateStmt.run(trimmed, JSON.stringify(payload), now, id);
  res.json({
    id,
    name: trimmed,
    created_at: target.created_at,
    updated_at: now,
    status: 'updated'
  });
});

app.delete(`${API_PREFIX}/schemas/:id`, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Identifiant invalide' });
    return;
  }
  const target = getByIdStmt.get(id);
  if (!target) {
    res.status(404).json({ error: 'Schema introuvable' });
    return;
  }
  deleteStmt.run(id);
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
