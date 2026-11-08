// Pure text parser: turns a pasted card description into field values.
//
//   Name
//   Level 4 FIRE Wyrm/Effect     | Rank 4 ... | Link 2 ... | Continuous Spell Card
//   ATK/900 DEF/1900             | ATK/2300 LINK-3
//   Link Arrows: Top, Bottom-Left            (Link monsters)
//   Scale 1/8                                (Pendulum)
//   [Pendulum Effect] ... [Monster Effect] ...
//   Effect text...
//   Art: https://...            (optional, last lines only)
//   Art 2: https://... [(off)]
//   Full Art: ON
(function (root) {
  'use strict';

  const ATTRS = ['LIGHT', 'DARK', 'FIRE', 'WATER', 'WIND', 'EARTH', 'DIVINE'];
  const MAJOR = ['Fusion', 'Ritual', 'Synchro', 'Xyz', 'Link'];
  const ABILITIES = ['Tuner', 'Flip', 'Spirit', 'Toon', 'Union', 'Gemini'];
  const SPELL_TYPES = ['Normal', 'Continuous', 'Equip', 'Field', 'Quick-Play', 'Ritual', 'Counter'];
  const ARROWS = ['top-left', 'top', 'top-right', 'left', 'right', 'bottom-left', 'bottom', 'bottom-right'];

  const ci = (list, word) => list.find((x) => x.toLowerCase() === word.toLowerCase());

  // "Top, Bottom-Left", "Up/Down", "↑ ↙", "Upper Left" ... -> canonical arrow names
  function parseArrows(s) {
    const found = new Set();
    const sym = { '↖': 'top-left', '↑': 'top', '↗': 'top-right', '←': 'left', '→': 'right', '↙': 'bottom-left', '↓': 'bottom', '↘': 'bottom-right' };
    for (const ch of s) if (sym[ch]) found.add(sym[ch]);
    const re = /\b(top|upper|up|north)(?:[\s\-]*(left|right))?|\b(bottom|lower|down|south)(?:[\s\-]*(left|right))?|\b(left|right)\b/gi;
    let m;
    while ((m = re.exec(s))) {
      if (m[1]) found.add(m[2] ? 'top-' + m[2].toLowerCase() : 'top');
      else if (m[3]) found.add(m[4] ? 'bottom-' + m[4].toLowerCase() : 'bottom');
      else found.add(m[5].toLowerCase());
    }
    return ARROWS.filter((a) => found.has(a));
  }

  const STAT_RE = /^\s*\[?\s*(ATK|DEF)\b\s*[\/:]?\s*(\?|\d)/i;
  const LINKONLY_RE = /^\s*\[?\s*LINK[\s\-–—:]*\d{1,2}\s*\]?\s*$/i;
  const ARROWLINE_RE = /^\s*\[?\s*(?:link\s*)?(?:arrows?|markers?)\s*\]?\s*[:：\-–]\s*(.+)$/i;
  const ARROWSYM_RE = /^[\s↖↑↗←→↙↓↘,]+$/;
  const SCALE_RE = /^\s*\[?\s*(?:Pendulum\s+)?Scales?\b[\s:]*(\d{1,2})(?:\s*[\/\-–,&]\s*(\d{1,2}))?/i;
  const PEND_HDR = /^\s*\[?\s*Pendulum\s+Effects?\s*\]?\s*:?\s*(.*)$/i;
  const MON_HDR = /^\s*\[?\s*(?:Monster\s+Effects?|Monster\s+Text|Flavou?r\s+Text)\s*\]?\s*:?\s*(.*)$/i;

  function parse(raw) {
    const notes = [];
    const lines = String(raw || '').replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+$/, ''));
    const peek = () => lines.find((l) => l.trim()) || '';
    const next = () => {
      while (lines.length && !lines[0].trim()) lines.shift();
      return lines.length ? lines.shift() : '';
    };

    // Optional picture lines at the very end ("Art: <link>", "Art 2: <link>", "Full Art: ON").
    // Only the last lines are read, so an effect that happens to contain "Art:" is safe.
    const meta = {};
    const META_RE = /^\s*(full\s*art|art\s*2|art)\s*:\s*(\S.*?)\s*$/i;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].trim()) continue;
      const m = lines[i].match(META_RE);
      if (!m) break;
      const key = m[1].toLowerCase().replace(/\s+/g, ''), val = m[2];
      if (key === 'fullart') meta.fullArt = !/^(off|no|false|0)$/i.test(val);
      else {
        const off = /\(off\)\s*$/i.test(val), url = val.replace(/\s*\((?:on|off)\)\s*$/i, '');
        if (!/^https?:\/\/\S+$/i.test(url)) (meta.bad = meta.bad || []).push(m[1]);
        else if (key === 'art') meta.art = url;
        else { meta.art2 = url; meta.art2On = !off; }
      }
      lines.splice(i, 1);
    }

    const out = { notes };
    Object.assign(out, meta);
    if (meta.bad) { delete out.bad; notes.push('"' + meta.bad.join('", "') + '" line is not a link and was ignored'); }
    out.name = next().trim().replace(/^name\s*:\s*/i, '');
    let l2 = next().trim().replace(/^\[|\]$/g, '').trim();

    const isSpellTrap = /\b(spell|trap)\b/i.test(l2) && !/\b(level|rank|link)\b/i.test(l2);

    if (isSpellTrap) {
      out.cardType = /trap/i.test(l2) ? 'Trap' : 'Spell';
      const sub = SPELL_TYPES.find((s) => new RegExp('\\b' + s.replace('-', '[- ]?') + '\\b', 'i').test(l2));
      out.subtype = sub || 'Normal';
    } else {
      out.cardType = 'Monster';

      // Level / Rank / Link rating
      const lv = l2.match(/\b(Level|Lv\.?|Rank|Link)[\s\-–:]*(\d{1,2})\b/i);
      let kind = '';
      if (lv) {
        kind = lv[1].toLowerCase().replace('.', '');
        out.level = lv[2];
        l2 = l2.replace(lv[0], ' ');
      }
      // Attribute
      const am = l2.match(new RegExp('\\b(' + ATTRS.join('|') + ')\\b', 'i'));
      if (am) {
        out.attribute = am[1].toUpperCase();
        l2 = l2.replace(am[0], ' ');
      }
      // Type line given on its own line, e.g. "[Dragon/Pendulum/Effect]"
      const typeLike = (nl) => nl && /\//.test(nl) && !STAT_RE.test(nl) && !/[.:;]\s*\S/.test(nl) && nl.length < 70;
      if (!/[A-Za-z]/.test(l2.replace(/[\/,\s]/g, ''))) {
        if (typeLike(peek())) l2 = next().trim().replace(/^\[|\]$/g, '');
      } else if (/^\s*\[[^\]]*\/[^\]]*\]\s*$/.test(peek()) && typeLike(peek())) {
        l2 += ' / ' + next().trim().replace(/^\[|\]$/g, '');
      }

      const seen = new Set();
      const tokens = l2.split(/[\/,]/).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean)
        .filter((t) => (seen.has(t.toLowerCase()) ? false : seen.add(t.toLowerCase())));
      let major = null, hasEffect = false, hasNormal = false;
      const rest = [], abilities = [];
      tokens.forEach((t) => {
        const m = ci(MAJOR, t), a = ci(ABILITIES, t);
        if (m) major = major || m;
        else if (/^pendulum$/i.test(t)) out.pendulum = true;
        else if (/^effect$/i.test(t)) hasEffect = true;
        else if (/^normal$/i.test(t)) hasNormal = true;
        else if (a) abilities.push(a);
        else rest.push(t);
      });
      if (!major && kind === 'rank') major = 'Xyz';
      if (!major && kind === 'link') major = 'Link';
      if (rest.length) out.type = rest[0];
      if (rest.length > 1) notes.push('Unrecognised word(s): ' + rest.slice(1).join(', '));
      if (abilities.length) out.ability = abilities[0];
      if (abilities.length > 1) out.abilities = abilities;

      // Stat lines (ATK/DEF, LINK-n, arrows) in any order, straight after the type line
      for (;;) {
        const nl = peek();
        if (!nl) break;
        const am2 = nl.match(ARROWLINE_RE);
        if (STAT_RE.test(nl)) {
          next();
          const a = nl.match(/ATK\s*[\/:]?\s*(\?|\d+)/i);
          const d = nl.match(/DEF\s*[\/:]?\s*(\?|\d+)/i);
          const lk = nl.match(/LINK\s*[\-–—:]?\s*(\d{1,2})/i);
          if (a) out.atk = a[1];
          if (d) out.def = d[1];
          if (lk) { out.level = out.level || lk[1]; major = major || 'Link'; }
          const arrowsInLine = nl.match(/\[([^\]]*)\]/);
          if (arrowsInLine) { const ar = parseArrows(arrowsInLine[1]); if (ar.length) out.arrows = ar; }
        } else if (LINKONLY_RE.test(nl)) {
          next();
          out.level = out.level || nl.match(/(\d{1,2})/)[1];
          major = major || 'Link';
        } else if (am2) {
          next();
          out.arrows = parseArrows(am2[1]);
          major = major || 'Link';
        } else if (ARROWSYM_RE.test(nl) && /[↖↑↗←→↙↓↘]/.test(nl)) {
          next();
          out.arrows = parseArrows(nl);
          major = major || 'Link';
        } else break;
      }

      // Stat or arrow lines that come later (e.g. after the effect text)
      const STRICT_STAT = /^\s*\[?\s*ATK\s*[\/:]?\s*(\?|\d+)\s*[\/,]?\s*(?:DEF\s*[\/:]?\s*(\?|\d+))?\s*(?:LINK[\s\-–—:]*(\d{1,2}))?\s*\]?\s*$/i;
      for (let i = lines.length - 1; i >= 0; i--) {
        const l = lines[i];
        let m;
        if (out.atk === undefined && (m = l.match(STRICT_STAT))) {
          out.atk = m[1];
          if (m[2]) out.def = m[2];
          if (m[3]) { out.level = out.level || m[3]; major = major || 'Link'; }
          lines.splice(i, 1);
        } else if (!out.arrows && (m = l.match(ARROWLINE_RE))) {
          out.arrows = parseArrows(m[1]);
          major = major || 'Link';
          lines.splice(i, 1);
        } else if (LINKONLY_RE.test(l)) {
          out.level = out.level || l.match(/(\d{1,2})/)[1];
          major = major || 'Link';
          lines.splice(i, 1);
        }
      }

      out.category = major || (hasEffect ? 'Effect' : hasNormal ? 'Normal' : 'Effect');
      if (out.arrows && out.category === 'Link' && out.level && out.arrows.length !== Number(out.level)) {
        notes.push('Link ' + out.level + ' but ' + out.arrows.length + ' arrow(s) listed');
      }
      if (out.category === 'Link' && !out.arrows) notes.push('No "Link Arrows:" line found, so no arrows will be set');
    }

    // Pendulum scale (line must start with it)
    const sci = lines.findIndex((l) => SCALE_RE.test(l));
    if (sci >= 0) {
      const m = lines[sci].match(SCALE_RE);
      out.scale = [m[1], m[2] || m[1]];
      out.pendulum = true;
      const tail = lines[sci].replace(SCALE_RE, '').replace(/^[\s\]]+/, '');
      if (tail.trim()) lines[sci] = tail; else lines.splice(sci, 1);
    }

    // Effect sections
    const sec = { pre: [], pend: [], mon: [] };
    let cur = 'pre', hasPend = false, hasMon = false;
    lines.forEach((l) => {
      let m;
      if ((m = l.match(PEND_HDR))) { cur = 'pend'; hasPend = true; if (m[1].trim()) sec.pend.push(m[1]); return; }
      if ((m = l.match(MON_HDR))) { cur = 'mon'; hasMon = true; if (m[1].trim()) sec.mon.push(m[1]); return; }
      sec[cur].push(l);
    });
    const join = (a) => a.join('\n').replace(/^\s*\n+|\n+\s*$/g, '');
    if (hasPend) {
      out.pendulum = true;
      out.pendEffect = join(sec.pend);
    }
    out.effect = join(hasMon ? sec.mon : sec.pre);
    if (out.pendulum && !out.scale) notes.push('Pendulum card with no "Scale" line; scales left as they are');
    return out;
  }

  root.dbfaParse = parse;
  if (typeof module !== 'undefined' && module.exports) module.exports = parse;
})(typeof window !== 'undefined' ? window : globalThis);
