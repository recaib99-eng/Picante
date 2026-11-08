const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const session = require('express-session');

const app = express();
const db = new Database('picante_admin.db');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'picante-mexico-super-secret-2026',
  resave: false,
  saveUninitialized: false
}));

// --- VERİTABANI ŞEMASI ---
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    is_banned INTEGER DEFAULT 0,
    bio TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    likes INTEGER DEFAULT 0,
    dislikes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(topic_id) REFERENCES topics(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS favorites (
    user_id INTEGER NOT NULL,
    entry_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, entry_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('novice_mode', '0')").run();

const topicCount = db.prepare('SELECT COUNT(*) as count FROM topics').get().count;
if (topicCount === 0) {
  const hash = bcrypt.hashSync('bot-pass-999', 10);
  const botInfo = db.prepare('INSERT INTO users (username, password, role, bio) VALUES (?, ?, ?, ?)').run('picante_bot', hash, 'bot', 'sistema oficial de picante.');

  const seedTopics = [
    { title: 'tacos al pastor', entry: 'la octava maravilla del mundo culinario. sin piña no es lo mismo, aunque digan lo contrario (véase: salsa verde). si quieres saber más mira [https://wikipedia.org la historia del trompo].' },
    { title: 'salsa verde', entry: 'el alma de cualquier taquería en la cdmx. si no pica, no sirve *neta*.' },
    { title: 'metro pantitlán en hora pico', entry: 'deporte extremo no reconocido por el comité olímpico. entras siendo una persona y sales siendo otra.' },
    { title: 'picante', entry: 'la neta de méxico, sin filtros. bienvenidos todos los cuates a echarle salsa a los temas del día. (v: reglas de convivencia)' },
    { title: 'reglas de convivencia', entry: '1. cero spam.\n2. respeta a los demás cuates.\n3. escribe con buena onda o buen sarcasmo.' }
  ];

  seedTopics.forEach((t) => {
    const slug = slugify(t.title);
    const info = db.prepare('INSERT INTO topics (title, slug) VALUES (?, ?)').run(t.title, slug);
    db.prepare('INSERT INTO entries (topic_id, user_id, content, likes) VALUES (?, ?, ?, ?)').run(info.lastInsertRowid, botInfo.lastInsertRowid, t.entry, Math.floor(Math.random() * 25) + 2);
  });
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : '0';
}

function slugify(text) {
  return text.toString().toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseEntryContent(rawText) {
  let text = escapeHtml(rawText);
  text = text.replace(/\[(https?:\/\/[^\s\]]+)\s+([^\]]+)\]/gi, '<a href="$1" target="_blank" rel="noopener noreferrer" class="ext-link">$2 ↗</a>');
  text = text.replace(/\((?:véase|v):\s*([^)]+)\)/gi, (match, title) => {
    const cleanTitle = title.trim().toLowerCase();
    return `(véase: <a href="/tema/${slugify(cleanTitle)}?q=${encodeURIComponent(cleanTitle)}" class="bknz">${cleanTitle}</a>)`;
  });
  text = text.replace(/\*([^*]+)\*/g, (match, hidden) => {
    const cleanTitle = hidden.trim().toLowerCase();
    return `<a href="/tema/${slugify(cleanTitle)}?q=${encodeURIComponent(cleanTitle)}" class="gizli-bknz" title="véase: ${cleanTitle}">*</a>`;
  });
  return text.replace(/\n/g, '<br>');
}

