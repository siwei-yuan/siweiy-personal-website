import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("exports the complete portfolio as static HTML", async () => {
  const html = await readFile(new URL("../out/index.html", import.meta.url), "utf8");

  assert.match(html, /<title>Siwei Yuan — Selected Work<\/title>/i);
  assert.match(html, /Siwei Yuan/);
  assert.match(html, /id="chronology"/);
  assert.match(html, /id="projects"/);
  assert.match(html, /id="blogs"/);
  assert.match(html, /Member of Technical Staff/);
  assert.match(html, /Amazon Web Services/);
  assert.match(html, /Open UCLA poster/);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/i);
});

test("keeps the interactive visual and accessible content in the source", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /from "three"/);
  assert.match(page, /ShaderMaterial/);
  assert.match(page, /pointermove/);
  assert.match(page, /prefers-reduced-motion/);
  assert.match(page, /Notes \/ Details/);
  assert.doesNotMatch(page, /Chronology record \/ extracted sheet|Field notes|personnel archive/i);
  assert.match(layout, /title: "Siwei Yuan — Selected Work"/);
  assert.match(packageJson, /"three"/);
  assert.doesNotMatch(packageJson, /cloudflare|drizzle|vinext|wrangler/i);
  await access(new URL("../app/globals.css", import.meta.url));
  await access(root);
});
