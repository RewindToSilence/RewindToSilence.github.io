// Shared by the public pages: loads data/index.json and every set file it lists.
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const bust = Date.now();

  async function getJson(url) {
    const r = await fetch(url + '?v=' + bust);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  // Returns { sets, cards, failed }. Each set gets .count and .idx; each card gets .set and .setName.
  async function loadData() {
    const idx = await getJson('data/index.json');
    const sets = (idx.sets || []).map((s, i) => ({ ...s, idx: i, count: 0 }));
    const failed = [];
    const parts = await Promise.all(sets.map(async (s) => {
      try {
        const d = await getJson(s.file);
        const list = Array.isArray(d) ? d : d.cards || [];
        s.count = list.length;
        return list.map((c) => ({ ...c, set: s.id, setName: s.name }));
      } catch (e) { failed.push(s.name); return []; }
    }));
    return { sets, cards: parts.flat(), failed };
  }

  window.RTS = { esc, plural, loadData };
})();
