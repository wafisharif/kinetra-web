# Kinetra — marketing site

A static, single-page site for Kinetra, styled after [cua.ai](https://cua.ai)'s
structure and dark, technical aesthetic, re-themed around Kinetra's own brand
blue (pulled straight from the app icon). No build step, no framework —
just `index.html` + `css/style.css` + `js/main.js`, so it drops onto GitHub
Pages as-is.

The pose "demos" (the animated stick figures in the hero and the Task
Coverage section) are procedural canvas animations driven by hand-tuned
joint-angle math in `js/main.js` — not real motion-capture or a MuJoCo/MyoSuite
simulation. They exist to communicate the pose-tracking concept visually.
See **"Swapping in real biomechanics renders"** below if you want to replace
them with actual simulation output later.

---

## 1. Preview it locally first

You don't need Node, a bundler, or anything installed beyond a browser —
but opening `index.html` directly with `file://` will silently break the
Google Fonts request in some browsers, so serve it over a tiny local
server instead:

```bash
cd kinetra-website
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser. Click through the
"Task Coverage" tabs and scroll the whole page once before publishing —
that's the fastest way to catch anything you want to tweak.

(No Python? `npx serve .` works the same way if you have Node installed.)

---

## 2. Put it in its own GitHub repo

If you want this to live at `github.com/wafisharif/kinetra-site` (or
similar) as its own repo, separate from the app's `biomech-app` repo:

```bash
cd kinetra-website
git init
git add .
git commit -m "Initial Kinetra marketing site"
git branch -M main
git remote add origin https://github.com/wafisharif/kinetra-site.git
git push -u origin main
```

Replace the URL with whatever you name the new repo on GitHub (create an
empty repo there first — no README/license, since you already have files
locally — then copy the URL it gives you).

If you'd rather nest it inside your existing `biomech-app` repo (e.g. under
a `website/` folder) that also works — just adjust the GitHub Pages source
folder in step 3.

---

## 3. Turn on GitHub Pages

1. On GitHub, open the repo → **Settings** → **Pages** (left sidebar, under "Code and automation").
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Under **Branch**, pick `main` and the folder:
   - `/ (root)` if `index.html` sits at the top of the repo (the setup above).
   - `/website` (or whatever you named it) if you nested it inside another repo.
4. Click **Save**.
5. Wait 30–60 seconds, then refresh the Pages settings page — it'll show a
   green banner with your live URL, something like:
   `https://wafisharif.github.io/kinetra-site/`

Every future `git push` to `main` redeploys the site automatically within
about a minute — no extra workflow file needed for a plain static site
like this one.

---

## 4. Optional: a custom domain

If you own a domain (or want to buy one for Kinetra specifically):

1. Add a file named `CNAME` (no extension) at the repo root containing just
   your domain, e.g.:
   ```
   kinetra.app
   ```
2. At your domain registrar, add either:
   - An **A record** pointing `@` to GitHub Pages' IPs (`185.199.108.153`,
     `185.199.109.153`, `185.199.110.153`, `185.199.111.153`), or
   - A **CNAME record** pointing a subdomain (e.g. `www`) to
     `wafisharif.github.io`.
3. Back in the repo's Pages settings, enter the custom domain and check
   **Enforce HTTPS** once it's verified (can take a few minutes to a few
   hours for DNS to propagate).

Skip this entirely if the free `github.io` URL is fine for now — it's a
real, shareable HTTPS link either way.

---

## 5. Editing the content

Everything lives in three files:

- **`index.html`** — all copy and structure. Every section has an `id`
  (`#why`, `#tasks`, `#product`, `#how`, `#insights`, `#status`) matching
  the nav links, so you can reorder or remove a whole section by cutting
  its `<section>...</section>` block plus the matching `<a href="#…">` in
  the nav and footer.
- **`css/style.css`** — all design tokens are CSS variables at the very
  top of the file, under `:root`. Change `--brand`, `--brand-strong`, and
  `--brand-deep` to re-theme the whole site's accent color in one place.
- **`js/main.js`** — the hero word-cycle list, the six Task Coverage
  descriptions (`COPY` object), and the pose-animation math.

To change the six task-mode blurbs (title, description, bullet points),
edit the `COPY` object near the bottom of `js/main.js` — the HTML doesn't
need to change at all, it's populated from that object.

---

## 6. Swapping in real biomechanics renders (optional, later)

You mentioned MuJoCo/MyoSuite — and you've already got a `mujoco_env`
set up locally, so this is genuinely doable, just a separate follow-up
project from shipping the site itself:

1. In your `mujoco_env`, render a short offscreen video/GIF of a
   humanoid model performing a motion (MuJoCo's own `humanoid.xml` for a
   generic figure, or a MyoSuite musculoskeletal env if you want it to
   visibly match the app's real biomechanics framing).
2. Export frames to a `.webm`/`.mp4` (small, muted, looping) or a `.gif`.
3. Drop the file into `assets/video/` in this repo.
4. In `index.html`, replace the relevant `<canvas>` element with:
   ```html
   <video src="assets/video/gait-cycle.webm" autoplay loop muted playsinline></video>
   ```
5. Remove that task's canvas-drawing call in `main.js` (or just leave it
   dead — an unused `<canvas id="...">` with nothing pointing at it does
   nothing).

Keep the canvas version for any task you don't have a render for yet —
mixing procedural demos and real renders across the six tabs is fine,
nothing about the layout depends on which one a given tab uses.

---

## File structure

```
kinetra-website/
├── index.html
├── css/
│   └── style.css
├── js/
│   └── main.js
├── assets/
│   └── images/
│       └── favicon.png
└── README.md
```
