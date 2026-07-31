import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Marked, Renderer } from "marked";
import { ArticleExperience } from "./article-experience";

export const metadata: Metadata = {
  title: "Building Coral — Siwei Yuan",
  description: "How Coral keeps events at the core while giving agent swarms room to evolve through code.",
};

type Heading = {
  depth: number;
  id: string;
  title: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[`'’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderArticle() {
  const sourcePath = path.join(process.cwd(), "content", "building-coral.md");
  const markdown = readFileSync(sourcePath, "utf8").replace(/^# Building Coral\s*/, "");
  const headings: Heading[] = [];
  const usedIds = new Map<string, number>();
  const renderer = new Renderer();

  renderer.heading = ({ text, depth }) => {
    const title = text.replace(/[*_`]/g, "");
    const base = slugify(title) || "section";
    const count = usedIds.get(base) ?? 0;
    usedIds.set(base, count + 1);
    const id = count ? `${base}-${count + 1}` : base;
    if (depth === 2 || depth === 3) headings.push({ depth, id, title });
    return `<h${depth} id="${id}">${escapeHtml(title)}</h${depth}>`;
  };

  const marked = new Marked({ renderer, gfm: true });
  const html = marked.parse(markdown) as string;
  return { html, headings };
}

export default function BuildingCoralPage() {
  const { html, headings } = renderArticle();
  const mainHeadings = headings.filter((heading) => heading.depth === 2);

  return (
    <div className="article-page">
      <ArticleExperience headingIds={mainHeadings.map((heading) => heading.id)} />
      <div className="article-atmosphere" aria-hidden="true" />
      <div className="article-grain" aria-hidden="true" />

      <header className="article-cover">
        <a className="article-back" href="../../#blogs"><span aria-hidden="true">←</span> Return to archive</a>
        <div className="article-cover-register">
          <span>Field Note / 001</span>
          <span>Agent systems</span>
        </div>
        <div className="article-cover-title">
          <p>A record of the mistakes that led me to</p>
          <h1>
            Building<br />
            <a
              className="article-coral-link"
              href="https://github.com/siwei-yuan/coral"
              target="_blank"
              rel="noreferrer"
              aria-label="Open the Coral repository on GitHub"
            >
              <span>Coral</span>
              <span className="article-coral-fill" aria-hidden="true">Coral</span>
            </a>
          </h1>
          <p className="article-deck">Keeping events at the core while giving agents the freedom to evolve through code.</p>
        </div>
        <div className="article-cover-meta">
          <span>Siwei Yuan</span>
          <span>July 2026</span>
          <span>25 min read</span>
        </div>
      </header>

      <main className="article-stage">
        <aside className="article-index" aria-label="Article sections">
          <p>Transmission index</p>
          <nav className="article-toc">
            {mainHeadings.map((heading, index) => (
              <a href={`#${heading.id}`} key={heading.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {heading.title}
              </a>
            ))}
          </nav>
        </aside>

        <article className="article-paper">
          <div className="article-paper-register" aria-hidden="true">
            <span>CORAL / FIELD NOTE 001</span>
            <span>YSW—0726</span>
          </div>
          <div className="article-copy" dangerouslySetInnerHTML={{ __html: html }} />
          <footer className="article-end">
            <span>End of transmission / 001</span>
            <a href="../../#blogs">Return to archive <i aria-hidden="true">↗</i></a>
          </footer>
        </article>
      </main>
    </div>
  );
}
