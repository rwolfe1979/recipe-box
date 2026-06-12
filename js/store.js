/* Data layer: loads recipes/plan from the GitHub repo (when a token is set)
   or from the static site files, with localStorage as offline cache and as
   the home for device-only edits made before GitHub is connected. */

const Store = {
  config: null,
  shas: {},          // path -> last seen git blob sha (needed for updates)
  recipes: [],
  bulk: [],
  plan: { entries: [] },

  PATHS: {
    recipes: 'data/recipes.json',
    plan: 'data/mealplan.json',
    bulk: 'data/bulk-ingredients.json',
    inbox: 'data/inbox.json',
  },

  init() {
    try { this.config = JSON.parse(localStorage.getItem('rb-config')) || {}; }
    catch (e) { this.config = {}; }
  },

  saveConfig(cfg) {
    this.config = cfg;
    localStorage.setItem('rb-config', JSON.stringify(cfg));
  },

  hasGitHub() {
    const c = this.config;
    return !!(c && c.owner && c.repo && c.token);
  },

  // ---------- loading ----------

  async loadAll() {
    const [recipes, bulk, plan] = await Promise.all([
      this.loadFile(this.PATHS.recipes, []),
      this.loadFile(this.PATHS.bulk, []),
      this.loadFile(this.PATHS.plan, { entries: [] }),
    ]);
    this.recipes = this.mergeLocalRecipes(recipes || []);
    this.bulk = bulk || [];
    this.plan = (plan && plan.entries) ? plan : { entries: [] };
    // Prefer a locally saved plan if GitHub isn't connected
    if (!this.hasGitHub()) {
      const localPlan = this.getLocal('rb-plan');
      if (localPlan && localPlan.entries) this.plan = localPlan;
    }
  },

  async loadFile(path, fallback) {
    try {
      if (this.hasGitHub()) {
        const { json } = await this.ghGet(path);
        this.setLocal('rb-cache-' + path, json);
        return json;
      }
      const res = await fetch(path + '?t=' + Date.now());
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      this.setLocal('rb-cache-' + path, json);
      return json;
    } catch (e) {
      const cached = this.getLocal('rb-cache-' + path);
      if (cached !== null) return cached;
      return fallback;
    }
  },

  // ---------- GitHub contents API ----------

  ghUrl(path) {
    const c = this.config;
    const branch = c.branch || 'main';
    return 'https://api.github.com/repos/' + c.owner + '/' + c.repo +
      '/contents/' + path + '?ref=' + encodeURIComponent(branch) + '&t=' + Date.now();
  },

  ghHeaders() {
    return {
      'Authorization': 'Bearer ' + this.config.token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  },

  async ghGet(path) {
    const res = await fetch(this.ghUrl(path), { headers: this.ghHeaders() });
    if (!res.ok) throw new Error('GitHub read failed (' + res.status + ') for ' + path);
    const body = await res.json();
    this.shas[path] = body.sha;
    const text = decodeURIComponent(escape(atob(body.content.replace(/\n/g, ''))));
    return { json: JSON.parse(text), sha: body.sha };
  },

  async ghPut(path, obj, message) {
    // Re-read right before writing so we always have the current sha
    let sha = null;
    try { const cur = await this.ghGet(path); sha = cur.sha; } catch (e) { /* new file */ }
    const c = this.config;
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(obj, null, 2))));
    const res = await fetch(
      'https://api.github.com/repos/' + c.owner + '/' + c.repo + '/contents/' + path,
      {
        method: 'PUT',
        headers: this.ghHeaders(),
        body: JSON.stringify({
          message: message,
          content: content,
          branch: c.branch || 'main',
          sha: sha || undefined,
        }),
      });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error('GitHub save failed (' + res.status + '): ' + detail.slice(0, 200));
    }
    const body = await res.json();
    this.shas[path] = body.content.sha;
  },

  async testConnection(cfg) {
    const res = await fetch(
      'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo,
      { headers: { 'Authorization': 'Bearer ' + cfg.token, 'Accept': 'application/vnd.github+json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  },

  // ---------- saving ----------

  async saveRecipe(recipe) {
    const idx = this.recipes.findIndex(r => r.id === recipe.id);
    if (idx >= 0) this.recipes[idx] = recipe; else this.recipes.push(recipe);

    if (this.hasGitHub()) {
      await this.ghPut(this.PATHS.recipes, this.stripLocalFlags(this.recipes),
        (idx >= 0 ? 'Update recipe: ' : 'Add recipe: ') + recipe.title);
      this.clearLocalRecipe(recipe.id);
    } else {
      recipe._localOnly = true;
      const locals = this.getLocal('rb-local-recipes') || [];
      const li = locals.findIndex(r => r.id === recipe.id);
      if (li >= 0) locals[li] = recipe; else locals.push(recipe);
      this.setLocal('rb-local-recipes', locals);
    }
    this.setLocal('rb-cache-' + this.PATHS.recipes, this.stripLocalFlags(this.recipes));
  },

  async deleteRecipe(id) {
    const r = this.recipes.find(x => x.id === id);
    this.recipes = this.recipes.filter(x => x.id !== id);
    this.clearLocalRecipe(id);
    if (this.hasGitHub()) {
      await this.ghPut(this.PATHS.recipes, this.stripLocalFlags(this.recipes),
        'Remove recipe: ' + (r ? r.title : id));
    }
    this.setLocal('rb-cache-' + this.PATHS.recipes, this.stripLocalFlags(this.recipes));
  },

  async savePlan() {
    this.setLocal('rb-plan', this.plan);
    if (this.hasGitHub()) {
      await this.ghPut(this.PATHS.plan, this.plan, 'Update meal plan');
    }
  },

  async saveToInbox(entry) {
    if (this.hasGitHub()) {
      let inbox = [];
      try { inbox = (await this.ghGet(this.PATHS.inbox)).json || []; } catch (e) { /* none yet */ }
      inbox.push(entry);
      await this.ghPut(this.PATHS.inbox, inbox, 'Inbox: ' + (entry.title || entry.url || 'pasted recipe'));
      return 'github';
    }
    const inbox = this.getLocal('rb-inbox') || [];
    inbox.push(entry);
    this.setLocal('rb-inbox', inbox);
    return 'local';
  },

  // Push any device-only recipes up to GitHub once a token is configured
  async syncLocalRecipes() {
    const locals = this.getLocal('rb-local-recipes') || [];
    if (!locals.length || !this.hasGitHub()) return 0;
    const { json } = await this.ghGet(this.PATHS.recipes);
    const merged = json || [];
    for (const r of locals) {
      delete r._localOnly;
      const i = merged.findIndex(x => x.id === r.id);
      if (i >= 0) merged[i] = r; else merged.push(r);
    }
    await this.ghPut(this.PATHS.recipes, merged,
      'Sync ' + locals.length + ' recipe(s) added on a device');
    localStorage.removeItem('rb-local-recipes');
    this.recipes = merged;
    return locals.length;
  },

  // ---------- helpers ----------

  mergeLocalRecipes(repoRecipes) {
    const locals = this.getLocal('rb-local-recipes') || [];
    const merged = repoRecipes.slice();
    for (const r of locals) {
      const i = merged.findIndex(x => x.id === r.id);
      if (i >= 0) merged[i] = r; else merged.push(r);
    }
    return merged;
  },

  clearLocalRecipe(id) {
    const locals = this.getLocal('rb-local-recipes') || [];
    const next = locals.filter(r => r.id !== id);
    if (next.length !== locals.length) this.setLocal('rb-local-recipes', next);
  },

  stripLocalFlags(recipes) {
    return recipes.map(r => { const c = Object.assign({}, r); delete c._localOnly; return c; });
  },

  localRecipeCount() {
    return (this.getLocal('rb-local-recipes') || []).length;
  },

  localInbox() {
    return this.getLocal('rb-inbox') || [];
  },

  getLocal(key) {
    try { const v = localStorage.getItem(key); return v === null ? null : JSON.parse(v); }
    catch (e) { return null; }
  },

  setLocal(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* full */ }
  },
};

Store.init();
