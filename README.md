# D&D 2024 Character Sheet

A local-first character sheet for D&D 5.5e (2024). Everything is saved in your browser. There is no backend and no account.

- Click-to-roll with Foundry / Roll20 chat commands
- Features, feats and racial features
- **Library**: search and add spells, feats, species traits and class features from the 2024 SRD 5.2 (CC-BY 4.0, via the Open5e API). Data is cached in your browser after the first load.
- **Custom content**: paste JSON for homebrew or books you own. It stays in your browser and never goes in the repo.

## Run locally

    npm install
    npm run dev

## Deploy to GitHub Pages

1. Create a **public** repo and push this folder to its `main` branch.
2. In the repo, go to **Settings > Pages > Build and deployment** and set **Source** to **GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` builds and publishes on every push. Your site will be at `https://<you>.github.io/<repo>/`.

## Custom content format

    [
      { "kind": "spell", "name": "My Spell", "level": 1, "sub": "Level 1 Evocation", "desc": "Text..." },
      { "kind": "feat",  "name": "My Feat",  "sub": "General feat", "desc": "Text..." },
      { "kind": "class", "name": "My Feature", "level": 3, "sub": "My Subclass, level 3", "desc": "Text..." },
      { "kind": "race",  "name": "My Species", "traits": [ { "n": "Trait", "d": "Text..." } ] }
    ]

## Notes

- Keep non-SRD book text out of this repo. Import it as custom content instead.
- SRD 5.2 is by Wizards of the Coast, licensed CC-BY 4.0.
