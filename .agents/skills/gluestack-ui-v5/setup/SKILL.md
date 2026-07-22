---
name: gluestack-ui-v5:setup
description: Guide for installing gluestack-ui v5 — CLI and manual paths for NativeWind v5 and UniWind. Tailwind CSS v4 (CSS-first, no tailwind.config.js).
---

# Gluestack UI v5 — Setup & Installation

This sub-skill covers gluestack-ui v5 setup. v5 runs on **Tailwind CSS v4** (CSS-first, no `tailwind.config.js`) with two supported styling engines:

| Engine | Tailwind | Platforms | When to choose |
|---|---|---|---|
| **NativeWind v5** | v4 | Expo, React Native CLI | Recommended default |
| **UniWind** | v4 | Expo only | No PostCSS build step, simpler setup |

> **Next.js support is pending** NativeWind v5 web support. Use gluestack-ui v4 for Next.js projects for now.

## v5 only — do not use v1/v2/v3/v4 packages or docs

- **Never** use or suggest: `@gluestack/styled`, `@gluestack-ui/themed`, `@gluestack-ui/nativewind-utils` (v4 package), `tailwind.config.js` (Tailwind v3), or any packages/docs from **v4.gluestack.io** (v4 docs, still available for reference).
- **v5** packages: `@gluestack-ui/core@^5`, `@gluestack-ui/utils@^5`, plus the styling engine (`nativewind@^5.0.0-preview.2` + `react-native-css@^3.0.4` OR `uniwind@^1.3.0`).

---

## CLI (Recommended)

### Prerequisites

| Package Name   | Supported Versions   |
|---|---|
| react-native   | versions >= 0.76     |
| expo           | versions >= 52       |
| node           | versions >= 18       |

### Step 1: Initialize

From your project root:

```bash
npx gluestack-ui@latest init
```

This adds **GluestackUIProvider** and essential components (**icon**, **overlay**, **toast**). The `@latest` tag is for greenfield projects. During migration from older versions, use `@alpha`.

### Step 2: Add Components

```bash
# Add individual components
npx gluestack-ui@latest add button

# Add all components at once
npx gluestack-ui@latest add --all
```

### Step 3: If migrating from v4

```bash
# Use @alpha tag for migration
npx gluestack-ui@alpha upgrade
npx gluestack-ui@alpha add gluestack-ui-provider
npx gluestack-ui@alpha add --all
```

After migration, delete `tailwind.config.js` — Tailwind v4 is CSS-first. See the `migrate-to-v5` skill for full details.

---

## Manual: NativeWind v5 (Expo / React Native CLI)

### Packages

```bash
# Styling engine
npm install nativewind@^5.0.0-preview.2 react-native-css@^3.0.4

# Dev dependencies (Tailwind v4 + PostCSS)
npm install -D tailwindcss@^4.2.0 @tailwindcss/postcss@^4.2.0 postcss@^8.5.0
```

### Pin lightningcss

NativeWind v5 requires exactly `lightningcss@1.30.1`. Add to `package.json`:

```json
{
  "overrides": { "lightningcss": "1.30.1" },
  "resolutions": { "lightningcss": "1.30.1" }
}
```

### `global.css`

Create at project root. This replaces `tailwind.config.js` — all tokens are defined here:

```css
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/preflight.css" layer(base);
@import "tailwindcss/utilities.css";
@import "nativewind/theme";

@layer theme {
  :root {
    --primary: 23 23 23;
    --primary-foreground: 250 250 250;
    --card: 255 255 255;
    --secondary: 245 245 245;
    --secondary-foreground: 23 23 23;
    --background: 255 255 255;
    --popover: 255 255 255;
    --popover-foreground: 10 10 10;
    --muted: 245 245 245;
    --muted-foreground: 115 115 115;
    --destructive: 231 0 11;
    --foreground: 10 10 10;
    --border: 229 229 229;
    --input: 229 229 229;
    --ring: 212 212 212;
    --accent: 247 247 247;
    --accent-foreground: 52 52 52;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --primary: 255 245 245;
      --primary-foreground: 23 23 23;
      --card: 23 23 23;
      --secondary: 38 38 38;
      --secondary-foreground: 250 250 250;
      --background: 10 10 10;
      --popover: 23 23 23;
      --popover-foreground: 250 250 250;
      --muted: 38 38 38;
      --muted-foreground: 161 161 161;
      --destructive: 255 100 103;
      --foreground: 250 250 250;
      --border: 46 46 46;
      --input: 46 46 46;
      --accent: 38 38 38;
      --accent-foreground: 250 250 250;
      --ring: 115 115 115;
    }
  }

  /* Web only: explicit class-based dark/light mode */
  :root.dark {
    --primary: 255 245 245;
    --primary-foreground: 23 23 23;
    --card: 23 23 23;
    --secondary: 38 38 38;
    --secondary-foreground: 250 250 250;
    --background: 10 10 10;
    --popover: 23 23 23;
    --popover-foreground: 250 250 250;
    --muted: 38 38 38;
    --muted-foreground: 161 161 161;
    --destructive: 255 100 103;
    --foreground: 250 250 250;
    --border: 46 46 46;
    --input: 46 46 46;
    --accent: 38 38 38;
    --accent-foreground: 250 250 250;
    --ring: 115 115 115;
  }

  :root.light {
    --primary: 23 23 23;
    --primary-foreground: 250 250 250;
    --card: 255 255 255;
    --secondary: 245 245 245;
    --secondary-foreground: 23 23 23;
    --background: 255 255 255;
    --popover: 255 255 255;
    --popover-foreground: 10 10 10;
    --muted: 245 245 245;
    --muted-foreground: 115 115 115;
    --destructive: 231 0 11;
    --foreground: 10 10 10;
    --border: 229 229 229;
    --input: 229 229 229;
    --ring: 212 212 212;
    --accent: 247 247 247;
    --accent-foreground: 52 52 52;
  }
}

@theme inline {
  --color-primary: rgb(var(--primary));
  --color-primary-foreground: rgb(var(--primary-foreground));
  --color-card: rgb(var(--card));
  --color-secondary: rgb(var(--secondary));
  --color-secondary-foreground: rgb(var(--secondary-foreground));
  --color-background: rgb(var(--background));
  --color-popover: rgb(var(--popover));
  --color-popover-foreground: rgb(var(--popover-foreground));
  --color-muted: rgb(var(--muted));
  --color-muted-foreground: rgb(var(--muted-foreground));
  --color-destructive: rgb(var(--destructive));
  --color-foreground: rgb(var(--foreground));
  --color-border: rgb(var(--border));
  --color-input: rgb(var(--input));
  --color-ring: rgb(var(--ring));
  --color-accent: rgb(var(--accent));
  --color-accent-foreground: rgb(var(--accent-foreground));
}
```

