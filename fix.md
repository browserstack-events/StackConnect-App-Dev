# Tailwind CSS v4 + Angular — What Went Wrong & How to Fix It

## Reference
Official docs: https://tailwindcss.com/docs/installation/framework-guides/angular

---

## What the Docs Say to Do

### 1. Install packages
```bash
npm install tailwindcss @tailwindcss/postcss postcss --force
```

### 2. Create PostCSS config — as `.postcssrc.json`
```json
{
  "plugins": {
    "@tailwindcss/postcss": {}
  }
}
```

### 3. Add the import to `src/styles.css`
```css
@import "tailwindcss";
```

### 4. Ensure `src/styles.css` is registered in `angular.json`
```json
"styles": ["src/styles.css"]
```

That's it. No `tailwind.config.js`. No `tailwind.config.mjs`. No `postcss.config.mjs`.

---

## What Was Actually Done (and Why It Broke)

### Mistake 1 — Created `tailwind.config.js` ❌

**What was done:**
```javascript
// tailwind.config.js — SHOULD NOT EXIST
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,html}', ...],
  theme: { extend: { fontFamily: { sans: ['Inter', ...] } } },
  plugins: [],
}
```

**Why it broke:**

Angular's `@angular/build:application` builder contains internal Tailwind
auto-detection logic. It scans the project root for the presence of any of
these files:

```
tailwind.config.js
tailwind.config.cjs
tailwind.config.mjs
tailwind.config.ts
```

When it finds one, it **bypasses all custom PostCSS configuration entirely**
and injects `tailwindcss` directly as a PostCSS plugin using the v3 API:

```javascript
// Angular's internal behaviour when tailwind.config.js is found:
plugins: [require('tailwindcss')(tailwindConfigPath)]
```

Tailwind v4 **removed** this direct-plugin API. It no longer exports a
function that can be called as a PostCSS plugin. So Angular's auto-injection
crashes with:

> *"It looks like you're trying to use `tailwindcss` directly as a PostCSS
> plugin. The PostCSS plugin has moved to a separate package,
> `@tailwindcss/postcss`."*

The file `tailwind.config.js` should never have been created. Tailwind v4
is configured entirely via CSS (`@import "tailwindcss"`) and does not use
a JS config file.

---

### Mistake 2 — Wrong PostCSS config filename: `postcss.config.mjs` ❌

**What was done:**
```javascript
// postcss.config.mjs — WRONG FILENAME
export default {
  plugins: { '@tailwindcss/postcss': {} },
};
```

**What the docs specify:**
```json
// .postcssrc.json — CORRECT FILENAME
{
  "plugins": {
    "@tailwindcss/postcss": {}
  }
}
```

**Why it matters:**

Angular's build uses `postcss-load-config` to discover PostCSS configuration.
The lookup order for this library is:

```
.postcssrc
.postcssrc.json    ← what the docs use
.postcssrc.yaml
.postcssrc.js
.postcssrc.cjs
.postcssrc.mjs
postcss.config.js
postcss.config.cjs
postcss.config.mjs ← this is what was created
```

`postcss.config.mjs` is lower priority than `.postcssrc.json` and, more
importantly, **this lookup only matters if Angular's Tailwind auto-detection
did not fire first**. Since `tailwind.config.js` was present, Angular's
auto-detection fired before `postcss-load-config` was ever consulted —
so `postcss.config.mjs` was completely ignored.

Even if `tailwind.config.js` had not existed, there's an additional risk:
Angular's esbuild builder may not correctly handle ES module `export default`
syntax in PostCSS config files in all environments. The JSON format
(`.postcssrc.json`) is the safest and what the official guide specifies.

---

### Mistake 3 — Missing `postcss` package ❌

**What was installed:**
```bash
npm install tailwindcss @tailwindcss/postcss
```

**What the docs say to install:**
```bash
npm install tailwindcss @tailwindcss/postcss postcss --force
```

`postcss` itself is a peer dependency of `@tailwindcss/postcss`. Without it
explicitly installed, the version resolved may be whatever happens to be
pulled in transitively — which can cause subtle version mismatches in the
PostCSS plugin pipeline.

---

## Summary of All Three Mistakes

| # | What was done | What docs say | Impact |
|---|--------------|---------------|--------|
| 1 | Created `tailwind.config.js` | Don't create this file (v4 has no JS config) | **Fatal** — triggered Angular's v3 auto-detection, crashed the build |
| 2 | Created `postcss.config.mjs` | Create `.postcssrc.json` instead | **Fatal** — wrong filename, and irrelevant anyway since mistake 1 fired first |
| 3 | Omitted `postcss` from install | Install `tailwindcss @tailwindcss/postcss postcss` | **Risky** — peer dep resolved transitively, can cause version mismatches |

---

## Correct Implementation (if/when you want to retry)

### Step 1 — Install
```bash
npm install tailwindcss @tailwindcss/postcss postcss --force
```

### Step 2 — Create `.postcssrc.json` in project root
```json
{
  "plugins": {
    "@tailwindcss/postcss": {}
  }
}
```
> **Do not** create `postcss.config.js`, `postcss.config.mjs`, or any
> variant. Use only `.postcssrc.json`.

### Step 3 — Create/update `src/styles.css`
```css
@import "tailwindcss";

/* keep any custom base styles below */
body { font-family: 'Inter', system-ui, sans-serif; background-color: #f3f4f6; }
::-webkit-scrollbar        { width: 6px; }
::-webkit-scrollbar-track  { background: transparent; }
::-webkit-scrollbar-thumb  { background-color: #cbd5e1; border-radius: 20px; }
```

### Step 4 — Register in `angular.json`
```json
"options": {
  "browser": "index.tsx",
  "tsConfig": "tsconfig.json",
  "styles": ["src/styles.css"]
}
```

### Step 5 — Remove the CDN tag from `index.html`
```html
<!-- REMOVE this line: -->
<script src="https://cdn.tailwindcss.com"></script>

<!-- REMOVE the inline <style> block — its contents go in src/styles.css -->
```

### Step 6 — Ensure NO `tailwind.config.*` file exists
```bash
# Verify — this must return nothing:
ls tailwind.config.*
```

If any `tailwind.config.*` file exists, delete it. Its presence will crash
the Angular build regardless of your PostCSS config.
