# Recipe Box — instructions for Claude

This is a static PWA (no build step) that organizes the family's recipes, plans meals,
and generates shopping lists. Data lives in `data/*.json` in this repo; the app is
served from GitHub Pages and also reads/writes those files via the GitHub contents API.

## Your most common job: importing recipes

When the user shares a recipe in ANY form (PDF, Word doc, photo, website link,
TikTok/Instagram link, pasted text) or says "process my recipe inbox":

1. **Extract the COMPLETE recipe** — every ingredient with amounts, every step in full
   detail. Never summarize steps or rely on the source staying online. If a social
   media post only shows part of the recipe (e.g. steps are spoken in a video),
   get a transcript if possible, or ask the user for the missing pieces. The recipe
   stored here must be cookable without ever opening the source again.
2. **Append it to `data/recipes.json`** using the schema below.
3. **Check `data/inbox.json`** — if the recipe came from there, set that entry's
   `status` to `"done"` (or remove it).
4. Commit and push (or use the GitHub API if working remotely).

## Recipe schema

```json
{
  "id": "kebab-case-slug-unique",
  "title": "Recipe Name",
  "cuisine": "Mexican",
  "mealTypes": ["dinner"],
  "mainIngredients": ["chicken"],
  "tags": ["weeknight"],
  "servings": 4,
  "prepTime": 15,
  "cookTime": 30,
  "source": { "url": "https://original-link", "note": "@creator on TikTok" },
  "ingredients": [
    { "item": "cilantro", "qty": 0.5, "unit": "bunch", "prep": "chopped", "optional": false }
  ],
  "steps": ["Full step text…"],
  "notes": "",
  "createdAt": "YYYY-MM-DD"
}
```

Conventions:
- `mealTypes`: subset of breakfast, lunch, dinner, side, snack, dessert, drink.
- `qty` is a number or null (null for "to taste"); fractions as decimals (0.5 not "1/2").
- `unit`: tsp, tbsp, cup, oz, lb, g, kg, ml, l, can, jar, bunch, clove, sprig, slice,
  stick, pinch, head, stalk, piece — or "" for countable items (e.g. 2 limes).
- `item` should be the plain grocery name ("cilantro", not "fresh chopped cilantro") —
  prep details go in `prep`. This is what makes shopping-list merging work.
- `cuisine` is free text but reuse existing values when close (check the file first).

## Bulk-ingredient knowledge base

`data/bulk-ingredients.json` powers the "use it up" suggestions (ingredients sold in
larger amounts than one recipe needs — fresh herbs, canned chipotles, buttermilk…).
When importing a recipe with such an ingredient that isn't in the list yet, add it:
`{ "name": "...", "aliases": [], "note": "sold by the ..." }`.

## Other data files

- `data/mealplan.json` — `{ "entries": [{date, slot, recipeId}] }`, written by the app.
- `data/inbox.json` — links/text the user saved from their phone for later import.

## Dev notes

- Plain HTML/CSS/JS in `index.html`, `css/`, `js/`. No dependencies, no build.
- Test locally: `node server.js` then open http://localhost:8420
- The service worker (`sw.js`) caches the shell — bump `VERSION` when changing app files.
