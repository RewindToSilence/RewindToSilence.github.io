// Public card browser. Reads cards.json (committed to the repo) and renders it.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = RTS.esc;
  let cards = [], sets = [];

  // Plate colours by card type (the widely used reference hex values for each frame type).
  const COLORS = {
    normal: '#FDE68A', effect: '#FF8B53', ritual: '#9DB5CC', fusion: '#A086B7', synchro: '#CCCCCC',
    xyz: '#000000', link: '#00008B', spell: '#1D9E74', trap: '#BC5A84', token: '#C0C0C0',
  };
  const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const rgb2hex = (r) => '#' + r.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const mix = (h, t, p) => { const a = hex2rgb(h), b = hex2rgb(t); return rgb2hex(a.map((v, k) => v + (b[k] - v) * p)); };
  const lum = (h) => { const [r, g, b] = hex2rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const SIDE = 'linear-gradient(90deg, rgba(0,0,0,.3) 0%, rgba(0,0,0,0) 50%, rgba(0,0,0,.3) 100%)';
  const shade = (h) => `linear-gradient(180deg, ${mix(h, '#ffffff', 0.22)} 0%, ${h} 48%, ${mix(h, '#000000', 0.18)} 100%)`;

  function frameFor(c) {
    if (c.type === 'Spell') return mk(COLORS.spell);
    if (c.type === 'Trap') return mk(COLORS.trap);
    const s = String(c.subtype || '').toLowerCase();
    const key = ['link', 'xyz', 'synchro', 'fusion', 'ritual', 'token', 'normal', 'effect'].find((k) => s.includes(k)) || 'effect';
    const base = COLORS[key];
    const isPend = (c.scale !== undefined && c.scale !== '') || !!c.pendEffect;
    if (isPend) { // Pendulum: monster colour on top, Spell green below
      const g = COLORS.spell;
      return { bg: SIDE + `, linear-gradient(180deg, ${mix(base, '#ffffff', 0.2)} 0%, ${base} 38%, ${g} 62%, ${mix(g, '#000000', 0.18)} 100%)`, dark: (lum(base) + lum(g)) / 2 > 0.2 };
    }
    return mk(base);
  }
  // pure black (Xyz) can't show a gradient, so its centre is lifted slightly
  function mk(h) { const c = h === '#000000' ? '#2b2b2b' : h; return { bg: SIDE + ', ' + shade(c), dark: lum(h) > 0.2 }; }

  const fields = { fType: 'type', fAttr: 'attribute', fArch: 'archetype', fSet: 'setName', fStatus: 'status' };

  // Shrink each name until it fits inside its fixed-size plate (the plate never changes size).
  function fitNames() {
    document.querySelectorAll('.tile .nm').forEach((plate) => {
      const span = plate.firstElementChild; if (!span) return;
      let size = 15.2;
      span.style.fontSize = size + 'px';
      const availW = plate.clientWidth - 24, availH = plate.clientHeight - 4;
      while (size > 7 && (span.scrollWidth > availW || span.offsetHeight > availH)) { size -= 0.4; span.style.fontSize = size + 'px'; }
    });
  }
  let fitTimer;
  window.addEventListener('resize', () => { clearTimeout(fitTimer); fitTimer = setTimeout(fitNames, 120); });

  async function load() {
    let data;
    try { data = await RTS.loadData(); }
    catch (e) { $('count').textContent = 'Could not load data/index.json (' + e.message + ')'; return; }
    cards = data.cards; sets = data.sets;
    if (data.failed.length) console.warn('Failed to load sets:', data.failed.join(', '));
    fillFilters();
    // cards.html?set=<id> opens with that set already selected (this is where the Sets page links to)
    const wanted = sets.find((s) => s.id === new URLSearchParams(location.search).get('set'));
    if (wanted) $('fSet').value = wanted.name;
    render();
    openFromHash();
  }

  function fillFilters() {
    for (const [selId, key] of Object.entries(fields)) {
      const sel = $(selId);
      const src = selId === 'fSet' ? sets.map((s) => s.name) : cards.map((c) => c[key]);
      const vals = [...new Set(src.filter(Boolean))].sort((a, b) => a.localeCompare(b));
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

  function syncBanner() {
    const el = $('setBanner');
    const s = sets.find((x) => x.name === $('fSet').value);
    if (!s) { el.hidden = true; el.innerHTML = ''; return; }
    el.innerHTML = `${s.cover ? `<img class="sb-cover" src="${esc(s.cover)}" alt="${esc(s.name)}" onerror="this.remove()">` : ''}
      <div class="sb-info">
        <div class="sb-kicker">Set</div>
        <h2>${esc(s.name)}</h2>
        ${s.description ? `<p class="sb-desc">${esc(s.description)}</p>` : ''}
        <p class="muted">${RTS.plural(s.count, 'card')}${s.date ? ' · ' + esc(s.date) : ''}</p>
        <a href="sets.html">&larr; All sets</a>
      </div>`;
    el.hidden = false;
  }

  function render() {
    syncBanner();
    const list = filtered();
    $('count').textContent = `${list.length} of ${cards.length} cards`;
    $('grid').innerHTML = list.map((c) => {
      const f = frameFor(c);
      const kind = /xyz/i.test(c.subtype || '') ? 'Rank' : /link/i.test(c.subtype || '') ? 'Link' : 'Lv';
      let l1, l2 = '';
      if (c.type === 'Monster') {
        l1 = [c.level ? kind + ' ' + c.level : '', c.attribute, c.race].filter(Boolean).join(' · ');
        l2 = [c.atk !== undefined && c.atk !== '' ? 'ATK ' + c.atk : '', c.def !== undefined && c.def !== '' ? 'DEF ' + c.def : ''].filter(Boolean).join(' / ');
      } else {
        l1 = [c.subtype, c.type].filter(Boolean).join(' ');
        l2 = c.archetype || '';
      }
      return `<article class="card tile${f.dark ? ' dark' : ''}" style="--fbg:${f.bg}" data-id="${esc(c.id)}">
        <div class="plate nm"><span>${esc(c.name)}</span></div>
        <div class="art">${c.image ? `<img loading="lazy" src="${esc(c.image)}" alt="${esc(c.name)}" onerror="this.replaceWith(document.createTextNode('No image'))">` : 'No image'}</div>
        <div class="plate st"><div class="l1">${esc(l1)}</div>${l2 ? `<div class="l2">${esc(l2)}</div>` : ''}</div>
      </article>`;
    }).join('');
    requestAnimationFrame(fitNames);
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
      c.ability,
      c.arrows ? 'Link arrows: ' + c.arrows : '',
    ].filter(Boolean);
    $('detail').innerHTML = `<div class="detail">
      <div class="img">${c.image ? `<img src="${esc(c.image)}" alt="${esc(c.name)}" onerror="this.replaceWith(document.createTextNode('No image'))">` : 'No image'}</div>
      <div>
        <h2>${esc(c.name)}</h2>
        <div class="muted">${esc(c.archetype || '')}</div>
        <div class="stats">${stats.map((s) => `<span class="stat">${esc(s)}</span>`).join('')}</div>
        ${c.pendEffect ? `<div class="effect"><strong>Pendulum Effect</strong>\n${esc(c.pendEffect)}</div><div style="height:8px"></div>` : ''}<div class="effect">${esc(c.effect || '')}</div>
        <p class="muted">${[c.setName && 'Set: ' + esc(c.setName), c.status && 'Status: ' + esc(c.status), c.creator && 'By ' + esc(c.creator)].filter(Boolean).join(' · ')}</p>
      </div></div>`;
    $('modal').hidden = false;
    history.replaceState(null, '', location.pathname + location.search + '#' + encodeURIComponent(id));
  }

  function hide() {
    $('modal').hidden = true;
    history.replaceState(null, '', location.pathname + location.search);
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