The `@theme inline {}` block maps CSS custom properties to Tailwind utility classes — so `bg-primary` resolves to `var(--color-primary)` which is `rgb(var(--primary))`.

### `postcss.config.js`

Create at project root (required for NativeWind v5):

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

### `metro.config.js`

```js
const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);
module.exports = withNativewind(config);
```

### `react-native-css-env.d.ts`

Create at project root:

```ts
/// <reference types="react-native-css/types" />

// NOTE: This file is generated by react-native-css and should not be edited manually.
```

### `babel.config.js`

Remove the `'tailwind.config': './tailwind.config.js'` alias if present — it was a v3/v4 workaround. Tailwind v4 doesn't use a config file.

### Rebuild (bare Expo / React Native CLI only)

```bash
# iOS
cd ios && pod install && npx expo run:ios
# Android
npx expo run:android
```

---

## Manual: UniWind (Expo only)

UniWind is an alternative styling engine that **does not require PostCSS**, making the setup simpler than NativeWind v5.

### Packages

```bash
# Styling engine
npm install uniwind@^1.3.0

# Dev dependency (Tailwind v4)
npm install -D tailwindcss@^4.1.18
```

No `lightningcss` pin or PostCSS config needed.

### `global.css`

```css
@import 'tailwindcss';
@import 'uniwind';

@layer theme {
  :where(.light, .light *) {
    --primary: 23 23 23;
    --primary-foreground: 250 250 250;
    --card: 255 255 255;
    --secondary: 245 245 245;
    --secondary-foreground: 23 23 23;
    --background: 255 255 255;
    --popover: 255 255 255;
    --popover-foreground: 10 10 10;
    --muted: 245 245 245;
    --muted-foreground: 115 115 115;
    --destructive: 231 0 11;
    --foreground: 10 10 10;
    --border: 229 229 229;
    --input: 229 229 229;
    --ring: 212 212 212;
    --accent: 247 247 247;
    --accent-foreground: 52 52 52;
  }

  @media (prefers-color-scheme: light) {
    :root:not(:where(.light, .light *, .dark, .dark *)) {
      --primary: 23 23 23;
      --primary-foreground: 250 250 250;
      --card: 255 255 255;
      --secondary: 245 245 245;
      --secondary-foreground: 23 23 23;
      --background: 255 255 255;
      --popover: 255 255 255;
      --popover-foreground: 10 10 10;
      --muted: 245 245 245;
      --muted-foreground: 115 115 115;
      --destructive: 231 0 11;
      --foreground: 10 10 10;
      --border: 229 229 229;
      --input: 229 229 229;
      --ring: 212 212 212;
      --accent: 247 247 247;
      --accent-foreground: 52 52 52;
    }
  }

  :where(.dark, .dark *) {
    --primary: 255 245 245;
    --primary-foreground: 23 23 23;
    --card: 23 23 23;
    --secondary: 38 38 38;
    --secondary-foreground: 250 250 250;
    --background: 10 10 10;
    --popover: 23 23 23;
    --popover-foreground: 250 250 250;
    --muted: 38 38 38;
    --muted-foreground: 161 161 161;
    --destructive: 255 100 103;
    --foreground: 250 250 250;
    --border: 46 46 46;
    --input: 46 46 46;
    --accent: 38 38 38;
    --accent-foreground: 250 250 250;
    --ring: 115 115 115;
  }

  @media (prefers-color-scheme: dark) {
    :root:not(:where(.light, .light *, .dark, .dark *)) {
      --primary: 255 245 245;
      --primary-foreground: 23 23 23;
      --card: 23 23 23;
      --secondary: 38 38 38;
      --secondary-foreground: 250 250 250;
      --background: 10 10 10;
      --popover: 23 23 23;
      --popover-foreground: 250 250 250;
      --muted: 38 38 38;
      --muted-foreground: 161 161 161;
      --destructive: 255 100 103;
      --foreground: 250 250 250;
      --border: 46 46 46;
      --input: 46 46 46;
      --accent: 38 38 38;
      --accent-foreground: 250 250 250;
      --ring: 115 115 115;
    }
  }
}

@theme inline {
  --color-primary: rgb(var(--primary));
  --color-primary-foreground: rgb(var(--primary-foreground));
  --color-card: rgb(var(--card));
  --color-secondary: rgb(var(--secondary));
  --color-secondary-foreground: rgb(var(--secondary-foreground));
  --color-background: rgb(var(--background));
  --color-popover: rgb(var(--popover));
  --color-popover-foreground: rgb(var(--popover-foreground));
  --color-muted: rgb(var(--muted));
  --color-muted-foreground: rgb(var(--muted-foreground));
  --color-destructive: rgb(var(--destructive));
  --color-foreground: rgb(var(--foreground));
  --color-border: rgb(var(--border));
  --color-input: rgb(var(--input));
  --color-ring: rgb(var(--ring));
  --color-accent: rgb(var(--accent));
  --color-accent-foreground: rgb(var(--accent-foreground));
}
```

