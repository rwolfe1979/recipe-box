/* Shopping-list math: aggregating ingredients across recipes, grouping by
   store section, and the "use it up" logic for ingredients sold in larger
   amounts than a single recipe needs. */

const Shopping = {

  CATEGORIES: [
    ['produce', ['onion', 'garlic', 'tomato', 'pepper', 'jalapeño', 'jalapeno', 'lime', 'lemon', 'orange', 'apple', 'banana', 'avocado', 'cilantro', 'parsley', 'basil', 'mint', 'dill', 'thyme', 'rosemary', 'sage', 'oregano', 'chive', 'scallion', 'green onion', 'shallot', 'ginger', 'lemongrass', 'carrot', 'celery', 'potato', 'sweet potato', 'zucchini', 'squash', 'cucumber', 'lettuce', 'spinach', 'kale', 'arugula', 'cabbage', 'broccoli', 'cauliflower', 'mushroom', 'corn', 'pea', 'green bean', 'eggplant', 'radish', 'beet', 'fennel', 'leek', 'berr', 'grape', 'melon', 'mango', 'pineapple', 'herb']],
    ['meat & seafood', ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'sausage', 'bacon', 'ham', 'prosciutto', 'chorizo', 'steak', 'ground', 'shrimp', 'salmon', 'tuna', 'fish', 'cod', 'tilapia', 'scallop', 'crab', 'mussel', 'clam', 'anchov']],
    ['dairy & eggs', ['milk', 'cream', 'half-and-half', 'buttermilk', 'yogurt', 'butter', 'cheese', 'cheddar', 'mozzarella', 'parmesan', 'feta', 'ricotta', 'cotija', 'queso', 'egg', 'sour cream', 'crème', 'creme fraiche', 'mascarpone']],
    ['bakery & grains', ['bread', 'tortilla', 'pita', 'naan', 'bun', 'roll', 'baguette', 'rice', 'pasta', 'spaghetti', 'noodle', 'macaroni', 'orzo', 'couscous', 'quinoa', 'oat', 'flour', 'breadcrumb', 'panko', 'wonton', 'lasagna']],
    ['pantry & canned', ['oil', 'vinegar', 'soy sauce', 'fish sauce', 'hoisin', 'sriracha', 'hot sauce', 'salsa', 'tomato paste', 'tomato sauce', 'crushed tomatoes', 'diced tomatoes', 'coconut milk', 'broth', 'stock', 'bean', 'chickpea', 'lentil', 'chipotle', 'adobo', 'can', 'jar', 'peanut butter', 'tahini', 'honey', 'maple', 'sugar', 'ketchup', 'mustard', 'mayonnaise', 'mayo', 'worcestershire', 'wine', 'mirin', 'sake', 'curry paste', 'olive', 'caper', 'raisin', 'nut', 'almond', 'walnut', 'pecan', 'cashew', 'peanut', 'sesame', 'chocolate', 'cocoa', 'vanilla', 'baking', 'yeast', 'cornstarch', 'corn starch']],
    ['spices', ['salt', 'pepper', 'cumin', 'paprika', 'chili powder', 'cayenne', 'coriander', 'turmeric', 'cinnamon', 'nutmeg', 'clove', 'cardamom', 'curry powder', 'garam masala', 'bay lea', 'red pepper flake', 'italian seasoning', 'five-spice', 'five spice', 'allspice', 'fennel seed', 'mustard seed', 'za\'atar', 'sumac', 'dried']],
    ['frozen', ['frozen']],
  ],

  // Things most kitchens always have; the list can hide them.
  STAPLES: ['salt', 'kosher salt', 'black pepper', 'pepper', 'olive oil', 'vegetable oil', 'neutral oil', 'canola oil', 'water', 'all-purpose flour', 'granulated sugar', 'cooking spray'],

  normalize(name) {
    return (name || '').toLowerCase().trim()
      .replace(/^fresh\s+/, '')
      .replace(/\s+/g, ' ');
  },

  categorize(item) {
    const n = this.normalize(item);
    for (const [cat, keys] of this.CATEGORIES) {
      for (const k of keys) {
        if (n.includes(k)) return cat;
      }
    }
    return 'other';
  },

  isStaple(item) {
    const n = this.normalize(item);
    return this.STAPLES.some(s => n === s || n === s + 's');
  },

  /* Find the bulk-ingredient record (if any) that an ingredient name matches. */
  bulkMatch(item, bulkList) {
    const n = this.normalize(item);
    for (const b of bulkList) {
      const names = [b.name].concat(b.aliases || []);
      if (names.some(a => n.includes(a.toLowerCase()))) return b;
    }
    return null;
  },

  /* Aggregate the ingredients of several (recipe, multiplier) pairs into one
     list. Returns [{item, category, isStaple, bulk, amounts:[{qty,unit}],
     usedIn:[recipeTitle], notes:[]}] */
  aggregate(picks, bulkList) {
    const map = new Map();
    for (const { recipe, mult } of picks) {
      for (const ing of (recipe.ingredients || [])) {
        const key = this.normalize(ing.item);
        if (!key) continue;
        if (!map.has(key)) {
          map.set(key, {
            item: ing.item,
            category: this.categorize(ing.item),
            isStaple: this.isStaple(ing.item),
            bulk: this.bulkMatch(ing.item, bulkList),
            amounts: [],
            usedIn: [],
            optional: true,
          });
        }
        const row = map.get(key);
        row.optional = row.optional && !!ing.optional;
        if (!row.usedIn.includes(recipe.title)) row.usedIn.push(recipe.title);
        if (ing.qty != null && ing.qty !== '') {
          const qty = Number(ing.qty) * (mult || 1);
          const unit = (ing.unit || '').trim();
          const existing = row.amounts.find(a => a.unit === unit);
          if (existing) existing.qty += qty;
          else row.amounts.push({ qty, unit });
        } else if (!row.amounts.length) {
          row.amounts.push({ qty: null, unit: ing.unit || '' });
        }
      }
    }
    const rows = Array.from(map.values());
    rows.sort((a, b) => a.item.localeCompare(b.item));
    return rows;
  },

  groupByCategory(rows) {
    const order = this.CATEGORIES.map(c => c[0]).concat(['other']);
    const groups = new Map();
    for (const row of rows) {
      if (!groups.has(row.category)) groups.set(row.category, []);
      groups.get(row.category).push(row);
    }
    return order.filter(c => groups.has(c)).map(c => ({ category: c, items: groups.get(c) }));
  },

  /* For a recipe: which other recipes share its "buy more than you need"
     ingredients? Returns [{ingredient, note, recipes:[{id,title}]}] */
  suggestions(recipe, allRecipes, bulkList) {
    const out = [];
    for (const ing of (recipe.ingredients || [])) {
      const b = this.bulkMatch(ing.item, bulkList);
      if (!b) continue;
      const others = allRecipes.filter(r =>
        r.id !== recipe.id &&
        (r.ingredients || []).some(i => this.bulkMatch(i.item, bulkList) === b));
      if (others.length) {
        out.push({
          ingredient: ing.item,
          note: b.note || '',
          recipes: others.map(r => ({ id: r.id, title: r.title })),
        });
      }
    }
    // de-dup by bulk ingredient name
    const seen = new Set();
    return out.filter(s => {
      const k = this.normalize(s.ingredient);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  },

  /* Same idea but for a whole shopping list: bulk items on the list plus
     unplanned recipes that would use them up. */
  listSuggestions(rows, pickedRecipeIds, allRecipes, bulkList) {
    const out = [];
    for (const row of rows) {
      if (!row.bulk) continue;
      const others = allRecipes.filter(r =>
        !pickedRecipeIds.includes(r.id) &&
        (r.ingredients || []).some(i => this.bulkMatch(i.item, bulkList) === row.bulk));
      if (others.length) {
        out.push({ ingredient: row.item, note: row.bulk.note || '', recipes: others.map(r => ({ id: r.id, title: r.title })) });
      }
    }
    return out;
  },

  formatQty(q) {
    if (q == null) return '';
    const whole = Math.floor(q);
    const frac = q - whole;
    const fracs = [[0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾']];
    for (const [v, sym] of fracs) {
      if (Math.abs(frac - v) < 0.03) return (whole ? whole + ' ' : '') + sym;
    }
    if (Math.abs(frac) < 0.03) return String(whole);
    return String(Math.round(q * 100) / 100);
  },

  formatAmounts(amounts) {
    return amounts
      .map(a => a.qty == null ? (a.unit || '') : (this.formatQty(a.qty) + (a.unit ? ' ' + a.unit : '')))
      .filter(s => s)
      .join(' + ');
  },
};
