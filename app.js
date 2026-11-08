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

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'user', is_banned INTEGER DEFAULT 0, bio TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS topics (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT UNIQUE NOT NULL, slug TEXT UNIQUE NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS entries (id INTEGER PRIMARY KEY AUTOINCREMENT, topic_id INTEGER NOT NULL, user_id INTEGER NOT NULL, content TEXT NOT NULL, likes INTEGER DEFAULT 0, dislikes INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS favorites (user_id INTEGER NOT NULL, entry_id INTEGER NOT NULL, PRIMARY KEY (user_id, entry_id));
  CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id INTEGER NOT NULL, receiver_id INTEGER NOT NULL, body TEXT NOT NULL, is_read INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
`);

db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('novice_mode', '0')").run();

const topicCount = db.prepare('SELECT COUNT(*) as count FROM topics').get().count;
if (topicCount === 0) {
  const hash = bcrypt.hashSync('bot-pass-999', 10);
  const botInfo = db.prepare('INSERT INTO users (username, password, role, bio) VALUES (?, ?, ?, ?)').run('picante_bot', hash, 'bot', 'sistema oficial de picante.');
  const seedTopics = [
    { title: 'tacos al pastor', entry: 'la octava maravilla del mundo culinario. sin piña no es lo mismo, aunque digan lo contrario (véase: salsa verde).' },
    { title: 'salsa verde', entry: 'el alma de cualquier taquería en la cdmx. si no pica, no sirve *neta*.' },
    { title: 'metro pantitlán en hora pico', entry: 'deporte extremo no reconocido por el comité olímpico.' },
    { title: 'picante', entry: 'la neta de méxico, sin filtros. bienvenidos todos los cuates a echarle salsa a los temas del día.' }
  ];
  seedTopics.forEach((t) => {
    const slug = slugify(t.title);
    const info = db.prepare('INSERT INTO topics (title, slug) VALUES (?, ?)').run(t.title, slug);
    db.prepare('INSERT INTO entries (topic_id, user_id, content, likes) VALUES (?, ?, ?, ?)').run(info.lastInsertRowid, botInfo.lastInsertRowid, t.entry, 10);
  });
}

function getSetting(key) { const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key); return row ? row.value : '0'; }
function slugify(text) { return text.toString().toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-'); }
function escapeHtml(text) { return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function parseEntryContent(rawText) {
  let text = escapeHtml(rawText);
  text = text.replace(/\[(https?:\/\/[^\s\]]+)\s+([^\]]+)\]/gi, '<a href="$1" target="_blank" rel="noopener noreferrer" class="ext-link">$2 ↗</a>');
  text = text.replace(/\((?:véase|v):\s*([^)]+)\)/gi, (match, title) => { const c = title.trim().toLowerCase(); return `(véase: <a href="/tema/${slugify(c)}?q=${encodeURIComponent(c)}" class="bknz">${c}</a>)`; });
  text = text.replace(/\*([^*]+)\*/g, (match, hidden) => { const c = hidden.trim().toLowerCase(); return `<a href="/tema/${slugify(c)}?q=${encodeURIComponent(c)}" class="gizli-bknz" title="véase: ${c}">*</a>`; });
  return text.replace(/\n/g, '<br>');
}

function renderLayout(req, contentHtml, pageTitle = 'Picante - La neta de México') {
  const agenda = db.prepare('SELECT t.title, t.slug, COUNT(e.id) as entry_count FROM topics t LEFT JOIN entries e ON t.id = e.topic_id GROUP BY t.id ORDER BY MAX(e.created_at) DESC LIMIT 35').all();
  const user = req.session.user;
  const unreadMsgCount = user ? db.prepare('SELECT COUNT(*) as c FROM messages WHERE receiver_id = ? AND is_read = 0').get(user.id).c : 0;
  return `<!DOCTYPE html><html lang="es-MX"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${pageTitle}</title>
  <style>
    :root { --bg: #161618; --panel: #202024; --border: #2e2e34; --text: #e4e4e7; --muted: #9ca3af; --accent: #ef4444; --green: #22c55e; --gold: #eab308; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); font-size: 14px; line-height: 1.55; }
    a { color: var(--green); text-decoration: none; } a:hover { text-decoration: underline; }
    header { background: var(--panel); border-bottom: 2px solid var(--accent); padding: 10px 20px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; gap: 10px; }
    .logo { font-size: 21px; font-weight: 900; color: var(--accent); display: flex; align-items: center; gap: 6px; }
    .logo span { color: var(--muted); font-weight: 400; font-size: 12px; }
    .search-box { display: flex; gap: 5px; width: 38%; }
    .search-box input { width: 100%; padding: 6px 12px; background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 4px; }
    .search-box button { background: var(--accent); color: white; border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-weight: bold; }
    .nav-links { display: flex; gap: 14px; align-items: center; font-size: 13px; }
    .badge { background: var(--accent); color: #fff; font-size: 10px; padding: 1px 5px; border-radius: 10px; }
    .admin-pill { background: var(--gold); color: #000; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; }
    .container { display: flex; max-width: 1280px; margin: 0 auto; min-height: calc(100vh - 54px); }
    .left-frame { width: 275px; border-right: 1px solid var(--border); padding: 15px; flex-shrink: 0; }
    .left-header { border-bottom: 1px solid var(--border); padding-bottom: 6px; margin-bottom: 12px; }
    .left-header h3 { color: var(--accent); font-size: 12.5px; text-transform: uppercase; }
    .topic-list { list-style: none; }
    .topic-list li { margin-bottom: 9px; display: flex; justify-content: space-between; gap: 8px; }
    .topic-list li a { color: var(--text); font-size: 13.5px; } .topic-list li span { color: var(--muted); font-size: 11px; }
    .main-content { flex: 1; padding: 25px 35px; max-width: 950px; }
    .topic-top { border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 20px; }
    .topic-title { font-size: 22px; font-weight: bold; color: #fff; margin-bottom: 10px; display: flex; justify-content: space-between; }
    .topic-tools { display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; font-size: 12px; }
    .filter-pills a { padding: 4px 10px; background: var(--panel); border: 1px solid var(--border); border-radius: 4px; color: var(--muted); margin-right: 5px; }
    .filter-pills a.active { border-color: var(--accent); color: var(--accent); font-weight: bold; }
    .in-topic-search input { background: var(--panel); border: 1px solid var(--border); color: var(--text); padding: 4px 8px; border-radius: 4px; }
    .entry { margin-bottom: 26px; padding-bottom: 16px; border-bottom: 1px solid #26262b; }
    .entry-content { font-size: 14.5px; margin-bottom: 12px; word-wrap: break-word; }
    .entry-footer { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); }
    .action-btns button { background: transparent; border: 1px solid var(--border); color: var(--muted); padding: 2px 8px; border-radius: 3px; cursor: pointer; margin-right: 4px; font-size: 11.5px; }
    .gizli-bknz { color: var(--accent); font-weight: bold; padding: 0 3px; }
    .pagination { display: flex; gap: 6px; margin: 20px 0; }
    .pagination a { padding: 5px 10px; background: var(--panel); border: 1px solid var(--border); border-radius: 4px; color: var(--text); }
    .pagination a.current { background: var(--accent); color: #fff; font-weight: bold; }
    textarea, input[type="text"], input[type="password"] { width: 100%; background: var(--panel); border: 1px solid var(--border); color: var(--text); padding: 10px; border-radius: 4px; margin-bottom: 10px; }
    .btn-primary { background: var(--accent); color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: bold; }
    .card-box { background: var(--panel); padding: 20px; border-radius: 6px; border: 1px solid var(--border); margin-bottom: 20px; }
    .auth-box { max-width: 400px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; } th, td { border-bottom: 1px solid var(--border); padding: 8px; text-align: left; }
    @media (max-width: 768px) { .container { flex-direction: column; } .left-frame { width: 100%; } }
  </style></head><body>
  <header>
    <a href="/" class="logo">🌶️ PICANTE <span>la neta de méxico</span></a>
    <form action="/buscar" method="GET" class="search-box"><input type="text" name="q" placeholder="busca un tema o @usuario..." required><button type="submit">ir</button></form>
    <div class="nav-links">
      <a href="/azar">🎲 azar</a>
      app.get('/', (req, res) => { const l = db.prepare('SELECT slug FROM topics ORDER BY id DESC LIMIT 1').get(); res.redirect(l ? '/tema/' + l.slug : '/register'); });
app.get('/azar', (req, res) => { const r = db.prepare('SELECT slug FROM topics ORDER BY RANDOM() LIMIT 1').get(); res.redirect(r ? '/tema/' + r.slug : '/'); });
app.get('/buscar', (req, res) => { const q = (req.query.q || '').trim().toLowerCase(); if (!q) return res.redirect('/'); if (q.startsWith('@')) return res.redirect('/perfil/' + q.substring(1)); res.redirect(`/tema/${slugify(q)}?q=${encodeURIComponent(q)}`); });

app.get('/entrada/:id', (req, res) => {
  const e = db.prepare('SELECT e.*, u.username, t.title, t.slug FROM entries e JOIN users u ON e.user_id = u.id JOIN topics t ON e.topic_id = t.id WHERE e.id = ?').get(req.params.id);
  if (!e) return res.send(renderLayout(req, '<p>No encontrado.</p>'));
  res.send(renderLayout(req, `<div class="topic-top"><div class="topic-title"><a href="/tema/${e.slug}" style="color:#fff;">${e.title}</a></div></div><article class="entry"><div class="entry-content">${parseEntryContent(e.content)}</div><div class="entry-footer"><div class="action-btns"><button onclick="accionEntry(${e.id}, 'like')">🔥 (${e.likes})</button><button onclick="accionEntry(${e.id}, 'dislike')">💧 (${e.dislikes})</button></div><div><a href="/perfil/${e.username}">@${e.username}</a> · #${e.id}</div></div></article>`));
});

app.get('/tema/:slug', (req, res) => {
  const slug = req.params.slug;
  const rawQuery = req.query.q ? req.query.q.toLowerCase().trim() : slug.replace(/-/g, ' ');
  const sort = req.query.sort === 'chido' ? 'chido' : 'cronologico';
  const searchInTopic = (req.query.buscar || '').trim();
  const page = Math.max(1, parseInt(req.query.p) || 1);
  const perPage = 10; const offset = (page - 1) * perPage;
  const topic = db.prepare('SELECT * FROM topics WHERE slug = ?').get(slug);
  const isAdmin = req.session.user && req.session.user.role === 'admin';
  let html = '';

  if (topic) {
    let where = 'WHERE e.topic_id = ?'; let params = [topic.id];
    if (searchInTopic) { where += ' AND e.content LIKE ?'; params.push(`%${searchInTopic}%`); }
    const totalPages = Math.ceil(db.prepare(`SELECT COUNT(*) as c FROM entries e ${where}`).get(...params).c / perPage);
    const orderBy = sort === 'chido' ? 'ORDER BY e.likes DESC, e.created_at ASC' : 'ORDER BY e.created_at ASC';
    const entries = db.prepare(`SELECT e.*, u.username, (SELECT COUNT(*) FROM favorites f WHERE f.entry_id = e.id) as fav_count FROM entries e JOIN users u ON e.user_id = u.id ${where} ${orderBy} LIMIT ? OFFSET ?`).all(...params, perPage, offset);

    html += `<div class="topic-top"><div class="topic-title"><span>${topic.title}</span>${isAdmin ? `<form action="/admin/borrar-tema" method="POST"><input type="hidden" name="topic_id" value="${topic.id}"><button type="submit" style="background:#7f1d1d;color:#fff;border:none;padding:4px 10px;border-radius:4px;font-size:11px;cursor:pointer;">🗑️ Borrar Tema</button></form>` : ''}</div><div class="topic-tools"><div class="filter-pills"><a href="/tema/${slug}?sort=cronologico" class="${sort === 'cronologico' ? 'active' : ''}">todos</a><a href="/tema/${slug}?sort=chido" class="${sort === 'chido' ? 'active' : ''}">🔥 los más chidos</a></div><form action="/tema/${slug}" method="GET" class="in-topic-search"><input type="text" name="buscar" value="${escapeHtml(searchInTopic)}" placeholder="buscar en este tema..."></form></div></div>`;
    entries.forEach((e) => {
      const canDelete = req.session.user && (req.session.user.id === e.user_id || isAdmin);
      html += `<article class="entry"><div class="entry-content">${parseEntryContent(e.content)}</div><div class="entry-footer"><div class="action-btns"><button onclick="accionEntry(${e.id}, 'like')">🔥 ¡qué chido! (${e.likes})</button><button onclick="accionEntry(${e.id}, 'dislike')">💧 agua (${e.dislikes})</button><button onclick="accionEntry(${e.id}, 'fav')">⭐ fav (${e.fav_count})</button>${canDelete ? `<button onclick="accionEntry(${e.id}, 'delete')" style="color:#ef4444;">🗑️ borrar</button>` : ''}</div><div><a href="/perfil/${e.username}">@${e.username}</a> · ${e.created_at} · <a href="/entrada/${e.id}" style="color:var(--muted)">#${e.id}</a></div></div></article>`;
    });
    if (totalPages > 1) {
      html += `<div class="pagination">`;
      for (let i = 1; i <= totalPages; i++) html += `<a href="/tema/${slug}?p=${i}&sort=${sort}&buscar=${encodeURIComponent(searchInTopic)}" class="${i === page ? 'current' : ''}">${i}</a>`;
      html += `</div>`;
    }
  } else {
    html += `<div class="topic-top"><div class="topic-title">${escapeHtml(rawQuery)}</div></div><p style="color:var(--muted); margin-bottom:20px;">nadie ha escrito sobre esto todavía. ¡sé el primero en picar!</p>`;
  }

  if (req.session.user) {
    if (req.session.user.role === 'novice') html += `<div class="card-box">⏳ Cuenta en modo novato (çaylak).</div>`;
    else html += `<form action="/entrada" method="POST" style="margin-top:30px;"><input type="hidden" name="title" value="${escapeHtml(topic ? topic.title : rawQuery)}"><textarea name="content" rows="5" placeholder="échale salsa a este tema..." required></textarea><button type="submit" class="btn-primary">publicar entrada</button></form>`;
  } else {
    html += `<div class="card-box" style="margin-top:20px;">para escribir aquí, <a href="/login">inicia sesión</a> o <a href="/register">regístrate gratis</a>.</div>`;
  }
  res.send(renderLayout(req, html, `${topic ? topic.title : rawQuery} - Picante`));
});

app.post('/entrada', (req, res) => {
  if (!req.session.user || req.session.user.role === 'novice') return res.redirect('/login');
  const title = (req.body.title || '').trim().toLowerCase(); const content = (req.body.content || '').trim();
  if (!title || !content) return res.redirect('/');
  const slug = slugify(title);
  let topic = db.prepare('SELECT id FROM topics WHERE slug = ?').get(slug);
  if (!topic) { const info = db.prepare('INSERT INTO topics (title, slug) VALUES (?, ?)').run(title, slug); topic = { id: info.lastInsertRowid }; }
  db.prepare('INSERT INTO entries (topic_id, user_id, content) VALUES (?, ?, ?)').run(topic.id, req.session.user.id, content);
  res.redirect('/tema/' + slug);
});

app.post('/api/entry-accion', (req, res) => {
  const { entryId, accion } = req.body; const user = req.session.user;
  if (accion === 'like') { db.prepare('UPDATE entries SET likes = likes + 1 WHERE id = ?').run(entryId); return res.json({ ok: true }); }
  if (accion === 'dislike') { db.prepare('UPDATE entries SET dislikes = dislikes + 1 WHERE id = ?').run(entryId); return res.json({ ok: true }); }
  if (!user) return res.json({ error: 'Debes iniciar sesión.' });
  if (accion === 'fav') {
    const ex = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND entry_id = ?').get(user.id, entryId);
    if (ex) db.prepare('DELETE FROM favorites WHERE user_id = ? AND entry_id = ?').run(user.id, entryId);
    else db.prepare('INSERT INTO favorites (user_id, entry_id) VALUES (?, ?)').run(user.id, entryId);
    return res.json({ ok: true });
  }
  if (accion === 'delete') {
    if (user.role === 'admin') db.prepare('DELETE FROM entries WHERE id = ?').run(entryId);
    else db.prepare('DELETE FROM entries WHERE id = ? AND user_id = ?').run(entryId, user.id);
    return res.json({ ok: true });
  }
});

app.get('/admin', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).send(renderLayout(req, '<p>Acceso denegado.</p>'));
  const noviceMode = getSetting('novice_mode') === '1';
  const users = db.prepare("SELECT * FROM users WHERE role != 'bot' ORDER BY id DESC").all();
  let html = `<h2 style="margin-bottom:20px; color:var(--gold);">🛡️ Panel de Administración</h2><div class="card-box"><form action="/admin/toggle-novice" method="POST"><button type="submit" class="btn-primary">${noviceMode ? '🔓 Desactivar Modo Novato' : '🔒 Activar Modo Novato (Çaylak)'}</button></form></div><div class="card-box"><table><thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${users.map(u => `<tr><td>@${u.username}</td><td>${u.role}</td><td>${u.is_banned ? 'Baneado' : 'Activo'}</td><td>${u.role !== 'admin' ? `<form action="/admin/user-action" method="POST"><input type="hidden" name="user_id" value="${u.id}"><button name="action" value="toggle_ban">${u.is_banned ? 'Quitar Ban' : '🚫 Ban'}</button><button name="action" value="make_user">✅ Autor</button></form>` : 'Admin'}</td></tr>`).join('')}</tbody></table></div>`;
  res.send(renderLayout(req, html, 'Admin - Picante'));
});

app.post('/admin/toggle-novice', (req, res) => { if (req.session.user?.role === 'admin') db.prepare("UPDATE settings SET value = ? WHERE key = 'novice_mode'").run(getSetting('novice_mode') === '1' ? '0' : '1'); res.redirect('/admin'); });
app.post('/admin/user-action', (req, res) => { if (req.session.user?.role === 'admin') { if (req.body.action === 'toggle_ban') db.prepare('UPDATE users SET is_banned = CASE WHEN is_banned = 1 THEN 0 ELSE 1 END WHERE id = ?').run(req.body.user_id); if (req.body.action === 'make_user') db.prepare("UPDATE users SET role = 'user' WHERE id = ?").run(req.body.user_id); } res.redirect('/admin'); });
app.post('/admin/borrar-tema', (req, res) => { if (req.session.user?.role === 'admin') { db.prepare('DELETE FROM entries WHERE topic_id = ?').run(req.body.topic_id); db.prepare('DELETE FROM topics WHERE id = ?').run(req.body.topic_id); } res.redirect('/'); });

app.get('/perfil/:username', (req, res) => {
  const p = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username.toLowerCase());
  if (!p) return res.send(renderLayout(req, '<p>Usuario no encontrado.</p>'));
  const entries = db.prepare('SELECT e.*, t.title, t.slug FROM entries e JOIN topics t ON e.topic_id = t.id WHERE e.user_id = ? ORDER BY e.created_at DESC LIMIT 20').all(p.id);