> **Important**: The `.dark {}` / `.light {}` selectors must be **top-level** inside `@layer theme`, never nested inside `:root {}`. Nested selectors won't match when UniWind transforms them for web.

### `metro.config.js`

```js
const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

const config = getDefaultConfig(__dirname);
module.exports = withUniwindConfig(config, {
  cssEntryFile: './global.css',
  dtsFile: './uniwind-types.d.ts',
  extraThemes: ['dark'],
});
```

### `uniwind-types.d.ts`

```ts
/// <reference types="uniwind/types" />

declare module 'uniwind' {
  export interface UniwindConfig {
    themes: readonly ['light', 'dark']
  }
}

export {}
```

### `babel.config.js`

```js
module.exports = {
  presets: [
    // Remove 'nativewind/babel' if present
    ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
  ],
  plugins: [
    'react-native-worklets/plugin',
  ],
};
```

### Theme Switching (UniWind)

With UniWind, use `Uniwind.setTheme()` instead of `Appearance.setColorScheme()`:

```tsx
import { Uniwind } from 'uniwind';

// In your GluestackUIProvider or theme toggle
Uniwind.setTheme('dark');   // Force dark
Uniwind.setTheme('light');  // Force light
Uniwind.setTheme('system'); // Follow device setting
```

After re-adding the provider via `npx gluestack-ui@alpha add gluestack-ui-provider`, the UniWind version handles this automatically.

---

## Engine Comparison

| Feature | NativeWind v5 | UniWind |
|---|---|---|
| Tailwind version | v4 (CSS-first) | v4 (CSS-first) |
| PostCSS required | Yes | **No** |
| lightningcss pin | Yes (`1.30.1`) | **No** |
| Platforms | Expo + RN CLI | **Expo only** |
| Next.js | Pending | Pending |
| `global.css` | `@import "tailwindcss/..."` | `@import 'tailwindcss'; @import 'uniwind'` |
| `metro.config.js` | `withNativewind` from `nativewind/metro` | `withUniwindConfig` from `uniwind/metro` |
| Dark mode selectors | `@media` + `.dark`/`.light` | `:where(.dark, .dark *)` |
| Theme switching | `Appearance.setColorScheme()` | `Uniwind.setTheme()` |
| Type defs file | `react-native-css-env.d.ts` | `uniwind-types.d.ts` |

## Common Issues

**"Mismatch between JavaScript part and native part of Worklets"**

`react-native-worklets` version must match the minor of `react-native-reanimated`. For Expo: `npx expo install react-native-reanimated && npx expo install --fix`.

**Theme not applying on Expo Web (UniWind)**

`.dark {}` / `.light {}` selectors in `global.css` must be **top-level** inside `@layer theme`, not nested inside `:root {}`.

**NativeWind v5 build errors**

Ensure `lightningcss` is pinned to exactly `1.30.1` in both `overrides` and `resolutions`, then `rm -rf node_modules && npm install`.

**`tailwind.config.js` still referenced after migration**

Delete it. Remove any `'tailwind.config': './tailwind.config.js'` alias from `babel.config.js` presets.

---

## Reference

- **Migration guide**: Use the `migrate-to-v5` skill for step-by-step v2/v3/v4 → v5 migration
- **NativeWind v5 docs**: https://www.nativewind.dev/
- **UniWind docs**: Check the UniWind package documentation
