const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const session = require('express-session');

const app = express();
const db = new Database('picante.db');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({ secret: 'picante-2026', resave: false, saveUninitialized: false }));

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'user', is_banned INTEGER DEFAULT 0, bio TEXT DEFAULT '');
  CREATE TABLE IF NOT EXISTS topics (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT UNIQUE NOT NULL, slug TEXT UNIQUE NOT NULL);
  CREATE TABLE IF NOT EXISTS entries (id INTEGER PRIMARY KEY AUTOINCREMENT, topic_id INTEGER NOT NULL, user_id INTEGER NOT NULL, content TEXT NOT NULL, likes INTEGER DEFAULT 0, dislikes INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS favorites (user_id INTEGER NOT NULL, entry_id INTEGER NOT NULL, PRIMARY KEY (user_id, entry_id));
  CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id INTEGER NOT NULL, receiver_id INTEGER NOT NULL, body TEXT NOT NULL, is_read INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
`);

db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('novice_mode', '0')").run();

if (db.prepare('SELECT COUNT(*) as c FROM topics').get().c === 0) {
  const bot = db.prepare('INSERT INTO users (username, password, role, bio) VALUES (?, ?, ?, ?)').run('picante_bot', bcrypt.hashSync('bot999', 10), 'bot', 'sistema oficial');
  [
    { t: 'tacos al pastor', e: 'la octava maravilla del mundo culinario (véase: salsa verde).' },
    { t: 'salsa verde', e: 'el alma de cualquier taquería en la cdmx. si no pica, no sirve *neta*.' },
    { t: 'picante', e: 'la neta de méxico, sin filtros. bienvenidos todos los cuates.' }
  ].forEach(x => {
    const info = db.prepare('INSERT INTO topics (title, slug) VALUES (?, ?)').run(x.t, slugify(x.t));
    db.prepare('INSERT INTO entries (topic_id, user_id, content, likes) VALUES (?, ?, ?, ?)').run(info.lastInsertRowid, bot.lastInsertRowid, x.e, 12);
  });
}

function getSetting(k) { const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(k); return r ? r.value : '0'; }
function slugify(t) { return t.toString().toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-'); }
function esc(t) { return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function parse(raw) {
  let t = esc(raw);
  t = t.replace(/\[(https?:\/\/[^\s\]]+)\s+([^\]]+)\]/gi, '<a href="$1" target="_blank" style="color:#60a5fa">$2 ↗</a>');
  t = t.replace(/\((?:véase|v):\s*([^)]+)\)/gi, (_, title) => { const c = title.trim().toLowerCase(); return `(véase: <a href="/tema/${slugify(c)}?q=${encodeURIComponent(c)}">${c}</a>)`; });
  t = t.replace(/\*([^*]+)\*/g, (_, h) => { const c = h.trim().toLowerCase(); return `<a href="/tema/${slugify(c)}?q=${encodeURIComponent(c)}" style="color:#ef4444;font-weight:bold" title="véase: ${c}">*</a>`; });
  return t.replace(/\n/g, '<br>');
}

function layout(req, body, title = 'Picante') {
  const agenda = db.prepare('SELECT t.title, t.slug, COUNT(e.id) as c FROM topics t LEFT JOIN entries e ON t.id = e.topic_id GROUP BY t.id ORDER BY MAX(e.created_at) DESC LIMIT 35').all();
  const u = req.session.user;
  const unread = u ? db.prepare('SELECT COUNT(*) as c FROM messages WHERE receiver_id = ? AND is_read = 0').get(u.id).c : 0;
  return `<!DOCTYPE html><html lang="es-MX"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
  <style>
    :root{--bg:#161618;--panel:#202024;--border:#2e2e34;--text:#e4e4e7;--muted:#9ca3af;--accent:#ef4444;--green:#22c55e;--gold:#eab308}
    *{box-sizing:border-box;margin:0;padding:0;font-family:sans-serif}body{background:var(--bg);color:var(--text);font-size:14px;line-height:1.5}
    a{color:var(--green);text-decoration:none}a:hover{text-decoration:underline}
    header{background:var(--panel);border-bottom:2px solid var(--accent);padding:10px 20px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;gap:10px}
    .logo{font-size:20px;font-weight:900;color:var(--accent)}.search{display:flex;gap:5px;width:38%}
    .search input{width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:4px}
    .search button,.btn{background:var(--accent);color:#fff;border:none;padding:7px 14px;border-radius:4px;cursor:pointer;font-weight:bold}
    .nav{display:flex;gap:12px;align-items:center;font-size:13px}.admin-tag{background:var(--gold);color:#000;padding:2px 7px;border-radius:4px;font-weight:bold}
    .wrap{display:flex;max-width:1250px;margin:0 auto;min-height:calc(100vh - 50px)}
    .side{width:270px;border-right:1px solid var(--border);padding:15px;flex-shrink:0}.side h3{color:var(--accent);font-size:12px;text-transform:uppercase;margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:5px}
    .side li{list-style:none;margin-bottom:8px;display:flex;justify-content:space-between}.side a{color:var(--text)}.side span{color:var(--muted);font-size:11px}
    .main{flex:1;padding:25px;max-width:900px}.entry{margin-bottom:22px;padding-bottom:15px;border-bottom:1px solid #26262b}
    .efoot{display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-top:10px}
    .efoot button{background:none;border:1px solid var(--border);color:var(--muted);padding:2px 7px;border-radius:3px;cursor:pointer;margin-right:4px}
    textarea,input[type=text],input[type=password]{width:100%;background:var(--panel);border:1px solid var(--border);color:var(--text);padding:9px;border-radius:4px;margin-bottom:10px}
    .box{background:var(--panel);padding:18px;border-radius:6px;border:1px solid var(--border);margin-bottom:18px}
    table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid var(--border);padding:8px;text-align:left}
    @media(max-width:768px){.wrap{flex-direction:column}.side{width:100%}}
  </style></head><body>
  <header>
    <a href="/" class="logo">🌶️ PICANTE</a>
    <form action="/buscar" class="search"><input name="q" placeholder="tema o @usuario..." required><button>ir</button></form>
    <div class="nav"><a href="/azar">🎲 azar</a>${u ? `${u.role === 'admin' ? '<a href="/admin" class="admin-tag">🛡️ Admin</a>' : ''}<a href="/mensajes">mensajes(${unread})</a><a href="/perfil/${u.username}">@${u.username}</a><a href="/logout" style="color:var(--muted)">salir</a>` : '<a href="/login">entrar</a><a href="/register" style="color:var(--accent);font-weight:bold">regístrate</a>'}</div>
  </header>
  <div class="wrap">
    <aside class="side"><h3>🔥 al rojo vivo</h3><ul>${agenda.map(t => `<li><a href="/tema/${t.slug}">${t.title}</a><span>${t.c}</span></li>`).join('')}</ul></aside>
    <main class="main">${body}</main>
  </div>
  <script>async function act(id,a){if(a==='delete'&&!confirm('¿Borrar?'))return;const r=await fetch('/api/act',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,a})});const d=await r.json();if(d.err)alert(d.err);else location.reload();}</script>
  </body></html>`;
}

app.get('/', (req, res) => { const l = db.prepare('SELECT slug FROM topics ORDER BY id DESC LIMIT 1').get(); res.redirect(l ? '/tema/' + l.slug : '/register'); });
app.get('/azar', (req, res) => { const r = db.prepare('SELECT slug FROM topics ORDER BY RANDOM() LIMIT 1').get(); res.redirect(r ? '/tema/' + r.slug : '/'); });
app.get('/buscar', (req, res) => { const q = (req.query.q || '').trim().toLowerCase(); if (!q) return res.redirect('/'); if (q.startsWith('@')) return res.redirect('/perfil/' + q.slice(1)); res.redirect(`/tema/${slugify(q)}?q=${encodeURIComponent(q)}`); });

app.get('/tema/:slug', (req, res) => {
  const slug = req.params.slug; const rawQ = req.query.q ? req.query.q.toLowerCase().trim() : slug.replace(/-/g, ' ');
  const sort = req.query.sort === 'chido' ? 'chido' : 'all'; const qIn = (req.query.b || '').trim();
  const page = Math.max(1, parseInt(req.query.p) || 1); const limit = 10; const offset = (page - 1) * limit;
  const topic = db.prepare('SELECT * FROM topics WHERE slug = ?').get(slug);
  const isAdmin = req.session.user?.role === 'admin';
  let h = '';
  if (topic) {
    let w = 'WHERE e.topic_id = ?'; let p = [topic.id];
    if (qIn) { w += ' AND e.content LIKE ?'; p.push(`%${qIn}%`); }
    const pages = Math.ceil(db.prepare(`SELECT COUNT(*) as c FROM entries e ${w}`).get(...p).c / limit);
    const ord = sort === 'chido' ? 'ORDER BY e.likes DESC, e.id ASC' : 'ORDER BY e.id ASC';
    const list = db.prepare(`SELECT e.*, u.username, (SELECT COUNT(*) FROM favorites f WHERE f.entry_id=e.id) as fc FROM entries e JOIN users u ON e.user_id=u.id ${w} ${ord} LIMIT ? OFFSET ?`).all(...p, limit, offset);
    h += `<div style="border-bottom:1px solid var(--border);padding-bottom:10px;margin-bottom:18px"><div style="display:flex;justify-content:space-between"><h2>${topic.title}</h2>${isAdmin ? `<form action="/admin/del-topic" method="POST"><input type="hidden" name="id" value="${topic.id}"><button class="btn" style="padding:3px 8px;font-size:11px">🗑️ Borrar Tema</button></form>` : ''}</div>
    <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:12px"><div><a href="/tema/${slug}?sort=all">todos</a> | <a href="/tema/${slug}?sort=chido">🔥 más chidos</a></div><form><input name="b" value="${esc(qIn)}" placeholder="buscar en tema..." style="padding:3px 6px;margin:0"></form></div></div>`;
    list.forEach(e => {
      const del = req.session.user && (req.session.user.id === e.user_id || isAdmin);
