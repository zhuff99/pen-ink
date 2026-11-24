// Scripted checks for test/harness.html. Open the harness with ?test=1 (or call
// window.runPenInkTests()) and read the results on the page / in the console.
// Uses synthetic pointer/touch events, so it checks the logic, not real Pencil hardware.
(function () {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const sections = () => [...document.querySelectorAll('.markdown-preview-section > div')];

  function fire(type, x, y, o = {}) {
    const el = document.elementFromPoint(x, y) || document.body;
    el.dispatchEvent(new PointerEvent(type, {
      pointerType: o.pointerType || 'pen', pointerId: o.pointerId || 7, clientX: x, clientY: y,
      bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1,
    }));
    return el;
  }
  // Fake TouchEvent: Chrome can't set touchType, so define the fields by hand.
  function touch(type, target, touches, changed) {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'touches', { value: touches });
    Object.defineProperty(ev, 'changedTouches', { value: changed || touches });
    target.dispatchEvent(ev);
    // Synthetic touches have no real timing, so the after-flick glide would fly off and keep
    // scrolling during later checks. Stop it.
    if (type === 'touchend' && window.__pi) for (const st of window.__pi.plugin.sessions.values()) window.__pi.plugin.stopGlide(st);
    return ev;
  }

  async function stroke(sectionIndex, o = {}) {
    const target = sections()[sectionIndex];
    target.scrollIntoView({ block: 'center' });
    await sleep(80);
    const r = target.getBoundingClientRect();
    const y = r.top + r.height / 2, x0 = r.left + 40, x1 = r.left + 240;
    fire('pointerdown', x0, y, o);
    for (let i = 1; i <= 20; i++) fire('pointermove', x0 + (x1 - x0) * i / 20, y, o);
    fire('pointerup', x1, y, o);
    await sleep(30);
    return { target, x0, x1, y };
  }

  window.runPenInkTests = async function () {
    const { plugin, view, files, NOTE } = window.__pi;
    const results = [];
    const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });

    // Visible = not hidden by the pa-hidden class (styles.css) and actually displayed.
    window.vis = (el) => !!el && !el.classList.contains('pa-hidden') && getComputedStyle(el).display !== 'none';
    check('toolbar defaults to a column on the left side', plugin.prefs.barVertical === true && !plugin.prefs.barPos);
    // The older checks below were written for the row layout.
    plugin.prefs.barVertical = false;
    if (!plugin.sessions.has(view)) await plugin.toggle(view);
    plugin.prefs.tool = 'pen';
    const bar = () => document.querySelector('.pa-toolbar');

    // 1. Ink lands under the pen, far down a long note after scrolling.
    for (const idx of [1, 18, 38]) {
      const { target, x0, x1, y } = await stroke(idx);
      const layer = target.querySelector('.pa-layer-ink');
      const p = layer && layer.lastElementChild;
      const pr = p ? p.getBoundingClientRect() : null;
      check(`ink lands under pen (section ${idx})`,
        pr && Math.abs(pr.left - x0) < 3 && Math.abs(pr.right - x1) < 3 && Math.abs((pr.top + pr.bottom) / 2 - y) < 3,
        pr && { pen: [x0, x1, Math.round(y)], ink: [Math.round(pr.left), Math.round(pr.right), Math.round((pr.top + pr.bottom) / 2)] });
      check(`section ${idx} is position:relative`, getComputedStyle(target).position === 'relative');
    }

    // 2. Still in place after scrolling away and back, and after a full re-render (= reopening the note).
    sections()[0].scrollIntoView(); await sleep(50);
    const t18 = sections()[18]; t18.scrollIntoView({ block: 'center' }); await sleep(50);
    let p = t18.querySelector('.pa-layer-ink path'), tr = t18.getBoundingClientRect(), pr = p.getBoundingClientRect();
    check('ink stays attached to its paragraph after scrolling', Math.abs((pr.top + pr.bottom) / 2 - (tr.top + tr.height / 2)) < 3);
    await sleep(700);   // debounced save
    const saved = files.get('Annotations/Folder/Long test note.json');
    check('ink saved to Annotations/<note>.json', saved && Object.keys(JSON.parse(saved).sections).length === 3, saved && saved.slice(0, 80));
    plugin.cache.clear();
    window.__pi.render(); await sleep(100);
    const t18b = sections()[18]; t18b.scrollIntoView({ block: 'center' }); await sleep(50);
    p = t18b.querySelector('.pa-layer-ink path'); tr = t18b.getBoundingClientRect();
    pr = p && p.getBoundingClientRect();
    check('ink restored in the same place after reopening', pr && Math.abs((pr.top + pr.bottom) / 2 - (tr.top + tr.height / 2)) < 3);

    // 3. Pen-stroke click doesn't open links.
    window.__linkClicks = 0;
    const a = sections()[5].querySelector('a'); a.scrollIntoView({ block: 'center' }); await sleep(50);
    const ar = a.getBoundingClientRect();
    fire('pointerdown', ar.left + 3, ar.top + 5); fire('pointerup', ar.left + 3, ar.top + 5); a.click();
    check('click after a pen stroke is swallowed (links stay closed)', window.__linkClicks === 0);

    // 4. Toolbar: Pencil touchstart is NOT prevented on the toolbar, but is on the page.
    const undoBtn = bar().querySelector('[aria-label="Undo"]');
    const stylus = [{ touchType: 'stylus', identifier: 1, clientX: 0, clientY: 0 }];
    check('Pencil touchstart on toolbar is left alone (so iOS fires click)', !touch('touchstart', undoBtn, stylus).defaultPrevented);
    check('Pencil touchstart on the note is prevented (no scrolling)', touch('touchstart', sections()[5].querySelector('p'), stylus).defaultPrevented);

    // 5. Toolbar buttons act on pointerup (pen), and the follow-up click doesn't double-fire.
    const hlBtn = bar().querySelector('[aria-label="Highlighter"]');
    let hr = hlBtn.getBoundingClientRect();
    fire('pointerdown', hr.left + 10, hr.top + 10); fire('pointerup', hr.left + 10, hr.top + 10); hlBtn.click();
    check('Pencil tap on highlighter button selects it', plugin.prefs.tool === 'hl');
    const styleBtn = bar().querySelector('[aria-label="Color and size"]');
    hr = styleBtn.getBoundingClientRect();
    fire('pointerdown', hr.left + 10, hr.top + 10); fire('pointerup', hr.left + 10, hr.top + 10); styleBtn.click();
    const panelEl = bar().children[1];
    check('color & size panel opens once (no double toggle from the click)', vis(panelEl));

    // 6. Pick green + biggest size, draw a highlight: translucent, flat caps, in the blended layer.
    bar().querySelector('[aria-label="#40c057"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    bar().querySelector('[aria-label="Size 4 of 4"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    check('color + size choices applied', plugin.prefs.hl.color === '#40c057' && plugin.prefs.hl.size === 32, plugin.prefs.hl);
    const { target: t9 } = await stroke(9);
    check('drawing closes the panel', !vis(panelEl));
    const hp = t9.querySelector('.pa-layer-hl path');
    check('highlight drawn in the highlighter layer', hp && hp.getAttribute('stroke') === '#40c057' && hp.getAttribute('stroke-width') === '32' && hp.getAttribute('stroke-linecap') === 'butt' && hp.getAttribute('stroke-opacity') === '0.4');
    check('highlighter layer blends (text shows through)', getComputedStyle(t9.querySelector('.pa-layer-hl')).mixBlendMode === 'multiply');

    // 7. Color wheel input sets any color and remembers it in "recent".
    styleBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    const picker = bar().querySelector('input[type=color]');
    picker.value = '#123456'; picker.dispatchEvent(new Event('input')); picker.dispatchEvent(new Event('change'));
    check('color wheel sets custom color + remembers it', plugin.prefs.hl.color === '#123456' && plugin.prefs.recent[0] === '#123456');
    await sleep(500);
    const data = await plugin.loadData();
    check('prefs persisted via saveData', data && data.hl.color === '#123456' && data.tool === 'hl', data);

    // 8. Undo + two-finger tap undo.
    const before = plugin.strokesFor(NOTE, t9.dataset.paKey).length;
    const ok = bar().querySelector('[aria-label="Undo"]'); ok.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    check('undo removes the last stroke', plugin.strokesFor(NOTE, t9.dataset.paKey).length === before - 1);
    const pEl = sections()[8].querySelector('p');
    const f1 = { identifier: 1, clientX: 100, clientY: 100 }, f2 = { identifier: 2, clientX: 160, clientY: 100 };
    const nStrokes = () => Object.values(plugin.inkData(NOTE).sections).reduce((n, l) => n + l.length, 0);
    const n0 = nStrokes();
    touch('touchstart', pEl, [f1], [f1]); touch('touchstart', pEl, [f1, f2], [f2]);
    touch('touchend', pEl, [f2], [f1]); touch('touchend', pEl, [], [f2]);
    check('two-finger tap undoes', nStrokes() === n0 - 1, { before: n0, after: nStrokes() });

    // 9. Eraser.
    bar().querySelector('[aria-label="Eraser"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    const n1 = nStrokes();
    await stroke(1);
    check('eraser removes the stroke it touches', nStrokes() === n1 - 1);

    // 9b. One eraser swipe across two strokes = one undo; redo re-erases.
    plugin.prefs.tool = 'pen';
    await stroke(14); await stroke(15);
    plugin.prefs.tool = 'eraser';
    const n3 = nStrokes();
    {
      const a = sections()[14].getBoundingClientRect(), b = sections()[15].getBoundingClientRect();
      const x = a.left + 100;
      fire('pointerdown', x, a.top + a.height / 2);
      fire('pointermove', x, b.top + b.height / 2);   // one big jump: must still erase in between
      check('eraser ring shows while erasing', vis(plugin.sessions.get(view).ring));
      const rg = plugin.sessions.get(view).ring.getBoundingClientRect();
      const want = [x, b.top + b.height / 2], got = [(rg.left + rg.right) / 2, (rg.top + rg.bottom) / 2];
      check('eraser ring is centered on the pointer', Math.hypot(got[0] - want[0], got[1] - want[1]) < 2, { want, got });
      fire('pointerup', x, b.top + b.height / 2);
    }
    check('fast eraser swipe hits both strokes', nStrokes() === n3 - 2, { before: n3, after: nStrokes() });
    plugin.undoLast();
    check('one undo restores the whole swipe', nStrokes() === n3);
    plugin.redoLast();
    check('redo erases them again', nStrokes() === n3 - 2);
    check('header uses the custom marker icon', window.__pi.view.penInkButton.innerHTML.includes('<path'));

    // 9c. Partial eraser: tapping the middle of a line cuts it into two pieces with a gap.
    {
      plugin.prefs.tool = 'pen'; plugin.prefs.pen.size = 2.5;
      const { target, x0, x1, y } = await stroke(16);
      const key = target.dataset.paKey, w = target.getBoundingClientRect().width;
      const before = plugin.strokesFor(NOTE, key).length;
      plugin.prefs.tool = 'eraser'; plugin.prefs.eraser = { mode: 'partial', size: 12 };
      const mid = (x0 + x1) / 2;
      fire('pointerdown', mid, y); fire('pointerup', mid, y);
      const list = plugin.strokesFor(NOTE, key);
      check('partial eraser splits the stroke in two', list.length === before + 1, { before, after: list.length });
      const [left, right] = list.slice(-2);
      const lx = left && left.pts[left.pts.length - 1][0] * w, rx = right && right.pts[0][0] * w;
      const gap = rx - lx, want = 2 * (12 + 2.5 / 2);
      check('cut gap matches eraser size', left && right && Math.abs(gap - want) < 2, { gap, want });
      check('pieces keep color/width', right && right.color === left.color && right.width === 2.5);
      plugin.undoLast();
      check('undo glues the stroke back together', plugin.strokesFor(NOTE, key).length === before);
      plugin.redoLast();
      check('redo cuts it again', plugin.strokesFor(NOTE, key).length === before + 1);
      // A swipe along the whole line with partial mode removes it entirely.
      const n0 = plugin.strokesFor(NOTE, key).length;
      fire('pointerdown', x0 - 20, y); fire('pointermove', x1 + 20, y); fire('pointerup', x1 + 20, y);
      check('partial swipe along the line erases all of it', plugin.strokesFor(NOTE, key).length === n0 - 2);
      plugin.undoLast();
      check('one undo restores the whole partial swipe', plugin.strokesFor(NOTE, key).length === n0);
      // Eraser card opens from the toolbar with the mode switch.
      bar().querySelector('[aria-label="Eraser options"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      bar().querySelector('[aria-label="Whole stroke"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      check('eraser card switches mode', plugin.prefs.eraser.mode === 'stroke');
      bar().querySelector('[aria-label="Eraser size 4 of 4"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      check('eraser size set from the card', plugin.prefs.eraser.size === 30);
      bar().querySelector('[aria-label="Eraser options"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      plugin.prefs.eraser = { mode: 'stroke', size: 12 };
    }

    // 10. Finger (touch pointer) doesn't draw; mouse draws on desktop.
    plugin.prefs.tool = 'pen';
    const n2 = nStrokes();
    await stroke(3, { pointerType: 'touch' });
    check('finger does not draw', nStrokes() === n2);

    // 10b. Toolbar sits inside the note area, can be dragged, remembers it, and resets on double-tap.
    {
      const root = view.contentEl, rr = () => root.getBoundingClientRect(), br = () => bar().getBoundingClientRect();
      check('toolbar starts inside the note area (not over the header)', br().top >= rr().top + 4 && br().right <= rr().right, { bar: br().top, root: rr().top });
      const grip = bar().querySelector('[aria-label^="Move toolbar"]');
      const g = grip.getBoundingClientRect(), gx = g.left + g.width / 2, gy = g.top + g.height / 2;
      const ev = (type, x, y) => grip.dispatchEvent(new PointerEvent(type, { pointerType: 'pen', pointerId: 9, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      ev('pointerdown', gx, gy); ev('pointermove', gx - 100, gy + 100); ev('pointermove', rr().left + 5, rr().bottom - 5); ev('pointerup', rr().left + 5, rr().bottom - 5);
      check('dragging moves the toolbar to the bottom-left', Math.abs(br().left - rr().left - 8) < 2 && Math.abs(rr().bottom - br().bottom - 8) < 2, { bar: br(), root: rr() });
      check('position remembered in prefs', plugin.prefs.barPos && plugin.prefs.barPos.x === 0 && plugin.prefs.barPos.y === 1, plugin.prefs.barPos);
      plugin.prefs.tool = 'pen'; plugin.refreshToolbars();
      bar().querySelector('[aria-label="Color and size"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      const pr = bar().children[1].getBoundingClientRect();
      check('color card opens upward when the toolbar is low', pr.bottom <= br().top, { card: pr.bottom, bar: br().top });
      bar().querySelector('[aria-label="Color and size"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      const g2 = grip.getBoundingClientRect();
      for (let i = 0; i < 2; i++) { ev('pointerdown', g2.left + 5, g2.top + 5); ev('pointerup', g2.left + 5, g2.top + 5); }
      check('double-tap on grip snaps back to top-right', plugin.prefs.barPos === null && Math.abs(br().top - rr().top - 8) < 2 && Math.abs(rr().right - br().right - 8) < 2);
    }

    // ===== v1.6 features =====
    const drawPts = (pts, o = {}) => {
      fire('pointerdown', pts[0][0], pts[0][1], o);
      for (const q of pts.slice(1)) {
        const el = document.elementFromPoint(q[0], q[1]) || document.body;
        el.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'pen', pointerId: 7, clientX: q[0], clientY: q[1], pressure: q[2] || 0.5, bubbles: true, cancelable: true, buttons: 1 }));
      }
      const L = pts[pts.length - 1];
      fire('pointerup', L[0], L[1], o);
    };
    const frameOf_ = (el) => { const r = el.getBoundingClientRect(), width = el.offsetWidth || r.width || 1; return { left: r.left, top: r.top, width, s: (r.width / width) || 1 }; };
    const lastStroke = (sec) => { const l = plugin.strokesFor(NOTE, sec.dataset.paKey); return l[l.length - 1]; };
    // The most recently drawn stroke, whichever paragraph it landed in (layout-independent).
    const lastAdded = () => { const a = plugin.undoStack[plugin.undoStack.length - 1]; return a && a.type === 'add' ? a.s : null; };
    const at = async (i) => { const t = sections()[i]; t.scrollIntoView({ block: 'center' }); await sleep(60); return { t, r: t.getBoundingClientRect() }; };

    // A. Straight highlighter: a wobbly highlight is stored as one flat line.
    {
      const { t, r } = await at(22);
      plugin.prefs.tool = 'hl'; plugin.prefs.hl.straight = true; plugin.prefs.smoothing = 0;
      drawPts(Array.from({ length: 20 }, (_, i) => [r.left + 30 + i * 10, r.top + 12 + Math.sin(i) * 3]));
      const s = lastStroke(t);
      check('straight highlighter stores a 2-point line', s.pts.length === 2, s.pts);
      check('nearly-flat straight line snaps exactly flat', s.pts[0][1] === s.pts[1][1], s.pts);
      plugin.prefs.hl.straight = false;
    }

    // B. Hold to straighten: a wobbly pen line + pause becomes straight; a circle + pause doesn't.
    {
      const { t, r } = await at(23);
      plugin.prefs.tool = 'pen'; plugin.prefs.holdToStraighten = true;
      const pts = Array.from({ length: 20 }, (_, i) => [r.left + 30 + i * 12, r.top + 10 + i * 1.5 + Math.sin(i * 2) * 2]);
      fire('pointerdown', pts[0][0], pts[0][1]);
      for (const q of pts.slice(1)) fire('pointermove', q[0], q[1]);
      await sleep(650);
      const L = pts[pts.length - 1]; fire('pointerup', L[0], L[1]);
      const s = lastStroke(t);
      check('hold to straighten turns a wobbly line straight', s.pts.length === 2, s.pts.length);
      const c = Array.from({ length: 30 }, (_, i) => [r.left + 200 + 30 * Math.cos(i / 29 * 6.2), r.top + 20 + 20 * Math.sin(i / 29 * 6.2)]);
      fire('pointerdown', c[0][0], c[0][1]);
      for (const q of c.slice(1)) fire('pointermove', q[0], q[1]);
      await sleep(650);
      fire('pointerup', c[29][0], c[29][1]);
      check('holding at the end of a circle leaves it a circle', lastStroke(t).pts.length > 10);
    }

    // C. Smoothing: a jittery line comes out calmer, but still ends exactly where the pen lifted.
    {
      const { t, r } = await at(24);
      const jitter = Array.from({ length: 40 }, (_, i) => [r.left + 30 + i * 6, r.top + 15 + (i % 2 ? 4 : -4)]);
      const spread = (s) => { const ys = s.pts.slice(1, -1).map(p => p[1]); return Math.max(...ys) - Math.min(...ys); };
      plugin.prefs.smoothing = 0; drawPts(jitter); const raw = lastStroke(t);
      plugin.prefs.smoothing = 60; drawPts(jitter.map(p => [p[0], p[1] + 20])); const smooth = lastStroke(t);
      check('smoothing reduces wobble', spread(smooth) < spread(raw) * 0.6, { raw: spread(raw), smooth: spread(smooth) });
      const w = t.getBoundingClientRect().width, end = smooth.pts[smooth.pts.length - 1], want = jitter[39];
      check('smoothed line still ends at the pen', Math.abs(end[0] * w + t.getBoundingClientRect().left - want[0]) < 1.5, { end, want });
      plugin.prefs.smoothing = 30;
    }

    // D. Fountain pen: pressure is stored and drawn as a filled, varying-width shape.
    {
      const { t, r } = await at(25);
      plugin.prefs.tool = 'pen'; plugin.prefs.pen.type = 'fountain'; plugin.prefs.pen.size = 4;
      drawPts(Array.from({ length: 25 }, (_, i) => [r.left + 30 + i * 10, r.top + 15, 0.1 + 0.035 * i]));
      const s = lastStroke(t);
      check('fountain stroke stores pressure', s.type === 'fountain' && s.pts.every(p => p.length === 3), s.pts[3]);
      const path = t.querySelector('.pa-layer-ink path:last-child');
      check('fountain stroke drawn as a filled outline', path.getAttribute('fill') === s.color && path.getAttribute('stroke') === 'none');
      plugin.prefs.pen.type = 'ball'; plugin.prefs.pen.size = 2.5;
    }

    // E. Eraser filter + auto switch-back.
    {
      const { t, r } = await at(26);
      const y = r.top + 15, xs = [r.left + 40, r.left + 260];
      plugin.prefs.tool = 'hl'; drawPts([[xs[0], y], [xs[1], y]]);
      plugin.prefs.tool = 'pen'; plugin.prefs.lastDrawTool = 'pen'; drawPts([[xs[0], y], [xs[1], y]]);
      const kinds = () => plugin.strokesFor(NOTE, t.dataset.paKey).map(s => s.kind).join(',');
      plugin.prefs.tool = 'eraser'; plugin.prefs.eraser = { mode: 'stroke', size: 12, only: 'hl', autoReturn: true };
      drawPts([[r.left + 150, y - 30], [r.left + 150, y + 30]]);
      check('"Highlighter" eraser leaves pen ink alone', kinds() === 'pen', kinds());
      check('eraser switches back to the last pen/highlighter', plugin.prefs.tool === 'pen');
      plugin.prefs.eraser = { mode: 'stroke', size: 12, only: 'all', autoReturn: false };
    }

    // F. Favorites: save current pen, change it, one tap brings it back; tap again to remove.
    {
      plugin.prefs.tool = 'pen'; plugin.prefs.pen.color = '#1c7ed6'; plugin.prefs.pen.size = 4; plugin.prefs.favorites = [];
      plugin.refreshToolbars();
      const tapEl = (el) => el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      tapEl(bar().querySelector('[aria-label="Color and size"]'));
      tapEl(bar().querySelector('[aria-label="Favorite"]'));
      check('save as favorite', plugin.prefs.favorites.length === 1 && plugin.prefs.favorites[0].color === '#1c7ed6', plugin.prefs.favorites);
      const chip = bar().querySelector('[aria-label^="Favorite 1"]');
      check('favorite chip appears in the toolbar', !!chip);
      plugin.prefs.pen.color = '#000000'; plugin.prefs.pen.size = 1.5; plugin.prefs.tool = 'hl'; plugin.refreshToolbars();
      tapEl(bar().querySelector('[aria-label^="Favorite 1"]'));
      check('tapping a favorite restores tool, color and size', plugin.prefs.tool === 'pen' && plugin.prefs.pen.color === '#1c7ed6' && plugin.prefs.pen.size === 4);
      tapEl(bar().querySelector('[aria-label="Color and size"]'));
      check('card offers to remove a matching favorite', bar().querySelector('[aria-label="Favorite"]').textContent.includes('Remove'));
      tapEl(bar().querySelector('[aria-label="Favorite"]'));
      check('favorite removed', plugin.prefs.favorites.length === 0 && !bar().querySelector('[aria-label^="Favorite 1"]'));
      tapEl(bar().querySelector('[aria-label="Color and size"]'));
      plugin.prefs.pen.color = '#e03131'; plugin.prefs.pen.size = 2.5;
    }

    // G. Lasso: select two strokes, move them, undo/redo, recolor, delete, undo.
    {
      const { t, r } = await at(28);
      plugin.prefs.tool = 'pen'; plugin.prefs.smoothing = 0;
      drawPts([[r.left + 60, r.top + 10], [r.left + 160, r.top + 10]]);
      drawPts([[r.left + 60, r.top + 30], [r.left + 160, r.top + 30]]);
      const [a, b] = plugin.strokesFor(NOTE, t.dataset.paKey).slice(-2);
      const a0 = JSON.stringify(a.pts);
      plugin.prefs.tool = 'lasso'; plugin.refreshToolbars();
      const loop = Array.from({ length: 24 }, (_, i) => [r.left + 110 + 80 * Math.cos(i / 23 * 6.3), r.top + 20 + 35 * Math.sin(i / 23 * 6.3)]);
      // Check the dashed loop is drawn under the pen while it's being drawn.
      fire('pointerdown', loop[0][0], loop[0][1]);
      for (const q of loop.slice(1)) fire('pointermove', q[0], q[1]);
      const lp = document.querySelector('.pa-lasso path').getBoundingClientRect();
      const lx = Math.min(...loop.map(q => q[0])), ly = Math.min(...loop.map(q => q[1]));
      check('lasso loop is drawn under the pen', Math.abs(lp.left - lx) < 3 && Math.abs(lp.top - ly) < 3, { loop: [lx, ly], drawn: [lp.left, lp.top] });
      fire('pointerup', loop[23][0], loop[23][1]);
      check('lasso selects the strokes inside the loop', plugin.selected.has(a) && plugin.selected.has(b) && plugin.selected.size === 2, plugin.selected.size);
      const menu = document.querySelector('.pa-selmenu');
      check('selection menu shows', vis(menu));
      check('selected strokes get a halo', t.querySelectorAll('.pa-layer-ink path').length >= 4);
      drawPts([[r.left + 110, r.top + 20], [r.left + 140, r.top + 28]]);   // small move: stays in this paragraph
      const w = t.getBoundingClientRect().width;
      check('dragging inside the box moves the selection', Math.abs(a.pts[0][1] - (JSON.parse(a0)[0][1] + 8)) < 0.2 && Math.abs((a.pts[0][0] - JSON.parse(a0)[0][0]) * w - 30) < 1, a.pts[0]);
      plugin.undoLast();
      check('undo moves it back', JSON.stringify(a.pts) === a0);
      plugin.redoLast();
      check('redo moves it again', JSON.stringify(a.pts) !== a0);
      menu.querySelector('[aria-label="Recolor #40c057"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      check('recolor from the menu', a.color === '#40c057' && b.color === '#40c057');
      const n0 = plugin.strokesFor(NOTE, t.dataset.paKey).length;
      menu.querySelector('[aria-label="Delete selection"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      check('delete removes the selection', plugin.strokesFor(NOTE, t.dataset.paKey).length === n0 - 2 && plugin.selected.size === 0 && !vis(menu));
      plugin.undoLast();
      const l = plugin.strokesFor(NOTE, t.dataset.paKey);
      check('undo brings deleted strokes back in order', l.length === n0 && l.indexOf(a) < l.indexOf(b) && l.indexOf(a) >= 0);
      plugin.prefs.tool = 'pen'; plugin.prefs.smoothing = 30; plugin.refreshToolbars();
    }

    // H. Lifting the pen outside the note still ends the stroke (no merged strokes).
    {
      const { t, r } = await at(30);
      plugin.prefs.tool = 'pen';
      const n0 = plugin.strokesFor(NOTE, t.dataset.paKey).length;
      fire('pointerdown', r.left + 40, r.top + 10); fire('pointermove', r.left + 120, r.top + 10);
      document.body.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'pen', pointerId: 7, clientX: 5000, clientY: r.top + 10, bubbles: true }));
      drawPts([[r.left + 40, r.top + 30], [r.left + 120, r.top + 30]]);
      check('lift outside the note ends the stroke', plugin.strokesFor(NOTE, t.dataset.paKey).length === n0 + 2);
    }

    // ===== v1.7: shapes =====
    {
      const { t, r } = await at(32);
      const key = t.dataset.paKey, w = () => t.getBoundingClientRect().width;
      plugin.prefs.shape.rough = 0; plugin.prefs.shape.fill = null; plugin.prefs.shape.edges = 'sharp';
      const shape = (kind, x0, y0, x1, y1) => { plugin.prefs.tool = 'shape'; plugin.prefs.shape.kind = kind; drawPts([[x0, y0], [(x0 + x1) / 2, (y0 + y1) / 2], [x1, y1]]); return lastStroke(t); };
      const box = (s) => { const R = t.getBoundingClientRect(); const xs = s.pts.map(p => p[0] * R.width + R.left), ys = s.pts.map(p => p[1] + R.top); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
      const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1.5);

      const x0 = r.left + 40, y0 = r.top + 10;
      let s = shape('rect', x0, y0, x0 + 160, y0 + 60);
      check('rectangle drag: closed 4-corner shape', s.geom === 'rect' && s.pts.length === 5, s.pts.length);
      check('rectangle matches the drag', near(box(s), [x0, y0, x0 + 160, y0 + 60]), box(s));
      const d = t.querySelector('.pa-layer-ink path:last-child').getAttribute('d');
      check('rectangle drawn with sharp corners (no smoothing)', !d.includes('Q') && d.includes('L'));
      s = shape('rect', x0, y0, x0 + 100, y0 + 94);
      check('near-square snaps to a perfect square', near(box(s), [x0, y0, x0 + 100, y0 + 100]), box(s));
      s = shape('ellipse', x0, y0, x0 + 120, y0 + 50);
      check('ellipse fills the drag box', s.pts.length === 65 && near(box(s), [x0, y0, x0 + 120, y0 + 50]), box(s));
      shape('ellipse', x0 + 64, y0 + 60, x0, y0);               // dragged up-left, nearly square
      s = lastAdded();
      const bb = (() => { const el = [...document.querySelectorAll('[data-pa-key]')].find(e => plugin.strokesFor(NOTE, e.dataset.paKey).includes(s)); const R = el.getBoundingClientRect(); const xs = s.pts.map(p => p[0] * R.width + R.left), ys = s.pts.map(p => p[1] + R.top); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; })();
      check('near-round ellipse snaps to a circle (any drag direction)', Math.abs((bb[2] - bb[0]) - (bb[3] - bb[1])) < 1.5, bb);
      s = shape('triangle', x0, y0, x0 + 100, y0 + 80);
      check('triangle: apex top-center, base at the bottom', s.pts.length === 4 && Math.abs(s.pts[0][0] * w() + t.getBoundingClientRect().left - (x0 + 50)) < 1.5);
      s = shape('line', x0, y0, x0 + 150, y0 + 6);
      check('near-flat line snaps flat', s.pts.length === 2 && s.pts[0][1] === s.pts[1][1], s.pts);
      s = shape('arrow', x0, y0, x0 + 150, y0 + 70);
      check('arrow: shaft + two-sided head', s.pts.length === 5 && s.pts[1][0] === s.pts[3][0] && s.pts[1][1] === s.pts[3][1]);
      const n0 = plugin.strokesFor(NOTE, key).length;
      plugin.prefs.shape.kind = 'rect'; drawPts([[x0, y0], [x0 + 2, y0 + 2]]);
      check('a tap with the shapes tool draws nothing', plugin.strokesFor(NOTE, key).length === n0);
      plugin.undoLast();
      check('undo removes the last shape', plugin.strokesFor(NOTE, key).length === n0 - 1);

      // Partial eraser through a rectangle keeps the pieces as sharp-cornered shapes (fresh paragraph).
      const { t: t2, r: r2 } = await at(34);
      plugin.prefs.tool = 'shape'; plugin.prefs.shape.kind = 'rect';
      const ex = r2.left + 40, ey = r2.top + 10;
      drawPts([[ex, ey], [ex + 160, ey + 60]]);
      s = lastStroke(t2);
      plugin.prefs.tool = 'eraser'; plugin.prefs.eraser = { mode: 'partial', size: 12, only: 'all', autoReturn: false };
      const beforeList = [...plugin.strokesFor(NOTE, t2.dataset.paKey)];
      fire('pointerdown', ex + 80, ey); fire('pointerup', ex + 80, ey);
      const after = plugin.strokesFor(NOTE, t2.dataset.paKey), pieces = after.filter(x => !beforeList.includes(x));
      check('partial eraser opens one gap in a rectangle (stays one open outline, sharp corners)', !after.includes(s) && pieces.length === 1 && pieces[0].geom === 'rect' && pieces[0].pts.length === 6, pieces.map(x => x.pts.length));
      plugin.prefs.eraser = { mode: 'stroke', size: 12, only: 'all', autoReturn: false };

      // Shapes card: picker switches the kind, and the Shapes button icon follows.
      plugin.prefs.tool = 'shape'; plugin.refreshToolbars();
      const tapEl = (el) => el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      tapEl(bar().querySelector('[aria-label="Color and size"]'));
      tapEl(bar().querySelector('[aria-label="Triangle"]'));
      check('shape picker selects triangle', plugin.prefs.shape.kind === 'triangle');
      check('Shapes button shows the triangle icon', bar().querySelector('[aria-label="Shapes"] span').dataset.kind === 'triangle');
      tapEl(bar().querySelector('[aria-label="#40c057"]'));
      check('shape color from the card', plugin.prefs.shape.color === '#40c057');
      tapEl(bar().querySelector('[aria-label="Color and size"]'));
      plugin.prefs.shape = { kind: 'rect', color: '#1c7ed6', size: 2.5, dash: 'solid', fill: null, rough: 0, edges: 'sharp', opacity: 1 };
    }

    // ===== lasso: dropping a drawing on another paragraph moves it into that paragraph =====
    {
      const { t: a, r } = await at(37);
      const b = sections()[38];
      plugin.prefs.tool = 'pen'; plugin.prefs.smoothing = 0;
      drawPts([[r.left + 60, r.top + 12], [r.left + 160, r.top + 12]]);
      const s = lastStroke(a), a0 = JSON.stringify(s.pts);
      plugin.prefs.tool = 'lasso'; plugin.refreshToolbars();
      drawPts(Array.from({ length: 24 }, (_, i) => [r.left + 110 + 70 * Math.cos(i / 23 * 6.3), r.top + 12 + 20 * Math.sin(i / 23 * 6.3)]));
      check('lasso picked the line', plugin.selected.has(s) && plugin.selected.size === 1);
      const rb = b.getBoundingClientRect(), dy = (rb.top + 20) - (r.top + 12);
      drawPts([[r.left + 110, r.top + 12], [r.left + 110, r.top + 12 + dy / 2], [r.left + 110, r.top + 12 + dy]]);
      const inB = plugin.strokesFor(NOTE, b.dataset.paKey), moved = inB[inB.length - 1];
      check('dropped on another paragraph: ink moves into it', !plugin.strokesFor(NOTE, a.dataset.paKey).includes(s) && moved && moved.color === s.color);
      const rb2 = b.getBoundingClientRect();
      check('...and stays exactly where it was dropped', moved && Math.abs(moved.pts[0][1] + rb2.top - (rb.top + 20)) < 1.5 && Math.abs(moved.pts[0][0] * rb2.width + rb2.left - (r.left + 60)) < 1.5, moved && moved.pts[0]);
      check('...and is still selected', plugin.selected.has(moved));
      plugin.undoLast();
      check('undo puts it back in its paragraph, unchanged', plugin.strokesFor(NOTE, a.dataset.paKey).includes(s) && JSON.stringify(s.pts) === a0 && !plugin.strokesFor(NOTE, b.dataset.paKey).includes(moved));
      plugin.redoLast();
      check('redo moves it again', plugin.strokesFor(NOTE, b.dataset.paKey).includes(moved));
      plugin.clearSelection(); plugin.prefs.tool = 'pen'; plugin.prefs.smoothing = 30; plugin.refreshToolbars();
    }

    // ===== Select: picks anything the loop surrounds even partly, or touches =====
    {
      const { t, r } = await at(36);
      plugin.prefs.tool = 'pen'; plugin.prefs.smoothing = 0;
      const y1 = r.top + 12, y2 = r.top + 40;
      drawPts([[r.left + 20, y1], [r.left + 300, y1]]);            // long line
      const long = lastStroke(t);
      drawPts([[r.left + 20, y2], [r.left + 60, y2]]);             // short line, far left
      const short = lastStroke(t);
      plugin.prefs.tool = 'lasso'; plugin.clearSelection(); plugin.refreshToolbars();
      // A small loop around only the right end of the long line.
      drawPts(Array.from({ length: 20 }, (_, i) => [r.left + 280 + 30 * Math.cos(i / 19 * 6.3), y1 + 15 * Math.sin(i / 19 * 6.3)]));
      check('loop around part of a drawing selects it', plugin.selected.has(long) && !plugin.selected.has(short), plugin.selected.size);
      plugin.clearSelection();
      // A quick slash across the short line (no enclosed points) selects it.
      drawPts([[r.left + 40, y2 - 15], [r.left + 42, y2 + 15]]);
      check('a line drawn across a drawing selects it', plugin.selected.has(short) && !plugin.selected.has(long), plugin.selected.size);
      plugin.clearSelection();
      // A loop in empty space selects nothing.
      drawPts(Array.from({ length: 20 }, (_, i) => [r.left + 160 + 20 * Math.cos(i / 19 * 6.3), y2 + 10 * Math.sin(i / 19 * 6.3)]));
      check('a loop that touches nothing selects nothing', plugin.selected.size === 0, plugin.selected.size);
      check('tool is labelled Select', !!bar().querySelector('[aria-label="Select"]'));
      plugin.prefs.tool = 'pen'; plugin.prefs.smoothing = 30; plugin.refreshToolbars();
    }

    // ===== dashed lines =====
    {
      const { t, r } = await at(17);
      plugin.prefs.tool = 'pen'; plugin.prefs.pen.type = 'ball'; plugin.prefs.pen.dash = 'dash'; plugin.prefs.smoothing = 0;
      drawPts([[r.left + 30, r.top + 12], [r.left + 250, r.top + 12]]);
      let s = lastStroke(t), path = t.querySelector('.pa-layer-ink path:last-child');
      check('dashed pen stroke saved + drawn dashed', s.dash === 'dash' && /\d/.test(path.getAttribute('stroke-dasharray') || ''), path.getAttribute('stroke-dasharray'));
      plugin.prefs.pen.dash = 'dot';
      drawPts([[r.left + 30, r.top + 30], [r.left + 250, r.top + 30]]);
      check('dotted pen stroke', lastStroke(t).dash === 'dot' && (t.querySelector('.pa-layer-ink path:last-child').getAttribute('stroke-dasharray') || '').startsWith('0.01'));
      plugin.prefs.pen.type = 'fountain';
      drawPts([[r.left + 30, r.top + 48, .5], [r.left + 250, r.top + 48, .5]]);
      check('fountain pen ignores dashes', !lastStroke(t).dash);
      plugin.prefs.pen.type = 'ball';
      plugin.prefs.tool = 'shape'; plugin.prefs.shape.kind = 'rect'; plugin.prefs.shape.dash = 'dash';
      drawPts([[r.left + 280, r.top + 5], [r.left + 380, r.top + 60]]);
      check('dashed shape', lastStroke(t).dash === 'dash' && lastStroke(t).geom === 'rect');
      // Card controls
      plugin.prefs.tool = 'pen'; plugin.prefs.pen.dash = 'solid'; plugin.refreshToolbars();
      const tapEl = (el) => el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      tapEl(bar().querySelector('[aria-label="Color and size"]'));
      tapEl(bar().querySelector('[aria-label="Dashed"]'));
      check('Dashed picked in the pen card', plugin.prefs.pen.dash === 'dash');
      check('size previews show the dash', !!bar().querySelector('[aria-label="Size 1 of 4"] path').getAttribute('stroke-dasharray'));
      tapEl(bar().querySelector('[aria-label="Color and size"]'));
      plugin.prefs.pen.dash = 'solid'; plugin.prefs.shape.dash = 'solid'; plugin.prefs.smoothing = 30;
    }

    // ===== laser pointer =====
    {
      const { t, r } = await at(18);
      const total = () => Object.values(plugin.inkData(NOTE).sections).reduce((n, l) => n + l.length, 0);
      const n0 = total(), u0 = plugin.undoStack.length;
      plugin.prefs.tool = 'laser'; plugin.refreshToolbars();
      const pts = Array.from({ length: 15 }, (_, i) => [r.left + 30 + i * 12, r.top + 20]);
      fire('pointerdown', pts[0][0], pts[0][1]);
      for (const q of pts.slice(1)) fire('pointermove', q[0], q[1]);
      const lst = plugin.sessions.get(view);
      plugin.laserFrame(lst);           // draw a frame directly: background tabs may not run animation frames
      const box = document.querySelector('.pa-laser');
      const dot = box && box.querySelector('circle');
      const dr = dot && dot.getBoundingClientRect();
      check('laser shows a dot under the pen', dr && Math.abs((dr.left + dr.right) / 2 - pts[14][0]) < 2 && Math.abs((dr.top + dr.bottom) / 2 - pts[14][1]) < 2, dr && [(dr.left + dr.right) / 2, (dr.top + dr.bottom) / 2, pts[14]]);
      check('laser draws a trail while pressed', box.querySelectorAll('line').length > 5);
      fire('pointermove', pts[14][0] + 40, pts[14][1] + 10);          // no waiting for a frame
      const d2 = box.querySelector('circle').getBoundingClientRect();
      check('laser dot follows the pen instantly (no frame lag)', Math.abs((d2.left + d2.right) / 2 - (pts[14][0] + 40)) < 1.5 && Math.abs((d2.top + d2.bottom) / 2 - (pts[14][1] + 10)) < 1.5);
      check('crosshair hidden while the laser is on', getComputedStyle(document.querySelector('.markdown-preview-view')).cursor === 'none');
      fire('pointerup', pts[14][0] + 40, pts[14][1] + 10);
      check('laser saves nothing and adds no undo step', total() === n0 && plugin.undoStack.length === u0);
      await sleep(1900);
      plugin.laserFrame(lst);
      check('laser trail and dot fade away', box.querySelectorAll('line').length === 0 && box.querySelector('circle').classList.contains('pa-hidden') && box.classList.contains('pa-hidden'));
      plugin.prefs.tool = 'pen'; plugin.refreshToolbars();
    }

    // ===== other tablets: a pen touchstart without iPad's touchType is still blocked from scrolling =====
    {
      const { t: t3 } = await at(3);
      const p = t3.querySelector('p');
      const pr = p.getBoundingClientRect();
      fire('pointerdown', pr.left + 20, pr.top + 10);                       // Android/Windows: pointerdown first...
      const ev = touch('touchstart', p, [{ identifier: 5, clientX: pr.left + 20, clientY: pr.top + 10 }]);   // ...then a plain touchstart
      check('pen touch on Android-style browsers is kept from scrolling', ev.defaultPrevented);
      fire('pointerup', pr.left + 20, pr.top + 10);
      plugin.undoLast();          // that tap made a pen dot
      await sleep(150);
      // A finger isn't treated as a pen (it scrolls; Pen Ink does the scrolling itself while annotating).
      const sc = view.contentEl.querySelector('.markdown-preview-view'), top0 = sc.scrollTop;
      const fg = (y) => [{ identifier: 6, clientX: pr.left + 40, clientY: y }];
      touch('touchstart', p, fg(pr.top + 200)); touch('touchmove', p, fg(pr.top + 120)); touch('touchend', p, [], fg(pr.top + 120));
      check('a finger drag scrolls the note', Math.abs(sc.scrollTop - top0 - 80) < 1, sc.scrollTop - top0);
      sc.scrollTop = top0;
    }

    // ===== Excalidraw-style options: fill, sloppiness, edges, opacity =====
    {
      const { t, r } = await at(20);
      const tapEl = (el) => el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      plugin.prefs.tool = 'shape';
      plugin.prefs.shape = { kind: 'rect', color: '#1c7ed6', size: 2.5, dash: 'solid', fill: '#a5d8ff', rough: 1, edges: 'sharp', opacity: 1 };
      drawPts([[r.left + 20, r.top + 5], [r.left + 180, r.top + 60]]);
      let s = lastStroke(t);
      check('filled sketchy rectangle saved with fill, sloppiness and a seed', s.fill === '#a5d8ff' && s.rough === 1 && typeof s.seed === 'number');
      const fillPath = [...t.querySelectorAll('.pa-layer-hl path')].find(p => p.getAttribute('fill') === '#a5d8ff');
      check('fill is drawn under the text (blended layer)', !!fillPath);
      const d1 = t.querySelector('.pa-layer-ink path:last-child').getAttribute('d');
      check('sketchy outline is hand-drawn (curved, two passes)', d1.includes('Q') && (d1.match(/M/g) || []).length >= 8, (d1.match(/M/g) || []).length);
      t.paChild.draw();
      check('sketchy look stays the same on redraw', t.querySelector('.pa-layer-ink path:last-child').getAttribute('d') === d1);
      plugin.prefs.shape = { kind: 'rect', color: '#1c7ed6', size: 2.5, dash: 'solid', fill: null, rough: 0, edges: 'round', opacity: 0.5 };
      drawPts([[r.left + 220, r.top + 5], [r.left + 380, r.top + 60]]);
      s = lastStroke(t);
      const d2 = t.querySelector('.pa-layer-ink path:last-child');
      check('round edges: clean outline with curved corners', s.edges === 'round' && !d2.getAttribute('d').includes('Q') && d2.getAttribute('d').split('L').length > 20);
      check('shape opacity applied', d2.getAttribute('stroke-opacity') === '0.5');
      plugin.prefs.tool = 'pen'; plugin.prefs.pen.opacity = 0.6; plugin.prefs.smoothing = 0;
      drawPts([[r.left + 20, r.top + 75], [r.left + 200, r.top + 75]]);
      check('pen opacity applied', lastAdded().opacity === 0.6);
      plugin.prefs.pen.opacity = 1;

      // Shapes card shows the new controls; Edges only for rectangles/triangles.
      plugin.prefs.tool = 'shape'; plugin.prefs.shape.kind = 'rect'; plugin.refreshToolbars();
      tapEl(bar().querySelector('[aria-label="Color and size"]'));
      check('shapes card has Fill, Sloppiness, Edges, Opacity', !!(bar().querySelector('[aria-label="No fill"]') && bar().querySelector('[aria-label="Sketchy"]') && bar().querySelector('[aria-label="Round"]') && bar().querySelector('input[aria-label="Opacity"]')));
      tapEl(bar().querySelector('[aria-label="Rough"]'));
      check('Rough picked from the card', plugin.prefs.shape.rough === 2);
      tapEl(bar().querySelector('[aria-label="Fill #ffec99"]'));
      check('Fill picked from the card', plugin.prefs.shape.fill === '#ffec99');
      tapEl(bar().querySelector('[aria-label="Ellipse"]'));
      check('Edges hidden for ellipses', !vis(bar().querySelector('[aria-label="Round"]').parentElement));
      tapEl(bar().querySelector('[aria-label="Line"]'));
      check('Fill hidden for lines', !vis(bar().querySelector('[aria-label="No fill"]').parentElement));
      tapEl(bar().querySelector('[aria-label="Color and size"]'));
      plugin.prefs.shape = { kind: 'rect', color: '#1c7ed6', size: 2.5, dash: 'solid', fill: null, rough: 0, edges: 'sharp', opacity: 1 };
    }

    // ===== Select: restyle, duplicate, layers =====
    {
      const { t, r } = await at(27);
      const tapEl = (el) => el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      const key = t.dataset.paKey, list = () => plugin.strokesFor(NOTE, key);
      plugin.prefs.tool = 'shape'; plugin.prefs.shape.kind = 'rect';
      drawPts([[r.left + 30, r.top + 5], [r.left + 150, r.top + 55]]);
      const rect = lastStroke(t);
      plugin.prefs.tool = 'pen'; plugin.prefs.smoothing = 0;
      drawPts([[r.left + 60, r.top + 30], [r.left + 260, r.top + 30]]);
      const line = lastStroke(t);
      plugin.prefs.tool = 'lasso'; plugin.refreshToolbars();
      drawPts(Array.from({ length: 24 }, (_, i) => [r.left + 150 + 150 * Math.cos(i / 23 * 6.3), r.top + 30 + 45 * Math.sin(i / 23 * 6.3)]));
      check('selected the rectangle and the line', plugin.selected.has(rect) && plugin.selected.has(line));
      const ui = () => [document.querySelector('.pa-selmenu'), document.querySelector('.pa-selcard')];
      tapEl(ui()[0].querySelector('[aria-label="Style selection"]'));
      const card = ui()[1];
      check('style card opens with all options for a shape + pen line', vis(card) && ['Width 1 of 4', 'Dashed', 'Fill #ffc9c9', 'Sketchy', 'Round'].every(l => card.querySelector(`[aria-label="${l}"]`)) && !!card.querySelector('input[aria-label="Opacity"]'));
      tapEl(card.querySelector('[aria-label="Fill #ffc9c9"]'));
      check('fill applies to the shape only', rect.fill === '#ffc9c9' && !line.fill);
      plugin.undoLast();
      check('undo removes the fill', !rect.fill);
      plugin.redoLast();
      tapEl(card.querySelector('[aria-label="Width 4 of 4"]'));
      check('width applies to both', rect.width === 7 && line.width === 7);
      tapEl(card.querySelector('[aria-label="Rough"]'));
      check('sloppiness applies to the shape only', rect.rough === 2 && !line.rough && typeof rect.seed === 'number');
      tapEl(card.querySelector('[aria-label="Dashed"]'));
      check('line style applies', rect.dash === 'dash' && line.dash === 'dash');
      const u0 = plugin.undoStack.length, input = card.querySelector('input[aria-label="Opacity"]');
      input.value = '40'; input.dispatchEvent(new Event('input')); input.value = '30'; input.dispatchEvent(new Event('input'));
      check('opacity previews while dragging (no undo steps yet)', rect.opacity === 0.3 && line.opacity === 0.3 && plugin.undoStack.length === u0);
      input.dispatchEvent(new Event('change'));
      check('letting go records one undo step', plugin.undoStack.length === u0 + 1);
      plugin.undoLast();
      check('undo restores opacity', rect.opacity === 1 && line.opacity === 1);
      // Duplicate
      const n0 = list().length;
      tapEl(ui()[0].querySelector('[aria-label="Duplicate"]'));
      const copies = [...plugin.selected];
      const w = t.getBoundingClientRect().width;
      check('duplicate adds copies and selects them', list().length === n0 + 2 && copies.length === 2 && !plugin.selected.has(rect) && copies.every(c => list().includes(c)));
      const rc = copies.find(c => c.geom === 'rect');
      check('copies are nudged and keep their style', rc && rc.fill === '#ffc9c9' && Math.abs((rc.pts[0][0] - rect.pts[0][0]) * w - 16) < 0.5 && Math.abs(rc.pts[0][1] - rect.pts[0][1] - 16) < 0.2);
      plugin.undoLast();
      check('undo removes the copies', list().length === n0);
      // Layers
      plugin.clearSelection(); plugin.selected.add(rect); plugin.showSelection(plugin.sessions.get(view));
      tapEl(ui()[0].querySelector('[aria-label="Bring to front"]'));
      check('bring to front', list().indexOf(rect) === list().length - 1);
      tapEl(ui()[0].querySelector('[aria-label="Send to back"]'));
      check('send to back', list().indexOf(rect) === 0);
      plugin.undoLast(); plugin.undoLast();
      check('undo restores the original order', list().indexOf(rect) < list().indexOf(line));
      plugin.clearSelection();
      check('style card closes when the selection goes away', !vis(card));
      plugin.prefs.tool = 'pen'; plugin.prefs.smoothing = 30; plugin.refreshToolbars();
    }

    // ===== vertical toolbar =====
    {
      const tapEl = (el) => el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      plugin.prefs.barPos = { x: 0, y: 0.3 }; plugin.prefs.tool = 'pen'; plugin.refreshToolbars();
      tapEl(bar().querySelector('[aria-label="Make toolbar vertical"]'));
      const row = bar().children[0], br = bar().getBoundingClientRect(), root = view.contentEl.getBoundingClientRect();
      check('toolbar turns vertical', plugin.prefs.barVertical === true && getComputedStyle(row).flexDirection === 'column' && br.height > br.width * 2, [br.width, br.height]);
      check('vertical toolbar stays inside the note area', br.left >= root.left && br.bottom <= root.bottom + 1 && br.top >= root.top);
      check('Done becomes a check button', bar().querySelector('[aria-label="Done"]').getBoundingClientRect().width < 50);
      tapEl(bar().querySelector('[aria-label="Color and size"]'));
      const pr = bar().children[1].getBoundingClientRect();
      check('card opens beside the column', pr.left >= br.right, [pr.left, br.right]);
      tapEl(bar().querySelector('[aria-label="Color and size"]'));
      tapEl(bar().querySelector('[aria-label="Make toolbar horizontal"]'));
      const br2 = bar().getBoundingClientRect();
      check('and back to horizontal', plugin.prefs.barVertical === false && br2.width > br2.height);
      plugin.prefs.barPos = null; plugin.refreshToolbars(); plugin.sessions.get(view).toolbar.place();
    }

    // ===== circles are truly round =====
    {
      const { t, r } = await at(21);
      plugin.prefs.tool = 'shape';
      const circle = (rough, x0, y0, x1, y1) => {
        plugin.prefs.shape = { kind: 'ellipse', color: '#1c7ed6', size: 2.5, dash: 'solid', fill: null, rough, edges: 'sharp', opacity: 1 };
        drawPts([[x0, y0], [x1, y1]]);
        return { s: lastStroke(t), path: t.querySelector('.pa-layer-ink path:last-child') };
      };
      // Worst distance from the true circle, sampled along the drawn outline.
      const offRound = (path, cx, cy, rad) => {
        const len = path.getTotalLength(), m = path.getScreenCTM();
        let worst = 0;
        for (let i = 0; i <= 200; i++) {
          const p = path.getPointAtLength(len * i / 200), x = m.a * p.x + m.e, y = m.d * p.y + m.f;
          worst = Math.max(worst, Math.abs(Math.hypot(x - cx, y - cy) - rad));
        }
        return worst;
      };
      const x0 = r.left + 30, y0 = r.top + 4, D = 80;
      let c = circle(0, x0, y0, x0 + D, y0 + D);
      check('clean circle is drawn with true arcs', / A/.test(c.path.getAttribute('d')));
      check('clean circle is perfectly round', offRound(c.path, x0 + D / 2, y0 + D / 2, D / 2) < 0.6, offRound(c.path, x0 + D / 2, y0 + D / 2, D / 2));
      c = circle(1, x0 + 120, y0, x0 + 120 + D, y0 + D);
      const d = c.path.getAttribute('d');
      check('sketchy circle is a smooth curve (no kinks)', d.includes('C') && !d.includes('Q'));
      check('sketchy circle stays close to round', offRound(c.path, x0 + 120 + D / 2, y0 + D / 2, D / 2) < 4, offRound(c.path, x0 + 120 + D / 2, y0 + D / 2, D / 2));
      c = circle(0, x0 + 240, y0, x0 + 240 + 90, y0 + 76);     // 16% off square
      const xs = c.s.pts.map(p => p[0]), ys = c.s.pts.map(p => p[1]), w = t.getBoundingClientRect().width;
      check('a roughly square drag snaps to a circle', Math.abs((Math.max(...xs) - Math.min(...xs)) * w - (Math.max(...ys) - Math.min(...ys))) < 1.5);
      plugin.prefs.shape = { kind: 'rect', color: '#1c7ed6', size: 2.5, dash: 'solid', fill: null, rough: 0, edges: 'sharp', opacity: 1 };
    }

    // ===== one-time Obsidian Sync tip =====
    {
      const { t, r } = await at(31);
      window.__notices = [];
      plugin.prefs.syncTipShown = false;
      plugin.prefs.tool = 'pen';
      drawPts([[r.left + 30, r.top + 10], [r.left + 200, r.top + 10]]);
      await sleep(800);
      drawPts([[r.left + 30, r.top + 30], [r.left + 200, r.top + 30]]);
      await sleep(800);
      const tips = window.__notices.filter(n => n.includes('Sync all other types'));
      check('Sync tip shows once (first save)', tips.length === 1 && plugin.prefs.syncTipShown === true, window.__notices);
    }

    // ===== a very long stroke (pen never lifts) stays fast =====
    {
      const { t, r } = await at(10);
      plugin.prefs.tool = 'pen'; plugin.prefs.pen.type = 'ball'; plugin.prefs.holdToStraighten = false; plugin.prefs.smoothing = 0;
      const root = view.contentEl, st = plugin.sessions.get(view);
      const ev = (type, x, y) => root.dispatchEvent(new PointerEvent(type, { pointerType: 'pen', pointerId: 7, clientX: x, clientY: y, pressure: .5, bubbles: true, cancelable: true, buttons: 1 }));
      const cx = r.left + 150, cy = r.top + 40;
      const pt = (i) => [cx + (30 + (i % 400) / 20) * Math.cos(i / 15), cy + (30 + (i % 400) / 20) * Math.sin(i / 15)];
      ev('pointerdown', ...pt(0));
      const frame = [];
      for (let i = 1; i <= 6000; i++) {
        ev('pointermove', ...pt(i));
        if (i % 4 === 0) {                       // a "frame": what the screen redraw costs
          const S = st.stroke, t0 = performance.now();
          plugin.liveRender(S);
          frame.push(performance.now() - t0);
        }
      }
      const S = st.stroke;
      const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
      const early = med(frame.slice(20, 120)), late = med(frame.slice(-100));
      check('long stroke: each redraw costs about the same at the end as at the start', late < early * 3 + 0.05, { early: early.toFixed(3), late: late.toFixed(3) });
      check('long stroke: old parts are frozen into pieces', S.group.childNodes.length > 30, S.group.childNodes.length);
      const raw = S.s.pts.length;
      ev('pointerup', ...pt(6000));
      const saved = lastStroke(t);
      check('finished stroke is thinned out (same shape, fewer points)', saved.pts.length < raw * 0.8 && saved.pts.length > 100, { raw, saved: saved.pts.length });
      check('finished stroke is drawn as one piece again', t.querySelectorAll('.pa-layer-ink path').length >= 1 && !t.querySelector('.pa-layer-ink g'));
      plugin.undoLast();
      plugin.prefs.holdToStraighten = true; plugin.prefs.smoothing = 30;
    }

    // ===== pinch zoom: ink drawn while zoomed lands where it belongs at 100% =====
    {
      // A palm landing while you draw doesn't zoom.
      {
        const { t: tp, r: rp } = await at(13);
        plugin.prefs.tool = 'pen';
        fire('pointerdown', rp.left + 40, rp.top + 10); fire('pointermove', rp.left + 80, rp.top + 10);
        await sleep(150);
        const pp = tp.querySelector('p'), ff = (id, x, y) => ({ identifier: id, clientX: x, clientY: y });
        const ev = touch('touchstart', pp, [ff(1, rp.left + 200, rp.top + 40), ff(2, rp.left + 260, rp.top + 60)]);
        touch('touchmove', pp, [ff(1, rp.left + 150, rp.top + 40), ff(2, rp.left + 330, rp.top + 60)]);
        check('a palm landing mid-stroke neither zooms nor scrolls', ev.defaultPrevented && plugin.sessions.get(view).zoom.s === 1);
        touch('touchend', pp, [], [ff(1, 0, 0), ff(2, 0, 0)]);
        fire('pointerup', rp.left + 80, rp.top + 10);
        plugin.undoLast();
        await sleep(150);
      }
      const { t, r } = await at(13);
      const st = plugin.sessions.get(view), root = view.contentEl, p = t.querySelector('p');
      const tapEl = (el) => el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      const cx = r.left + 160, cy = r.top + 20;
      const content0 = [cx - r.left, cy - r.top];                 // what's under (cx, cy) at 100%
      const btnW = bar().querySelector('[aria-label="Pen"]').getBoundingClientRect().width;
      const f = (id, x, y) => ({ identifier: id, clientX: x, clientY: y });
      touch('touchstart', p, [f(1, cx - 50, cy), f(2, cx + 50, cy)]);
      touch('touchmove', p, [f(1, cx - 100, cy), f(2, cx + 100, cy)]);
      touch('touchend', p, [], [f(1, cx - 100, cy), f(2, cx + 100, cy)]);
      check('pinch zooms in (2x)', Math.abs(st.zoom.s - 2) < 0.01, st.zoom);
      check('the toolbar stays the same size while zoomed', Math.abs(bar().querySelector('[aria-label="Pen"]').getBoundingClientRect().width - btnW) < 0.5);
      const fr = frameOf_(t);
      check('the spot under your fingers stays under them', Math.abs((cx - fr.left) / fr.s - content0[0]) < 1 && Math.abs((cy - fr.top) / fr.s - content0[1]) < 1);
      check('zoom badge shows 2×', vis(bar().querySelector('[aria-label="Reset zoom"]')) && bar().querySelector('[aria-label="Reset zoom"]').textContent === '2×');
      // Draw a line at 2x, centered on (cx, cy).
      plugin.prefs.tool = 'pen'; plugin.prefs.smoothing = 0;
      drawPts([[cx - 40, cy], [cx, cy], [cx + 40, cy]]);
      const s = lastStroke(t), w = t.offsetWidth;
      const mid = [(s.pts[0][0] + s.pts[s.pts.length - 1][0]) / 2 * w, s.pts[0][1]];
      check('ink drawn while zoomed is saved at real size', Math.abs(mid[0] - content0[0]) < 1 && Math.abs(mid[1] - content0[1]) < 1 && Math.abs((s.pts[s.pts.length - 1][0] - s.pts[0][0]) * w - 40) < 1, { mid, content0 });
      // Eraser at 2x removes what's under it.
      plugin.prefs.tool = 'eraser'; plugin.prefs.eraser = { mode: 'stroke', size: 12, only: 'all', autoReturn: false };
      const n0 = plugin.strokesFor(NOTE, t.dataset.paKey).length;
      fire('pointerdown', cx + 30, cy); fire('pointerup', cx + 30, cy);
      check('eraser works while zoomed', plugin.strokesFor(NOTE, t.dataset.paKey).length === n0 - 1);
      plugin.undoLast();
      // Back to 100% with the badge: the line sits exactly where it was drawn over the text.
      tapEl(bar().querySelector('[aria-label="Reset zoom"]'));
      check('badge resets to 100%', st.zoom.s === 1 && !vis(bar().querySelector('[aria-label="Reset zoom"]')));
      const pr = t.querySelector('.pa-layer-ink path:last-child').getBoundingClientRect();
      check('…and the line lines up at 100%', Math.abs((pr.left + pr.right) / 2 - cx) < 1.5 && Math.abs((pr.top + pr.bottom) / 2 - cy) < 1.5, [(pr.left + pr.right) / 2, (pr.top + pr.bottom) / 2, cx, cy]);
      // Trackpad pinch / Ctrl + scroll.
      root.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -60, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
      check('Ctrl + scroll (trackpad pinch) zooms in', st.zoom.s > 1.5, st.zoom.s);
      root.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: 600, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
      check('…and back out, never below 100%', st.zoom.s === 1);
      // Zoom can't go past 4x.
      await sleep(150);
      touch('touchstart', p, [f(1, cx - 10, cy), f(2, cx + 10, cy)]);
      touch('touchmove', p, [f(1, cx - 300, cy), f(2, cx + 300, cy)]);
      touch('touchend', p, [], [f(1, 0, 0), f(2, 0, 0)]);
      check('zoom tops out at 4x', st.zoom.s === 4);
      plugin.resetZoom(st);
      plugin.prefs.tool = 'pen'; plugin.prefs.smoothing = 30; plugin.refreshToolbars();
    }

    // ===== finger scrolling and pinch always respond =====
    {
      const { t, r } = await at(15);
      const st = plugin.sessions.get(view), sc = view.contentEl.querySelector('.markdown-preview-view'), p = t.querySelector('p');
      const f = (id, x, y) => ({ identifier: id, clientX: x, clientY: y });
      const cx = r.left + 150, cy = r.top + 30;
      // Scroll with one finger, then pinch straight away (this used to do nothing on iPad).
      const top0 = sc.scrollTop;
      touch('touchstart', p, [f(1, cx, cy + 100)]); touch('touchmove', p, [f(1, cx, cy + 40)]); touch('touchend', p, [], [f(1, cx, cy + 40)]);
      check('one-finger scroll moves the note', Math.abs(sc.scrollTop - top0 - 60) < 1);
      touch('touchstart', p, [f(1, cx - 40, cy), f(2, cx + 40, cy)]);
      touch('touchmove', p, [f(1, cx - 80, cy), f(2, cx + 80, cy)]);
      check('pinch works right after scrolling', Math.abs(st.zoom.s - 2) < 0.01, st.zoom.s);
      // Lift one finger: the other keeps moving the page.
      touch('touchend', p, [f(2, cx + 80, cy)], [f(1, cx - 80, cy)]);
      const tx0 = st.zoom.tx;
      touch('touchmove', p, [f(2, cx + 20, cy)]);
      check('after a pinch, the remaining finger pans', Math.abs(st.zoom.tx - (tx0 - 60)) < 1, [tx0, st.zoom.tx]);
      touch('touchend', p, [], [f(2, cx + 20, cy)]);
      // Zoomed: sideways one-finger drag pans.
      const tx1 = st.zoom.tx;
      touch('touchstart', p, [f(3, cx, cy)]); touch('touchmove', p, [f(3, cx + 50, cy)]); touch('touchend', p, [], [f(3, cx + 50, cy)]);
      check('zoomed: one finger pans sideways', Math.abs(st.zoom.tx - Math.min(0, tx1 + 50)) < 1, [tx1, st.zoom.tx]);
      plugin.resetZoom(st);
      // A finger tap on a link still opens it.
      window.__linkClicks = 0;
      const a = t.querySelector('a'); a.scrollIntoView({ block: 'center' }); await sleep(450);   // clicks right after a pen stroke are ignored on purpose
      const ar = a.getBoundingClientRect(), lx = ar.left + 4, ly = ar.top + ar.height / 2;
      touch('touchstart', a, [f(4, lx, ly)]); touch('touchend', a, [], [f(4, lx, ly)]);
      check('a finger tap on a link opens it', window.__linkClicks === 1, window.__linkClicks);
      sc.scrollTop = top0;
    }

    // 11. Done removes the toolbar.
    bar().querySelector('[aria-label="Done"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    check('done closes annotation mode', !bar() && !plugin.sessions.has(view));
    check('done puts the zoom back to 100%', !(view.contentEl.querySelector('.markdown-reading-view').style.transform));

    const failed = results.filter(r => !r.ok);
    const out = document.createElement('pre');
    out.id = 'test-results';
    out.style.cssText = 'position:fixed;left:8px;bottom:8px;max-width:60vw;max-height:50vh;overflow:auto;background:#000c;color:#fff;padding:8px;font-size:12px;z-index:999;';
    out.textContent = results.map(r => (r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail))).join('\n') + `\n\n${results.length - failed.length}/${results.length} passed`;
    document.body.appendChild(out);
    console.log(out.textContent);
    return { passed: results.length - failed.length, total: results.length, failed };
  };

  if (/test=1/.test(location.search)) {
    const go = () => (window.__ready ? window.runPenInkTests() : setTimeout(go, 50));
    go();
  }
})();
