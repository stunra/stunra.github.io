# Godfinger (browser version)

A browser port of Godfinger (Wonderland Software / ngmoco, 2010), rebuilt from the v2.1 iPhone game files.

## Put it on GitHub Pages

1. Create a new repository on github.com (e.g. `godfinger`).
2. Upload everything in this folder to it (drag the files into "Add file → Upload files"; keep the `assets`, `js` and `sfx` folders).
3. In the repo go to **Settings → Pages**, set **Source** to "Deploy from a branch", branch `main`, folder `/ (root)`, and save.
4. After a minute the game is live at `https://<your-username>.github.io/godfinger/`.

Progress saves in each player's browser. Tip: on iPad, use Share → "Add to Home Screen" for a full-screen app icon.

To test locally, run `python3 -m http.server` in this folder and open http://localhost:8000 (opening index.html directly from disk won't load the sounds).
