// Load-path test: runs main.js against a mock `obsidian` module whose Plugin has a real
// load() -> onload() lifecycle. Catches things like accidentally overriding load().
// Run: node test/load.test.js
'use strict';
const path = require('path');
const Module = require('module');
const assert = require('assert');
const mock = require('./mock-obsidian.js');

// Make require('obsidian') inside main.js return the mock.
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  return req === 'obsidian' ? path.join(__dirname, 'mock-obsidian.js') : origResolve.call(this, req, ...rest);
};

const PenInk = require('../main.js');
// Minimal page stand-in for code paths that look for rendered sections.
globalThis.document = globalThis.document || { querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} };
globalThis.activeDocument = globalThis.document;
globalThis.window = globalThis;

(async () => {
  const actions = [];
  class View extends mock.MarkdownView {
    addAction(icon, title, cb) { const el = { icon, title, cb, removed: false, classList: { add() {}, remove() {} }, remove() { this.removed = true; } }; actions.push(el); return el; }
  }
  const view = new View();
  const handlers = {};
  const app = {
    workspace: {
      getActiveViewOfType: () => view,
      iterateAllLeaves: (fn) => fn({ view }),
      onLayoutReady: (fn) => fn(),
      on: () => ({ off() {} }),
    },
    vault: {
      on: (name, fn) => { handlers[name] = fn; return { off() {} }; },
      getAbstractFileByPath: () => null, read: async () => '', modify: async () => {}, create: async () => {}, createFolder: async () => {}, rename: async () => {},
    },
  };

  const plugin = new PenInk(app, { id: 'pen-ink', version: 'test' });
  plugin._data = { tool: 'pen', pen: { color: '#ABCDEF', size: 4 }, hl: { color: 'red; background:url(x)', size: 999 }, recent: ['#111111', 'nope'], favorites: [{ tool: 'hl', color: '#40C057', size: 24 }, { tool: 'pen', color: 'red', size: 2.5 }, { tool: 'hl', color: '#ffffff', size: 13 }], smoothing: 500 };
  await plugin.load();

  assert.deepStrictEqual(globalThis.__notices || [], [], 'no error notices during load');
  assert.strictEqual(typeof Object.getOwnPropertyDescriptor(PenInk.prototype, 'load'), 'undefined', 'plugin must not override load()');
  assert.strictEqual(typeof Object.getOwnPropertyDescriptor(PenInk.prototype, 'unload'), 'undefined', 'plugin must not override unload()');
  assert.strictEqual(plugin.postProcessors.length, 1, 'post-processor registered');
  assert.deepStrictEqual(plugin.commands.map(c => c.id), ['toggle', 'undo', 'redo', 'reset-zoom', 'copy-ink', 'cut-ink', 'paste-ink', 'recover-hidden-ink']);
  assert.strictEqual(actions.length, 1, 'button added to the view header');
  assert.strictEqual(actions[0].icon, 'pen-ink-marker', 'header uses our own icon, not the edit pencil');
  assert.ok(/<path d="/.test(mock.icons['pen-ink-marker']), 'custom icon registered');
  assert.ok(handlers.rename && handlers.modify, 'rename + modify handlers registered');
  assert.strictEqual((plugin.settingTabs || []).length, 1, 'settings tab registered');
  plugin.settingTabs[0].display();
  assert.deepStrictEqual(plugin.settingTabs[0].containerEl.children.map(x => x.name), ['Ink folder', 'Hold to straighten', 'Straight highlighter', 'Smoothing', 'Eraser switches back']);
  assert.strictEqual(plugin.inkFolder(), 'Annotations');
  assert.strictEqual(plugin.dataPath('A/B.md'), 'Annotations/A/B.json');
  const folderCtl = plugin.settingTabs[0].containerEl.children[0].control;
  folderCtl.setValue('.obsidian/ink'); folderCtl.inputEl.fire('change');
  assert.strictEqual(plugin.inkFolder(), 'Annotations', 'hidden folders are refused');
  folderCtl.setValue('Ink'); folderCtl.inputEl.fire('change');
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(plugin.dataPath('A/B.md'), 'Ink/A/B.json', 'folder setting applies');
  await plugin.changeFolder('Annotations');

  // Saved prefs are validated (bad color/size ignored, good ones kept).
  assert.strictEqual(plugin.prefs.tool, 'pen');
  assert.deepStrictEqual(plugin.prefs.pen, { color: '#abcdef', size: 4, type: 'ball', dash: 'solid', opacity: 1 });
  assert.deepStrictEqual(plugin.prefs.hl, { color: '#ffd400', size: 16, straight: false });
  assert.deepStrictEqual(plugin.prefs.favorites, [{ tool: 'hl', color: '#40c057', size: 24 }], 'bad favorites dropped');
  assert.strictEqual(plugin.prefs.smoothing, 30, 'out-of-range smoothing ignored');
  assert.strictEqual(plugin.prefs.barVertical, true, 'toolbar defaults to vertical');
  assert.ok(!/style\s*\.\s*\w+\s*=\s*['"`]|setAttribute\('style'|cssText/.test(require('fs').readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8')), 'no fixed inline styles');
  assert.deepStrictEqual(plugin.prefs.recent, ['#111111']);

  assert.strictEqual(plugin.dataPath('Folder/My note.md'), 'Annotations/Folder/My note.json');

  plugin.unload();
  assert.ok(actions[0].removed, 'pencil button removed on unload');
  assert.ok(!('penInkButton' in view), 'view cleaned up on unload');
  assert.ok(!/adapter|internalPlugins/.test(require('fs').readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8').replace(/\/\/.*$/gm, '')), 'no adapter or private API use');

  console.log('load.test.js: all checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
