# Siwei Yuan — Personal Website

An atmospheric portfolio built with React, Three.js, and custom GLSL shaders.
The site is statically exported and deployed to GitHub Pages.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Quality checks

```bash
npm run lint
npx tsc --noEmit
npm test
```

`npm test` creates a production static export in `out/` and verifies the
portfolio structure and metadata in the generated HTML.

## Deployment

Pushes to `main` are built and deployed by the GitHub Pages workflow in
`.github/workflows/deploy-pages.yml`.
