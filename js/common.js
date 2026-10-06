// Piezas compartidas entre el sitio y el panel de moderación.

const TEMAS = {
  educacion: { label: 'Educación',       color: 'var(--ochre)', text: 'var(--ink)' },
  salud:     { label: 'Salud',           color: 'var(--rust)',  text: '#fff' },
  ambiente:  { label: 'Medio ambiente',  color: 'var(--teal)',  text: '#fff' },
  futuro:    { label: 'Sociedad futura', color: 'var(--ink)',   text: '#fff' }
};

// Cliente de Supabase, o null si todavía no se configuró js/config.js.
const db = (() => {
  const cfg = window.SOBREMESA_CONFIG || {};
  // Supabase ahora llama "publishable key" a la anon key; aceptamos ambos nombres.
  const key = cfg.SUPABASE_PUBLISHABLE_KEY || cfg.SUPABASE_ANON_KEY;
  const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes('TU-PROYECTO')
    && key && key !== 'TU-ANON-KEY';
  if(!configured || !window.supabase) return null;
  return window.supabase.createClient(cfg.SUPABASE_URL, key);
})();

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function formatDate(iso){
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function temaTag(tema){
  const t = TEMAS[tema];
  if(!t) return '';
  return `<span class="tema-tag" style="background:${t.color}; color:${t.text}">${t.label}</span>`;
}

function setStatus(el, msg, kind){
  el.textContent = msg;
  el.className = 'status-note' + (kind ? ' ' + kind : '');
}

function safeStorage(){
  try{ return window.localStorage; }catch(e){ return null; }
}
