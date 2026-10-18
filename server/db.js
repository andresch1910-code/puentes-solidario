// Base de datos SQLite integrada en Node.js (node:sqlite): no requiere compilar
// nada, funciona igual en Windows, macOS y Linux.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NEEDS_CATALOG } from './catalog.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const DB_PATH = path.join(DATA_DIR, 'puente.db');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'volunteer',   -- volunteer | coordinator | admin
  province TEXT,
  district TEXT,
  organization TEXT,
  skills TEXT NOT NULL DEFAULT '[]',
  availability TEXT,
  has_vehicle INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | needs_info | verified | rejected | resolved
  status_note TEXT,
  source TEXT NOT NULL DEFAULT 'self',      -- self | third_party
  reporter_user_id INTEGER REFERENCES users(id),
  reporter_name TEXT,
  reporter_phone TEXT,
  province TEXT NOT NULL,
  district TEXT NOT NULL,
  community TEXT NOT NULL,
  lat REAL, lng REAL,
  address_private TEXT,
  affectations TEXT NOT NULL DEFAULT '[]',
  vulnerable TEXT NOT NULL DEFAULT '[]',
  story TEXT,
  family_name TEXT NOT NULL,
  responsible_name TEXT,
  cedula TEXT,
  cedula_norm TEXT,
  adults INTEGER NOT NULL DEFAULT 1,
  minors INTEGER NOT NULL DEFAULT 0,
  contact_phone TEXT,
  notes_private TEXT,
  allow_contact INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT,                      -- yappy | ach | none
  payment_number TEXT,
  payment_bank TEXT,
  payment_account_type TEXT,
  payment_holder TEXT,
  payment_approved INTEGER NOT NULL DEFAULT 0,
  coordinator_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  verified_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_cedula ON requests(cedula_norm);

CREATE TABLE IF NOT EXISTS needs_catalog (
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  icon TEXT NOT NULL,
  unit TEXT NOT NULL,
  category TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS request_needs (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  catalog_id INTEGER REFERENCES needs_catalog(id),
  label TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '📦',
  unit TEXT NOT NULL DEFAULT 'unidades',
  quantity INTEGER NOT NULL DEFAULT 1,
  fulfilled INTEGER NOT NULL DEFAULT 0,
  detail TEXT,
  custom INTEGER NOT NULL DEFAULT 0,        -- 1 = escrita por la familia, pendiente de moderación
  approved INTEGER NOT NULL DEFAULT 1,
  store TEXT, store_branch TEXT,            -- compra en tienda (coordinador la habilita)
  purchased_by TEXT, purchase_ref TEXT, purchased_at TEXT,
  claimed_by INTEGER REFERENCES users(id),
  claimed_name TEXT,
  claimed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_needs_request ON request_needs(request_id);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                       -- id | situation
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,                     -- family | coordinator
  author_name TEXT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS donations (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  donor_user_id INTEGER REFERENCES users(id),
  donor_name TEXT,
  kind TEXT NOT NULL DEFAULT 'money',       -- money | goods | purchase
  amount REAL NOT NULL DEFAULT 0,
  method TEXT,
  reference TEXT,
  message TEXT,
  confirmed INTEGER NOT NULL DEFAULT 0,     -- la familia confirma que lo recibió
  confirmed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  volunteer_name TEXT NOT NULL,
  organization TEXT,
  province TEXT NOT NULL,
  district TEXT NOT NULL,
  community TEXT NOT NULL,
  lat REAL, lng REAL,
  visit_date TEXT NOT NULL,
  people_served INTEGER NOT NULL DEFAULT 0,
  families_served INTEGER NOT NULL DEFAULT 0,
  hours REAL NOT NULL DEFAULT 0,
  aid_types TEXT NOT NULL DEFAULT '[]',
  pending_needs TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS missions (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  province TEXT, district TEXT, community TEXT,
  lat REAL, lng REAL,
  meeting_point TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  slots INTEGER NOT NULL DEFAULT 10,
  skills TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open',      -- open | closed | done
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mission_signups (
  id INTEGER PRIMARY KEY,
  mission_id INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  attended INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (mission_id, user_id)
);

CREATE TABLE IF NOT EXISTS centers (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  province TEXT NOT NULL,
  district TEXT,
  address TEXT,
  lat REAL, lng REAL,
  hours TEXT,
  contact TEXT,
  managed_by TEXT,
  capacity INTEGER,
  occupancy INTEGER,
  needs TEXT NOT NULL DEFAULT '[]',
  surplus TEXT NOT NULL DEFAULT '[]',
  accepting INTEGER NOT NULL DEFAULT 1,
  verified INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source TEXT NOT NULL,
  source_url TEXT,
  level TEXT NOT NULL DEFAULT 'info',
  province TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  published_by INTEGER REFERENCES users(id),
  published_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  user_name TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Catálogo de necesidades (idempotente).
{
  const ins = db.prepare('INSERT OR IGNORE INTO needs_catalog (key, label, icon, unit, category, sort) VALUES (?, ?, ?, ?, ?, ?)');
  NEEDS_CATALOG.forEach((n, i) => ins.run(n.key, n.label, n.icon, n.unit, n.category, i));
}

export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function audit(user, action, entity, entityId, detail) {
  run('INSERT INTO audit (user_id, user_name, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?)',
    user?.id ?? null, user?.name ?? null, action, entity ?? null, entityId ?? null,
    detail == null ? null : typeof detail === 'string' ? detail : JSON.stringify(detail));
}

export const parseJSON = (s, fallback = []) => {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
};
