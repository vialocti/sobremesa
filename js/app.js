// ---------- Menú en celular ----------
(() => {
  const toggle = document.getElementById('nav-toggle');
  const nav = document.getElementById('main-nav');
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }));
})();

// ---------- Pestañas (accesibles con teclado) ----------
const tabs = Array.from(document.querySelectorAll('[role="tab"]'));

function selectTab(tab, focus){
  tabs.forEach(t => {
    const selected = t === tab;
    t.setAttribute('aria-selected', String(selected));
    t.tabIndex = selected ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !selected;
  });
  if(focus) tab.focus();
}

tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', e => {
    let next = null;
    if(e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
    if(e.key === 'ArrowLeft')  next = tabs[(i - 1 + tabs.length) % tabs.length];
    if(e.key === 'Home') next = tabs[0];
    if(e.key === 'End')  next = tabs[tabs.length - 1];
    if(next){ e.preventDefault(); selectTab(next, true); }
  });
});

// Las tarjetas de temas llevan al foro filtrado por ese tema
document.querySelectorAll('.tema-link').forEach(btn => {
  btn.addEventListener('click', () => {
    selectTab(document.getElementById('tab-foro'));
    setCommentFilter(btn.dataset.tema);
    document.getElementById('comment-tema').value = btn.dataset.tema;
    document.getElementById('participar').scrollIntoView();
  });
});

// ---------- Filtros por tema (chips) ----------
function bindChips(rowId, onChange){
  const chips = document.querySelectorAll(`#${rowId} .chip`);
  chips.forEach(chip => chip.addEventListener('click', () => onChange(chip.dataset.tema)));
  return tema => chips.forEach(c => c.setAttribute('aria-pressed', String(c.dataset.tema === tema)));
}

// ---------- Encuesta ----------
const store = safeStorage();
const VOTER_KEY = 'sobremesa-voter';
const VOTE_KEY = 'sobremesa-voto';

function getVoterId(){
  let id = null;
  try{ id = store && store.getItem(VOTER_KEY); }catch(e){}
  if(!id){
    id = (crypto.randomUUID ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        }));
    try{ store && store.setItem(VOTER_KEY, id); }catch(e){}
  }
  return id;
}
let myVote = null;
try{ myVote = store && store.getItem(VOTE_KEY); }catch(e){}

async function loadPoll(){
  const container = document.getElementById('poll-options');
  const totalEl = document.getElementById('poll-total');
  const counts = {};
  if(db){
    const { data, error } = await db.rpc('poll_results');
    if(error){ totalEl.textContent = 'No se pudieron cargar los resultados.'; }
    (data || []).forEach(r => { counts[r.tema] = Number(r.votos); });
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  container.innerHTML = Object.entries(TEMAS).map(([id, t]) => {
    const pct = total > 0 ? Math.round((counts[id] || 0) / total * 100) : 0;
    const mine = myVote === id;
    return `
      <div class="poll-option">
        <button class="poll-row${mine ? ' mine' : ''}" data-id="${id}" ${myVote || !db ? 'disabled' : ''}
          aria-label="${t.label}: ${pct}%${mine ? ' (tu voto)' : ''}">
          <span class="poll-label">${t.label}${mine ? ' ✓' : ''}</span>
          <span class="poll-bar-track"><span class="poll-bar-fill" style="width:${pct}%; background:${t.color}"></span></span>
          <span class="poll-pct">${pct}%</span>
        </button>
      </div>`;
  }).join('');

  if(db){
    totalEl.textContent = total + (total === 1 ? ' voto registrado' : ' votos registrados')
      + (myVote ? ' · ya votaste, ¡gracias!' : '');
  } else {
    totalEl.textContent = 'La encuesta todavía no está conectada.';
  }
  container.querySelectorAll('.poll-row:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => castVote(btn.dataset.id));
  });
}

