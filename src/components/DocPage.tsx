import { Diagram } from "@/components/Diagram";
import { loadDoc } from "@/lib/content";

/**
 * One renderer for all three written deliverables. They differ only in which
 * file they read and what sits above them.
 */
export async function DocPage({
  file,
  eyebrow,
  lede,
}: {
  file: string;
  eyebrow: string;
  lede: string;
}) {
  const blocks = await loadDoc(file);

  return (
    <div className="shell-narrow" style={{ padding: "2.5rem 0 3rem" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <span className="chip">{eyebrow}</span>
        <p className="small dim" style={{ margin: "0.6rem 0 0.3rem", maxWidth: "62ch" }}>{lede}</p>
        <p className="micro faint" style={{ margin: 0 }}>
          Rendered from <span className="ident">{file}</span> in the repo. Same file, not a copy.
        </p>
      </div>

      <article className="prose">
        {blocks.map((block, index) =>
          block.kind === "mermaid" ? (
            <div key={index} className="vellum" style={{ margin: "1.2rem 0" }}>
              <div className="prose-scroll">
                <Diagram source={block.source} />
              </div>
            </div>
          ) : (
            <div key={index} className="prose-scroll" dangerouslySetInnerHTML={{ __html: block.html }} />
          ),
        )}
      </article>
    </div>
  );
}
