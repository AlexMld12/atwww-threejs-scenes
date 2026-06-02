# Hero scene — glass logo + curved video slider

Three.js intro: top-down camera, color-reveal floor rings, ice-glass logo
rising from a stepped pedestal, draggable curved video carousel. Designed
to live inside an `ATWWW` monorepo on GitHub and be served straight from
GitHub Pages — no third-party hosting required.

## Local development

```bash
npm install
npm run dev      # http://localhost:5173/
```

## Build (publishes to GitHub Pages)

```bash
npm run build
```

This writes the production bundle to `../docs/<this-folder's-name>/`. So if
this folder is named `hero-glass` and sits inside `ATWWW/`, you'll end up
with `ATWWW/docs/hero-glass/index.html` etc. Commit + push and GitHub Pages
serves it.

## End-to-end deploy to GitHub Pages

### 1. One-time folder layout

Create a parent folder named **ATWWW** somewhere outside this scene (e.g.
on your Desktop), then move this folder inside it and rename it to a clean
scene slug (e.g. `hero-glass`):

```
ATWWW/
└── hero-glass/         ← this project's contents
    ├── package.json
    ├── vite.config.js
    ├── public/
    ├── src/
    └── …
```

### 2. Build the production bundle

From the scene folder:

```bash
npm install     # if you haven't yet
npm run build
```

`docs/hero-glass/` will appear at the **ATWWW** level (one directory up).
That's the folder GitHub Pages will serve.

### 3. Push to GitHub

```bash
cd ..                 # at the ATWWW level
git init
git add .
git commit -m "hero-glass scene"
git branch -M main
```

On <https://github.com/new>, create a new public repo named **ATWWW**
(empty — no README, no .gitignore). Copy the URL it shows you, then:

```bash
git remote add origin https://github.com/<USERNAME>/ATWWW.git
git push -u origin main
```

### 4. Turn on GitHub Pages

In the GitHub repo: **Settings → Pages**. Under "Build and deployment":

- **Source:** Deploy from a branch
- **Branch:** `main` / folder **`/docs`**
- Save

After ~30 seconds your scene is live at:

```
https://<USERNAME>.github.io/ATWWW/hero-glass/
```

### 5. Embed in Webflow

In the Webflow Designer, drag in an **Embed** element (under Components →
Embed), put it inside a `<div>` sized to the height you want the hero to
occupy (e.g. `height: 100vh`), and paste:

```html
<iframe
  src="https://<USERNAME>.github.io/ATWWW/hero-glass/"
  style="width:100%; height:100%; border:0; display:block;"
  loading="lazy"
  allow="autoplay"
></iframe>
```

`allow="autoplay"` is required — without it browsers block the muted slider
videos from playing inside an iframe.

## Updating the scene

Every time you change something:

```bash
npm run build           # rebuilds ../docs/hero-glass/
cd ..
git add .
git commit -m "tweak"
git push
```

GitHub Pages re-deploys automatically within a minute.

## Adding another scene later

Drop a second scene folder next to this one (`ATWWW/another-scene/`). Its
own `vite.config.js` auto-detects the folder name and outputs to
`docs/another-scene/`. Same workflow — build, commit, push. GitHub Pages
serves it at `https://<USERNAME>.github.io/ATWWW/another-scene/`.
