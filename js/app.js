/* Recipe Box — views and routing. No build step, no framework. */

const App = {
  shop: null,   // {start, days, extras:[], checked:{}, hideStaples}
  loaded: false,

  MEAL_TYPES: ['breakfast', 'lunch', 'dinner', 'casserole', 'side', 'bread', 'soup', 'salad', 'appetizer', 'snack', 'dessert', 'drink', 'dressing', 'marinade'],
  DIETS: ['vegetarian', 'vegan', 'gluten-free'],
  TIME_LIMITS: [20, 30, 45, 60],
  SLOTS: ['breakfast', 'lunch', 'dinner', 'other'],

  async start() {
    this.shop = Store.getLocal('rb-shop') || {
      start: this.today(), days: 7, extras: [], checked: {}, hideStaples: true,
    };
    this.applyTheme(Store.getLocal('rb-theme') || 'auto');
    this.handleShareTarget();
    this.updateSyncBadge();
    window.addEventListener('hashchange', () => this.route());
    this.renderLoading();
    try { await Store.loadAll(); } catch (e) { console.error(e); }
    this.loaded = true;
    this.route();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(reg => {
        // When a new version installs (and we already had one running), reload once
        // so the user always lands on the latest app without manual cache-clearing.
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller && !this._reloadedForUpdate) {
              this._reloadedForUpdate = true;
              location.reload();
            }
          });
        });
        // Check for an update now, and whenever the app is brought back to the foreground.
        reg.update();
        document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update(); });
      }).catch(() => {});
    }
  },

  // ---------- routing ----------

  route() {
    if (!this.loaded) return;
    const hash = location.hash || '#/home';
    const parts = hash.replace(/^#\//, '').split('/');
    const page = parts[0] || 'home';
    document.querySelectorAll('.bottomnav a').forEach(a => {
      a.classList.toggle('active', a.dataset.nav === page ||
        (a.dataset.nav === 'recipes' && (page === 'recipe' || page === 'edit')) ||
        (a.dataset.nav === 'new' && page === 'import'));
    });
    window.scrollTo(0, 0);
    const view = document.getElementById('view');
    switch (page) {
      case 'home': return this.renderHome(view);
      case 'recipes': return this.renderBrowse(view);
      case 'recipe': return this.renderDetail(view, decodeURIComponent(parts[1] || ''));
      case 'new': return this.renderEdit(view, null);
      case 'edit': return this.renderEdit(view, decodeURIComponent(parts[1] || ''));
      case 'plan': return this.renderPlan(view);
      case 'shopping': return this.renderShopping(view);
      case 'import': return this.renderImport(view);
      case 'settings': return this.renderSettings(view);
      default: return this.renderHome(view);
    }
  },

  // ---------- home (category selector) ----------

  TYPE_META: [
    ['breakfast', '🍳'], ['lunch', '🥪'], ['dinner', '🍽️'], ['casserole', '🍲'], ['bread', '🍞'],
    ['soup', '🥣'], ['salad', '🥗'], ['appetizer', '🫕'], ['side', '🥘'], ['snack', '🍿'],
    ['dessert', '🍰'], ['drink', '🥤'], ['dressing', '🫙'], ['marinade', '🧂'],
  ],

  renderHome(view) {
    const count = (pred) => Store.recipes.filter(pred).length;
    const types = this.TYPE_META
      .map(([t, e]) => ({ t, e, n: count(r => (r.mealTypes || []).includes(t)) }))
      .filter(x => x.n > 0);
    const cuisines = this.distinct(Store.recipes.map(r => r.cuisine))
      .map(c => ({ c, n: count(r => r.cuisine === c) }))
      .sort((a, b) => b.n - a.n);
    const quick = [
      { label: 'Under 30 min', emoji: '⏱️', f: { time: '30' } },
      { label: 'Vegetarian', emoji: '🌱', f: { diet: 'vegetarian' }, on: count(r => (r.diet || []).includes('vegetarian')) },
      { label: 'Vegan', emoji: '🥬', f: { diet: 'vegan' }, on: count(r => (r.diet || []).includes('vegan')) },
      { label: 'From TikTok', emoji: '📱', f: { tag: 'tiktok' }, on: count(r => (r.tags || []).includes('tiktok')) },
    ].filter(q => q.on === undefined || q.on > 0);

    view.innerHTML = `
      <div class="home-head">
        <h2>What are we cooking?</h2>
        <p class="muted small">${Store.recipes.length} recipes · tap a category, or <a href="javascript:App.browseBy({})">see them all</a></p>
      </div>
      <div class="searchbar"><input type="text" id="home-q" placeholder="Search all recipes…"></div>

      <h3>By type</h3>
      <div class="cat-grid">
        ${types.map(x => `<button class="cat-tile" style="${this.placeholderStyle({ id: x.t })}" data-meal="${x.t}">
          <span class="cat-emoji">${x.e}</span><span class="cat-name">${x.t}</span><span class="cat-count">${x.n}</span>
        </button>`).join('')}
      </div>

      <h3>Quick picks</h3>
      <div class="chip-row">
        ${quick.map((q, i) => `<button class="quick-chip" data-quick="${i}"><span>${q.emoji}</span> ${q.label}</button>`).join('')}
      </div>

      <h3>By cuisine</h3>
      <div class="chip-row">
        ${cuisines.map(x => `<button class="quick-chip" data-cuisine="${this.esc(x.c)}">${this.esc(x.c)} <span class="muted">${x.n}</span></button>`).join('')}
      </div>`;

    const q = document.getElementById('home-q');
    q.addEventListener('keydown', e => { if (e.key === 'Enter' && q.value.trim()) this.browseBy({ q: q.value.trim() }); });
    view.querySelectorAll('[data-meal]').forEach(b => b.onclick = () => this.browseBy({ meal: b.dataset.meal }));
    view.querySelectorAll('[data-cuisine]').forEach(b => b.onclick = () => this.browseBy({ cuisine: b.dataset.cuisine }));
    view.querySelectorAll('[data-quick]').forEach(b => b.onclick = () => this.browseBy(quick[Number(b.dataset.quick)].f));
  },

  // Apply a filter set and jump to the full Recipes list.
  browseBy(filter) {
    this.browseFilters = Object.assign(
      { q: '', meal: '', cuisine: '', main: '', tag: '', diet: '', time: '' }, filter);
    location.hash = '#/recipes';
  },

  renderLoading() {
    document.getElementById('view').innerHTML = '<p class="muted">Loading your recipes…</p>';
  },

  // ---------- browse ----------

  renderBrowse(view) {
    const f = this.browseFilters || { q: '', meal: '', cuisine: '', main: '', tag: '', diet: '', time: '' };
    this.browseFilters = f;
    const cuisines = this.distinct(Store.recipes.map(r => r.cuisine));
    const mains = this.distinct(Store.recipes.flatMap(r => r.mainIngredients || []));
    const tags = this.distinct(Store.recipes.flatMap(r => r.tags || []));
    const diets = this.DIETS.filter(d => Store.recipes.some(r => (r.diet || []).includes(d)));

    view.innerHTML = `
      <h2>Recipes <span class="muted small">(${Store.recipes.length})</span></h2>
      <div class="searchbar"><input type="text" id="f-q" placeholder="Search recipes or ingredients…" value="${this.esc(f.q)}"></div>
      <div class="filters">
        <select id="f-meal"><option value="">Any type</option>${this.MEAL_TYPES.map(m => `<option ${f.meal === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
        <select id="f-cuisine"><option value="">Any cuisine</option>${cuisines.map(c => `<option ${f.cuisine === c ? 'selected' : ''}>${this.esc(c)}</option>`).join('')}</select>
        <select id="f-main"><option value="">Any main ingredient</option>${mains.map(m => `<option ${f.main === m ? 'selected' : ''}>${this.esc(m)}</option>`).join('')}</select>
        <select id="f-tag"><option value="">Any tag</option>${tags.map(t => `<option ${f.tag === t ? 'selected' : ''}>${this.esc(t)}</option>`).join('')}</select>
        <select id="f-diet"><option value="">Any diet</option>${diets.map(d => `<option ${f.diet === d ? 'selected' : ''}>${this.esc(d)}</option>`).join('')}</select>
        <select id="f-time"><option value="">Any time</option>${this.TIME_LIMITS.map(t => `<option value="${t}" ${String(f.time) === String(t) ? 'selected' : ''}>under ${t} min</option>`).join('')}</select>
      </div>
      <p class="small" id="filter-status" hidden></p>
      <div class="recipe-grid" id="grid"></div>
      <p class="muted small" id="empty-note" hidden></p>`;

    const renderGrid = () => {
      const list = Store.recipes.filter(r => {
        if (f.meal && !(r.mealTypes || []).includes(f.meal)) return false;
        if (f.cuisine && r.cuisine !== f.cuisine) return false;
        if (f.main && !(r.mainIngredients || []).includes(f.main)) return false;
        if (f.tag && !(r.tags || []).includes(f.tag)) return false;
        if (f.diet && !(r.diet || []).includes(f.diet)) return false;
        if (f.time) {
          const total = this.totalTime(r);
          if (!total || total > Number(f.time)) return false;
        }
        if (f.q) {
          const hay = (r.title + ' ' + (r.tags || []).join(' ') + ' ' +
            (r.ingredients || []).map(i => i.item).join(' ')).toLowerCase();
          if (!hay.includes(f.q.toLowerCase())) return false;
        }
        return true;
      });
      list.sort((a, b) => a.title.localeCompare(b.title));
      const active = ['meal', 'cuisine', 'main', 'tag', 'diet', 'time'].some(k => f[k]) || f.q;
      const status = document.getElementById('filter-status');
      status.hidden = !active;
      status.innerHTML = active
        ? `<span class="muted">Showing ${list.length} of ${Store.recipes.length}</span> · <a href="javascript:App.clearFilters()">clear filters</a>`
        : '';
      document.getElementById('grid').innerHTML = list.map(r => `
        <div class="recipe-card" onclick="location.hash='#/recipe/${encodeURIComponent(r.id)}'">
          ${this.thumbHtml(r, false)}
          <h3>${this.esc(r.title)}${r._localOnly ? ' <span class="chip">this device</span>' : ''}</h3>
          <div>
            ${r.cuisine ? `<span class="chip">${this.esc(r.cuisine)}</span>` : ''}
            ${(r.mealTypes || []).map(m => `<span class="chip green">${m}</span>`).join('')}
          </div>
          <p class="muted small">${(r.mainIngredients || []).join(', ')}${this.totalTime(r) ? ' · ' + this.totalTime(r) + ' min' : ''}</p>
        </div>`).join('');
      const note = document.getElementById('empty-note');
      note.hidden = list.length > 0;
      note.textContent = Store.recipes.length === 0
        ? 'No recipes yet — tap ➕ Add to create one, or ask Claude to import some.'
        : 'Nothing matches those filters.';
    };

    document.getElementById('f-q').addEventListener('input', e => { f.q = e.target.value; renderGrid(); });
    for (const [id, key] of [['f-meal', 'meal'], ['f-cuisine', 'cuisine'], ['f-main', 'main'], ['f-tag', 'tag'], ['f-diet', 'diet'], ['f-time', 'time']]) {
      document.getElementById(id).addEventListener('change', e => { f[key] = e.target.value; renderGrid(); });
    }
    renderGrid();
  },

  clearFilters() {
    this.browseFilters = { q: '', meal: '', cuisine: '', main: '', tag: '', diet: '', time: '' };
    this.route();
  },

  // ---------- recipe detail ----------

  renderDetail(view, id) {
    const r = Store.recipes.find(x => x.id === id);
    if (!r) { view.innerHTML = '<p>Recipe not found. <a href="#/recipes">Back to recipes</a></p>'; return; }
    const baseServ = Number(r.servings) || 4;
    let serv = baseServ;

    const suggestions = Shopping.suggestions(r, Store.recipes, Store.bulk);

    view.innerHTML = `
      <a class="muted small no-print" href="#/recipes">← All recipes</a>
      <div class="detail-hero">${this.thumbHtml(r, true)}
        <button class="btn tiny photo-btn no-print" id="d-photo">📷 ${Store.imageSrc(r) ? 'Change photo' : 'Add photo'}</button>
        <input type="file" accept="image/*" id="d-photo-input" hidden>
      </div>
      <h2>${this.esc(r.title)}</h2>
      <div>
        ${r.cuisine ? `<span class="chip">${this.esc(r.cuisine)}</span>` : ''}
        ${(r.mealTypes || []).map(m => `<span class="chip green">${m}</span>`).join('')}
        ${(r.diet || []).map(d => `<span class="chip diet">${this.esc(d)}</span>`).join('')}
        ${(r.tags || []).filter(t => !(r.mealTypes || []).includes(t) && !(r.diet || []).includes(t)).map(t => `<span class="chip">${this.esc(t)}</span>`).join('')}
      </div>
      <div class="detail-meta">
        ${r.prepTime ? `<span>Prep ${r.prepTime} min</span>` : ''}
        ${r.cookTime ? `<span>Cook ${r.cookTime} min</span>` : ''}
        ${r.source && (r.source.url || r.source.note) ? `<span>Source: ${r.source.url ? `<a href="${this.esc(r.source.url)}" target="_blank" rel="noopener">${this.esc(r.source.note || this.hostOf(r.source.url))}</a>` : this.esc(r.source.note)}</span>` : ''}
      </div>
      ${r.nutrition ? `<div class="detail-macros">
        ${r.nutrition.calories != null ? `<span><strong>${r.nutrition.calories}</strong> cal</span>` : ''}
        ${r.nutrition.protein != null ? `<span><strong>${r.nutrition.protein}g</strong> protein</span>` : ''}
        ${r.nutrition.fiber != null ? `<span><strong>${r.nutrition.fiber}g</strong> fiber</span>` : ''}
        ${r.nutrition.carbs != null ? `<span><strong>${r.nutrition.carbs}g</strong> carbs</span>` : ''}
        ${r.nutrition.fat != null ? `<span><strong>${r.nutrition.fat}g</strong> fat</span>` : ''}
        <span class="macros-per">per serving</span>
      </div>` : ''}
      <div class="btn-row no-print">
        <button class="btn primary" id="d-plan">📅 Add to plan</button>
        <button class="btn" id="d-shop">🛒 Add to shopping list</button>
        <button class="btn" id="d-print">🖨️ Print</button>
        <a class="btn" href="#/edit/${encodeURIComponent(r.id)}">✏️ Edit</a>
        <button class="btn danger subtle" id="d-del">Delete</button>
      </div>

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0">Ingredients</h3>
          <span class="servings-ctl">
            <button id="s-minus">−</button>
            <span id="s-label">${serv} servings</span>
            <button id="s-plus">+</button>
          </span>
        </div>
        <ul class="ing-list" id="ing-list"></ul>
      </div>

      ${(r.steps && r.steps.length) ? `
      <div class="card">
        <h3 style="margin-top:0">Steps</h3>
        <ol class="steps">${r.steps.map(s => `<li>${this.esc(s)}</li>`).join('')}</ol>
      </div>` : ''}

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0">Notes</h3>
          <button class="btn tiny no-print" id="d-notes-edit">✏️ Edit</button>
        </div>
        <div id="d-notes-view"></div>
      </div>

      ${suggestions.length ? `
      <div class="suggest-box no-print">
        <h3>🌿 Use it up</h3>
        <p class="muted small">You'll likely buy more of these than this recipe uses. Other recipes that share them:</p>
        ${suggestions.map(s => `
          <p><strong>${this.esc(s.ingredient)}</strong>${s.note ? ` <span class="muted small">(${this.esc(s.note)})</span>` : ''}:
          ${s.recipes.map(o => `<a href="#/recipe/${encodeURIComponent(o.id)}">${this.esc(o.title)}</a>`).join(' · ')}</p>`).join('')}
      </div>` : ''}`;

    const renderIngs = () => {
      const mult = serv / baseServ;
      document.getElementById('s-label').textContent = serv + ' servings';
      document.getElementById('ing-list').innerHTML = (r.ingredients || []).map(i => {
        const qty = i.qty != null && i.qty !== '' ? Shopping.formatQty(Number(i.qty) * mult) : '';
        return `<li><span class="ing-qty">${qty}${i.unit ? ' ' + this.esc(i.unit) : ''}</span> ${this.esc(i.item)}${i.prep ? `<span class="muted">, ${this.esc(i.prep)}</span>` : ''}${i.optional ? ' <span class="muted small">(optional)</span>' : ''}</li>`;
      }).join('');
    };
    document.getElementById('s-minus').onclick = () => { if (serv > 1) { serv--; renderIngs(); } };
    document.getElementById('s-plus').onclick = () => { serv++; renderIngs(); };
    renderIngs();

    document.getElementById('d-plan').onclick = () => this.addToPlanModal(r);
    document.getElementById('d-shop').onclick = () => {
      if (!this.shop.extras.includes(r.id)) this.shop.extras.push(r.id);
      this.saveShop();
      this.toast('Added to shopping list');
    };
    document.getElementById('d-del').onclick = async () => {
      if (!confirm('Delete "' + r.title + '"? This removes it for good.')) return;
      try {
        await Store.deleteRecipe(r.id);
        this.toast('Recipe deleted');
        location.hash = '#/recipes';
      } catch (e) { this.toast('Delete failed: ' + e.message); }
    };

    document.getElementById('d-print').onclick = () => window.print();

    // ---- photo ----
    const photoInput = document.getElementById('d-photo-input');
    document.getElementById('d-photo').onclick = () => photoInput.click();
    photoInput.onchange = async () => {
      const file = photoInput.files && photoInput.files[0];
      if (!file) return;
      const btn = document.getElementById('d-photo');
      btn.disabled = true; btn.textContent = '⏳ Saving photo…';
      try {
        const dataUrl = await this.resizeImage(file, 1200);
        const where = await Store.saveImage(r.id, dataUrl);
        this.toast(where === 'github' ? 'Photo saved & synced' : 'Photo saved on this device (connect GitHub to sync)');
        this.route();
      } catch (e) {
        btn.disabled = false;
        btn.textContent = '📷 Add photo';
        this.toast('Photo failed: ' + e.message);
      }
    };

    // ---- notes (inline editable) ----
    const renderNotes = () => {
      const view = document.getElementById('d-notes-view');
      view.innerHTML = r.notes
        ? this.esc(r.notes).replace(/\n/g, '<br>')
        : '<span class="muted small">No notes yet. Tap Edit to jot down your tweaks.</span>';
    };
    renderNotes();
    document.getElementById('d-notes-edit').onclick = () => {
      const card = document.getElementById('d-notes-view');
      card.innerHTML = `<textarea id="d-notes-text" style="min-height:90px">${this.esc(r.notes || '')}</textarea>
        <div class="btn-row"><button class="btn primary tiny" id="d-notes-save">Save</button>
        <button class="btn tiny" id="d-notes-cancel">Cancel</button></div>`;
      document.getElementById('d-notes-text').focus();
      document.getElementById('d-notes-cancel').onclick = () => renderNotes();
      document.getElementById('d-notes-save').onclick = async () => {
        r.notes = document.getElementById('d-notes-text').value.trim();
        const save = document.getElementById('d-notes-save');
        save.disabled = true; save.textContent = 'Saving…';
        try {
          await Store.saveRecipe(r);
          this.toast(Store.hasGitHub() ? 'Notes saved & synced' : 'Notes saved on this device');
        } catch (e) { this.toast('Save failed: ' + e.message); }
        renderNotes();
      };
    };
  },

  addToPlanModal(recipe) {
    this.modal(`
      <h3 style="margin-top:0">Add "${this.esc(recipe.title)}" to plan</h3>
      <label class="field">Date<input type="date" id="m-date" value="${this.today()}"></label>
      <label class="field">Meal<select id="m-slot">${this.SLOTS.map(s => `<option ${s === 'dinner' ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <div class="btn-row">
        <button class="btn primary" id="m-ok">Add</button>
        <button class="btn" id="m-cancel">Cancel</button>
      </div>`);
    document.getElementById('m-cancel').onclick = () => this.closeModal();
    document.getElementById('m-ok').onclick = async () => {
      Store.plan.entries.push({
        date: document.getElementById('m-date').value,
        slot: document.getElementById('m-slot').value,
        recipeId: recipe.id,
      });
      this.closeModal();
      await this.trySavePlan();
    };
  },

  // ---------- meal plan ----------

  renderPlan(view) {
    const s = this.shop;
    const days = [];
    for (let i = 0; i < s.days; i++) days.push(this.addDays(s.start, i));

    view.innerHTML = `
      <h2>Meal plan</h2>
      <div class="filters">
        <label class="field" style="flex:1;margin:0">From<input type="date" id="p-start" value="${s.start}"></label>
        <label class="field" style="flex:1;margin:0">Days<select id="p-days">${[5, 7, 10, 14].map(d => `<option ${s.days === d ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      </div>
      <div id="p-days-list">${days.map(d => this.dayCardHtml(d)).join('')}</div>
      <div class="btn-row">
        <a class="btn primary" href="#/shopping">🛒 Shopping list for these days</a>
      </div>`;

    document.getElementById('p-start').onchange = e => { s.start = e.target.value; this.saveShop(); this.route(); };
    document.getElementById('p-days').onchange = e => { s.days = Number(e.target.value); this.saveShop(); this.route(); };

    view.querySelectorAll('[data-add-day]').forEach(btn => {
      btn.onclick = () => this.pickRecipeModal(btn.dataset.addDay);
    });
    view.querySelectorAll('[data-rm-entry]').forEach(btn => {
      btn.onclick = async () => {
        Store.plan.entries.splice(Number(btn.dataset.rmEntry), 1);
        await this.trySavePlan();
      };
    });
  },

  dayCardHtml(date) {
    const entries = Store.plan.entries
      .map((e, i) => ({ e, i }))
      .filter(x => x.e.date === date)
      .sort((a, b) => this.SLOTS.indexOf(a.e.slot) - this.SLOTS.indexOf(b.e.slot));
    return `
      <div class="card day-card">
        <div class="day-head">
          <h3>${this.dayLabel(date)}</h3>
          <button class="btn tiny" data-add-day="${date}">＋ Add</button>
        </div>
        ${entries.map(({ e, i }) => {
          const r = Store.recipes.find(x => x.id === e.recipeId);
          return `<div class="plan-entry">
            <span><span class="slot-tag">${e.slot}</span>${r ? `<a href="#/recipe/${encodeURIComponent(r.id)}">${this.esc(r.title)}</a>` : '<span class="muted">(missing recipe)</span>'}</span>
            <button class="btn tiny subtle danger" data-rm-entry="${i}">✕</button>
          </div>`;
        }).join('') || '<p class="muted small" style="margin:6px 0 0">Nothing planned.</p>'}
      </div>`;
  },

  pickRecipeModal(date) {
    this.modal(`
      <h3 style="margin-top:0">Plan for ${this.dayLabel(date)}</h3>
      <label class="field">Meal<select id="m-slot">${this.SLOTS.map(s => `<option ${s === 'dinner' ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <input type="text" id="m-q" placeholder="Search recipes…">
      <ul class="picker-list" id="m-list"></ul>
      <div class="btn-row"><button class="btn" id="m-cancel">Cancel</button></div>`);
    const renderList = (q) => {
      const list = Store.recipes
        .filter(r => !q || r.title.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => a.title.localeCompare(b.title))
        .slice(0, 30);
      document.getElementById('m-list').innerHTML = list.map(r =>
        `<li data-pick="${this.esc(r.id)}">${this.esc(r.title)} <span class="muted small">${this.esc(r.cuisine || '')}</span></li>`).join('');
      document.querySelectorAll('#m-list [data-pick]').forEach(li => {
        li.onclick = async () => {
          Store.plan.entries.push({ date, slot: document.getElementById('m-slot').value, recipeId: li.dataset.pick });
          this.closeModal();
          await this.trySavePlan();
        };
      });
    };
    document.getElementById('m-q').addEventListener('input', e => renderList(e.target.value));
    document.getElementById('m-cancel').onclick = () => this.closeModal();
    renderList('');
  },

  async trySavePlan() {
    try { await Store.savePlan(); this.toast(Store.hasGitHub() ? 'Plan saved & synced' : 'Plan saved on this device'); }
    catch (e) { this.toast('Saved locally; sync failed: ' + e.message); }
    if ((location.hash || '').startsWith('#/plan')) this.route();
  },

  // ---------- shopping list ----------

  renderShopping(view) {
    const s = this.shop;
    const dates = [];
    for (let i = 0; i < s.days; i++) dates.push(this.addDays(s.start, i));

    // every planned entry counts once (cooking it twice = buy twice)
    const counts = new Map();
    for (const e of Store.plan.entries) {
      if (!dates.includes(e.date)) continue;
      counts.set(e.recipeId, (counts.get(e.recipeId) || 0) + 1);
    }
    for (const id of s.extras) counts.set(id, (counts.get(id) || 0) + 1);

    const picks = [];
    for (const [id, mult] of counts) {
      const r = Store.recipes.find(x => x.id === id);
      if (r) picks.push({ recipe: r, mult });
    }

    const rows = Shopping.aggregate(picks, Store.bulk);
    const visible = rows.filter(r => !(s.hideStaples && r.isStaple));
    const groups = Shopping.groupByCategory(visible);
    const sugg = Shopping.listSuggestions(rows, Array.from(counts.keys()), Store.recipes, Store.bulk);

    view.innerHTML = `
      <h2>Shopping list</h2>
      <p class="muted small">${this.dayLabel(s.start)} – ${this.dayLabel(dates[dates.length - 1])} ·
        ${picks.length} recipe${picks.length === 1 ? '' : 's'} ·
        <a href="#/plan">change dates</a></p>
      ${picks.length ? `<p>${picks.map(p =>
        `<span class="chip">${this.esc(p.recipe.title)}${p.mult > 1 ? ' ×' + p.mult : ''}${s.extras.includes(p.recipe.id) ? ` <a style="text-decoration:none" href="javascript:App.removeExtra('${this.esc(p.recipe.id)}')">✕</a>` : ''}</span>`).join(' ')}</p>` : ''}
      <div class="toggle-row">
        <input type="checkbox" id="sh-staples" ${s.hideStaples ? 'checked' : ''}>
        <label for="sh-staples">Hide pantry staples (salt, oil, …)</label>
        <span style="flex:1"></span>
        <button class="btn tiny" id="sh-copy">Copy list</button>
        <button class="btn tiny" id="sh-clear">Clear checks</button>
      </div>
      ${picks.length === 0 ? '<div class="card"><p class="muted">Nothing to buy yet. Plan some meals or add recipes from their page.</p></div>' : ''}
      ${groups.map(g => `
        <div class="card shop-cat">
          <h3 style="margin-top:0">${g.category[0].toUpperCase() + g.category.slice(1)}</h3>
          ${g.items.map(it => {
            const key = Shopping.normalize(it.item);
            const done = !!s.checked[key];
            return `<div class="shop-item ${done ? 'done' : ''}">
              <input type="checkbox" data-check="${this.esc(key)}" ${done ? 'checked' : ''}>
              <span class="shop-text"><strong>${this.esc(it.item)}</strong>
                ${Shopping.formatAmounts(it.amounts) ? '— ' + Shopping.formatAmounts(it.amounts) : ''}
                ${it.optional ? '<span class="muted small">(optional)</span>' : ''}
                <br><span class="muted small">${it.usedIn.map(t => this.esc(t)).join(', ')}</span></span>
            </div>`;
          }).join('')}
        </div>`).join('')}
      ${sugg.length ? `
        <div class="suggest-box">
          <h3>🌿 Use it up</h3>
          <p class="muted small">These list items usually come in bigger amounts than you need. Recipes (not on your plan) that share them:</p>
          ${sugg.map(x => `<p><strong>${this.esc(x.ingredient)}</strong>: ${x.recipes.slice(0, 4).map(o => `<a href="#/recipe/${encodeURIComponent(o.id)}">${this.esc(o.title)}</a>`).join(' · ')}</p>`).join('')}
        </div>` : ''}`;

    document.getElementById('sh-staples').onchange = e => { s.hideStaples = e.target.checked; this.saveShop(); this.route(); };
    document.getElementById('sh-clear').onclick = () => { s.checked = {}; this.saveShop(); this.route(); };
    document.getElementById('sh-copy').onclick = () => {
      const text = groups.map(g =>
        g.category.toUpperCase() + '\n' + g.items.map(it =>
          '- ' + it.item + (Shopping.formatAmounts(it.amounts) ? ' (' + Shopping.formatAmounts(it.amounts) + ')' : '')).join('\n')
      ).join('\n\n');
      navigator.clipboard.writeText(text).then(() => this.toast('List copied'));
    };
    view.querySelectorAll('[data-check]').forEach(cb => {
      cb.onchange = () => {
        if (cb.checked) s.checked[cb.dataset.check] = true;
        else delete s.checked[cb.dataset.check];
        this.saveShop();
        cb.closest('.shop-item').classList.toggle('done', cb.checked);
      };
    });
  },

  removeExtra(id) {
    this.shop.extras = this.shop.extras.filter(x => x !== id);
    this.saveShop();
    this.route();
  },

  // ---------- add / edit ----------

  renderEdit(view, id) {
    const r = id ? Store.recipes.find(x => x.id === id) : null;
    if (id && !r) { view.innerHTML = '<p>Recipe not found.</p>'; return; }
    const v = r || { title: '', cuisine: '', mealTypes: ['dinner'], mainIngredients: [], tags: [], servings: 4, prepTime: '', cookTime: '', source: {}, ingredients: [], steps: [], notes: '' };

    view.innerHTML = `
      <h2>${r ? 'Edit recipe' : 'New recipe'}</h2>
      <p class="muted small">Tip: you can also paste a link/photo/PDF into a Claude session and say "add this to my recipe box" — see <a href="#/import">Import</a>.</p>
      <div class="card">
        <label class="field">Title<input type="text" id="e-title" value="${this.esc(v.title)}"></label>
        <div class="form-grid">
          <label class="field">Cuisine / nationality<input type="text" id="e-cuisine" value="${this.esc(v.cuisine || '')}" placeholder="e.g. Mexican" list="cuisine-opts">
            <datalist id="cuisine-opts">${this.distinct(Store.recipes.map(x => x.cuisine)).map(c => `<option value="${this.esc(c)}">`).join('')}</datalist></label>
          <label class="field">Main ingredients (comma-separated)<input type="text" id="e-mains" value="${this.esc((v.mainIngredients || []).join(', '))}" placeholder="e.g. chicken, rice"></label>
          <label class="field">Servings<input type="number" id="e-serv" min="1" value="${v.servings || 4}"></label>
          <label class="field">Tags (comma-separated)<input type="text" id="e-tags" value="${this.esc((v.tags || []).join(', '))}" placeholder="weeknight, spicy"></label>
          <label class="field">Prep time (min)<input type="number" id="e-prep" value="${v.prepTime || ''}"></label>
          <label class="field">Cook time (min)<input type="number" id="e-cook" value="${v.cookTime || ''}"></label>
        </div>
        <div class="field">Meals this fits:<br>
          ${this.MEAL_TYPES.map(m => `<label style="margin-right:12px;font-size:0.9rem"><input type="checkbox" class="e-meal" value="${m}" ${(v.mealTypes || []).includes(m) ? 'checked' : ''}> ${m}</label>`).join('')}
        </div>
        <div class="form-grid">
          <label class="field">Source link (optional)<input type="url" id="e-srcurl" value="${this.esc((v.source || {}).url || '')}" placeholder="https://…"></label>
          <label class="field">Source note (optional)<input type="text" id="e-srcnote" value="${this.esc((v.source || {}).note || '')}" placeholder="Grandma / @tiktokchef / cookbook p.42"></label>
        </div>
      </div>

      <div class="card">
        <h3 style="margin-top:0">Ingredients</h3>
        <p class="muted small">Qty · unit · ingredient (add prep after a comma, e.g. “cilantro, chopped”)</p>
        <div id="e-ings"></div>
        <button class="btn tiny" id="e-adding">＋ Ingredient</button>
      </div>

      <div class="card">
        <h3 style="margin-top:0">Steps</h3>
        <p class="muted small">One step per line.</p>
        <textarea id="e-steps">${this.esc((v.steps || []).join('\n'))}</textarea>
        <label class="field">Notes<textarea id="e-notes" style="min-height:60px">${this.esc(v.notes || '')}</textarea></label>
      </div>

      <div class="btn-row">
        <button class="btn primary" id="e-save">💾 Save recipe</button>
        <a class="btn" href="${r ? '#/recipe/' + encodeURIComponent(r.id) : '#/recipes'}">Cancel</a>
      </div>
      ${Store.hasGitHub() ? '' : '<p class="muted small">⚠️ GitHub isn\'t connected on this device, so this recipe will be saved on this device only until you connect in <a href="#/settings">Setup</a>.</p>'}`;

    const ingRow = (i) => {
      const itemText = i ? this.esc(i.item + (i.prep ? ', ' + i.prep : '')) : '';
      return `<div class="ing-row">
        <input type="text" class="ing-qty-in" placeholder="1.5" value="${i && i.qty != null ? i.qty : ''}">
        <input type="text" class="ing-unit-in" placeholder="cup" value="${i ? this.esc(i.unit || '') : ''}" list="unit-opts">
        <input type="text" class="ing-item-in" placeholder="ingredient, prep" value="${itemText}">
        <button class="rm" title="remove">✕</button>
      </div>`;
    };
    const ingsEl = document.getElementById('e-ings');
    ingsEl.innerHTML = (v.ingredients || []).map(ingRow).join('') +
      `<datalist id="unit-opts">${['tsp', 'tbsp', 'cup', 'oz', 'lb', 'g', 'kg', 'ml', 'l', 'can', 'jar', 'bunch', 'clove', 'sprig', 'slice', 'stick', 'pinch', 'head', 'stalk', 'piece'].map(u => `<option value="${u}">`).join('')}</datalist>`;
    if (!(v.ingredients || []).length) ingsEl.insertAdjacentHTML('afterbegin', ingRow(null) + ingRow(null) + ingRow(null));

    const wireRemove = () => ingsEl.querySelectorAll('.rm').forEach(b => b.onclick = () => b.parentElement.remove());
    wireRemove();
    document.getElementById('e-adding').onclick = () => { ingsEl.insertAdjacentHTML('beforeend', ingRow(null)); wireRemove(); };

    document.getElementById('e-save').onclick = async () => {
      const title = document.getElementById('e-title').value.trim();
      if (!title) { this.toast('Give it a title first'); return; }
      const ingredients = Array.from(ingsEl.querySelectorAll('.ing-row')).map(row => {
        const rawItem = row.querySelector('.ing-item-in').value.trim();
        if (!rawItem) return null;
        const commaAt = rawItem.indexOf(',');
        const qtyRaw = row.querySelector('.ing-qty-in').value.trim();
        return {
          item: commaAt >= 0 ? rawItem.slice(0, commaAt).trim() : rawItem,
          prep: commaAt >= 0 ? rawItem.slice(commaAt + 1).trim() : '',
          qty: qtyRaw === '' ? null : this.parseQty(qtyRaw),
          unit: row.querySelector('.ing-unit-in').value.trim(),
        };
      }).filter(Boolean);

      const recipe = {
        id: r ? r.id : this.slug(title),
        title,
        cuisine: document.getElementById('e-cuisine').value.trim(),
        mealTypes: Array.from(document.querySelectorAll('.e-meal:checked')).map(c => c.value),
        mainIngredients: this.csv(document.getElementById('e-mains').value),
        tags: this.csv(document.getElementById('e-tags').value),
        servings: Number(document.getElementById('e-serv').value) || 4,
        prepTime: Number(document.getElementById('e-prep').value) || null,
        cookTime: Number(document.getElementById('e-cook').value) || null,
        source: {
          url: document.getElementById('e-srcurl').value.trim(),
          note: document.getElementById('e-srcnote').value.trim(),
        },
        ingredients,
        steps: document.getElementById('e-steps').value.split('\n').map(s => s.trim()).filter(Boolean),
        notes: document.getElementById('e-notes').value.trim(),
        createdAt: r ? (r.createdAt || null) : new Date().toISOString().slice(0, 10),
        ...(r && r.image ? { image: r.image } : {}),
        ...(r && r.diet ? { diet: r.diet } : {}),
        ...(r && r.nutrition ? { nutrition: r.nutrition } : {}),
      };
      const btn = document.getElementById('e-save');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        await Store.saveRecipe(recipe);
        this.toast(Store.hasGitHub() ? 'Saved & synced to GitHub' : 'Saved on this device');
        location.hash = '#/recipe/' + encodeURIComponent(recipe.id);
      } catch (e) {
        btn.disabled = false; btn.textContent = '💾 Save recipe';
        this.toast('Save failed: ' + e.message);
      }
    };
  },

  // ---------- import ----------

  renderImport(view) {
    const shared = JSON.parse(sessionStorage.getItem('rb-shared') || 'null');
    sessionStorage.removeItem('rb-shared');
    const localInbox = Store.localInbox();

    view.innerHTML = `
      <h2>Import a recipe</h2>
      <p class="muted">Drop a link here (or share one straight to this app from TikTok/Instagram once it's installed).
      It lands in your <strong>import inbox</strong>; then ask Claude to “process my recipe inbox” and the full
      recipe — ingredients, steps, source — gets written into the box permanently. No going back to the original post.</p>
      <div class="card">
        <label class="field">Link (TikTok, Instagram, website…)<input type="url" id="i-url" value="${this.esc(shared && shared.url || '')}" placeholder="https://…"></label>
        <label class="field">Name / what is it (optional)<input type="text" id="i-title" value="${this.esc(shared && shared.title || '')}" placeholder="e.g. that viral feta pasta"></label>
        <label class="field">Pasted text — caption, your notes, the whole recipe… (optional)<textarea id="i-text">${this.esc(shared && shared.text || '')}</textarea></label>
        <button class="btn primary" id="i-save">📥 Save to import inbox</button>
      </div>
      ${localInbox.length ? `
      <div class="card">
        <h3 style="margin-top:0">Waiting on this device (${localInbox.length})</h3>
        <p class="muted small">These will move to the shared inbox when GitHub is connected in Setup.</p>
        ${localInbox.map(e => `<p>• ${this.esc(e.title || e.url || (e.text || '').slice(0, 60))}</p>`).join('')}
      </div>` : ''}
      <div class="card">
        <h3 style="margin-top:0">Importing with Claude</h3>
        <p class="muted small">In any Claude session on the computer, you can say things like:</p>
        <ul class="muted small">
          <li>“Process my recipe box import inbox.”</li>
          <li>“Add this PDF / photo / link to my recipe box.” (attach it)</li>
          <li>“Here's a recipe I copied — add it to the recipe box: …”</li>
        </ul>
        <p class="muted small">Claude writes the complete recipe into the app's data on GitHub, and it shows up here.</p>
      </div>`;

    document.getElementById('i-save').onclick = async () => {
      const entry = {
        url: document.getElementById('i-url').value.trim(),
        title: document.getElementById('i-title').value.trim(),
        text: document.getElementById('i-text').value.trim(),
        addedAt: new Date().toISOString(),
        status: 'new',
      };
      if (!entry.url && !entry.text && !entry.title) { this.toast('Add a link or some text first'); return; }
      try {
        const where = await Store.saveToInbox(entry);
        this.toast(where === 'github' ? 'Saved to inbox — ask Claude to process it' : 'Saved on this device');
        this.route();
      } catch (e) { this.toast('Could not save: ' + e.message); }
    };
  },

  // ---------- settings ----------

  renderSettings(view) {
    const c = Store.config || {};
    const localCount = Store.localRecipeCount();
    view.innerHTML = `
      <h2>Setup</h2>
      <div class="card">
        <h3 style="margin-top:0">Appearance</h3>
        <p class="muted small">Choose the look. “Auto” follows your phone's light/dark setting.</p>
        <div class="btn-row" id="theme-row">
          ${['auto', 'light', 'dark'].map(t => `<button class="btn ${(this.themePref || 'auto') === t ? 'primary' : ''}" data-theme-set="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
        </div>
      </div>
      <div class="card">
        <h3 style="margin-top:0">GitHub sync</h3>
        <p class="muted small">Connecting GitHub makes recipes and plans save to your repo so every device sees them.
        Create a fine-grained personal access token at
        <strong>github.com → Settings → Developer settings → Personal access tokens</strong>
        with <em>Contents: Read & write</em> permission on just this repo.</p>
        <div class="form-grid">
          <label class="field">GitHub username<input type="text" id="g-owner" value="${this.esc(c.owner || '')}" placeholder="your-username"></label>
          <label class="field">Repository<input type="text" id="g-repo" value="${this.esc(c.repo || 'recipe-box')}"></label>
          <label class="field">Branch<input type="text" id="g-branch" value="${this.esc(c.branch || 'main')}"></label>
          <label class="field">Token<input type="password" id="g-token" value="${this.esc(c.token || '')}" placeholder="github_pat_…"></label>
        </div>
        <div class="btn-row">
          <button class="btn primary" id="g-save">Connect & save</button>
          ${c.token ? '<button class="btn danger" id="g-forget">Disconnect</button>' : ''}
        </div>
        <p class="muted small" id="g-status">${Store.hasGitHub() ? '✅ Connected as ' + this.esc(c.owner) + '/' + this.esc(c.repo) : 'Not connected — changes stay on this device.'}</p>
      </div>
      ${localCount ? `
      <div class="card">
        <h3 style="margin-top:0">Device-only recipes (${localCount})</h3>
        <p class="muted small">Recipes saved before GitHub was connected. Push them up so other devices get them.</p>
        <button class="btn primary" id="g-sync" ${Store.hasGitHub() ? '' : 'disabled'}>⬆️ Sync to GitHub</button>
      </div>` : ''}
      <div class="card">
        <h3 style="margin-top:0">Install as an app</h3>
        <p class="muted small">On Android Chrome: menu (⋮) → <strong>Add to home screen</strong> → Install.
        After installing, TikTok/Instagram's Share menu can send links straight here.</p>
      </div>
      <p class="muted small">Recipe Box · your data lives in your GitHub repo · built with Claude</p>`;

    view.querySelectorAll('[data-theme-set]').forEach(btn => {
      btn.onclick = () => { this.applyTheme(btn.dataset.themeSet); this.route(); };
    });

    document.getElementById('g-save').onclick = async () => {
      const cfg = {
        owner: document.getElementById('g-owner').value.trim(),
        repo: document.getElementById('g-repo').value.trim(),
        branch: document.getElementById('g-branch').value.trim() || 'main',
        token: document.getElementById('g-token').value.trim(),
      };
      const status = document.getElementById('g-status');
      if (!cfg.owner || !cfg.repo || !cfg.token) { status.textContent = 'Fill in username, repository, and token.'; return; }
      status.textContent = 'Testing connection…';
      try {
        await Store.testConnection(cfg);
        Store.saveConfig(cfg);
        // move any local inbox entries up
        const inbox = Store.localInbox();
        for (const entry of inbox) await Store.saveToInbox(entry);
        if (inbox.length) localStorage.removeItem('rb-inbox');
        status.textContent = '✅ Connected! Reloading…';
        setTimeout(() => location.reload(), 800);
      } catch (e) {
        status.textContent = '❌ Could not connect: ' + e.message + ' — check the username/repo spelling and that the token has Contents read/write on this repo.';
      }
    };
    const forget = document.getElementById('g-forget');
    if (forget) forget.onclick = () => { Store.saveConfig({}); location.reload(); };
    const sync = document.getElementById('g-sync');
    if (sync) sync.onclick = async () => {
      sync.disabled = true; sync.textContent = 'Syncing…';
      try {
        const n = await Store.syncLocalRecipes();
        this.toast('Synced ' + n + ' recipe(s)');
        this.route();
      } catch (e) { this.toast('Sync failed: ' + e.message); sync.disabled = false; }
    };
  },

  // ---------- theme ----------

  applyTheme(pref) {
    this.themePref = pref;
    Store.setLocal('rb-theme', pref);
    const dark = pref === 'dark' ||
      (pref === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const root = document.documentElement;
    if (dark) root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#15110d' : '#b9472a');
    // keep "auto" in sync if the system flips while the app is open
    if (pref === 'auto' && window.matchMedia && !this._themeWatch) {
      this._themeWatch = window.matchMedia('(prefers-color-scheme: dark)');
      this._themeWatch.addEventListener('change', () => {
        if (this.themePref === 'auto') this.applyTheme('auto');
      });
    }
  },

  // ---------- photos ----------

  thumbHtml(r, big) {
    const src = Store.imageSrc(r);
    const cls = 'thumb' + (big ? ' thumb-big' : '');
    if (src) return `<div class="${cls}"><img src="${this.esc(src)}" alt="${this.esc(r.title)}" loading="lazy"></div>`;
    return `<div class="${cls} ph" style="${this.placeholderStyle(r)}"><span>${this.foodEmoji(r)}</span></div>`;
  },

  placeholderStyle(r) {
    const s = r.id || r.title || 'x';
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    const h2 = (h + 38) % 360;
    return `background:linear-gradient(135deg,hsl(${h} 52% 82%),hsl(${h2} 54% 66%));`;
  },

  foodEmoji(r) {
    if ((r.mealTypes || []).includes('marinade')) return '🧂';
    if ((r.mealTypes || []).includes('dressing')) return '🫙';
    const hay = ((r.mainIngredients || []).join(' ') + ' ' + r.title + ' ' + (r.tags || []).join(' ')).toLowerCase();
    const byIng = [
      [/shrimp|prawn/, '🦐'], [/salmon|tuna|fish|cod|tilapia/, '🐟'], [/chicken/, '🍗'],
      [/beef|steak|bolognese/, '🥩'], [/bacon|pork|sausage|chorizo|ham/, '🥓'],
      [/egg/, '🍳'], [/pasta|spaghetti|penne|noodle|gnocchi|macaroni/, '🍝'],
      [/\brice\b|risotto/, '🍚'], [/chickpea|bean|lentil|tofu/, '🫘'], [/potato/, '🥔'],
      [/mango/, '🥭'], [/banana/, '🍌'], [/lemon/, '🍋'], [/blueberr|berry/, '🫐'],
      [/corn/, '🌽'], [/mushroom/, '🍄'], [/cheese|cheddar|gruyere|parmesan/, '🧀'],
      [/chia|oat/, '🥣'], [/shakshuka|tomato/, '🍅'],
    ];
    for (const [re, e] of byIng) if (re.test(hay)) return e;
    const types = r.mealTypes || [];
    const byType = { casserole: '🍲', bread: '🍞', salad: '🥗', soup: '🥣', appetizer: '🫕', dessert: '🍰', breakfast: '🍳', drink: '🥤', snack: '🍿', side: '🥘' };
    for (const t of ['casserole', 'appetizer', 'bread', 'salad', 'soup', 'dessert', 'breakfast', 'drink', 'snack', 'side']) if (types.includes(t)) return byType[t];
    return '🍽️';
  },

  // Read a chosen file, shrink it to keep the repo light, return a jpeg data URL.
  resizeImage(file, maxPx) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read the file'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('That file is not a readable image'));
        img.onload = () => {
          let { width, height } = img;
          const scale = Math.min(1, maxPx / Math.max(width, height));
          width = Math.round(width * scale); height = Math.round(height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  },

  // ---------- share target ----------

  handleShareTarget() {
    const params = new URLSearchParams(location.search);
    if (params.has('share-target')) {
      sessionStorage.setItem('rb-shared', JSON.stringify({
        title: params.get('title') || '',
        text: params.get('text') || '',
        url: params.get('url') || this.firstUrlIn(params.get('text') || ''),
      }));
      history.replaceState(null, '', location.pathname + '#/import');
    }
  },

  firstUrlIn(text) {
    const m = text.match(/https?:\/\/\S+/);
    return m ? m[0] : '';
  },

  // ---------- tiny helpers ----------

  esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  distinct(arr) {
    return Array.from(new Set(arr.filter(Boolean))).sort();
  },

  csv(s) {
    return s.split(',').map(x => x.trim()).filter(Boolean);
  },

  slug(title) {
    let base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'recipe';
    let id = base, n = 2;
    while (Store.recipes.some(r => r.id === id)) id = base + '-' + (n++);
    return id;
  },

  parseQty(s) {
    s = s.trim();
    const m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);       // "1 1/2"
    if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
    const f = s.match(/^(\d+)\/(\d+)$/);                // "1/2"
    if (f) return Number(f[1]) / Number(f[2]);
    const n = Number(s.replace(',', '.'));
    return isNaN(n) ? null : n;
  },

  totalTime(r) {
    return (Number(r.prepTime) || 0) + (Number(r.cookTime) || 0) || null;
  },

  today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },

  addDays(iso, n) {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },

  dayLabel(iso) {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  },

  hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; }
  },

  saveShop() {
    Store.setLocal('rb-shop', this.shop);
  },

  modal(innerHtml) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `<div class="modal-back" id="modal-back"><div class="modal">${innerHtml}</div></div>`;
    document.getElementById('modal-back').addEventListener('click', e => {
      if (e.target.id === 'modal-back') this.closeModal();
    });
  },

  closeModal() {
    document.getElementById('modal-root').innerHTML = '';
  },

  toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  },

  updateSyncBadge() {
    const b = document.getElementById('sync-badge');
    if (Store.hasGitHub()) { b.textContent = 'synced'; b.classList.add('ok'); }
    else { b.textContent = 'this device'; b.classList.remove('ok'); }
  },
};

App.start();
