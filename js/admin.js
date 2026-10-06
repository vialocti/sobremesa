const loginView = document.getElementById('login-view');
const adminView = document.getElementById('admin-view');
const logoutBtn = document.getElementById('logout');
const adminStatus = document.getElementById('admin-status');

const state = { kind: 'comments', status: 'pending' };

// En la tabla de notas "publicado" se guarda como 'published'
const dbStatus = (kind, status) => (kind === 'notas' && status === 'approved') ? 'published' : status;

// ---------- Sesión ----------
async function start(){
  if(!db){
    document.getElementById('not-configured').hidden = false;
    return;
  }
  const { data: { session } } = await db.auth.getSession();
  if(session) await enterIfAdmin();
  else loginView.hidden = false;
}

async function enterIfAdmin(){
  const { data: isAdmin, error } = await db.rpc('is_admin');
  if(error || !isAdmin){
    await db.auth.signOut();
    loginView.hidden = false;
    setStatus(document.getElementById('login-status'), 'Esta cuenta no tiene permisos de moderación.', 'err');
    return;
  }
  loginView.hidden = true;
  adminView.hidden = false;
  logoutBtn.hidden = false;
  refresh();
}

document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const status = document.getElementById('login-status');
  setStatus(status, 'Entrando…');
  const { error } = await db.auth.signInWithPassword({
    email: document.getElementById('login-email').value.trim(),
    password: document.getElementById('login-pass').value
  });
  if(error) return setStatus(status, 'Email o contraseña incorrectos.', 'err');
  setStatus(status, '');
  enterIfAdmin();
});

logoutBtn.addEventListener('click', async () => {
  await db.auth.signOut();
  location.reload();
});

// ---------- Pestañas y filtros ----------
const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
tabs.forEach(tab => tab.addEventListener('click', () => {
  tabs.forEach(t => {
    const selected = t === tab;
    t.setAttribute('aria-selected', String(selected));
    t.tabIndex = selected ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !selected;
  });
  state.kind = tab.id === 'tab-notas' ? 'notas' : 'comments';
  loadList();
}));

document.querySelectorAll('#status-filters .chip').forEach(chip => chip.addEventListener('click', () => {
  state.status = chip.dataset.status;
  document.querySelectorAll('#status-filters .chip').forEach(c =>
    c.setAttribute('aria-pressed', String(c === chip)));
  loadList();
}));

// ---------- Listados ----------
function refresh(){
  loadList();
  loadCounts();
}

async function loadCounts(){
  const [c, n, stats] = await Promise.all([
    db.from('comments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    db.from('notas').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    db.rpc('public_stats')
  ]);
  const pill = (id, count) => {
    const el = document.getElementById(id);
    el.textContent = count;
    el.hidden = !count;
  };
  pill('pending-comments', c.count);
  pill('pending-notas', n.count);
  if(stats.data){
    document.getElementById('admin-summary').textContent =
      `${stats.data.votos} votos · ${stats.data.comentarios} comentarios publicados · ${stats.data.notas} notas propuestas`;
  }
}

function actionsFor(status){
  const btn = (action, label, cls) =>
    `<button class="btn btn-small ${cls}" data-action="${action}">${label}</button>`;
  const approve = btn('approved', state.kind === 'notas' ? 'Publicar' : 'Aprobar', 'btn-approve');
  const reject = btn('rejected', status === 'pending' ? 'Rechazar' : 'Despublicar', 'btn-reject');
  const del = btn('delete', 'Borrar', 'btn-delete');
  if(status === 'pending') return approve + reject + del;
  if(status === 'approved') return reject + del;
  return approve + del;
}

function itemHtml(row){
  const date = new Date(row.created_at).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
  if(state.kind === 'comments'){
    return `
      <div class="admin-item" data-id="${row.id}">
        <div class="comment-meta">${escapeHtml(row.name)} · ${date} ${temaTag(row.tema)}</div>
        <div class="comment-body">${escapeHtml(row.body)}</div>
        <div class="admin-actions">${actionsFor(state.status)}</div>
      </div>`;
  }
  return `
    <div class="admin-item" data-id="${row.id}">
      ${temaTag(row.tema)}
      <h3 style="margin-top:8px;">${escapeHtml(row.titulo)}</h3>
      <div class="comment-meta">${escapeHtml(row.autor)} · ${date}
        ${row.contacto ? ' · contacto: ' + escapeHtml(row.contacto) : ''}</div>
      <div class="comment-body">${escapeHtml(row.resumen)}</div>
      <div class="admin-actions">${actionsFor(state.status)}</div>
    </div>`;
}

async function loadList(){
  const panel = document.getElementById(state.kind === 'notas' ? 'panel-notas' : 'panel-comments');
  panel.innerHTML = '<p class="empty-note">Cargando…</p>';
  const { data, error } = await db.from(state.kind)
    .select('*')
    .eq('status', dbStatus(state.kind, state.status))
    .order('created_at', { ascending: state.status === 'pending' }) // pendientes: los más viejos primero
    .limit(100);
  if(error){
    panel.innerHTML = '<p class="empty-note">No se pudo cargar el listado.</p>';
    return;
  }
  panel.innerHTML = data.length
    ? data.map(itemHtml).join('')
    : '<p class="empty-note">No hay nada en esta lista.</p>';
}

// ---------- Acciones ----------
document.addEventListener('click', async e => {
  const btn = e.target.closest('[data-action]');
  if(!btn) return;
  const item = btn.closest('.admin-item');
  const id = Number(item.dataset.id);
  const action = btn.dataset.action;

  if(action === 'delete' && !confirm('¿Borrar definitivamente? No se puede deshacer.')) return;

  item.querySelectorAll('button').forEach(b => { b.disabled = true; });
  const table = db.from(state.kind);
  const { error } = action === 'delete'
    ? await table.delete().eq('id', id)
    : await table.update({ status: dbStatus(state.kind, action) }).eq('id', id);

  if(error){
    item.querySelectorAll('button').forEach(b => { b.disabled = false; });
    return setStatus(adminStatus, 'No se pudo guardar el cambio: ' + error.message, 'err');
  }
  setStatus(adminStatus, '');
  item.remove();
  loadCounts();
  const panel = document.getElementById(state.kind === 'notas' ? 'panel-notas' : 'panel-comments');
  if(!panel.querySelector('.admin-item')) panel.innerHTML = '<p class="empty-note">No hay nada en esta lista.</p>';
});

start();
