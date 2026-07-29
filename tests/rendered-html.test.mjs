import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the portfolio structure and metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Siwei Yuan — Selected Work<\/title>/i);
  assert.match(html, /Siwei Yuan/);
  assert.match(html, /id="experience"/);
  assert.match(html, /id="projects"/);
  assert.match(html, /id="blogs"/);
  assert.match(html, /Member of Technical Staff/);
  assert.match(html, /Amazon Web Services/);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/i);
});

test("keeps the interactive visual local and removes starter artifacts", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /from "three"/);
  assert.match(page, /ShaderMaterial/);
  assert.match(page, /pointermove/);
  assert.match(page, /prefers-reduced-motion/);
  assert.match(layout, /title: "Siwei Yuan — Selected Work"/);
  assert.match(packageJson, /"three"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  await access(new URL("../app/globals.css", import.meta.url));
  await access(root);
});
