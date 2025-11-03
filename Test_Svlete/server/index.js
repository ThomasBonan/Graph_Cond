// ============================================================================
// server/index.js
// ----------------------------------------------------------------------------
// Express + SQLite API servant au stockage des schemas, a l'authentification
// et a la distribution du client. Toute logique de persistence (CRUD schemas,
// gestion utilisateurs, tokens JWT) est centralisee ici.
// ============================================================================
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
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
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`).run();

try {
  db.prepare('ALTER TABLE schemas ADD COLUMN archived INTEGER NOT NULL DEFAULT 0').run();
} catch (err) {
  if (!String(err.message || '').includes('duplicate column name')) {
    throw err;
  }
}

db.prepare(`
  CREATE TABLE IF NOT EXISTS schema_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schema_id INTEGER,
    name TEXT,
    action TEXT NOT NULL,
    actor TEXT,
    created_at TEXT NOT NULL,
    extra TEXT
  )
`).run();

const selectSchemasByArchivedStmt = db.prepare(
  'SELECT id, name, created_at, updated_at, archived FROM schemas WHERE archived = ? ORDER BY updated_at DESC, id DESC'
);
const selectAllSchemasStmt = db.prepare(
  'SELECT id, name, created_at, updated_at, archived FROM schemas ORDER BY updated_at DESC, id DESC'
);
const getSchemaByIdStmt = db.prepare(
  'SELECT id, name, payload, archived, created_at, updated_at FROM schemas WHERE id = ?'
);
const getSchemaByNameStmt = db.prepare('SELECT id FROM schemas WHERE LOWER(name) = LOWER(?)');
const insertSchemaStmt = db.prepare(
  'INSERT INTO schemas (name, payload, archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
);
const updateSchemaStmt = db.prepare(
  'UPDATE schemas SET name = ?, payload = ?, archived = ?, updated_at = ? WHERE id = ?'
);
const deleteSchemaStmt = db.prepare('DELETE FROM schemas WHERE id = ?');
const insertAuditStmt = db.prepare(
  'INSERT INTO schema_audit (schema_id, name, action, actor, created_at, extra) VALUES (?, ?, ?, ?, ?, ?)'
);
const selectAuditBySchemaStmt = db.prepare(
  'SELECT id, schema_id, name, action, actor, created_at, extra FROM schema_audit WHERE schema_id = ? ORDER BY created_at DESC, id DESC'
);
const selectAuditSummariesStmt = db.prepare(`
  SELECT a.schema_id,
         a.name,
         a.action,
         a.actor,
         a.created_at,
         s.id AS current_id,
         s.archived
  FROM schema_audit a
  LEFT JOIN schema_audit newer
    ON a.schema_id = newer.schema_id
   AND (a.created_at < newer.created_at OR (a.created_at = newer.created_at AND a.id < newer.id))
  LEFT JOIN schemas s ON s.id = a.schema_id
  WHERE a.schema_id IS NOT NULL AND newer.schema_id IS NULL
  ORDER BY a.created_at DESC, a.id DESC