async function castVote(tema){
  document.querySelectorAll('.poll-row').forEach(b => { b.disabled = true; });
  const { error } = await db.from('votes').insert({ voter_id: getVoterId(), tema });
  // 23505 = este navegador ya había votado (restricción única en la base)
  if(error && error.code !== '23505'){
    document.getElementById('poll-total').textContent = 'No se pudo registrar tu voto. Probá de nuevo.';
    document.querySelectorAll('.poll-row').forEach(b => { b.disabled = false; });
    return;
  }
  myVote = error ? (myVote || tema) : tema;
  try{ store && store.setItem(VOTE_KEY, myVote); }catch(e){}
  await Promise.all([loadPoll(), loadStats()]);
}

// ---------- Foro ----------
const PAGE = 10;
const commentState = { tema: '', offset: 0 };
const markCommentChip = bindChips('comment-filters', tema => setCommentFilter(tema));

function setCommentFilter(tema){
  commentState.tema = tema || '';
  commentState.offset = 0;
  markCommentChip(commentState.tema);
  loadComments();
}

function commentHtml(c){
  return `
    <div class="comment-item">
      <div class="comment-meta">${escapeHtml(c.name)} · ${formatDate(c.created_at)} ${temaTag(c.tema)}</div>
      <div class="comment-body">${escapeHtml(c.body)}</div>
    </div>`;
}

async function loadComments(append){
  const list = document.getElementById('comment-list');
  const more = document.getElementById('comment-more');
  if(!db){
    list.innerHTML = '<p class="empty-note">Los comentarios aparecen acá cuando el sitio esté conectado.</p>';
    return;
  }
  let q = db.from('comments')
    .select('id, name, body, tema, created_at')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .range(commentState.offset, commentState.offset + PAGE); // pide uno de más para saber si hay otra página
  if(commentState.tema) q = q.eq('tema', commentState.tema);
  const { data, error } = await q;
  if(error){
    list.innerHTML = '<p class="empty-note">No se pudieron cargar los comentarios.</p>';
    more.hidden = true;
    return;
  }
  const rows = data.slice(0, PAGE);
  const html = rows.map(commentHtml).join('');
  if(append) list.insertAdjacentHTML('beforeend', html);
  else list.innerHTML = html || `<p class="empty-note">Todavía no hay comentarios${commentState.tema ? ' sobre ' + TEMAS[commentState.tema].label.toLowerCase() : ''}. Podés ser la primera voz.</p>`;
  more.hidden = data.length <= PAGE;
}

document.getElementById('comment-more').addEventListener('click', () => {
  commentState.offset += PAGE;
  loadComments(true);
});

// Evita envíos repetidos desde el mismo navegador en poco tiempo
const COOLDOWN_MS = 30 * 1000;
function tooSoon(key){
  try{
    const last = Number(store && store.getItem(key)) || 0;
    return Date.now() - last < COOLDOWN_MS;
  }catch(e){ return false; }
}
function markSent(key){
  try{ store && store.setItem(key, String(Date.now())); }catch(e){}
}

document.getElementById('comment-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const status = document.getElementById('comment-status');
  const textEl = document.getElementById('comment-text');
  const name = document.getElementById('comment-name').value.trim() || 'Anónimo';
  const body = textEl.value.trim();
  const tema = document.getElementById('comment-tema').value || null;

  if(!body) return setStatus(status, 'Escribí algo antes de enviar.', 'err');
  if(document.getElementById('comment-website').value){ // bot
    textEl.value = '';
    return setStatus(status, 'Recibimos tu comentario. Se publica cuando el equipo lo revise.', 'ok');
  }
  if(tooSoon('sobremesa-last-comment')) return setStatus(status, 'Esperá unos segundos antes de enviar otro comentario.', 'err');

  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  const { error } = await db.from('comments').insert({ name, body, tema });
  submit.disabled = false;
  if(error) return setStatus(status, 'No se pudo enviar el comentario. Probá de nuevo.', 'err');

  markSent('sobremesa-last-comment');
  textEl.value = '';
  setStatus(status, 'Recibimos tu comentario. Se publica cuando el equipo lo revise. ¡Gracias por sumarte!', 'ok');
});

// ---------- Notas ----------
const notaState = { tema: '', offset: 0 };
const markNotaChip = bindChips('nota-filters', tema => {
  notaState.tema = tema || '';
  notaState.offset = 0;
  markNotaChip(notaState.tema);
  loadNotas();
});

