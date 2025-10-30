#!/usr/bin/env node
import path from 'path';
import fs from 'fs/promises';
import readline from 'readline';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const dataDir = path.resolve(projectRoot, process.env.DB_DIR || 'data');
const dbFile = path.join(dataDir, process.env.DB_FILE || 'schemas.db');

await fs.mkdir(dataDir, { recursive: true });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt, { mask = false } = {}) {
  return new Promise((resolve) => {
    if (!mask) {
      rl.question(prompt, (answer) => resolve(answer.trim()));
      return;
    }
    const stdin = process.stdin;
    const onData = (char) => {
      char = char + '';
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004':
          stdin.removeListener('data', onData);
          break;
        default:
          process.stdout.clearLine(0);
          process.stdout.cursorTo(0);
          process.stdout.write(prompt + '*'.repeat(buffer.length));
          buffer += char;
          break;
      }
    };
    let buffer = '';
    stdin.on('data', onData);
    rl.question(prompt, () => {
      stdin.removeListener('data', onData);
      process.stdout.write('\n');
      resolve(buffer.trim());
    });
  });
}

async function main() {
  console.log('=== Creation utilisateur Graph_Cond ===');
  const username = await question('Nom utilisateur: ');
  if (!username) {
    throw new Error('Nom utilisateur obligatoire.');
  }
  const password = await question('Mot de passe: ', { mask: true });
  if (!password) {
    throw new Error('Mot de passe obligatoire.');
  }
  const confirm = await question('Confirmer mot de passe: ', { mask: true });
  if (password !== confirm) {
    throw new Error('Les mots de passe ne correspondent pas.');
  }

  const hash = await bcrypt.hash(password, 12);
  const db = new Database(dbFile);
  db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `).run();

  const insertStmt = db.prepare(`
    INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)
  `);

  const createdAt = new Date().toISOString();

  try {
    insertStmt.run(username.trim(), hash, createdAt);
    console.log(`Utilisateur "${username.trim()}" cree avec succes.`);
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE')) {
      console.error('Ce nom utilisateur existe deja.');
    } else {
      console.error('Erreur creation utilisateur:', err.message || err);
    }
    process.exitCode = 1;
  } finally {
    db.close();
    rl.close();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
  rl.close();
});