function renderLayout(req, contentHtml, pageTitle = 'Picante - La neta de México') {
  const agenda = db.prepare(`
    SELECT t.title, t.slug, COUNT(e.id) as entry_count 
    FROM topics t 
    LEFT JOIN entries e ON t.id = e.topic_id 
    GROUP BY t.id 
    ORDER BY MAX(e.created_at) DESC 
    LIMIT 35
  `).all();

  const user = req.session.user;
  let unreadMsgCount = 0;
  if (user) {
    unreadMsgCount = db.prepare('SELECT COUNT(*) as c FROM messages WHERE receiver_id = ? AND is_read = 0').get(user.id).c;
  }

  return `<!DOCTYPE html>
<html lang="es-MX">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageTitle}</title>
  <style>
    :root { --bg: #161618; --panel: #202024; --border: #2e2e34; --text: #e4e4e7; --muted: #9ca3af; --accent: #ef4444; --green: #22c55e; --gold: #eab308; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); font-size: 14px; line-height: 1.55; }
    a { color: var(--green); text-decoration: none; }
    a:hover { text-decoration: underline; }
    header { background: var(--panel); border-bottom: 2px solid var(--accent); padding: 10px 20px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; gap: 10px; }
    .logo { font-size: 21px; font-weight: 900; color: var(--accent); letter-spacing: -0.5px; display: flex; align-items: center; gap: 6px; white-space: nowrap; }
    .logo span { color: var(--muted); font-weight: 400; font-size: 12px; }
    .search-box { display: flex; gap: 5px; width: 38%; max-width: 450px; }
    .search-box input { width: 100%; padding: 6px 12px; background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 4px; font-size: 13px; }
    .search-box button { background: var(--accent); color: white; border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-weight: bold; }
    .nav-links { display: flex; gap: 14px; align-items: center; font-size: 13px; white-space: nowrap; }
    .badge { background: var(--accent); color: #fff; font-size: 10px; padding: 1px 5px; border-radius: 10px; font-weight: bold; }
    .admin-pill { background: var(--gold); color: #000; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; }
    .container { display: flex; max-width: 1280px; margin: 0 auto; min-height: calc(100vh - 54px); }
    .left-frame { width: 275px; border-right: 1px solid var(--border); padding: 15px; flex-shrink: 0; }
    .left-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 6px; margin-bottom: 12px; }
    .left-header h3 { color: var(--accent); font-size: 12.5px; text-transform: uppercase; letter-spacing: 0.8px; }
    .topic-list { list-style: none; }
    .topic-list li { margin-bottom: 9px; display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
    .topic-list li a { color: var(--text); font-size: 13.5px; line-height: 1.3; }
    .topic-list li a:hover { color: var(--accent); }
    .topic-list li span { color: var(--muted); font-size: 11px; flex-shrink: 0; }
    .main-content { flex: 1; padding: 25px 35px; max-width: 950px; }
    .topic-top { border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 20px; }
    .topic-title { font-size: 22px; font-weight: bold; color: #fff; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
    .topic-tools { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; font-size: 12px; }
    .filter-pills a { padding: 4px 10px; background: var(--panel); border: 1px solid var(--border); border-radius: 4px; color: var(--muted); margin-right: 5px; }
    .filter-pills a.active { border-color: var(--accent); color: var(--accent); font-weight: bold; }
    .in-topic-search input { background: var(--panel); border: 1px solid var(--border); color: var(--text); padding: 4px 8px; border-radius: 4px; font-size: 12px; }
    .entry { margin-bottom: 26px; padding-bottom: 16px; border-bottom: 1px solid #26262b; }
    .entry-content { font-size: 14.5px; margin-bottom: 12px; word-wrap: break-word; }
    .entry-footer { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--muted); flex-wrap: wrap; gap: 8px; }
    .action-btns button { background: transparent; border: 1px solid var(--border); color: var(--muted); padding: 2px 8px; border-radius: 3px; cursor: pointer; margin-right: 4px; font-size: 11.5px; }
    .action-btns button:hover { border-color: var(--accent); color: var(--text); }
    .gizli-bknz { color: var(--accent); font-weight: bold; padding: 0 3px; }
    .ext-link { color: #60a5fa; }
    .pagination { display: flex; gap: 6px; margin: 20px 0; }
    .pagination a { padding: 5px 10px; background: var(--panel); border: 1px solid var(--border); border-radius: 4px; color: var(--text); font-size: 12px; }
    .pagination a.current { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: bold; }