function notaHtml(n){
  return `
    <article class="nota-card">
      ${temaTag(n.tema)}
      <h3>${escapeHtml(n.titulo)}</h3>
      <div class="comment-meta">${escapeHtml(n.autor)} · ${formatDate(n.created_at)}</div>
      <p>${escapeHtml(n.resumen)}</p>
    </article>`;
}

async function loadNotas(append){
  const list = document.getElementById('notas-list');
  const more = document.getElementById('notas-more');
  const empty = msg => `<p class="empty-note" style="grid-column:1/-1">${msg}</p>`;
  if(!db){
    list.innerHTML = empty('Las notas publicadas aparecen acá cuando el sitio esté conectado.');
    return;
  }
  let q = db.from('notas')
    .select('id, titulo, autor, resumen, tema, created_at')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .range(notaState.offset, notaState.offset + PAGE);
  if(notaState.tema) q = q.eq('tema', notaState.tema);
  const { data, error } = await q;
  if(error){
    list.innerHTML = empty('No se pudieron cargar las notas.');
    more.hidden = true;
    return;
  }
  const html = data.slice(0, PAGE).map(notaHtml).join('');
  if(append) list.insertAdjacentHTML('beforeend', html);
  else list.innerHTML = html || empty('Todavía no hay notas publicadas acá. ¿Te animás a <a href="#participar" id="write-first">escribir la primera</a>?');
  more.hidden = data.length <= PAGE;

  const first = document.getElementById('write-first');
  if(first) first.addEventListener('click', () => selectTab(document.getElementById('tab-nota')));
}

document.getElementById('notas-more').addEventListener('click', () => {
  notaState.offset += PAGE;
  loadNotas(true);
});

document.getElementById('nota-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const status = document.getElementById('nota-status');
  const titulo = document.getElementById('nota-titulo').value.trim();
  const autor = document.getElementById('nota-autor').value.trim() || 'Anónimo';
  const contacto = document.getElementById('nota-contacto').value.trim() || null;
  const resumen = document.getElementById('nota-resumen').value.trim();
  const tema = document.getElementById('nota-tema').value || null;

  if(!titulo || !resumen) return setStatus(status, 'Completá el título y el resumen antes de enviar.', 'err');
  if(document.getElementById('nota-website').value){ // bot
    form.reset();
    return setStatus(status, 'Propuesta enviada. El equipo la va a revisar pronto.', 'ok');
  }
  if(tooSoon('sobremesa-last-nota')) return setStatus(status, 'Esperá unos segundos antes de enviar otra propuesta.', 'err');

  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  const { error } = await db.from('notas').insert({ titulo, autor, contacto, resumen, tema });
  submit.disabled = false;
  if(error) return setStatus(status, 'No se pudo enviar la propuesta. Probá de nuevo.', 'err');

  markSent('sobremesa-last-nota');
  form.reset();
  setStatus(status, 'Propuesta enviada. El equipo la va a revisar pronto.', 'ok');
  loadStats();
});

// ---------- Comunidad ----------
async function loadStats(){
  if(!db) return;
  const { data, error } = await db.rpc('public_stats');
  if(error || !data) return;
  document.getElementById('stat-votos').textContent = data.votos;
  document.getElementById('stat-comentarios').textContent = data.comentarios;
  document.getElementById('stat-notas').textContent = data.notas;
}

async function loadVoces(){
  if(!db) return;
  const { data } = await db.from('comments')
    .select('name, body, created_at')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(2);
  if(!data || data.length === 0) return;
  const el = document.getElementById('voces');
  el.innerHTML = data.map(c => `
    <div class="voz-card">
      <p>${escapeHtml(c.body)}</p>
      <span>— ${escapeHtml(c.name)}</span>
    </div>`).join('');
  el.hidden = false;
}

// ---------- Inicio ----------
if(!db){
  document.getElementById('not-configured').hidden = false;
  document.querySelectorAll('#comment-form button, #nota-form button').forEach(b => { b.disabled = true; });
}
loadPoll();
loadComments();
loadNotas();
loadStats();
loadVoces();