`);

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

const bootstrapUsername = normalizeName(process.env.BOOTSTRAP_USERNAME);
const bootstrapUsernameLC = bootstrapUsername ? bootstrapUsername.toLowerCase() : null;

function isBootstrapUserAccount(user) {
  if (!bootstrapUsernameLC) return false;
  const candidate = normalizeName(user?.username);
  if (!candidate) return false;
  return candidate.toLowerCase() === bootstrapUsernameLC;
}

async function ensureBootstrapUser() {
  const usernameEnv = bootstrapUsername;
  const passwordEnv = process.env.BOOTSTRAP_PASSWORD;
  if (!usernameEnv && !passwordEnv) return;
  if (!usernameEnv || !passwordEnv) {
    console.warn('[auth] BOOTSTRAP_USERNAME et BOOTSTRAP_PASSWORD doivent etre definis ensemble.');
    return;
  }
  const username = usernameEnv;
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

function toSafeUserPayload(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    created_at: user.created_at,
    isBootstrap: isBootstrapUserAccount(user)
  };
}

function recordSchemaAudit({ schemaId, name, action, actor, extra = null }) {
  try {
    const createdAt = new Date().toISOString();
    const payload = extra ? JSON.stringify(extra) : null;
    insertAuditStmt.run(schemaId ?? null, name ?? null, action, actor ?? null, createdAt, payload);
  } catch (err) {
    console.error('[audit] echec enregistrement audit', err);
  }
}

async function computeDirectoryStats(rootDir) {
  const summary = { bytes: 0, fileCount: 0, dirCount: 0 };
  const stack = [rootDir];
  const visited = new Set();

  while (stack.length) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isSymbolicLink?.()) continue;
      if (entry.isDirectory()) {
        summary.dirCount += 1;
        stack.push(fullPath);
        continue;
      }
      try {
        const stat = await fs.stat(fullPath);
        summary.fileCount += 1;
        summary.bytes += Number(stat.size || 0);
      } catch {
        continue;
      }
    }
  }

  return summary;
}

async function getFilesystemInfo(targetDir) {
  const statfsFn = fs.statfs;
  if (typeof statfsFn !== 'function') {
    return null;
  }
  try {
    const info = await statfsFn(targetDir);
    const blockSize = Number(info?.bsize || 0);
    const blocks = Number(info?.blocks || 0);
    const freeBlocks = Number(info?.bfree || 0);
    const availBlocks = Number(info?.bavail || 0);
    const totalBytes = Number.isFinite(blockSize * blocks) ? blockSize * blocks : null;
    const freeBytes = Number.isFinite(blockSize * freeBlocks) ? blockSize * freeBlocks : null;
    const availableBytes = Number.isFinite(blockSize * availBlocks) ? blockSize * availBlocks : null;
    const usedBytes =
      totalBytes != null && freeBytes != null ? Math.max(totalBytes - freeBytes, 0) : null;
    return {
      blockSize,
      totalBytes,
      freeBytes,
      availableBytes,
      usedBytes,
      files: typeof info.files === 'number' ? info.files : null,
      freeFiles: typeof info.ffree === 'number' ? info.ffree : null
    };
  } catch (err) {
    console.warn('[health] statfs indisponible', err?.message || err);
    return null;
  }
}

async function collectSystemHealthSnapshot() {
  const hrStart =
    typeof process.hrtime?.bigint === 'function' ? process.hrtime.bigint() : null;

  let dbStats = null;
  try {
    dbStats = await fs.stat(dbFile);
  } catch (err) {
    console.warn('[health] impossible de lire la taille de la base', err?.message || err);
  }

  let directoryStats = null;
  try {
    directoryStats = await computeDirectoryStats(dataDir);
  } catch (err) {
    console.warn("[health] impossible d'inspecter le dossier data", err?.message || err);
  }

  const fsInfo = await getFilesystemInfo(dataDir);

  const pageSize = Number(db.pragma('page_size', { simple: true }) || 0);
  const pageCount = Number(db.pragma('page_count', { simple: true }) || 0);

  const memory = process.memoryUsage();
  const cpuInfo = typeof os.cpus === 'function' ? os.cpus() : null;
  const loadAverage = typeof os.loadavg === 'function' ? os.loadavg() : [];

  const snapshot = {
    serverTime: new Date().toISOString(),
    uptimeSeconds: process.uptime(),
    process: {
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      memory: {
        rss: memory.rss ?? null,
        heapTotal: memory.heapTotal ?? null,
        heapUsed: memory.heapUsed ?? null,
        external: memory.external ?? null,
        arrayBuffers: memory.arrayBuffers ?? null
      }
    },
    cpu: {
      cores: Array.isArray(cpuInfo) ? cpuInfo.length : null,
      loadAverage: Array.isArray(loadAverage) ? loadAverage : []
    },
    database: {
      path: dbFile,
      sizeBytes: dbStats?.size ?? null,
      modifiedAt: dbStats?.mtime ? new Date(dbStats.mtime).toISOString() : null,
      pageSize,
      pageCount,
      approxSizeBytes:
        pageSize && pageCount ? Number(pageSize) * Number(pageCount) : null
    },
    storage: {
      dataDir,
      blockSize: fsInfo?.blockSize ?? null,
      totalBytes: fsInfo?.totalBytes ?? null,
      freeBytes: fsInfo?.freeBytes ?? null,
      availableBytes: fsInfo?.availableBytes ?? null,
      usedBytes: fsInfo?.usedBytes ?? null,
      files: directoryStats?.fileCount ?? null,
      directories: directoryStats?.dirCount ?? null,
      contentBytes: directoryStats?.bytes ?? null
    },
    paths: {
      projectRoot,
      dataDir,
      dbFile
    }
  };

  if (hrStart) {
    const diff = process.hrtime.bigint() - hrStart;
    snapshot.serverProcessingMs = Number(diff / BigInt(1_000_000));
  } else {
    snapshot.serverProcessingMs = null;
  }

  return snapshot;
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
    const safeUser = toSafeUserPayload(user);
    req.user = safeUser;
    if (ROLLING_SESSION) {
      res.cookie('auth_token', signToken(safeUser), cookieOptions);
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

  const user = toSafeUserPayload(record);
  const token = signToken(user);
  res.cookie('auth_token', token, cookieOptions);
  res.json({ user });
});

app.post(`${API_PREFIX}/auth/logout`, (req, res) => {
  res.clearCookie('auth_token', clearCookieOptions);
  res.status(204).end();
});


app.post(`${API_PREFIX}/auth/users`, requireAuth, async (req, res) => {
  if (!isBootstrapUserAccount(req.user)) {
    res.status(403).json({ error: 'Seul le compte bootstrap peut creer des utilisateurs.' });
    return;
  }
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

app.get(`${API_PREFIX}/schemas`, (req, res) => {
  const query = req.query || {};
  let rows;
  const archivedFilter = typeof query.archived === 'string' ? query.archived.trim() : null;
  const includeArchived = query.includeArchived === '1';
  if (archivedFilter === '1') {
    rows = selectSchemasByArchivedStmt.all(1);
  } else if (archivedFilter === '0') {
    rows = selectSchemasByArchivedStmt.all(0);
  } else if (includeArchived) {
    rows = selectAllSchemasStmt.all();
  } else {
    rows = selectSchemasByArchivedStmt.all(0);
  }
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
    archived: Boolean(row.archived),
    created_at: row.created_at,
    updated_at: row.updated_at,
    payload: JSON.parse(row.payload)
  });
});

app.get(`${API_PREFIX}/schema-audit/summaries`, requireAuth, (req, res) => {
  if (!isBootstrapUserAccount(req.user)) {
    res.status(403).json({ error: 'Acces reserve au compte bootstrap' });
    return;
  }
  const rows = selectAuditSummariesStmt.all();
  const items = rows.map((row) => ({
    schema_id: row.schema_id,
    name: row.name,
    action: row.action,
    actor: row.actor,
    created_at: row.created_at,
    exists: Boolean(row.current_id),
    archived: Boolean(row.archived)
  }));
  res.json({ items });
});

app.get(`${API_PREFIX}/schemas/:id/audit`, requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Identifiant invalide' });
    return;
  }
  const rows = selectAuditBySchemaStmt.all(id);
  const events = rows.map((entry) => ({
    id: entry.id,
    schema_id: entry.schema_id,
    name: entry.name,
    action: entry.action,
    actor: entry.actor,
    created_at: entry.created_at,
    extra: entry.extra ? JSON.parse(entry.extra) : null
  }));
  res.json({ events });
});

app.get(`${API_PREFIX}/admin/system-health`, requireAuth, async (req, res) => {
  if (!isBootstrapUserAccount(req.user)) {
    res.status(403).json({ error: 'Acces reserve au compte bootstrap' });
    return;
  }
  try {
    const payload = await collectSystemHealthSnapshot();
    res.json(payload);
  } catch (err) {
    console.error('[health] echec recuperation', err);
    res.status(500).json({ error: 'Impossible de recuperer la sante du systeme' });
  }
});

app.post(`${API_PREFIX}/schemas`, requireAuth, (req, res) => {
  const { id: rawId, name, payload, archived: rawArchived } = req.body || {};
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
  const actor = req.user?.username || null;
  const archivedInput =
    rawArchived === true || rawArchived === '1' || rawArchived === 1 ? 1 : 0;

  if (!targetId) {
    const existing = getSchemaByNameStmt.get(trimmed);
    targetId = existing?.id || null;
  }

  if (targetId) {
    const current = getSchemaByIdStmt.get(targetId);
    if (!current) {
      res.status(404).json({ error: 'Schema introuvable' });
      return;
    }
    const archivedValue =
      rawArchived === undefined || rawArchived === null
        ? current.archived
        : archivedInput;
    updateSchemaStmt.run(trimmed, stringified, archivedValue ? 1 : 0, now, targetId);
    const updated = getSchemaByIdStmt.get(targetId);
    recordSchemaAudit({
      schemaId: targetId,
      name: trimmed,
      action: 'update',
      actor
    });
    res.json({
      id: updated.id,
      name: updated.name,
      archived: Boolean(updated.archived),
      created_at: updated.created_at,
      updated_at: updated.updated_at,
      status: 'updated'
    });
    return;
  }

  const info = insertSchemaStmt.run(trimmed, stringified, archivedInput, now, now);
  const schemaId = Number(info.lastInsertRowid);
  recordSchemaAudit({
    schemaId,
    name: trimmed,
    action: 'create',
    actor
  });
  res.status(201).json({
    id: schemaId,
    name: trimmed,
    archived: Boolean(archivedInput),
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
  const { name, payload, archived: rawArchived } = req.body || {};
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
  const archivedValue =
    rawArchived === undefined || rawArchived === null
      ? target.archived
      : rawArchived === true || rawArchived === '1' || rawArchived === 1
        ? 1
        : 0;
  updateSchemaStmt.run(trimmed, JSON.stringify(payload), archivedValue ? 1 : 0, now, id);
  recordSchemaAudit({
    schemaId: id,
    name: trimmed,
    action: 'update',
    actor: req.user?.username || null
  });
  res.json({
    id,
    name: trimmed,
    archived: Boolean(archivedValue),
    created_at: target.created_at,
    updated_at: now,
    status: 'updated'
  });
});

app.post(`${API_PREFIX}/schemas/:id/archive`, requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Identifiant invalide' });
    return;
  }
  const { archived: rawArchived } = req.body || {};
  const target = getSchemaByIdStmt.get(id);
  if (!target) {
    res.status(404).json({ error: 'Schema introuvable' });
    return;
  }
  const archivedValue =
    rawArchived === true || rawArchived === '1' || rawArchived === 1 ? 1 : 0;
  const now = new Date().toISOString();
  updateSchemaStmt.run(
    target.name,
    target.payload,
    archivedValue ? 1 : 0,
    now,
    id
  );
  recordSchemaAudit({
    schemaId: id,
    name: target.name,
    action: archivedValue ? 'archive' : 'unarchive',
    actor: req.user?.username || null
  });
  res.json({
    id,
    name: target.name,
    archived: Boolean(archivedValue),
    created_at: target.created_at,
    updated_at: now,
    status: archivedValue ? 'archived' : 'restored'
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
  let payloadSnapshot = null;
  try {
    payloadSnapshot = target.payload ? JSON.parse(target.payload) : null;
  } catch (err) {
    payloadSnapshot = null;
  }
  deleteSchemaStmt.run(id);
  recordSchemaAudit({
    schemaId: id,
    name: target.name,
    action: 'delete',
    actor: req.user?.username || null,
    extra: payloadSnapshot ? { payload: payloadSnapshot } : null
  });
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
