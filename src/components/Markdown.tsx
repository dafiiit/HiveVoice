"use client";
import { Children, isValidElement, useEffect, useId, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslations } from "next-intl";

/**
 * Markdown as formatted text: headings, lists, tables, task lists, code and Mermaid diagrams.
 * Raw HTML is not rendered, links open in a new tab, and remote images are shown as links (they would tell
 * the other site who is reading).
 */
export function Markdown({ source }: { source: string }) {
  const t = useTranslations("knowledge");
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => <a href={href} target={href?.startsWith("#") ? undefined : "_blank"} rel="noopener noreferrer nofollow ugc">{children}</a>,
          img: ({ src, alt }) => <a href={typeof src === "string" ? src : undefined} target="_blank" rel="noopener noreferrer nofollow ugc">{t("externalImage", { alt: alt || t("image") })}</a>,
          table: ({ children }) => <div className="md-table"><table>{children}</table></div>,
          pre: ({ children }) => {
            const only = Children.toArray(children)[0];
            // The code element's own class tells whether this block is a diagram (then it must not sit inside <pre>).
            const diagram = isValidElement(only) && /language-mermaid/.test((only.props as { className?: string }).className ?? "");
            return diagram ? <>{children}</> : <pre>{children}</pre>;
          },
          code: ({ className, children }) => {
            const language = /language-([\w-]+)/.exec(className ?? "")?.[1];
            if (language === "mermaid") return <Mermaid code={String(children).replace(/\n$/, "")} />;
            return <code className={className}>{children as ReactNode}</code>;
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

const isDark = () => {
  const theme = document.documentElement.dataset.theme;
  return theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
};

/** A Mermaid diagram drawn in the browser (the library loads only when a note has one), in strict mode: no scripts, no HTML labels. */
function Mermaid({ code }: { code: string }) {
  const t = useTranslations("knowledge");
  const id = `mmd${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [result, setResult] = useState<{ code: string; svg: string | null; error: string | null } | null>(null);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: isDark() ? "dark" : "neutral", fontFamily: "inherit" });
        const { svg } = await mermaid.render(id, code);
        if (live) setResult({ code, svg, error: null });
      } catch (e) {
        document.getElementById(`d${id}`)?.remove();
        if (live) setResult({ code, svg: null, error: String((e as Error).message ?? e).split("\n")[0] });
      }
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [code, id]);

  // While a changed diagram is being drawn, the last good picture stays.
  if (!result) return <figure className="md-diagram" aria-busy="true">{t("diagramLoading")}</figure>;
  if (result.error) return <pre role="alert" className="md-diagram-error">{t("diagramError", { error: result.error })}</pre>;
  return <figure className="md-diagram" role="img" aria-label={t("diagram")} dangerouslySetInnerHTML={{ __html: result.svg ?? "" }} />;
}
