import { readFile } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";

/**
 * Renders a repository markdown file for the site.
 *
 * The markdown files at the repo root are the deliverables. Rendering those
 * exact files rather than keeping a second copy in TSX means the note a reviewer
 * reads in the browser and the note they read on GitHub cannot disagree.
 *
 * Mermaid fences are split out rather than passed through, so they can be drawn
 * by the same component that draws a learner's design instead of a second
 * rendering path.
 */

export type Block =
  | { kind: "html"; html: string }
  | { kind: "mermaid"; source: string };

const FENCE = /^```mermaid\s*$/;

export async function loadDoc(filename: string): Promise<Block[]> {
  const raw = await readFile(path.join(process.cwd(), filename), "utf8");
  const blocks: Block[] = [];

  let prose: string[] = [];
  let diagram: string[] | null = null;

  const flushProse = () => {
    const text = prose.join("\n").trim();
    if (text) blocks.push({ kind: "html", html: marked.parse(text, { async: false }) });
    prose = [];
  };

  for (const line of raw.split("\n")) {
    if (diagram === null && FENCE.test(line.trim())) {
      flushProse();
      diagram = [];
      continue;
    }
    if (diagram !== null && line.trim() === "```") {
      blocks.push({ kind: "mermaid", source: diagram.join("\n") });
      diagram = null;
      continue;
    }
    (diagram ?? prose).push(line);
  }

  // An unclosed fence is a typo in the source, not a reason to lose the content.
  if (diagram !== null) prose.push(...diagram);
  flushProse();

  return blocks;
}
