// Demo scene for store screenshots: open test/harness.html?demo (add &dark, &card=shape,
// &card=select). A generic study note with sample ink, drawn through the real plugin code.
(function () {
  const q = new URLSearchParams(location.search);

  window.DEMO_BLOCKS = [
    '# Photosynthesis',
    'Photosynthesis turns light energy into chemical energy. It happens in two stages: the light-dependent reactions and the Calvin cycle.',
    '## Light-dependent reactions',
    'These take place in the thylakoid membranes. Water is split, oxygen is released, and the energy is stored as ATP and NADPH.',
    '## Calvin cycle',
    'In the stroma, the enzyme RuBisCO fixes carbon dioxide into sugar, using the ATP and NADPH made in the first stage.',
    '- Inputs: light, water, carbon dioxide\n- Outputs: glucose and oxygen',
    'Remember: the oxygen we breathe comes from water, not from carbon dioxide.',
  ];

  // Screenshot styling: hide the test page's fake sidebar, tab bar and loud test buttons.
  const css = document.createElement('style');
  css.textContent = `
    .sidebar, .tab-bar, #theme { display: none !important; }
    .view-content { height: calc(100vh - 45px) !important; }
    html, body { background: var(--background-primary); }
    body.theme-light { background: #fdfcfa; } body.theme-dark { background: #1e1e1e; }
    body { font-family: -apple-system, "Inter", system-ui, sans-serif; }
    .markdown-preview-section { max-width: 680px !important; font-size: 19px; line-height: 1.65; padding-top: 18px; }
    .markdown-preview-section h1 { font-size: 34px; margin: 6px 0 14px !important; }
    .markdown-preview-section h2 { font-size: 24px; margin: 18px 0 8px !important; }
    .markdown-preview-section ul { padding-left: 26px; }
    body.theme-light { --background-primary: #fdfcfa; --text-normal: #2b2b2b; }
    body.theme-dark { --background-primary: #1e1e1e; --text-normal: #dcddde; }
    /* headless Chrome reports a shorter page than it renders; keep the toolbar one column */
    .pa-toolbar.is-vertical .pa-row { max-height: none !important; }
  `;
  // &paper: print like Obsidian's Export to PDF does, white paper even while the theme is dark.
  if (q.has('paper')) css.textContent += `@media print { body, .workspace-leaf-content, .view-content, .markdown-preview-view { background: #fff !important; color: #222 !important; --text-normal: #222; } .view-header { display: none !important; } }`;
  document.head.appendChild(css);
  document.addEventListener('DOMContentLoaded', () => {
    document.body.className = q.has('dark') ? 'theme-dark' : 'theme-light';
    const title = document.querySelector('.view-header .title');
    if (title) title.textContent = 'Photosynthesis.md';
  });

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function run() {
    while (!window.__ready) await sleep(20);
    const { plugin, view, NOTE } = window.__pi;
    await sleep(100);
    const secs = () => [...document.querySelectorAll('.markdown-preview-section > div')];

    // Where some text is on screen: { el: its section, rects: one rect per line }.
    const find = (text) => {
      for (const el of secs()) {
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walk.nextNode())) {
          const i = n.data.indexOf(text);
          if (i < 0) continue;
          const r = document.createRange();
          r.setStart(n, i); r.setEnd(n, i + text.length);
          return { el, rects: [...r.getClientRects()] };
        }
      }
      throw new Error('demo text not found: ' + text);
    };
    const local = (el, x, y) => { const r = el.getBoundingClientRect(); return [+((x - r.left) / el.offsetWidth).toFixed(4), +(y - r.top).toFixed(1)]; };
    const add = (el, s) => { const d = plugin.inkData(NOTE); (d.sections[el.dataset.paKey] = d.sections[el.dataset.paKey] || []).push(s); el.paChild.draw(); return s; };
    const highlight = (text, color) => {
      const { el, rects } = find(text);
      for (const r of rects) add(el, { kind: 'hl', color, width: 20, opacity: 0.4, pts: [local(el, r.left - 2, r.top + r.height / 2), local(el, r.right + 2, r.top + r.height / 2)] });
    };
    const ellipse = (el, cx, cy, rx, ry, extra) => {
      const pts = [];
      for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2; pts.push(local(el, cx + rx * Math.cos(a), cy + ry * Math.sin(a))); }
      return add(el, { kind: 'pen', geom: 'ellipse', width: 2.5, opacity: 1, rough: 1, seed: 11, pts, ...extra });
    };

    if (q.has('anim')) return animate(+q.get('f') || 0);

    // README GIF: frame f of a short "someone marks up the note" clip. Each frame is rendered
    // by its own headless page load, so this just draws every stroke as far as frame f gets.
    async function animate(f) {
      Object.assign(plugin.prefs, { tool: 'hl', barVertical: true, barPos: null, syncTipShown: true, favorites: [] });
      plugin.prefs.hl.color = '#ffd400';
      plugin.prefs.pen.color = '#e03131';
      await plugin.toggle(view);
      const prog = (a, b) => Math.max(0, Math.min(1, (f - a) / (b - a)));
      const upTo = (pts, t) => pts.slice(0, Math.max(2, Math.round(pts.length * t)));
      let tip = null;
      const stroke = (el, a, b, pts, style) => {
        if (f < a) return;
        const shown = upTo(pts, prog(a, b));
        add(el, { ...style, pts: shown.map(p => local(el, p[0], p[1])) });
        if (f <= b) tip = shown[shown.length - 1];
      };

      // 1. Highlight a phrase (frames 3-12).
      const hl = find('light energy into chemical energy'), hr = hl.rects[0], hy = hr.top + hr.height / 2;
      const hpts = []; for (let i = 0; i <= 30; i++) hpts.push([hr.left - 2 + (hr.width + 4) * i / 30, hy]);
      if (f >= 3) { const e = upTo(hpts, prog(3, 12)), end = e[e.length - 1]; add(hl.el, { kind: 'hl', color: '#ffd400', width: 20, opacity: 0.4, pts: [hpts[0], end].map(p => local(hl.el, p[0], p[1])) }); if (f <= 12) tip = end; }

      // 2. Switch to the red pen and loop around a word (frames 15-28).
      if (f >= 14) plugin.prefs.tool = 'pen';
      const ru = find('RuBisCO'), rr = ru.rects[0], cx = (rr.left + rr.right) / 2, cy = rr.top + rr.height / 2;
      const cpts = [];
      for (let i = 0; i <= 60; i++) {
        const a = Math.PI * 0.95 + (i / 60) * Math.PI * 2.18, k = 1 + 0.05 * Math.sin(a * 2.5) + i * 0.0012;
        cpts.push([cx + (rr.width / 2 + 15) * k * Math.cos(a) + i * 0.08, cy + (rr.height / 2 + 9) * k * Math.sin(a) - i * 0.03]);
      }
      stroke(ru.el, 15, 28, cpts, { kind: 'pen', color: '#e03131', width: 2.6, opacity: 1 });

      // 3. Orange pen: an arrow from "from water" up to "oxygen is released" (frames 32-47).
      if (f >= 30) plugin.prefs.pen.color = '#f08c00';
      const rem = find('oxygen we breathe comes from water'), w1 = find('oxygen is released').rects[0], w2 = find('from water').rects[0];
      const x0 = w2.right + 12, y0 = w2.top + 2, x1 = w1.right - 24, y1 = w1.bottom + 6;
      const mx = (x0 + x1) / 2 + 34, my = (y0 + y1) / 2 + 10, shaft = [];
      for (let i = 0; i <= 40; i++) { const t = i / 40, u = 1 - t; shaft.push([u * u * x0 + 2 * u * t * mx + t * t * x1, u * u * y0 + 2 * u * t * my + t * t * y1]); }
      const ang = Math.atan2(y1 - shaft[36][1], x1 - shaft[36][0]);
      const wing = (s) => { const w = []; for (let i = 0; i <= 8; i++) w.push([x1 - 17 * (i / 8) * Math.cos(ang + s), y1 - 17 * (i / 8) * Math.sin(ang + s)]); return w; };
      const orange = { kind: 'pen', color: '#f08c00', width: 2.6, opacity: 1 };
      stroke(rem.el, 32, 42, shaft, orange);
      stroke(rem.el, 43, 45, wing(Math.PI / 7), orange);
      stroke(rem.el, 46, 47, wing(-Math.PI / 7), orange);

      plugin.refreshToolbars();
      if (tip) {
        const pen = document.createElement('div');
        pen.innerHTML = '<svg width="22" height="240" viewBox="0 0 22 240"><rect x="2" y="0" width="18" height="192" rx="5" fill="#fbfbfb" stroke="#cfd2d8"/><path d="M2 190 L20 190 L13.5 229 L8.5 229 Z" fill="#f1f2f4" stroke="#cfd2d8"/><path d="M8.5 229 L13.5 229 L11 239 Z" fill="#7d828c"/></svg>';
        Object.assign(pen.style, { position: 'fixed', left: (tip[0] - 11) + 'px', top: (tip[1] - 239) + 'px', transformOrigin: '11px 239px', transform: 'rotate(26deg)', zIndex: 9999, pointerEvents: 'none', filter: 'drop-shadow(6px 10px 8px rgba(0,0,0,.18))' });
        document.body.appendChild(pen);
      }
      await sleep(300);
      plugin.sessions.get(view).toolbar.place();
      await sleep(100);
      window.__demoDone = true;
    }

    // 1. Highlights on the key ideas.
    highlight('light energy into chemical energy', '#ffd400');
    highlight('thylakoid membranes', '#40c057');
    highlight('Calvin cycle', '#f06595');

    // 2. A sketchy red circle around RuBisCO.
    const ru = find('RuBisCO'), rr = ru.rects[0];
    const circled = ellipse(ru.el, (rr.left + rr.right) / 2, rr.top + rr.height / 2, rr.width / 2 + 14, rr.height / 2 + 8, { color: '#e03131' });

    // 3. A light-blue, sketchy, round-cornered box around the inputs/outputs list.
    const list = find('Inputs').el, lr = list.querySelector('ul').getBoundingClientRect();
    const box = [[lr.left - 4, lr.top - 8], [lr.left + 430, lr.top - 8], [lr.left + 430, lr.bottom + 6], [lr.left - 4, lr.bottom + 6], [lr.left - 4, lr.top - 8]];
    const boxed = add(list, { kind: 'pen', geom: 'rect', color: '#1971c2', width: 2, opacity: 1, rough: 1, seed: 5, edges: 'round', fill: '#a5d8ff', pts: box.map(p => local(list, p[0], p[1])) });

    // 4. A fountain-pen underline with pressure.
    const rem = find('oxygen we breathe comes from water');
    for (const r of rem.rects) {
      const pts = [];
      for (let i = 0; i <= 30; i++) {
        const t = i / 30, x = r.left + (r.right - r.left) * t, y = r.bottom + 2 + Math.sin(t * 9) * 1.2;
        const p = local(rem.el, x, y);
        pts.push([p[0], p[1], +(0.25 + 0.6 * Math.sin(Math.PI * t)).toFixed(2)]);
      }
      add(rem.el, { kind: 'pen', type: 'fountain', color: '#1c7ed6', width: 4, opacity: 1, pts });
    }

    // 5. A sketchy arrow from "water" in the reminder up to "oxygen is released" (past the list box).
    const w1 = find('oxygen is released').rects[0], w2 = find('from water').rects[0], el = rem.el;
    const x0 = w2.right + 12, y0 = w2.top + 2, x1 = w1.right - 24, y1 = w1.bottom + 6;
    const ang = Math.atan2(y1 - y0, x1 - x0), len = 16, sp = Math.PI / 7;
    const wing = (s) => [x1 - len * Math.cos(ang + s), y1 - len * Math.sin(ang + s)];
    add(el, { kind: 'pen', geom: 'arrow', color: '#f08c00', width: 2.5, opacity: 1, rough: 1, seed: 3, pts: [[x0, y0], [x1, y1], wing(sp), [x1, y1], wing(-sp)].map(p => local(el, p[0], p[1])) });

    // 6. A little hand-drawn star in the margin next to "Remember".
    const rm = find('Remember').rects[0], sx = rm.left - 30, sy = rm.top + rm.height / 2, star = [];
    for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5, rad = 13; star.push(local(el, sx + rad * Math.cos(a) + Math.sin(i * 3) * 0.6, sy + rad * Math.sin(a))); }
    add(el, { kind: 'pen', color: '#f08c00', width: 2.2, opacity: 1, pts: star });

    // Toolbar: a column on the left, two favorites, the highlighter picked.
    Object.assign(plugin.prefs, {
      tool: 'hl', barVertical: true, barPos: null, syncTipShown: true,
      favorites: [{ tool: 'pen', color: '#e03131', size: 2.5, type: 'ball', dash: 'solid' }, { tool: 'hl', color: '#ffd400', size: 16 }],
    });
    plugin.prefs.hl.color = '#ffd400';
    await plugin.toggle(view);
    const st = plugin.sessions.get(view), tap = (sel) => document.querySelector(sel).dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));

    // &newshapes: draw the diamond, pentagon, hexagon and star under the note, the way a Pencil would.
    if (q.has('newshapes')) {
      const lr2 = secs()[secs().length - 1].getBoundingClientRect();
      const pen = (type, x, y) => (document.elementFromPoint(x, y) || document.body).dispatchEvent(new PointerEvent(type, { pointerType: 'pen', pointerId: 5, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
      ['diamond', 'pentagon', 'hexagon', 'star'].forEach((kind, i) => {
        Object.assign(plugin.prefs.shape, { kind, color: ['#e03131', '#1971c2', '#2f9e44', '#f08c00'][i], size: 2.5, rough: i % 2, edges: i === 2 ? 'round' : 'sharp', fill: ['#ffc9c9', '#a5d8ff', '#b2f2bb', '#ffec99'][i] });
        plugin.prefs.tool = 'shape';
        const x0 = lr2.left + 20 + i * 150, y0 = lr2.bottom + 30;
        pen('pointerdown', x0, y0); pen('pointermove', x0 + 55, y0 + 55); pen('pointermove', x0 + 110, y0 + 110); pen('pointerup', x0 + 110, y0 + 110);
      });
      plugin.prefs.tool = 'hl'; plugin.refreshToolbars();
    }
    if (q.get('card') === 'shape') {
      Object.assign(plugin.prefs.shape, { kind: 'ellipse', color: '#e03131', size: 2.5, rough: 1, fill: '#ffc9c9', edges: 'sharp' });
      plugin.prefs.tool = 'shape';
      plugin.refreshToolbars();
      tap('.pa-toolbar [aria-label="Color and size"]');
    }
    if (q.get('card') === 'select') {
      plugin.prefs.tool = 'lasso';
      plugin.refreshToolbars();
      plugin.selected.add(boxed);
      plugin.showSelection(st);
      tap('.pa-selmenu [aria-label="Style selection"]');
    }
    void circled;
    // Headless screenshot runs can lay out before the window has its final size: re-place.
    await sleep(300);
    st.toolbar.place();
    await sleep(100);
    window.__demoDone = true;
  }
  run().catch(e => { window.__demoError = e; console.error(e); });
})();
