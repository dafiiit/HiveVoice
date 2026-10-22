// Reading what draw.io saved. A saved diagram is an SVG whose `content` attribute holds the drawing (an mxfile).

/**
 * draw.io writes its colours as `light-dark(…)` and marks the picture `color-scheme: light dark`, so on a device in dark
 * mode the saved picture turned dark (black shapes, white lines on the white ground). Diagrams always look as in the editor.
 */
export function lightSvg(svg: string): string {
  return svg.replace(/^(\s*(?:<\?xml[^>]*>\s*)?(?:<!DOCTYPE[^>]*>\s*)?<svg\b[^>]*?)color-scheme:\s*light\s+dark/, "$1color-scheme: light");
}

/** The drawing inside a saved SVG, to open it in draw.io again. */
export function drawingOf(svg: string): string {
  if (!svg) return "";
  const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  return root.getAttribute("content") ?? "";
}
