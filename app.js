// Public card browser. Reads cards.json (committed to the repo) and renders it.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let cards = [];

  const fields = { fType: 'type', fAttr: 'attribute', fArch: 'archetype', fSet: 'setName', fStatus: 'status' };

  // data/index.json lists the sets; each set has its own JSON file in data/sets/
  async function load() {
    const v = Date.now();
    try {
      const r = await fetch('data/index.json?v=' + v);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const idx = await r.json();
      const failed = [];
      const parts = await Promise.all((idx.sets || []).map(async (s) => {
        try {
          const rr = await fetch(s.file + '?v=' + v);
          if (!rr.ok) throw new Error('HTTP ' + rr.status);
          const d = await rr.json();
          return (Array.isArray(d) ? d : d.cards || []).map((c) => ({ ...c, set: s.id, setName: s.name }));
        } catch (e) { failed.push(s.name); return []; }
      }));
      cards = parts.flat();
      if (failed.length) console.warn('Failed to load sets:', failed.join(', '));
    } catch (e) {
      $('count').textContent = 'Could not load data/index.json (' + e.message + ')';
      return;
    }
    fillFilters();
    render();
    openFromHash();
  }

  function fillFilters() {
    for (const [selId, key] of Object.entries(fields)) {
      const sel = $(selId);
      const vals = [...new Set(cards.map((c) => c[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      for (const v of vals) sel.insertAdjacentHTML('beforeend', `<option>${esc(v)}</option>`);
    }
  }

  function filtered() {
    const q = $('q').value.trim().toLowerCase();
    let out = cards.filter((c) => {
      for (const [selId, key] of Object.entries(fields)) {
        const v = $(selId).value;
        if (v && c[key] !== v) return false;
      }
      if (!q) return true;
      return [c.name, c.effect, c.archetype, c.race, c.subtype].some((x) => String(x || '').toLowerCase().includes(q));
    });
    const s = $('sort').value;
    const num = (v) => (v === '?' || v === undefined || v === '' ? -1 : Number(v));
    if (s === 'name') out.sort((a, b) => a.name.localeCompare(b.name));
    if (s === 'newest') out.sort((a, b) => String(b.added || '').localeCompare(String(a.added || '')));
    if (s === 'atk') out.sort((a, b) => num(b.atk) - num(a.atk));
    if (s === 'level') out.sort((a, b) => num(b.level) - num(a.level));
    return out;
  }

  function statusBadge(st) {
    if (!st) return '';
    const cls = /done|complete|implemented|ready/i.test(st) ? 'ok' : /wip|progress|partial/i.test(st) ? 'warn' : '';
    return `<span class="badge ${cls}">${esc(st)}</span>`;
  }

  function render() {
    const list = filtered();
    $('count').textContent = `${list.length} of ${cards.length} cards`;
    $('grid').innerHTML = list
      .map((c) => {
        const sub = [c.type, c.attribute, c.level ? 'Lv ' + c.level : ''].filter(Boolean).join(' · ');
        return `<article class="card" data-id="${esc(c.id)}">
          <div class="img">${c.image ? `<img loading="lazy" src="${esc(c.image)}" alt="${esc(c.name)}" onerror="this.replaceWith(document.createTextNode('No image'))">` : 'No image'}</div>
          <div class="meta"><div class="name">${esc(c.name)}</div><div class="sub">${esc(sub)}</div>${statusBadge(c.status)}</div>
        </article>`;
      })
      .join('');
  }

  function show(id) {
    const c = cards.find((x) => x.id === id);
    if (!c) return;
    const stats = [
      c.type, c.subtype, c.attribute, c.race,
      c.level ? 'Level/Rank ' + c.level : '',
      c.atk !== undefined && c.atk !== '' ? 'ATK ' + c.atk : '',
      c.def !== undefined && c.def !== '' ? 'DEF ' + c.def : '',
      c.scale !== undefined && c.scale !== '' ? 'Scale ' + c.scale : '',
    ].filter(Boolean);
    $('detail').innerHTML = `<div class="detail">
      <div class="img">${c.image ? `<img src="${esc(c.image)}" alt="${esc(c.name)}" onerror="this.replaceWith(document.createTextNode('No image'))">` : 'No image'}</div>
      <div>
        <h2>${esc(c.name)}</h2>
        <div class="muted">${esc(c.archetype || '')}</div>
        <div class="stats">${stats.map((s) => `<span class="stat">${esc(s)}</span>`).join('')}</div>
        <div class="effect">${esc(c.effect || '')}</div>
        <p class="muted">${[c.setName && 'Set: ' + esc(c.setName), c.status && 'Status: ' + esc(c.status), c.creator && 'By ' + esc(c.creator)].filter(Boolean).join(' · ')}</p>
      </div></div>`;
    $('modal').hidden = false;
    history.replaceState(null, '', '#' + encodeURIComponent(id));
  }

  function hide() {
    $('modal').hidden = true;
    history.replaceState(null, '', location.pathname);
  }

  function openFromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) show(id);
  }

  $('grid').addEventListener('click', (e) => {
    const el = e.target.closest('.card');
    if (el) show(el.dataset.id);
  });
  $('close').addEventListener('click', hide);
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') hide(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  ['q', 'fType', 'fAttr', 'fArch', 'fSet', 'fStatus', 'sort'].forEach((id) => $(id).addEventListener('input', render));

  load();
})();
