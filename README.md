# 🍲 Recipe Box

Our family recipe app: every recipe stored in full (no "go back to TikTok to see the
steps"), organized by meal, cuisine, and main ingredient, with meal planning and
auto-generated shopping lists.

**The data is the repo.** Every recipe lives in [`data/recipes.json`](data/recipes.json),
version-controlled and backed up by GitHub. The app is just a viewer/editor on top.

## Using it

- **Browse** — filter by meal, cuisine, or main ingredient; search everything.
- **Plan** — put recipes on a calendar for the week (or two).
- **Shop** — one tap builds a combined shopping list for the planned days, grouped by
  store section, with quantities merged across recipes.
- **Use it up** — when a recipe calls for something sold in bigger amounts than it uses
  (a bunch of cilantro, a can of chipotles, a carton of buttermilk), the app suggests
  other recipes that share it.
- **Import** — share a TikTok/Instagram/website link to the app (or paste it in) and it
  lands in an inbox; a Claude session then extracts the complete recipe into the box.
  PDFs, Word docs, photos, and screenshots go straight through Claude too.

## Setup on a new device

1. Open the GitHub Pages URL for this repo.
2. (Android) Chrome menu → **Add to home screen** → Install. The app now appears in
   share menus, works offline, and feels native.
3. In the app: **Setup** → enter GitHub username, repo, and a fine-grained personal
   access token (Contents: read & write on this repo only) → **Connect & save**.
   Without a token the app is read-only + saves changes to that device only.

## For Claude

See [CLAUDE.md](CLAUDE.md) — it documents the recipe schema and the import workflow.
