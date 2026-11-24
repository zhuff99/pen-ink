// Minimal stand-in for the `obsidian` module, used by test/load.test.js (Node)
// and test/harness.html (browser). Only what Pen Ink touches is mocked.
// Component has a REAL load() that calls onload(), like Obsidian's, so a plugin
// that accidentally overrides load()/unload() breaks here too.
(function (root) {
  class Component {
    constructor() { this._loaded = false; this._children = []; this._cleanups = []; }
    load() {
      if (this._loaded) return;
      this._loaded = true;
      const r = this.onload();
      for (const c of this._children) c.load();
      return r;
    }
    unload() {
      if (!this._loaded) return;
      this._loaded = false;
      for (const c of this._children) c.unload();
      for (const fn of this._cleanups.splice(0)) fn();
      this.onunload();
    }
    onload() {}
    onunload() {}
    addChild(c) { this._children.push(c); if (this._loaded) c.load(); return c; }
    register(fn) { this._cleanups.push(fn); }
    registerEvent(ref) { this._cleanups.push(() => ref && ref.off && ref.off()); }
    registerDomEvent(el, type, fn, opts) { el.addEventListener(type, fn, opts); this.register(() => el.removeEventListener(type, fn, opts)); }
  }

  class MarkdownRenderChild extends Component {
    constructor(containerEl) { super(); this.containerEl = containerEl; }
  }

  class Plugin extends Component {
    constructor(app, manifest) {
      super();
      this.app = app; this.manifest = manifest;
      this.commands = []; this.postProcessors = []; this._data = null;
    }
    addCommand(c) { this.commands.push(c); return c; }
    addSettingTab(t) { this.settingTabs = (this.settingTabs || []).concat(t); }
    registerMarkdownPostProcessor(fn) { this.postProcessors.push(fn); return fn; }
    async loadData() { return this._data ? JSON.parse(JSON.stringify(this._data)) : null; }
    async saveData(d) { this._data = JSON.parse(JSON.stringify(d)); }
  }

  class MarkdownView {}
  class Notice { constructor(msg) { (root.__notices = root.__notices || []).push(String(msg)); } }
  const normalizePath = (p) => p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
  const Platform = { isMobile: false };
  class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; this.containerEl = { empty() {}, children: [] }; } }
  // Chainable no-op Setting that records what was added (enough to run display()).
  class Setting {
    constructor(el) { this.el = el; el.children && el.children.push(this); }
    setName(n) { this.name = n; return this; }
    setDesc() { return this; }
    _ctl(fn) {
      let value = '';
      const listeners = {};
      const c = { setValue: (v) => { value = v; return c; }, getValue: () => value, onChange: (f) => { this.onChange = f; return c; },
        setLimits: () => c, setDynamicTooltip: () => c, setPlaceholder: () => c,
        inputEl: { addEventListener: (t, f) => { listeners[t] = f; }, fire: (t) => listeners[t] && listeners[t]() } };
      this.control = c; fn(c); return this;
    }
    addText(fn) { return this._ctl(fn); }
    addToggle(fn) { return this._ctl(fn); }
    addSlider(fn) { return this._ctl(fn); }
  }
  class TAbstractFile { constructor(path) { this.path = path; } }
  class TFile extends TAbstractFile {}
  class TFolder extends TAbstractFile {}
  const icons = {};
  const addIcon = (id, svg) => { icons[id] = svg; };

  const api = { Component, MarkdownRenderChild, Plugin, MarkdownView, Notice, normalizePath, Platform, addIcon, icons, PluginSettingTab, Setting, TFile, TFolder, TAbstractFile };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.mockObsidian = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
