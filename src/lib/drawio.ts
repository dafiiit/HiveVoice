// Reading what draw.io saved (in the browser). A saved diagram is an SVG whose `content` attribute holds the drawing
// (an mxfile); each page is either plain XML or compressed (deflate, base64, URI-encoded).

/** The drawing inside a saved SVG, to open it in draw.io again. */
export function drawingOf(svg: string): string {
  if (!svg) return "";
  const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  return root.getAttribute("content") ?? "";
}

async function inflate(text: string): Promise<string> {
  const bytes = Uint8Array.from(atob(text.trim()), (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return decodeURIComponent(await new Response(stream).text());
}

/** The pages of a drawing as graph models. */
async function pagesOf(svg: string): Promise<Element[]> {
  const file = new DOMParser().parseFromString(drawingOf(svg), "text/xml");
  const pages: Element[] = [];
  for (const page of [...file.getElementsByTagName("diagram")]) {
    const inline = page.getElementsByTagName("mxGraphModel")[0];
    if (inline) { pages.push(inline); continue; }
    const xml = await inflate(page.textContent ?? "");
    pages.push(new DOMParser().parseFromString(xml, "text/xml").documentElement);
  }
  return pages;
}

/**
 * The Mermaid source of a diagram that is nothing but one Mermaid group (made from a Mermaid block). `changed`: something
 * was styled or added inside the group in draw.io, which Mermaid cannot keep. Null when there is more on the drawing.
 */
export async function mermaidOf(svg: string): Promise<{ source: string; changed: boolean } | null> {
  const pages = await pagesOf(svg).catch(() => []);
  if (pages.length !== 1) return null;
  // A cell is either <mxCell id parent> or wrapped in <UserObject|object id …><mxCell parent>.
  const cells = [...pages[0].getElementsByTagName("mxCell")].map((c) => {
    const holder = c.parentElement && c.parentElement.tagName !== "root" ? c.parentElement : c;
    return { id: holder.getAttribute("id") ?? c.getAttribute("id"), parent: c.getAttribute("parent"), holder, cell: c };
  });
  const layers = cells.filter((c) => c.parent === "0");
  const top = cells.filter((c) => layers.some((l) => l.id === c.parent));
  if (layers.length !== 1 || top.length !== 1) return null;
  const data = top[0].holder.getAttribute("mermaidData");
  if (!data) return null;
  let source: string;
  try { source = String(JSON.parse(data).data ?? ""); } catch { return null; }
  if (!source.trim()) return null;
  const inside = cells.filter((c) => c.parent === top[0].id);
  const changed = inside.some((c) => {
    const base = c.holder.getAttribute("mermaidBaseStyle");
    if (base === null) return true; // added in draw.io
    return base !== (c.cell.getAttribute("style") ?? "") || (c.holder.getAttribute("mermaidBaseValue") ?? "") !== (c.holder.getAttribute("label") ?? "");
  });
  return { source, changed };
}
