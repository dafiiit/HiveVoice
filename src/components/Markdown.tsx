"use client";
import { Children, isValidElement, useEffect, useId, useState, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { imageUrl } from "@/lib/images";
import { btn } from "./ui/styles";
import "katex/dist/katex.min.css";

// Photos uploaded into a note are written as `img:<auth user id>/<file>.jpg`, so the text does not depend on where images are served from.
const OWN_IMAGE = /^img:([0-9a-f-]{36}\/[0-9a-f]{32}\.jpg)$/;
// A draw.io diagram from Ich → Diagramme is written as `![Name](diagram:<id>)`: it shows the saved picture and opens in draw.io.
const DIAGRAM = /^diagram:([0-9a-f-]{36})$/;
const urlTransform = (url: string) => (OWN_IMAGE.test(url) || DIAGRAM.test(url) ? url : defaultUrlTransform(url));

/**
 * Markdown as formatted text: headings, lists, tables, task lists, code, formulas (LaTeX between $ or $$), Mermaid and draw.io diagrams.
 * Raw HTML is not rendered, links open in a new tab. Photos uploaded here are shown; remote images are shown as links
 * (they would tell the other site who is reading).
 */
/** What the note editor adds to its preview: a Mermaid block moves to draw.io, a diagram made from one comes back. */
export type MarkdownActions = { mermaid?: { label: string; run: (code: string) => void }; drawing?: { label: string; run: (id: string) => void } };

export function Markdown({ source, actions }: { source: string; actions?: MarkdownActions }) {
  const t = useTranslations("knowledge");
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        urlTransform={urlTransform}
        components={{
          a: ({ href, children }) => <a href={href} target={href?.startsWith("#") ? undefined : "_blank"} rel="noopener noreferrer nofollow ugc">{children}</a>,
          img: ({ src, alt }) => {
            const drawing = typeof src === "string" ? DIAGRAM.exec(src)?.[1] : undefined;
            if (drawing) return <Drawing id={drawing} title={alt ?? ""} action={actions?.drawing} />;
            const own = typeof src === "string" ? OWN_IMAGE.exec(src)?.[1] : undefined;
            // eslint-disable-next-line @next/next/no-img-element -- photos from our own store, already shrunk on upload
            if (own) return <img src={imageUrl(own) ?? undefined} alt={alt ?? ""} loading="lazy" className="md-image" />;
            return <a href={typeof src === "string" ? src : undefined} target="_blank" rel="noopener noreferrer nofollow ugc">{t("externalImage", { alt: alt || t("image") })}</a>;
          },
          table: ({ children }) => <div className="md-table"><table>{children}</table></div>,
          pre: ({ children }) => {
            const only = Children.toArray(children)[0];
            // The code element's own class tells whether this block is a diagram (then it must not sit inside <pre>).
            const diagram = isValidElement(only) && /language-(mermaid|math)/.test((only.props as { className?: string }).className ?? "");
            return diagram ? <>{children}</> : <pre>{children}</pre>;
          },
          code: ({ className, children }) => {
            const language = /language-([\w-]+)/.exec(className ?? "")?.[1];
            if (language === "mermaid") return <Mermaid code={String(children).replace(/\n$/, "")} action={actions?.mermaid} />;
            if (language === "math") return <Formula code={String(children)} display={/math-display/.test(className ?? "")} />;
            return <code className={className}>{children as ReactNode}</code>;
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

/**
 * A draw.io diagram inside a text. Always the latest saved version; whoever may not read the diagram itself sees a note
 * instead of the picture. The link opens it in draw.io (or just shows it, for those who may not edit).
 */
function Drawing({ id, title, action }: { id: string; title: string; action?: MarkdownActions["drawing"] }) {
  const t = useTranslations("knowledge");
  const [missing, setMissing] = useState(false);
  // After drawing, "Schließen" leads back to the text the diagram sits in.
  const here = usePathname();
  // Spans, not <figure>: Markdown puts an image inside a paragraph.
  return (
    <span className="md-drawing" role="group" aria-label={title || t("drawing")}>
      {missing ? <span className="md-drawing-closed">{t("drawingClosed")}</span>
        // eslint-disable-next-line @next/next/no-img-element -- an SVG as <img>: scripts inside never run
        : <img src={`/api/diagrams/${id}`} alt={title || t("drawing")} loading="lazy" onError={() => setMissing(true)} />}
      <span className="md-drawing-caption">
        <span>{title}</span>
        <span className="md-drawing-actions">
          {action && <button type="button" onClick={() => action.run(id)} className={btn.link}>{action.label}</button>}
          <a href={`/links/${id}?edit=1&back=${encodeURIComponent(here)}`}>{t("drawingOpen")}</a>
        </span>
      </span>
    </span>
  );
}

/** A formula set with KaTeX (loaded only when a text has one). Untrusted input: no \\href, \\url or HTML commands. */
function Formula({ code, display }: { code: string; display: boolean }) {
  const [html, setHtml] = useState<{ code: string; html: string } | null>(null);
  useEffect(() => {
    let live = true;
    void import("katex").then(({ default: katex }) => {
      if (live) setHtml({ code, html: katex.renderToString(code, { displayMode: display, throwOnError: false, trust: false, strict: "ignore", maxExpand: 500 }) });
    });
    return () => { live = false; };
  }, [code, display]);
  const Tag = display ? "div" : "span";
  if (!html) return <Tag className={display ? "md-math md-math-display" : "md-math"}><code>{code}</code></Tag>;
  return <Tag className={display ? "md-math md-math-display" : "md-math"} dangerouslySetInnerHTML={{ __html: html.html }} />;
}

const isDark = () => {
  const theme = document.documentElement.dataset.theme;
  return theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
};

/** A Mermaid diagram drawn in the browser (the library loads only when a note has one), in strict mode: no scripts, no HTML labels. */
function Mermaid({ code, action }: { code: string; action?: MarkdownActions["mermaid"] }) {
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
  const picture = <figure className="md-diagram" role="img" aria-label={t("diagram")} dangerouslySetInnerHTML={{ __html: result.svg ?? "" }} />;
  if (!action) return picture;
  return <div className="md-diagram-wrap">{picture}<button type="button" onClick={() => action.run(code)} className={btn.link}>{action.label}</button></div>;
}
