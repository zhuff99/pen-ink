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
    // Any uncaught error during the run fails it, even if every check passed.
    const uncaught = [];
    const onErr = (e) => uncaught.push(String(e.message || e.reason || e));
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onErr);

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

    // ===== Select: resize from a corner, rotate with the knob =====
    {
      const { t, r } = await at(27);
      const st = plugin.sessions.get(view), w = t.offsetWidth;
      const end = (s) => [(s.pts[s.pts.length - 1][0] - s.pts[0][0]) * w, s.pts[s.pts.length - 1][1] - s.pts[0][1]];
      const len = (s) => Math.hypot(...end(s));
      plugin.prefs.tool = 'pen'; plugin.prefs.smoothing = 0;
      drawPts([[r.left + 60, r.top + 30], [r.left + 110, r.top + 30], [r.left + 160, r.top + 30]]);
      const line = lastStroke(t);
      plugin.prefs.tool = 'shape';
      plugin.prefs.shape = { kind: 'ellipse', color: '#e03131', size: 2.5, dash: 'solid', fill: null, rough: 0, edges: 'sharp', opacity: 1 };
      drawPts([[r.left + 200, r.top + 10], [r.left + 300, r.top + 50]]);
      const oval = lastStroke(t);
      plugin.prefs.tool = 'lasso'; plugin.refreshToolbars();
      plugin.clearSelection(); plugin.selected.add(line); plugin.showSelection(st);
      const b0 = { ...st.selBox }, [kx, ky] = plugin.knobAt(b0);
      check('selection shows 4 resize handles and a rotate knob', document.querySelectorAll('.pa-selbox .pa-handle').length === 4 && vis(document.querySelector('.pa-selbox .pa-knob')));
      const kr = document.querySelector('.pa-selbox .pa-knob').getBoundingClientRect();
      check('the knob is drawn where it is grabbed', Math.abs(kr.left + kr.width / 2 - kx) < 1.5 && Math.abs(kr.top + kr.height / 2 - ky) < 1.5, [kr.left + kr.width / 2, kx, kr.top + kr.height / 2, ky]);
      const hits = [plugin.handleAt(st, b0.right + 4, b0.bottom + 4), plugin.handleAt(st, b0.left - 3, b0.top - 3), plugin.handleAt(st, kx, ky),
        plugin.handleAt(st, (b0.left + b0.right) / 2, (b0.top + b0.bottom) / 2), plugin.handleAt(st, b0.right + 60, b0.top - 60)];
      check('corners, knob, inside and outside are told apart', hits.join() === 'se,nw,rotate,move,', [hits.join(), b0]);
      check('a thin selection can still be moved from near its ends', plugin.handleAt(st, b0.left + 12, (b0.top + b0.bottom) / 2) === 'move');

      // Resize: drag the bottom-right corner out to twice the size; the top-left corner stays put.
      const l0 = len(line), w0 = line.width, x0 = line.pts[0][0];
      drawPts([[b0.right, b0.bottom], [(3 * b0.right - b0.left) / 2, (3 * b0.bottom - b0.top) / 2], [2 * b0.right - b0.left, 2 * b0.bottom - b0.top]]);
      check('dragging a corner resizes the drawing', Math.abs(len(line) - 2 * l0) < 1.5, [len(line), l0]);
      check('...from the opposite corner, and the line thickens with it', line.pts[0][0] > x0 && Math.abs(line.width - 2 * w0) < 0.01, [line.width, w0]);
      plugin.undoLast();
      check('undo restores the size and width', Math.abs(len(line) - l0) < 0.5 && line.width === w0);

      // Rotate: the knob starts straight below the center; dragging it round to the left is a quarter turn.
      plugin.showSelection(st);
      const b1 = { ...st.selBox }, c1 = [(b1.left + b1.right) / 2, (b1.top + b1.bottom) / 2], [qx, qy] = plugin.knobAt(b1), R1 = qy - c1[1];
      drawPts([[qx, qy], [c1[0] - R1 * 0.7, c1[1] + R1 * 0.7], [c1[0] - R1, c1[1] + 1]]);
      check('the knob rotates, snapping to a quarter turn', Math.abs(end(line)[0]) < 0.6 && Math.abs(Math.abs(end(line)[1]) - l0) < 1, end(line));
      plugin.undoLast();
      check('undo turns it back', Math.abs(end(line)[1]) < 0.5);

      // A rotated ellipse keeps its angle (it used to be redrawn level from its bounding box).
      plugin.clearSelection(); plugin.selected.add(oval); plugin.showSelection(st);
      const b2 = { ...st.selBox }, c2 = [(b2.left + b2.right) / 2, (b2.top + b2.bottom) / 2], [ox, oy] = plugin.knobAt(b2), R2 = oy - c2[1];
      drawPts([[ox, oy], [c2[0] - R2 * 0.38, c2[1] + R2 * 0.92], [c2[0] - R2 * Math.SQRT1_2, c2[1] + R2 * Math.SQRT1_2]]);
      check('a rotated ellipse remembers its angle', oval.rot === 45, oval.rot);
      {
        // Drawn from its own (turned) points: the outline's box matches the points' box, not the old level one.
        const xs = oval.pts.map(p => p[0] * w), ys = oval.pts.map(p => p[1]), bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
        const drawn = [...t.querySelectorAll('.pa-layer-ink path')].map(p => p.getBBox()).find(bb => Math.abs(bb.width - bw) < 3 && Math.abs(bb.height - bh) < 3);
        check('...and is drawn turned, matching its points (not snapped back level)', !!drawn, [bw, bh]);
      }
      check('...so its box gets narrower', st.selBox.right - st.selBox.left < b2.right - b2.left - 12, [st.selBox.right - st.selBox.left, b2.right - b2.left]);
      plugin.undoLast();
      check('undo levels it again', !oval.rot);
      {
        // Turn it about 20 degrees, then back to about 2 (snaps to 0): no leftover angle.
        plugin.clearSelection(); plugin.selected.add(oval); plugin.showSelection(st);
        const b3 = { ...st.selBox }, c3 = [(b3.left + b3.right) / 2, (b3.top + b3.bottom) / 2], [qx3, qy3] = plugin.knobAt(b3), R3 = qy3 - c3[1];
        const at3 = (deg) => { const a = (90 + deg) * Math.PI / 180; return [c3[0] + R3 * Math.cos(a), c3[1] + R3 * Math.sin(a)]; };
        const before3 = JSON.stringify(oval.pts);
        drawPts([[qx3, qy3], at3(20), at3(2)]);
        check('turning back to (almost) level leaves no angle behind', !oval.rot && JSON.stringify(oval.pts) === before3, oval.rot);
        plugin.clearSelection();
      }
      plugin.clearSelection();
      plugin.prefs.shape = { kind: 'rect', color: '#1c7ed6', size: 2.5, dash: 'solid', fill: null, rough: 0, edges: 'sharp', opacity: 1 };
      plugin.prefs.tool = 'pen'; plugin.prefs.smoothing = 30; plugin.refreshToolbars();
    }

    // ===== copy and paste ink =====
    {
      const tapEl = (el) => el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      const key = (k, extra = {}) => { const { target, ...o } = extra; const ev = new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, cancelable: true, ...o }); (target || document.body).dispatchEvent(ev); return ev; };
      const st = plugin.sessions.get(view), all = () => Object.values(plugin.inkData(NOTE).sections).reduce((a, l) => a + l.length, 0);
      const { t, r } = await at(30);
      plugin.prefs.tool = 'pen'; plugin.prefs.smoothing = 0;
      drawPts([[r.left + 60, r.top + 20], [r.left + 100, r.top + 20], [r.left + 140, r.top + 20]]);
      const line = lastStroke(t);
      plugin.prefs.tool = 'shape'; plugin.prefs.shape = { kind: 'ellipse', color: '#e03131', size: 2.5, dash: 'solid', fill: null, rough: 1, edges: 'sharp', opacity: 1 };
      drawPts([[r.left + 160, r.top + 5], [r.left + 220, r.top + 45]]);
      const oval = lastStroke(t);
      plugin.prefs.tool = 'lasso'; plugin.refreshToolbars();
      plugin.clearSelection(); plugin.selected.add(line); plugin.selected.add(oval); plugin.showSelection(st);
      const pasteBtn = () => bar().querySelector('[aria-label="Paste ink"]');
      plugin.inkClip = null; plugin.refreshToolbars();
      check('no Paste button until something is copied', !vis(pasteBtn()));
      tapEl(document.querySelector('.pa-selmenu [aria-label="Copy"]'));
      check('Copy keeps both drawings and shows Paste', !!plugin.inkClip && plugin.inkClip.strokes.length === 2 && vis(pasteBtn()));

      // Paste somewhere else in the note: lands mid-screen, same size, selected, with Select on.
      const n0 = all();
      await at(38);
      plugin.prefs.tool = 'pen'; plugin.refreshToolbars();
      tapEl(pasteBtn());
      const pasted = [...plugin.selected], pl = pasted.find(s => !s.geom), po = pasted.find(s => s.geom);
      const w = (s) => { for (const el of sections()) if (plugin.strokesFor(NOTE, el.dataset.paKey).includes(s)) return el.offsetWidth; };
      const lenOf = (s) => (s.pts[s.pts.length - 1][0] - s.pts[0][0]) * w(s);
      check('Paste adds the copies and selects them', all() === n0 + 2 && pasted.length === 2 && !!pl && !!po && !pasted.includes(line));
      check('...switches to Select so they can be dragged', plugin.prefs.tool === 'lasso');
      check('...at the same size', Math.abs(lenOf(pl) - lenOf(line)) < 0.6 && pl.width === line.width, [lenOf(pl), lenOf(line)]);
      check('...with a fresh sketch seed', po.rough === 1 && po.seed !== oval.seed);
      const box = st.selBox, root = st.root.getBoundingClientRect(), mid = (root.top + root.bottom) / 2;
      check('...in the middle of the screen', box.top < mid && box.bottom > mid, [box.top, box.bottom, mid]);
      check('...attached to a paragraph there, not the original one', !plugin.strokesFor(NOTE, t.dataset.paKey).includes(pl));
      const b1 = { ...st.selBox };
      tapEl(pasteBtn());
      check('pasting again nudges the copy down-right', all() === n0 + 4 && Math.abs(st.selBox.left - b1.left - 16) < 1 && Math.abs(st.selBox.top - b1.top - 16) < 1, [st.selBox.left - b1.left, st.selBox.top - b1.top]);
      plugin.undoLast(); plugin.undoLast();
      check('undo removes pasted ink', all() === n0);

      // Keyboard: Cmd+X cuts, Cmd+V pastes, but never while typing in a field.
      plugin.clearSelection(); plugin.selected.add(line); plugin.showSelection(st);
      const ex = key('x');
      check('Cmd+X cuts the selection', ex.defaultPrevented && !plugin.strokesFor(NOTE, t.dataset.paKey).includes(line) && plugin.inkClip.strokes.length === 1);
      const input = document.createElement('input'); document.body.appendChild(input); input.focus();
      const n1 = all(), ev = key('v', { target: input });
      check('Cmd+V in a text field is left alone', !ev.defaultPrevented && all() === n1);
      input.remove();
      const ev2 = key('v');
      check('Cmd+V pastes', ev2.defaultPrevented && all() === n1 + 1);
      plugin.clearSelection();
      const ev3 = key('c');
      check('Cmd+C with nothing selected does nothing (normal copy still works)', !ev3.defaultPrevented);
      plugin.undoLast(); plugin.undoLast();
      check('undo brings the cut ink back', plugin.strokesFor(NOTE, t.dataset.paKey).includes(line));
      plugin.inkClip = null; plugin.clearSelection();
      plugin.prefs.shape = { kind: 'rect', color: '#1c7ed6', size: 2.5, dash: 'solid', fill: null, rough: 0, edges: 'sharp', opacity: 1 };
      plugin.prefs.tool = 'pen'; plugin.prefs.smoothing = 30; plugin.refreshToolbars();
    }

    // ===== bug sweep: sync safety, per-note undo, identical paragraphs, stale previews, renames =====
    {
      const { files, vaultHandlers, O } = window.__pi;
      const st = plugin.sessions.get(view), dp = plugin.dataPath(NOTE), stroke = (x) => ({ kind: 'pen', color: '#123456', width: 2, opacity: 1, pts: [[0.1, 5], [x, 5]] });
      await plugin.writeInk(NOTE);
      const { t, r } = await at(33), key = t.dataset.paKey;
      const onDisk = () => JSON.parse(files.get(dp));
      const has = (d, k, c) => (d.sections[k] || []).some(s => s.color === c);

      // 1. Another device changed the file (no event yet). Our next save merges instead of overwriting.
      const remote = onDisk(); (remote.sections.REMOTE = []).push({ ...stroke(0.4), color: '#aa0001' });
      files.set(dp, JSON.stringify(remote));
      plugin.prefs.tool = 'pen'; plugin.prefs.smoothing = 0; plugin.refreshToolbars();
      drawPts([[r.left + 60, r.top + 20], [r.left + 120, r.top + 20]]);
      const mine = lastStroke(t);
      await plugin.writeInk(NOTE);
      check('saving merges ink another device added (nothing is overwritten)', has(onDisk(), 'REMOTE', '#aa0001') && onDisk().sections[key].some(s => JSON.stringify(s) === JSON.stringify(mine)));
      check('...and the merged ink shows up here too', has(plugin.inkData(NOTE), 'REMOTE', '#aa0001'));

      // 2. A deletion on the other device stays deleted; our own deletion stays deleted.
      const d2 = onDisk(); delete d2.sections.REMOTE; files.set(dp, JSON.stringify(d2));
      plugin.selected.clear(); plugin.selected.add(mine); plugin.deleteSelection(st);
      await plugin.writeInk(NOTE);
      check('merge keeps deletions from both sides', !has(onDisk(), 'REMOTE', '#aa0001') && !(onDisk().sections[key] || []).some(s => JSON.stringify(s) === JSON.stringify(mine)));

      // 3. A half-synced (unreadable) file is never saved over; we retry, then merge once it's whole.
      const good = files.get(dp);
      files.set(dp, good.slice(0, 20));
      drawPts([[r.left + 60, r.top + 30], [r.left + 140, r.top + 30]]);
      await plugin.writeInk(NOTE);
      check('a half-synced ink file is left alone', files.get(dp) === good.slice(0, 20) && plugin.saveTimers.has(NOTE));
      const fixed = JSON.parse(good); (fixed.sections.LATE = []).push({ ...stroke(0.3), color: '#aa0002' }); files.set(dp, JSON.stringify(fixed));
      await plugin.writeInk(NOTE);
      check('...and once it is whole, both sides are kept', has(onDisk(), 'LATE', '#aa0002') && onDisk().sections[key].length === plugin.strokesFor(NOTE, key).length);
      if (plugin.saveFails) plugin.saveFails.clear();

      // 4. Ink arriving as a NEW file for an open note (Sync "create") is picked up.
      const arrived = onDisk(); (arrived.sections.NEWFILE = []).push({ ...stroke(0.2), color: '#aa0003' });
      files.set(dp, JSON.stringify(arrived));
      for (const fn of vaultHandlers.create || []) await fn(new O.TFile(dp));
      check('ink that arrives as a new file is loaded', has(plugin.inkData(NOTE), 'NEWFILE', '#aa0003'));

      // 5. Undo is per note: undoing here never touches another note.
      const OTHER = 'Other note.md', theirStroke = stroke(0.5);
      plugin.cache.set(OTHER, { version: 1, sections: { k: [theirStroke] } });
      plugin.record({ type: 'add', path: OTHER, key: 'k', s: theirStroke });
      drawPts([[r.left + 60, r.top + 40], [r.left + 100, r.top + 40]]);
      const here = lastStroke(t);
      plugin.undoLast(); plugin.undoLast();
      check('undo only undoes this note', !plugin.strokesFor(NOTE, key).includes(here) && plugin.strokesFor(OTHER, 'k').includes(theirStroke));
      check('the Undo button dims when only other notes have history', bar().querySelector('[aria-label="Undo"]').classList.contains('is-dim') || (plugin.lastFor && plugin.lastFor(plugin.undoStack, NOTE) >= 0));
      plugin.cache.delete(OTHER); if (plugin.forgetHistory) plugin.forgetHistory(OTHER); else plugin.undoStack.length = plugin.redoStack.length = 0;

      // 6. Two identical paragraphs get their own ink.
      const twins = sections().filter(el => el.textContent.trim().startsWith('Same words twice.'));
      check('identical paragraphs get different keys', twins.length === 2 && twins[0].dataset.paKey !== twins[1].dataset.paKey && twins[1].dataset.paKey.endsWith('~1'), twins.map(e => e.dataset.paKey));

      // 7. An opacity drag that ends where it started can't later change an old selection.
      const a1 = lastStroke(t);
      drawPts([[r.left + 60, r.top + 50], [r.left + 100, r.top + 50]]);
      const b1 = lastStroke(t);
      plugin.prefs.tool = 'lasso'; plugin.refreshToolbars();
      plugin.clearSelection(); plugin.selected.add(a1); plugin.showSelection(st);
      document.querySelector('.pa-selmenu [aria-label="Style selection"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      const op = () => document.querySelector('.pa-selcard input[aria-label="Opacity"]');
      op().value = '50'; op().dispatchEvent(new Event('input')); op().value = '100'; op().dispatchEvent(new Event('input'));   // no "change"
      plugin.selected.clear(); plugin.selected.add(b1); plugin.showSelection(st);
      op().value = '40'; op().dispatchEvent(new Event('input')); op().dispatchEvent(new Event('change'));
      check('a new selection\'s opacity changes only the new selection', b1.opacity === 0.4 && a1.opacity === 1, [a1.opacity, b1.opacity]);
      plugin.clearSelection();

      // 8. Renaming a note with a save pending: the save goes to the right file and paths follow.
      plugin.prefs.tool = 'pen'; plugin.refreshToolbars();
      drawPts([[r.left + 60, r.top + 60], [r.left + 110, r.top + 60]]);
      const pend = lastStroke(t), NEW = 'Folder/Renamed note.md';
      check('a save is pending before the rename', plugin.saveTimers.has(NOTE));
      for (const fn of vaultHandlers.rename || []) await fn(new O.TFile(NEW), NOTE);
      const newDp = plugin.dataPath(NEW);
      check('rename saves pending ink, then moves the file', !files.has(dp) && files.has(newDp) && JSON.parse(files.get(newDp)).sections[key].some(s => JSON.stringify(s) === JSON.stringify(pend)));
      check('...and the paragraphs and undo history follow the new name', t.dataset.paPath === NEW && t.paChild.notePath === NEW && !!plugin.pathsOf && plugin.pathsOf(plugin.undoStack[plugin.undoStack.length - 1]).includes(NEW));
      for (const fn of vaultHandlers.rename || []) await fn(new O.TFile(NOTE), NEW);
      check('...and back again', files.has(dp) && t.dataset.paPath === NOTE);
      plugin.prefs.smoothing = 30; plugin.refreshToolbars();
    }

    // ===== pen side button / eraser end erase, without changing the tool =====
    {
      const { t, r } = await at(35), key = t.dataset.paKey;
      const press = (type, x, y, button, buttons) => (document.elementFromPoint(x, y) || document.body).dispatchEvent(new PointerEvent(type, {
        pointerType: 'pen', pointerId: 11, clientX: x, clientY: y, bubbles: true, cancelable: true, button, buttons }));
      const swipe = (button, buttons, y) => { press('pointerdown', r.left + 90, y - 15, button, buttons); for (let i = 1; i <= 6; i++) press('pointermove', r.left + 90, y - 15 + i * 5, -1, buttons); press('pointerup', r.left + 90, y + 15, button, 0); };
      plugin.prefs.tool = 'pen'; plugin.prefs.eraser.mode = 'stroke'; plugin.prefs.eraser.autoReturn = false; plugin.refreshToolbars();
      drawPts([[r.left + 40, r.top + 20], [r.left + 140, r.top + 20]]);
      const a = lastStroke(t);
      swipe(2, 2, r.top + 20);
      check('holding the pen side button erases', !plugin.strokesFor(NOTE, key).includes(a));
      check('...and the pen stays the picked tool', plugin.prefs.tool === 'pen');
      plugin.undoLast();
      check('...and undo brings it back', plugin.strokesFor(NOTE, key).includes(a));
      drawPts([[r.left + 40, r.top + 40], [r.left + 140, r.top + 40]]);
      const b = lastStroke(t);
      swipe(5, 32, r.top + 40);
      check('the pen\'s eraser end erases', !plugin.strokesFor(NOTE, key).includes(b) && plugin.prefs.tool === 'pen');
      plugin.prefs.eraser.autoReturn = true; plugin.refreshToolbars();
    }

    // ===== printing / Export to PDF =====
    {
      const rules = [...document.styleSheets].flatMap(sh => { try { return [...sh.cssRules]; } catch (e) { return []; } });
      const media = (m) => rules.filter(r => r.media && [...r.media].includes(m)).map(r => r.cssText).join(' ');
      check('printing hides the toolbar and selection UI', /\.pa-toolbar[^{]*\{[^}]*display: none/.test(media('print')));
      check('dark-theme highlight tweaks apply on screen only (not on white paper)', /theme-dark \.pa-layer-hl/.test(media('screen')) && !rules.some(r => !r.media && /theme-dark \.pa-layer-hl/.test(r.selectorText || '')));
    }

    // ===== eraser reaches ink that hangs over a neighboring paragraph =====
    {
      await at(23);
      const A = sections()[22], B = sections()[23], ra = A.getBoundingClientRect(), rb = B.getBoundingClientRect();
      const keyB = B.dataset.paKey, cx = rb.left + 200, top = ra.top + 15, bottom = rb.top + 25;
      plugin.prefs.tool = 'shape';
      plugin.prefs.shape = { kind: 'ellipse', color: '#e03131', size: 2.5, dash: 'solid', fill: null, rough: 1, edges: 'sharp', opacity: 1 };
      drawPts([[cx - 60, bottom], [cx + 60, top]]);   // starts in B, drawn up over A: belongs to B
      const circle = lastStroke(B);
      check('circle belongs to the paragraph it was started in', !!circle && circle.geom === 'ellipse' && plugin.strokesFor(NOTE, keyB).includes(circle));
      plugin.prefs.tool = 'eraser'; plugin.prefs.eraser.mode = 'stroke'; plugin.prefs.eraser.only = 'all'; plugin.prefs.eraser.autoReturn = false;
      const yTop = Math.min(...circle.pts.map(p => p[1])) + rb.top;   // the circle's top edge, over paragraph A
      check('...and its top edge sits over the paragraph above', yTop < ra.bottom, [yTop, ra.bottom]);
      drawPts([[cx - 8, yTop], [cx + 8, yTop]]);
      check('whole-stroke eraser removes it from the part over the other paragraph', !plugin.strokesFor(NOTE, keyB).includes(circle));
      plugin.undoLast();
      plugin.prefs.eraser.mode = 'partial';
      const n0 = plugin.strokesFor(NOTE, keyB).length;
      drawPts([[cx - 8, yTop], [cx + 8, yTop]]);
      check('partial eraser cuts it there too', !plugin.strokesFor(NOTE, keyB).includes(circle) && plugin.strokesFor(NOTE, keyB).length >= n0);
      plugin.undoLast();
      plugin.undoLast();   // the circle itself
      plugin.prefs.eraser.mode = 'stroke'; plugin.prefs.eraser.autoReturn = true;
      plugin.prefs.shape = { kind: 'rect', color: '#1c7ed6', size: 2.5, dash: 'solid', fill: null, rough: 0, edges: 'sharp', opacity: 1 };
      plugin.prefs.tool = 'pen'; plugin.refreshToolbars();
    }

    // ===== second bug sweep =====
    {
      const { files, vaultHandlers, O, app } = window.__pi;
      const st = plugin.sessions.get(view), dp = plugin.dataPath(NOTE);
      const { t, r } = await at(34), key = t.dataset.paKey, onDisk = () => JSON.parse(files.get(dp));
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), diskHas = (s) => (onDisk().sections[key] || []).some(x => same(x, s));
      plugin.prefs.tool = 'pen'; plugin.prefs.smoothing = 0; plugin.refreshToolbars();
      await plugin.writeInk(NOTE);

      // 1. A save that fails must not become the merge base: the next save keeps new ink and deletions.
      drawPts([[r.left + 60, r.top + 15], [r.left + 120, r.top + 15]]);
      const old = lastStroke(t);
      await plugin.writeInk(NOTE);
      plugin.selected.clear(); plugin.selected.add(old); plugin.deleteSelection(st);
      drawPts([[r.left + 60, r.top + 25], [r.left + 120, r.top + 25]]);
      const s1 = lastStroke(t);
      const realModify = app.vault.modify; let failOnce = true;
      app.vault.modify = async (f, d) => { if (failOnce) { failOnce = false; throw new Error('EBUSY (test)'); } return realModify(f, d); };
      await plugin.writeInk(NOTE);
      check('a failed save keeps the old file and schedules a retry', diskHas(old) && !diskHas(s1) && plugin.saveTimers.has(NOTE));
      drawPts([[r.left + 60, r.top + 35], [r.left + 120, r.top + 35]]);
      const s2 = lastStroke(t);
      await plugin.writeInk(NOTE);
      app.vault.modify = realModify;
      check('...and the next save keeps every new stroke and the deletion', diskHas(s1) && diskHas(s2) && !diskHas(old) && plugin.strokesFor(NOTE, key).includes(s1));
      plugin.saveFails.clear();

      // 3. Same ink in a different key order is not a change: no endless save ping-pong.
      const d0 = onDisk(), flipped = { ...d0, sections: Object.fromEntries(Object.entries(d0.sections).reverse()) };
      files.set(dp, JSON.stringify(flipped));
      for (const fn of vaultHandlers.modify || []) await fn(new O.TFile(dp));
      check('same ink in another order does not trigger a save', !plugin.saveTimers.has(NOTE));

      // 4. Keys: a block equal to one line of an earlier list is still a first (no "~").
      const lone = sections().find(el => el.textContent.trim() === 'list item B');
      check('a block that matches a line inside an earlier block keeps its plain key', !!lone && !lone.dataset.paKey.includes('~'), lone && lone.dataset.paKey);

      // 2. Renaming onto a name that already has an ink file: both are kept, the old file goes to the trash.
      const TAKEN = 'Folder/Taken note.md', takenDp = plugin.dataPath(TAKEN);
      files.set(takenDp, JSON.stringify({ version: 1, sections: { STALE: [{ kind: 'pen', color: '#aa0009', width: 2, opacity: 1, pts: [[0.1, 1], [0.2, 1]] }] } }));
      const mineBefore = onDisk().sections[key].length;
      for (const fn of vaultHandlers.rename || []) await fn(new O.TFile(TAKEN), NOTE);
      const merged = JSON.parse(files.get(takenDp));
      check('rename onto an existing ink file keeps both', merged.sections.STALE && merged.sections[key] && merged.sections[key].length === mineBefore && !files.has(dp));
      check('...and the ink still shows under the new name', plugin.strokesFor(TAKEN, key).length === mineBefore && t.dataset.paPath === TAKEN);
      for (const fn of vaultHandlers.rename || []) await fn(new O.TFile(NOTE), TAKEN);
      check('...and renaming back works', files.has(dp) && plugin.strokesFor(NOTE, key).length === mineBefore);

      // 8 + 9. Laser picked: the pen's side button still erases, and no right-click menu follows.
      const press = (type, x, y, button, buttons) => (document.elementFromPoint(x, y) || document.body).dispatchEvent(new PointerEvent(type, { pointerType: 'pen', pointerId: 12, clientX: x, clientY: y, bubbles: true, cancelable: true, button, buttons }));
      plugin.prefs.eraser.mode = 'stroke'; plugin.prefs.eraser.only = 'all';
      drawPts([[r.left + 60, r.top + 45], [r.left + 160, r.top + 45]]);
      const vic = lastStroke(t);
      plugin.prefs.tool = 'laser'; plugin.refreshToolbars();
      press('pointerdown', r.left + 100, r.top + 30, 2, 2);
      for (let i = 1; i <= 6; i++) press('pointermove', r.left + 100, r.top + 30 + i * 5, -1, 2);
      press('pointerup', r.left + 100, r.top + 60, 2, 0);
      check('with the laser picked, the side button still erases', !plugin.strokesFor(NOTE, key).includes(vic));
      const cm = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 100, clientY: r.top + 60 });
      (document.elementFromPoint(r.left + 100, r.top + 60) || document.body).dispatchEvent(cm);
      check('...and no right-click menu pops up after it', cm.defaultPrevented);
      st.penEraseAt = 0;
      const cm2 = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 100, clientY: r.top + 60 });
      (document.elementFromPoint(r.left + 100, r.top + 60) || document.body).dispatchEvent(cm2);
      check('...while a normal right-click still works', !cm2.defaultPrevented);
      plugin.prefs.tool = 'pen'; plugin.prefs.smoothing = 30; plugin.refreshToolbars();
    }

    // ===== more shapes: diamond, pentagon, hexagon, star =====
    {
      const { t, r } = await at(36), w = t.offsetWidth;
      const box = (s) => { const xs = s.pts.map(p => p[0] * w), ys = s.pts.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
      const tapEl = (el) => el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      const expect = { diamond: 5, pentagon: 6, hexagon: 7, star: 11 };
      plugin.prefs.tool = 'shape';
      for (const [kind, n] of Object.entries(expect)) {
        plugin.prefs.shape = { kind, color: '#1c7ed6', size: 2.5, dash: 'solid', fill: '#a5d8ff', rough: 0, edges: 'sharp', opacity: 1 };
        drawPts([[r.left + 40, r.top + 10], [r.left + 100, r.top + 30], [r.left + 160, r.top + 70]]);
        const s = lastStroke(t), [l, tp, rt, bt] = box(s), first = s.pts[0], last = s.pts[s.pts.length - 1];
        check(`${kind}: closed outline with ${n - 1} corners`, s.geom === kind && s.pts.length === n && first[0] === last[0] && first[1] === last[1], s.pts.length);
        check(`${kind}: fills the drag box`, Math.abs(rt - l - 120) < 1.5 && Math.abs(bt - tp - 60) < 1.5, [rt - l, bt - tp]);
        check(`${kind}: keeps its fill`, s.fill === '#a5d8ff' && !!t.querySelector('.pa-layer-hl .pa-fill'));
      }
      const star = lastStroke(t), [sl, st2, sr, sb] = box(star), cx = (sl + sr) / 2;
      const dist = star.pts.slice(0, 10).map(p => Math.hypot((p[0] * w - cx) / (sr - sl), (p[1] - (st2 + sb) / 2) / (sb - st2)));
      check('star: points alternate out and in', dist.every((d, i) => (i % 2 ? d < 0.35 : d > 0.4)), dist.map(d => d.toFixed(2)));
      plugin.prefs.shape = { kind: 'hexagon', color: '#1c7ed6', size: 2.5, dash: 'solid', fill: null, rough: 0, edges: 'sharp', opacity: 1 };
      drawPts([[r.left + 200, r.top + 10], [r.left + 262, r.top + 68]]);
      const hx = box(lastStroke(t));
      check('a near-square drag makes a regular hexagon', Math.abs((hx[2] - hx[0]) - (hx[3] - hx[1])) < 1, [hx[2] - hx[0], hx[3] - hx[1]]);
      plugin.prefs.shape = { kind: 'star', color: '#1c7ed6', size: 2.5, dash: 'solid', fill: null, rough: 1, edges: 'round', opacity: 1 };
      drawPts([[r.left + 40, r.top + 10], [r.left + 160, r.top + 70]]);
      const rs = lastStroke(t);
      check('round edges and sketchy lines work on the new shapes', rs.edges === 'round' && rs.rough === 1 && /C/.test(t.querySelector('.pa-layer-ink path:last-child').getAttribute('d')));
      tapEl(bar().querySelector('[aria-label="Color and size"]'));
      const grid = document.querySelector('.pa-shape-grid'), kids = grid ? [...grid.children] : [];
      check('shape picker shows all 9 shapes in two rows', kids.length === 9 && new Set(kids.map(k => Math.round(k.getBoundingClientRect().top))).size === 2);
      tapEl(grid.querySelector('[aria-label="Star"]'));
      check('picking Star works from the card', plugin.prefs.shape.kind === 'star');
      tapEl(bar().querySelector('[aria-label="Color and size"]'));
      for (let i = 0; i < 6; i++) plugin.undoLast();
      plugin.prefs.shape = { kind: 'rect', color: '#1c7ed6', size: 2.5, dash: 'solid', fill: null, rough: 0, edges: 'sharp', opacity: 1 };
      plugin.prefs.tool = 'pen'; plugin.refreshToolbars();
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
      check('long stroke: each redraw costs about the same at the end as at the start', late < early * 3 + 0.15, { early: early.toFixed(3), late: late.toFixed(3) });
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

    // ===== drawing can start anywhere, even over the title / Properties block =====
    {
      const sc = view.contentEl.querySelector('.markdown-preview-view');
      sc.scrollTop = 0; await sleep(80);
      const props = document.querySelector('.metadata-container'), pr = props.getBoundingClientRect();
      plugin.prefs.tool = 'pen'; plugin.prefs.smoothing = 0;
      const n0 = plugin.undoStack.length, y = pr.top + pr.height / 2, x0 = pr.left + 120, x1 = pr.left + 320;
      fire('pointerdown', x0, y); fire('pointermove', (x0 + x1) / 2, y); fire('pointermove', x1, y); fire('pointerup', x1, y);
      const a = plugin.undoStack[plugin.undoStack.length - 1];
      check('a stroke can start over the Properties block', plugin.undoStack.length === n0 + 1 && a.type === 'add');
      const el = [...document.querySelectorAll('[data-pa-key]')].find(e => e.dataset.paKey === a.key);
      const path = [...el.querySelectorAll('.pa-layer-ink path')].pop(), r = path.getBoundingClientRect();
      check('…and it shows exactly where it was drawn', Math.abs((r.left + r.right) / 2 - (x0 + x1) / 2) < 1.5 && Math.abs((r.top + r.bottom) / 2 - y) < 1.5, [(r.left + r.right) / 2, (r.top + r.bottom) / 2, (x0 + x1) / 2, y]);
      plugin.undoLast();
      plugin.prefs.smoothing = 30;
    }

    // ===== ink follows small edits; rewritten paragraphs can bring their ink back =====
    {
      const { blocks, edit } = window.__pi;
      const original = [...blocks], d = plugin.inkData(NOTE);
      const S = (k) => d.sections[k] || [];
      const hidden = () => (plugin.hiddenKeys ? plugin.hiddenKeys(NOTE) : ['(no hiddenKeys)']);   // so a run on older code reports, not crashes
      const elFor = (start) => [...document.querySelectorAll('[data-pa-key]')].find(e => e.textContent.startsWith(start));
      const drawOn = async (start) => {
        const t = elFor(start); t.scrollIntoView({ block: 'center' }); await sleep(60);
        const r = t.getBoundingClientRect();
        plugin.prefs.tool = 'pen';
        drawPts([[r.left + 60, r.top + 10], [r.left + 140, r.top + 14], [r.left + 220, r.top + 10]]);
        return plugin.undoStack[plugin.undoStack.length - 1].key;
      };
      const inkShown = (start) => { const e = elFor(start); return !!(e && e.querySelector('.pa-layer-ink path')); };
      // Earlier sync checks left ink under made-up keys (STALE, LATE...) that no paragraph has: those
      // really are hidden. Every real paragraph's ink must not be.
      const fake = hidden();
      check('edits: no paragraph\'s ink counts as hidden before any edit', fake.length > 0 && fake.every(k => /^[A-Z]+$/.test(k)), fake);
      for (const k of fake) delete d.sections[k];
      for (const k of ['STALE', 'NEWFILE', 'LATE']) delete d.sections[k];
      const i5 = blocks.findIndex(b => b.startsWith('Paragraph 5.'));
      const k1 = await drawOn('Paragraph 5.'), s1 = d.sections[k1][d.sections[k1].length - 1], n1 = d.sections[k1].length;
      // A typo fix: the ink moves to the new version of the paragraph.
      let nb = [...blocks]; nb[i5] = nb[i5].replace('quick brown', 'quikc brown');
      window.__notices = [];
      await edit(nb); await sleep(30);
      const e2 = elFor('Paragraph 5.'), k2 = e2.dataset.paKey;
      check('edits: a typo fix keeps the paragraph\'s ink', k2 !== k1 && !d.sections[k1] && S(k2).length === n1 && S(k2).includes(s1), [k1, k2]);
      check('…and it shows on the edited paragraph', inkShown('Paragraph 5.'));
      check('…with no "hidden" notice', !(window.__notices || []).some(n => /hid the ink/.test(n)), window.__notices);
      await sleep(700);
      const disk = JSON.parse(files.get('Annotations/Folder/Long test note.json')).sections;
      check('…and is saved under the new paragraph', disk[k2] && disk[k2].length === n1 && !disk[k1], Object.keys(disk).length);
      // Undo still finds the stroke after it moved.
      plugin.undoLast();
      check('…undo still removes the moved stroke', S(k2).length === n1 - 1 && !inkShown('Paragraph 5.') === (n1 === 1));
      plugin.redoLast();
      check('…and redo puts it back', S(k2).includes(s1));
      // Re-rendered before Obsidian re-indexed (the other order): still drawn.
      nb = [...blocks]; nb[i5] = nb[i5].replace('quikc brown', 'quick brown') + ' One more sentence.';
      await edit(nb, true); await sleep(30);
      const k3 = elFor('Paragraph 5.').dataset.paKey;
      check('edits: an added sentence keeps the ink (even when the page redraws first)', d.sections[k3] && S(k3).includes(s1) && inkShown('Paragraph 5.'));
      // Editing another paragraph leaves this ink alone.
      const i7 = blocks.findIndex(b => b.startsWith('Paragraph 7.'));
      nb = [...blocks]; nb[i7] = nb[i7] + ' Edited.';
      await edit(nb); await sleep(30);
      check('edits: changing another paragraph leaves the ink alone', d.sections[k3] && S(k3).includes(s1) && hidden().length === 0);
      // A real rewrite: hidden, with a notice that can bring it back.
      window.__notices = []; window.__noticeEls = [];
      nb = [...blocks]; nb[i5] = 'Something completely new about owls at midnight.';
      await edit(nb); await sleep(30);
      check('edits: a rewritten paragraph hides its ink', hidden().length === 1 && !inkShown('Something completely new'), hidden());
      check('…and says so', (window.__notices || []).some(n => /hid the ink on a paragraph you rewrote/.test(n)), window.__notices);
      const cmd = plugin.commands.find(c => c.id === 'recover-hidden-ink');
      check('…"Bring back hidden ink" is offered', cmd && cmd.checkCallback(true) === true);
      const frag = (window.__noticeEls || []).find(n => n && n.querySelector && n.querySelector('.pa-notice-btn'));
      const before = d.sections[k3] ? [...d.sections[k3]] : [];
      if (frag) frag.querySelector('.pa-notice-btn').click();
      await sleep(80);
      const shownKeys = new Set([...document.querySelectorAll('[data-pa-key]')].map(e => e.dataset.paKey));
      const placed = [...plugin.selected].every(x => Object.keys(d.sections).some(k => shownKeys.has(k) && d.sections[k].includes(x)));
      check('…the notice\'s button brings it back, selected', hidden().length === 0 && before.length > 0 && plugin.selected.size === before.length && placed, [hidden(), plugin.selected.size, before.length]);
      const box = document.querySelector('.pa-selbox');
      const sr = box && box.getBoundingClientRect(), rr = view.contentEl.getBoundingClientRect();
      check('…in the middle of the screen', sr && sr.top > rr.top && sr.bottom < rr.bottom, sr && [sr.top, sr.bottom, rr.top, rr.bottom]);
      check('…with the command no longer offered', !!cmd && cmd.checkCallback(true) === false);
      plugin.undoLast();
      check('…one undo hides it again', hidden().length === 1 && S(k3).length === before.length);
      plugin.redoLast();
      check('…and redo brings it back again', hidden().length === 0);
      plugin.clearSelection();
      // Deleting a paragraph hides its ink; putting the paragraph back shows it again.
      const k7 = await drawOn('Paragraph 7.');
      const s7 = d.sections[k7][S(k7).length - 1];
      const withP7 = [...blocks];
      nb = blocks.filter(b => !b.startsWith('Paragraph 7.'));
      await edit(nb); await sleep(30);
      check('edits: a deleted paragraph\'s ink is hidden', hidden().includes(k7));
      await edit(withP7); await sleep(30);
      check('…and shows again when the paragraph comes back', hidden().length === 0 && S(k7).includes(s7) && inkShown('Paragraph 7.'));
      // An edit that came through Sync: left to the device it was typed on.
      const k9 = await drawOn('Paragraph 9.'), s9 = d.sections[k9][d.sections[k9].length - 1];
      const i9 = blocks.findIndex(b => b.startsWith('Paragraph 9.'));
      nb = [...blocks]; nb[i9] = nb[i9].replace('lazy', 'sleepy');
      window.__notices = [];
      await edit(nb, false, true); await sleep(30);
      check('edits: an edit from another device doesn\'t move ink here (that device does)', S(k9).includes(s9) && !S(elFor('Paragraph 9.').dataset.paKey).includes(s9) && !(window.__notices || []).some(n => /hid the ink/.test(n)));
      nb = [...blocks]; nb[i9] = original[i9]; await edit(nb); await sleep(30);
      check('…and the ink is back once the text is', inkShown('Paragraph 9.'));
      // A look-alike paragraph somewhere else doesn't take the ink.
      nb = blocks.filter(b => !b.startsWith('Paragraph 9.'));
      const at3 = nb.findIndex(b => b.startsWith('Paragraph 3.'));
      nb.splice(at3, 0, original[i9].replace('lazy', 'sleepy'));
      await edit(nb); await sleep(30);
      check('edits: a look-alike paragraph in another spot doesn\'t take the ink', S(k9).includes(s9) && hidden().includes(k9));
      await edit(original); await sleep(30);
      check('…and putting the paragraph back shows its ink', inkShown('Paragraph 9.') && S(k9).includes(s9));
      // Two edits right after each other (the second arrives before the first is handled).
      const k8 = await drawOn('Paragraph 8.'), s8 = d.sections[k8][d.sections[k8].length - 1];
      const i8 = blocks.findIndex(b => b.startsWith('Paragraph 8.'));
      const nA = [...blocks]; nA[i8] = nA[i8].replace('lazy', 'lazzy');
      const nB = [...nA]; nB[i8] = nB[i8].replace('few more', 'few more more');
      const p1 = edit(nA), p2 = edit(nB); await p1; await p2; await sleep(30);
      const k8b = elFor('Paragraph 8.').dataset.paKey;
      check('edits: two quick edits in a row keep the ink', S(k8b).includes(s8) && inkShown('Paragraph 8.'), k8b);
      await edit(original); await sleep(30);
      await sleep(700);
    }

    // ===== Draw with finger (phones): one finger draws, two scroll and zoom =====
    {
      const O = window.__pi.O, sc = view.contentEl.querySelector('.markdown-preview-view');
      await plugin.toggle(view); await plugin.toggle(view);   // a fresh session: no pen used yet
      const st = plugin.sessions.get(view);
      plugin.prefs.tool = 'pen'; plugin.prefs.smoothing = 0; plugin.prefs.holdToStraighten = false;
      const fp = (type, x, y, id, primary = true) => {
        const el = document.elementFromPoint(x, y) || document.body;
        el.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', pointerId: id, isPrimary: primary, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
        return el;
      };
      const f = (id, x, y) => ({ identifier: id, clientX: x, clientY: y });
      const { r } = await at(24);
      const x0 = r.left + 60, y0 = r.top + 20;
      const fingerStroke = (dx = 15, dy = 0) => {
        const tg = fp('pointerdown', x0, y0, 31); touch('touchstart', tg, [f(31, x0, y0)]);
        for (let i = 1; i <= 10; i++) { fp('pointermove', x0 + i * dx, y0 + i * dy, 31); touch('touchmove', tg, [f(31, x0 + i * dx, y0 + i * dy)]); }
        fp('pointerup', x0 + 10 * dx, y0 + 10 * dy, 31); touch('touchend', tg, [], [f(31, x0 + 10 * dx, y0 + 10 * dy)]);
      };
      const last = () => plugin.undoStack[plugin.undoStack.length - 1];
      plugin.prefs.fingerDraws = null;
      let n = plugin.undoStack.length;
      fingerStroke();
      check('finger: doesn\'t draw by default on tablets and computers', plugin.undoStack.length === n);
      check('hand: no hand button on tablets and computers', !vis(bar().querySelector('[aria-label="Scroll"]')));
      O.Platform.isPhone = true;
      fingerStroke();
      check('finger: draws by default on phones', plugin.undoStack.length === n + 1 && last().type === 'add', plugin.undoStack.length - n);
      O.Platform.isPhone = false;
      plugin.prefs.fingerDraws = true;
      n = plugin.undoStack.length;
      const top0 = sc.scrollTop;
      fingerStroke(0, 8);   // straight down: must draw, not scroll
      const a = last(), el = [...document.querySelectorAll('[data-pa-key]')].find(e => e.dataset.paKey === a.key);
      const pr = el && [...el.querySelectorAll('.pa-layer-ink path')].pop(), rb = pr && pr.getBoundingClientRect();
      check('finger: turned on, one finger draws (even straight down)', plugin.undoStack.length === n + 1 && sc.scrollTop === top0, [plugin.undoStack.length - n, sc.scrollTop - top0]);
      check('…right under the finger', rb && Math.abs(rb.top - y0) < 2 && Math.abs(rb.bottom - (y0 + 80)) < 2, rb && [rb.top, rb.bottom, y0]);
      // Two fingers: no ink, the page scrolls with them and spreading zooms.
      n = plugin.undoStack.length;
      const tg = fp('pointerdown', x0, y0, 41); touch('touchstart', tg, [f(41, x0, y0)]);
      fp('pointermove', x0 + 5, y0 + 5, 41); touch('touchmove', tg, [f(41, x0 + 5, y0 + 5)]);
      fp('pointerdown', x0 + 80, y0, 42, false); touch('touchstart', tg, [f(41, x0 + 5, y0 + 5), f(42, x0 + 80, y0)]);
      check('finger: a second finger drops the stroke', !st.stroke);
      const t1 = sc.scrollTop;
      touch('touchmove', tg, [f(41, x0 + 5, y0 - 55), f(42, x0 + 80, y0 - 60)]);
      check('…two fingers scroll the note', Math.abs(sc.scrollTop - t1 - 60) < 2, sc.scrollTop - t1);
      touch('touchmove', tg, [f(41, x0 - 60, y0 - 55), f(42, x0 + 145, y0 - 60)]);
      check('…and spreading them zooms', st.zoom.s > 1.5, st.zoom.s);
      fp('pointerup', x0, y0, 41); fp('pointerup', x0, y0, 42);
      touch('touchend', tg, [], [f(41, x0, y0), f(42, x0, y0)]);
      check('…without leaving any ink', plugin.undoStack.length === n && !st.stroke, plugin.undoStack.length - n);
      plugin.resetZoom(st); sc.scrollTop = top0; await sleep(60);
      // Two-finger tap still undoes.
      fingerStroke();
      n = plugin.undoStack.length;
      const tg2 = fp('pointerdown', x0, y0, 51); touch('touchstart', tg2, [f(51, x0, y0)]);
      fp('pointerdown', x0 + 60, y0, 52, false); touch('touchstart', tg2, [f(51, x0, y0), f(52, x0 + 60, y0)]);
      fp('pointerup', x0, y0, 51); fp('pointerup', x0 + 60, y0, 52);
      touch('touchend', tg2, [], [f(51, x0, y0), f(52, x0 + 60, y0)]);
      check('finger: a two-finger tap still undoes', plugin.undoStack.length === n - 1, plugin.undoStack.length - n);
      // The hand: one finger scrolls instead of drawing; tapping a tool draws again.
      const hand = bar().querySelector('[aria-label="Scroll"]'), penB = bar().querySelector('[aria-label="Pen"]');
      const tap = (b) => { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 61, pointerType: 'touch', isPrimary: true })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 61, pointerType: 'touch', isPrimary: true })); };
      check('hand: shown while drawing with a finger', hand && vis(hand) && !hand.classList.contains('is-active'));
      const favs0 = plugin.prefs.favorites, P0 = plugin.prefs.pen;
      plugin.prefs.favorites = [{ tool: 'pen', color: P0.color, size: P0.size, type: P0.type || 'ball', dash: P0.dash || 'solid' }];
      plugin.refreshToolbars();
      const favOn = () => [...bar().querySelectorAll('[aria-label^="Favorite "]')].some(b => b.classList.contains('is-active'));
      check('hand: (a favorite matching the pen shows as in use)', favOn());
      tap(hand);
      check('hand: nothing else looks active while it\'s on (not even a favorite)', !favOn());
      plugin.prefs.favorites = favs0; plugin.refreshToolbars();
      check('hand: tapping it makes it the active button (and the pen not)', hand.classList.contains('is-active') && !penB.classList.contains('is-active'));
      n = plugin.undoStack.length;
      const t2 = sc.scrollTop;
      fingerStroke(0, -6);   // one finger moving up: scrolls down the note
      check('hand: one finger scrolls, no ink', plugin.undoStack.length === n && sc.scrollTop - t2 > 40, [plugin.undoStack.length - n, sc.scrollTop - t2]);
      plugin.stopGlide(st); sc.scrollTop = top0; await sleep(60);
      tap(penB);
      check('hand: tapping the pen draws again (without opening its card)', !hand.classList.contains('is-active') && penB.classList.contains('is-active') && !vis(document.querySelector('.pa-panel')));
      fingerStroke();
      check('…and one finger draws', plugin.undoStack.length === n + 1);
      tap(hand); tap(hand);
      check('hand: tapping it again goes back to drawing', !hand.classList.contains('is-active') && penB.classList.contains('is-active'));
      // ----- bug sweep before 1.17.0 -----
      const keyAt = (x, y) => { const el = plugin.sectionAt(view.contentEl, x, y); return el && el.dataset.paKey; };
      // A quick tap presses what's under it (a link) instead of drawing a dot.
      await sleep(450);
      { const a = sections()[24].querySelector('a'); const ar = a.getBoundingClientRect(), lx = ar.left + 4, ly = ar.top + ar.height / 2;
        window.__linkClicks = 0; n = plugin.undoStack.length;
        const tg = fp('pointerdown', lx, ly, 70); touch('touchstart', tg, [f(70, lx, ly)]); fp('pointerup', lx, ly, 70); touch('touchend', tg, [], [f(70, lx, ly)]);
        check('sweep: a finger tap opens a link, no dot', window.__linkClicks === 1 && plugin.undoStack.length === n, [window.__linkClicks, plugin.undoStack.length - n]); }
      // Eraser: the first finger of a pinch doesn't erase anything.
      fingerStroke();
      const k1 = keyAt(x0 + 60, y0), before1 = plugin.strokesFor(NOTE, k1).length;
      plugin.prefs.tool = 'eraser'; plugin.refreshToolbars();
      n = plugin.undoStack.length;
      { const tg = fp('pointerdown', x0 + 40, y0, 71); touch('touchstart', tg, [f(71, x0 + 40, y0)]);
        fp('pointermove', x0 + 52, y0, 71); touch('touchmove', tg, [f(71, x0 + 52, y0)]);   // moved: erasing started
        check('sweep: (the eraser finger did start erasing)', plugin.strokesFor(NOTE, k1).length < before1);
        fp('pointerdown', x0 + 160, y0, 72, false); touch('touchstart', tg, [f(71, x0 + 52, y0), f(72, x0 + 160, y0)], [f(72, x0 + 160, y0)]);   // only the new finger is "changed"
        fp('pointerup', x0, y0, 71); fp('pointerup', x0, y0, 72); touch('touchend', tg, [], [f(71, x0, y0), f(72, x0, y0)]); }
      check('sweep: …a second finger puts back what it erased, nothing to undo, still the eraser',
        plugin.strokesFor(NOTE, k1).length === before1 && plugin.undoStack.length === n && plugin.prefs.tool === 'eraser' && !vis(document.querySelector('.pa-ring')),
        [plugin.strokesFor(NOTE, k1).length, before1, plugin.undoStack.length - n, plugin.prefs.tool]);
      plugin.prefs.tool = 'pen'; plugin.refreshToolbars();
      // The system cancels a finger (back swipe): no stroke.
      n = plugin.undoStack.length;
      { const tg = fp('pointerdown', x0, y0, 73); touch('touchstart', tg, [f(73, x0, y0)]);
        for (let i = 1; i <= 4; i++) { fp('pointermove', x0 + i * 10, y0, 73); touch('touchmove', tg, [f(73, x0 + i * 10, y0)]); }
        fp('pointercancel', x0 + 40, y0, 73); touch('touchend', tg, [], [f(73, x0 + 40, y0)]); }
      check('sweep: a cancelled finger leaves no stroke', plugin.undoStack.length === n && !st.stroke);
      // A two-finger tap where both fingers land at the same moment still undoes.
      await sleep(60); fingerStroke(); n = plugin.undoStack.length;
      { const tg = fp('pointerdown', x0, y0, 81); fp('pointerdown', x0 + 60, y0, 82, false);
        touch('touchstart', tg, [f(81, x0, y0), f(82, x0 + 60, y0)]);
        fp('pointerup', x0, y0, 81); fp('pointerup', x0 + 60, y0, 82); touch('touchend', tg, [], [f(81, x0, y0), f(82, x0 + 60, y0)]); }
      check('sweep: two fingers landing together still undo', plugin.undoStack.length === n - 1, plugin.undoStack.length - n);
      // Select: a pinch doesn't clear the selection.
      fingerStroke(); const picked = plugin.undoStack[plugin.undoStack.length - 1].s;
      plugin.prefs.tool = 'lasso'; plugin.refreshToolbars();
      plugin.clearSelection(); plugin.selected.add(picked); plugin.afterHistory();
      { const y2 = y0 + 160, tg = fp('pointerdown', x0, y2, 91); touch('touchstart', tg, [f(91, x0, y2)]);
        fp('pointermove', x0 + 12, y2, 91); touch('touchmove', tg, [f(91, x0 + 12, y2)]);
        fp('pointerdown', x0 + 120, y2, 92, false); touch('touchstart', tg, [f(91, x0 + 12, y2), f(92, x0 + 120, y2)], [f(92, x0 + 120, y2)]);
        fp('pointerup', x0, y2, 91); fp('pointerup', x0, y2, 92); touch('touchend', tg, [], [f(91, x0, y2), f(92, x0, y2)]); }
      check('sweep: a pinch with Select keeps the selection', plugin.selected.size === 1 && plugin.selected.has(picked) && !st.lasso, plugin.selected.size);
      plugin.clearSelection(); plugin.prefs.tool = 'pen'; plugin.refreshToolbars();
      // Hidden ink comes back when you draw.
      plugin.setInkHidden(true); fingerStroke();
      check('sweep: drawing while ink is hidden shows it again', !document.body.classList.contains('pa-ink-hidden'));
      // A palm down first, then the pen: the palm's mark goes, the pen draws.
      n = plugin.undoStack.length;
      { const tg = fp('pointerdown', x0, y0 + 40, 95); touch('touchstart', tg, [f(95, x0, y0 + 40)]);
        for (let i = 1; i <= 3; i++) fp('pointermove', x0 + i * 10, y0 + 40, 95);
        check('sweep: (the palm had started a stroke)', !!st.stroke);
        drawPts([[x0, y0 + 80], [x0 + 60, y0 + 80], [x0 + 120, y0 + 80]]);
        fp('pointerup', x0 + 30, y0 + 40, 95); touch('touchend', tg, [], [f(95, x0 + 30, y0 + 40)]); }
      const Lp = last(), Wp = plugin.sections(view.contentEl)[0].getBoundingClientRect().width, xs = Lp && Lp.s.pts.map(p => p[0] * Wp);
      const spanP = xs ? Math.max(...xs) - Math.min(...xs) : 0;   // the pen's line is 120px wide, the palm's 30px
      check('sweep: a pen landing during a palm stroke drops the palm\'s and draws its own', plugin.undoStack.length === n + 1 && !st.stroke && spanP > 100, [plugin.undoStack.length - n, Math.round(spanP)]);
      // Once a pen is used, fingers are palms again (scrolling) until Done.
      await stroke(24);
      n = plugin.undoStack.length;
      fingerStroke();
      check('finger: after using a pen, fingers stop drawing', plugin.undoStack.length === n);
      check('hand: hidden once a pen is used (fingers scroll anyway)', !vis(bar().querySelector('[aria-label="Scroll"]')));
      plugin.prefs.fingerDraws = null;
      sc.scrollTop = top0;
    }

    // ===== the toolbar stays clear of Obsidian's floating buttons (phone layout) =====
    {
      const st = plugin.sessions.get(view), root = view.contentEl, r = root.getBoundingClientRect();
      const box = (x, y, w, h, cls) => { const d = document.createElement('div'); if (cls) d.className = cls; d.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:#8888;border-radius:24px;z-index:50`; document.body.appendChild(d); return d; };
      // Like a phone: the buttons float a little in from the edges (below the status bar).
      const side = box(r.left + 4, r.top + 44, 52, 52), pill = box(r.right - 150, r.top + 44, 144, 52), nav = box(r.left + 40, r.bottom - 64, r.width - 80, 56);
      const free = (el) => { const b = el.getBoundingClientRect(), t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!t && bar().contains(t); };
      const saved = { v: plugin.prefs.barVertical, pos: plugin.prefs.barPos };
      plugin.prefs.barPos = null;
      for (const vertical of [true, false]) {
        plugin.prefs.barVertical = vertical; bar().classList.toggle('is-vertical', vertical); st.toolbar.place(); await sleep(30);
        const b = bar().getBoundingClientRect(), btns = [...bar().querySelectorAll('.pa-btn, .pa-grip')].filter(x => vis(x) && x.getBoundingClientRect().width > 0);
        check(`toolbar (${vertical ? 'column' : 'row'}) starts below floating top buttons`, b.top >= r.top + 96, [b.top, r.top + 96]);
        check(`…ends above a floating bottom bar`, b.bottom <= r.bottom - 64, [b.bottom, r.bottom - 64]);
        check(`…and none of its buttons are covered`, btns.length > 5 && btns.every(free), btns.filter(x => !free(x)).map(x => x.getAttribute('aria-label') || x.className));
      }
      // Dragged to the very bottom: still above the bottom bar.
      plugin.prefs.barVertical = true; bar().classList.add('is-vertical'); plugin.prefs.barPos = { x: 0, y: 1 }; st.toolbar.place(); await sleep(30);
      check('…also when moved to the bottom', bar().getBoundingClientRect().bottom <= r.bottom - 64, bar().getBoundingClientRect().bottom);
      // A notice passing by doesn't push the toolbar around.
      side.remove(); pill.remove(); nav.remove();
      plugin.prefs.barPos = null;
      const note = box(r.left, r.top, 300, 80, 'notice-container');
      st.toolbar.place(); await sleep(30);
      check('…a notice on top doesn\'t move it', Math.abs(bar().getBoundingClientRect().top - (r.top + 8)) < 6, bar().getBoundingClientRect().top - r.top);
      note.remove();
      plugin.prefs.barVertical = saved.v; bar().classList.toggle('is-vertical', !!saved.v); plugin.prefs.barPos = saved.pos; st.toolbar.place();
    }

    // ===== a toolbar too long for the screen: favorites fold into a star, then buttons shrink =====
    {
      const st = plugin.sessions.get(view), root = view.contentEl;
      const saved = { v: plugin.prefs.barVertical, pos: plugin.prefs.barPos, favs: plugin.prefs.favorites, h: root.style.height };
      plugin.prefs.barVertical = true; plugin.prefs.barPos = null; bar().classList.add('is-vertical');
      plugin.prefs.favorites = [{ tool: 'pen', color: '#e03131', size: 2.5, type: 'ball' }, { tool: 'hl', color: '#ffd400', size: 16 }, { tool: 'pen', color: '#1c7ed6', size: 2.5, type: 'ball' }];
      plugin.refreshToolbars(); st.toolbar.place(); await sleep(30);
      const star = () => bar().querySelector('[aria-label="Favorites"]'), favIn = (sel) => bar().querySelectorAll(sel + ' [aria-label^="Favorite "]').length;
      const shown = (el) => !!el && el.getBoundingClientRect().width > 0;   // takes up space (no hidden parent)
      const oneColumn = () => bar().getBoundingClientRect().width < 60;
      check('fit: with room, favorites show in the bar (no star)', !shown(star()) && favIn('.pa-row > .pa-favs') === 3 && !bar().classList.contains('is-compact') && oneColumn());
      const set = async (px) => { root.style.height = px + 'px'; st.toolbar.place(); await sleep(30); };
      await set(700);
      const b1 = bar().getBoundingClientRect();
      check('fit: short screen, favorites fold into a star, still one column', shown(star()) && favIn('.pa-favpop') === 3 && oneColumn(), [shown(star()), favIn('.pa-favpop'), b1.width]);
      check('…and the bar fits', b1.bottom <= root.getBoundingClientRect().bottom, [b1.bottom, root.getBoundingClientRect().bottom]);
      const tap = (b) => { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); };
      tap(star());
      const pop = bar().querySelector('.pa-favpop');
      check('fit: tapping the star shows the favorites beside it', shown(pop) && pop.getBoundingClientRect().left >= bar().querySelector('.pa-row').getBoundingClientRect().right);
      tap(pop.querySelectorAll('[aria-label^="Favorite "]')[2]);
      check('…picking one uses it and closes the star', plugin.prefs.tool === 'pen' && plugin.prefs.pen.color === '#1c7ed6' && !shown(pop));
      await set(560);
      check('fit: shorter still, buttons get a little smaller (one column)', bar().classList.contains('is-compact') && oneColumn() && bar().getBoundingClientRect().bottom <= root.getBoundingClientRect().bottom, [bar().className, bar().getBoundingClientRect().width]);
      await set(300);
      check('fit: far too short, it wraps as a last resort (nothing cut off)', bar().getBoundingClientRect().bottom <= root.getBoundingClientRect().bottom + 1 && !oneColumn());
      root.style.height = saved.h; plugin.prefs.favorites = saved.favs; plugin.refreshToolbars(); st.toolbar.place(); await sleep(30);
      check('fit: room again, favorites go back into the bar', !shown(star()) && !bar().classList.contains('is-compact'));
      // Phones: always the folded, smaller bar, even when the full one would fit.
      window.__pi.O.Platform.isPhone = true; plugin.prefs.favorites = [{ tool: 'pen', color: '#e03131', size: 2.5, type: 'ball' }];
      plugin.refreshToolbars(); st.toolbar.place(); await sleep(30);
      check('fit: on a phone the favorites fold and buttons are smaller, even with room', shown(star()) && bar().classList.contains('is-compact') && oneColumn());
      window.__pi.O.Platform.isPhone = false; plugin.prefs.favorites = saved.favs; plugin.refreshToolbars(); st.toolbar.place(); await sleep(30);
      check('fit: …but not on a tablet', !shown(star()) && !bar().classList.contains('is-compact'));
      plugin.prefs.barVertical = saved.v; bar().classList.toggle('is-vertical', !!saved.v); plugin.prefs.barPos = saved.pos; st.toolbar.place();
    }

    // ===== Select all ink on screen, and Hide or show ink =====
    {
      const st = plugin.sessions.get(view), cmd = (id) => plugin.commands.find(c => c.id === id);
      const rr0 = view.contentEl.getBoundingClientRect(), onScreen = (el) => { const r = el.getBoundingClientRect(); return r.bottom >= rr0.top && r.top <= rr0.bottom; };
      const onPage = () => plugin.sections(view.contentEl).filter(el => el.dataset.paPath === NOTE && onScreen(el)).reduce((n, el) => n + plugin.strokesFor(NOTE, el.dataset.paKey).length, 0);
      const offScreen = plugin.sections(view.contentEl).filter(el => !onScreen(el)).flatMap(el => plugin.strokesFor(NOTE, el.dataset.paKey));
      plugin.clearSelection();
      const total = onPage();
      check('select all: offered while marking up', cmd('select-all-ink') && cmd('select-all-ink').checkCallback(true) === true);
      cmd('select-all-ink').checkCallback(false);
      check('select all: picks every drawing on the page', total > 5 && plugin.selected.size === total && plugin.prefs.tool === 'lasso', [plugin.selected.size, total]);
      check('…and shows the selection box', vis(document.querySelector('.pa-selbox')));
      check('select all: leaves ink scrolled out of view alone', offScreen.length > 0 && offScreen.every(s => !plugin.selected.has(s)), offScreen.length);
      const mr = document.querySelector('.pa-selmenu').getBoundingClientRect();
      check('…and its menu stays on screen', mr.top >= rr0.top && mr.bottom <= rr0.bottom, [mr.top, mr.bottom]);
      plugin.clearSelection();
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true, cancelable: true }));
      check('select all: Cmd/Ctrl + A does it too', plugin.selected.size === total, plugin.selected.size);
      plugin.clearSelection();
      const modal = document.createElement('div'); modal.className = 'modal-container'; document.body.appendChild(modal);
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', metaKey: true, bubbles: true, cancelable: true }));
      check('select all: Cmd/Ctrl + A does nothing behind a dialog', plugin.selected.size === 0);
      modal.remove();
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ф', code: 'KeyA', metaKey: true, bubbles: true, cancelable: true }));
      check('select all: works with a non-Latin keyboard layout', plugin.selected.size === total, plugin.selected.size);
      plugin.clearSelection();
      // A note renamed while its ink is still loading keeps its ink under the new name.
      files.set('Annotations/Loading A.json', JSON.stringify({ version: 1, sections: { k: [{ kind: 'pen', color: '#000000', width: 2, opacity: 1, pts: [[0.1, 1], [0.2, 2]] }] } }));
      const pl = plugin.loadInk('Loading A.md');
      plugin.cache.set('Loading B.md', plugin.cache.get('Loading A.md')); plugin.cache.delete('Loading A.md');   // what the rename does
      await pl;
      const dB = plugin.cache.get('Loading B.md');
      check('sweep: ink renamed mid-load lands under the new name', dB && !(dB instanceof Promise) && dB.sections.k && !plugin.cache.has('Loading A.md') && plugin.lastWritten.has('Loading B.md'));
      plugin.cache.delete('Loading B.md'); plugin.lastWritten.delete('Loading B.md'); files.delete('Annotations/Loading A.json');
      const inp = document.createElement('input'); document.body.appendChild(inp); inp.focus();
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true, cancelable: true }));
      check('…but not while typing in a field', plugin.selected.size === 0);
      inp.remove();
      plugin.prefs.tool = 'pen'; plugin.refreshToolbars();
      // Hide or show ink.
      await sleep(700);   // let earlier saves land first
      const saved = files.get('Annotations/Folder/Long test note.json');
      const inked = plugin.sections(view.contentEl).find(el => plugin.strokesFor(NOTE, el.dataset.paKey).length);
      const layerShown = () => getComputedStyle(inked.querySelector('.pa-layer-ink')).display !== 'none' || getComputedStyle(inked.querySelector('.pa-layer-hl')).display !== 'none';
      check('hide ink: (ink showing to start with)', layerShown());
      cmd('toggle-ink-visibility').callback();
      check('hide ink: hides every drawing', document.body.classList.contains('pa-ink-hidden') && !layerShown());
      await sleep(700);
      check('…without changing the saved ink', files.get('Annotations/Folder/Long test note.json') === saved);
      cmd('toggle-ink-visibility').callback();
      check('hide ink: running it again shows them', !document.body.classList.contains('pa-ink-hidden') && layerShown());
      cmd('toggle-ink-visibility').callback();
      plugin.stop(view); await plugin.start(view);
      check('hide ink: marking up shows the ink again', !document.body.classList.contains('pa-ink-hidden') && layerShown());
      plugin.prefs.barVertical = false;
    }

    // ===== the mouse pointer matches the tool =====
    {
      const sc = view.contentEl.querySelector('.markdown-preview-view'), cur = () => getComputedStyle(sc).cursor;
      const pick = (tool) => { plugin.prefs.tool = tool; plugin.refreshToolbars(); };
      plugin.prefs.pen.color = '#e03131'; plugin.prefs.hl.color = '#ffd400';
      pick('pen');
      check('cursor: the pen is a pencil in its color, tip on the ink', /^url\(/.test(cur()) && cur().includes(encodeURIComponent('#e03131')) && /\b2 22\b/.test(cur()), cur().slice(-40));
      plugin.prefs.pen.color = '#1c7ed6'; plugin.refreshToolbars();
      check('…and follows a color change', cur().includes(encodeURIComponent('#1c7ed6')));
      // While you press, the pointer is captured by the note area: it must show the pencil too.
      const rootCur = getComputedStyle(view.contentEl).cursor;
      check('cursor: the pencil stays while pressing (on the note area that captures the pointer)', rootCur === cur(), rootCur.slice(0, 30));
      const tb = getComputedStyle(bar()).cursor;
      check('…but not over the toolbar', !/^url\(/.test(tb), tb.slice(0, 30));
      pick('hl');
      check('cursor: the highlighter is a highlighter in its color', /^url\(/.test(cur()) && cur().includes(encodeURIComponent('#ffd400')) && /\b4 20\b/.test(cur()));
      pick('shape');
      check('cursor: shapes keep the crosshair', cur() === 'crosshair', cur());
      pick('eraser');
      check('cursor: the eraser is a pink eraser', /^url\(/.test(cur()) && cur().includes(encodeURIComponent('#f783ac')) && /\b5 19\b/.test(cur()), cur().slice(-40));
      pick('laser');
      check('cursor: the laser shows its red dot instead', cur() === 'none', cur());
      pick('lasso');
      check('cursor: Select is an arrow', cur() === 'default', cur());
      pick('pen'); plugin.prefs.pen.color = '#e03131'; plugin.refreshToolbars();
    }

    // 11. Done removes the toolbar.
    bar().querySelector('[aria-label="Done"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    check('done closes annotation mode', !bar() && !plugin.sessions.has(view));
    check('done puts the normal pointer back', !view.contentEl.classList.contains('pa-cur-tool') && !view.contentEl.style.getPropertyValue('--pa-cursor'));
    await sleep(50);
    window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onErr);
    check('no uncaught errors during the whole run', uncaught.length === 0, uncaught.slice(0, 3));
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
