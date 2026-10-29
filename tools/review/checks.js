// Checks of one page as it is drawn right now, run in the browser (page.evaluate). Plain JavaScript on purpose: it is sent
// as text, so it works from any test or script and does not depend on how that one is compiled.
// Returns a list of findings: { kind, level: "error" | "warn" | "info", text, where, box }.
(() => {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const touch = window.matchMedia("(pointer: coarse)").matches;
  const out = [];
  const add = (kind, level, text, el) => out.push({ kind, level, text, where: el ? name(el) : "", box: el ? box(el) : null });

  /** A short, readable name of an element: its role or tag, its label or text, and a class to find it by. */
  function name(el) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role");
    const label = el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("placeholder") || (el.textContent || "").trim().replace(/\s+/g, " ");
    const id = el.id ? `#${el.id}` : "";
    return `${role ? `${tag}[role=${role}]` : tag}${id}${label ? ` "${label.slice(0, 40)}"` : ""}`;
  }
  function box(el) {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) };
  }
  function visible(el) {
    const r = el.getBoundingClientRect();
    // 1 px and less: text only for screen readers (sr-only), meant to be invisible.
    if (r.width <= 1 || r.height <= 1) return false;
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
      if (e.tagName === "DETAILS" && !e.open && e !== el && !el.closest("summary")) return false;
    }
    return true;
  }
  /**
   * The layer an element is drawn in: an open menu, a dialog, a bar that stays put (fixed or sticky), or the page (null).
   * Something in one layer lying over something in another is meant to be (a menu over the page, the page scrolling under a bar).
   */
  function layer(el) {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      if (e.matches("[role=dialog], [role=menu], [role=listbox], [role=tooltip], details[open] > :not(summary), header, [data-sidebar]")) return e;
      const p = getComputedStyle(e).position;
      if (p === "fixed" || p === "sticky") return e;
    }
    return null;
  }
  /** What one sees of a control: a field without a border of its own shows the frame of the label around it. */
  function frame(el) {
    if (el.matches("input, textarea, select") && parseFloat(getComputedStyle(el).borderTopWidth) === 0) {
      const l = el.closest("label");
      if (l && parseFloat(getComputedStyle(l).borderTopWidth) > 0) return l;
    }
    return el;
  }
  /** Inside a box that scrolls or clips sideways on purpose (tab rows, carousels, the code view). */
  function inScroller(el) {
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return true;
    }
    return false;
  }
  /** The part of a box one can see: a text cut off with "…" or a scroll box hides the rest of it. */
  function shown(r, el) {
    let { left, top, right, bottom } = r;
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.overflowX === "visible" && s.overflowY === "visible") continue;
      const c = e.getBoundingClientRect();
      if (s.overflowX !== "visible") { left = Math.max(left, c.left); right = Math.min(right, c.right); }
      if (s.overflowY !== "visible") { top = Math.max(top, c.top); bottom = Math.min(bottom, c.bottom); }
    }
    if (right <= left || bottom <= top) return null;
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }
  const inter = (a, b) => {
    const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return { area: x * y, cx: Math.max(a.left, b.left) + x / 2, cy: Math.max(a.top, b.top) + y / 2 };
  };

  const CONTROLS = "a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=radio], [role=checkbox], [role=combobox], [role=menuitem], [contenteditable=true]";
  const controls = [...document.querySelectorAll(CONTROLS)].filter(visible);

  // 1. The page scrolls sideways.
  const sw = document.documentElement.scrollWidth;
  if (sw > W + 1) add("overflow-x", "error", `Die Seite ist ${sw - W} px breiter als das Fenster (seitliches Scrollen).`, null);

  // 2. Things that stick out of the window on the right or left (and are not in a box that scrolls sideways).
  for (const el of document.querySelectorAll("main *, nav *, header *")) {
    if (el.children.length > 0 && !el.matches(CONTROLS)) continue;
    if (!visible(el) || inScroller(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > W + 1 || r.left < -1) add("offscreen", "error", `Ragt ${Math.round(r.right > W ? r.right - W : -r.left)} px aus dem Fenster.`, el);
  }

  // 3. Controls on top of each other: what is under the point where they meet is not what one would click.
  for (let i = 0; i < controls.length; i++) {
    const a = controls[i];
    const ra = a.getBoundingClientRect();
    for (let j = i + 1; j < controls.length; j++) {
      const b = controls[j];
      if (a.contains(b) || b.contains(a)) continue;
      const rb = b.getBoundingClientRect();
      const { area, cx, cy } = inter(ra, rb);
      const small = Math.min(ra.width * ra.height, rb.width * rb.height);
      if (area < 16 || area < small * 0.15) continue;
      if (cy < 0 || cy > H || cx < 0 || cx > W) continue;
      const top = document.elementFromPoint(cx, cy);
      if (!top) continue;
      const coverA = a.contains(top), coverB = b.contains(top);
      if (!coverA && !coverB) continue;
      const [over, under] = coverA ? [a, b] : [b, a];
      if (layer(over) !== layer(under)) continue; // a menu or bar lying over the page, as meant
      add("overlap", "error", `Liegt über ${name(under)} (${Math.round(area)} px²).`, over);
    }
  }

  // 4. Text on top of text (labels pushed into each other, a panel unfolding over the next lines).
  const texts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent.trim().length > 1 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
  for (let n = walker.nextNode(); n && texts.length < 1500; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || !visible(el) || el.closest("svg, script, style, .cm-editor, [aria-hidden=true]")) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const r = shown(range.getBoundingClientRect(), el);
    if (!r || r.width < 2 || r.height < 2) continue;
    texts.push({ el, r, top: layer(el) });
  }
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j];
      if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (a.top !== b.top) continue; // a menu over text is meant to be
      const { area } = inter(a.r, b.r);
      const small = Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
      if (area > 20 && area > small * 0.3) add("text-overlap", "error", `Text überlagert „${b.el.textContent.trim().slice(0, 30)}“.`, a.el);
    }
  }

  // 5. Text cut off without "…" (a label or button too narrow for its words).
  for (const el of document.querySelectorAll("main *, nav *, header *, [role=dialog] *")) {
    if (!visible(el) || ![...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
    const s = getComputedStyle(el);
    const clipsX = el.scrollWidth > el.clientWidth + 1 && /(hidden|clip)/.test(s.overflowX);
    const clipsY = el.scrollHeight > el.clientHeight + 2 && /(hidden|clip)/.test(s.overflowY) && !s.webkitLineClamp?.match(/\d/);
    if ((clipsX && s.textOverflow !== "ellipsis") || clipsY) add("clipped", "warn", `Text abgeschnitten (${clipsX ? "rechts" : "unten"}).`, el);
  }

  // 6. Targets too small to hit: 24 px at the least (WCAG 2.2), 44 px on touch screens (Apple, Google). Links inside a
  // running sentence are allowed to be text-sized.
  for (const el of controls) {
    if (el.matches("input[type=hidden]") || el.closest(".cm-editor")) continue;
    const r = frame(el).getBoundingClientRect();
    const inline = el.tagName === "A" && getComputedStyle(el).display === "inline" && el.parentElement && /\S/.test(el.parentElement.textContent.replace(el.textContent, ""));
    if (inline) continue;
    const min = Math.min(r.width, r.height);
    // A name or place as a link in a line of text is easy to hit sideways; a button narrower than a finger is not.
    const textLink = el.tagName === "A" && r.width >= 24 && !el.querySelector("svg, img");
    if (min < 24) add("target", textLink ? "warn" : "error", `Nur ${Math.round(r.width)}×${Math.round(r.height)} px groß (mindestens 24).`, el);
    else if (touch && min < 40) add("target-touch", "info", `${Math.round(r.width)}×${Math.round(r.height)} px auf einem Touch-Gerät (44 empfohlen).`, el);
  }

  // 7. Two different kinds of control that look the same and sit under each other (a button that looks like a search
  // field, a search field that looks like the box to write a post).
  const kind = (el) => (el.matches("input[type=search], [role=searchbox], [role=combobox]") || /such|search/i.test(el.getAttribute("placeholder") || el.getAttribute("aria-label") || "") ? "search"
    : el.matches("textarea, input, select, [contenteditable=true]") ? "field" : "button");
  const look = (el) => {
    const s = getComputedStyle(frame(el));
    return [s.borderTopColor, s.borderTopWidth, s.backgroundColor, s.borderRadius, s.borderStyle].join("|");
  };
  for (let i = 0; i < controls.length; i++) {
    for (let j = 0; j < controls.length; j++) {
      const a = controls[i], b = controls[j];
      if (i === j || kind(a) === kind(b)) continue;
      const ra = frame(a).getBoundingClientRect(), rb = frame(b).getBoundingClientRect();
      const gap = rb.top - ra.bottom;
      if (gap < 0 || gap > 28) continue;
      if (Math.abs(ra.left - rb.left) > 8 || Math.abs(ra.width - rb.width) > 12 || ra.width < 120) continue;
      if (look(a) !== look(b)) continue;
      add("lookalike", "error", `Sieht aus wie ${name(b)} direkt darunter, ist aber ${kind(a) === "button" ? "ein Knopf" : kind(a) === "search" ? "ein Suchfeld" : "ein Eingabefeld"} und das andere ${kind(b) === "button" ? "ein Knopf" : kind(b) === "search" ? "ein Suchfeld" : "ein Eingabefeld"}.`, a);
    }
  }

  // 8. The design: square corners, and a few control heights only (24 boxes, 28–48 for buttons and fields).
  const heights = new Map();
  for (const el of controls) {
    if (el.matches("input[type=checkbox], input[type=radio], input[type=range], input[type=file], input[type=color], [contenteditable=true], textarea") || el.closest(".cm-editor")) continue;
    if (el.tagName === "A" && getComputedStyle(el).display === "inline") continue;
    const h = Math.round(frame(el).getBoundingClientRect().height);
    heights.set(h, (heights.get(h) ?? 0) + 1);
    const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius);
    if (radius > 2 && !el.closest("[data-round]")) add("radius", "info", `Abgerundete Ecken (${radius} px), das Design hat eckige.`, el);
  }
  const usual = new Set([24, 28, 32, 36, 40, 44, 48, 56]);
  for (const [h, n] of heights) {
    if (!usual.has(h) && h < 64) {
      const el = controls.find((c) => Math.round(frame(c).getBoundingClientRect().height) === h);
      add("height", "info", `${n} Bedienelement(e) mit ${h} px Höhe (üblich: 28, 36, 40, 44, 48).`, el);
    }
  }

  // 9. Nothing empty that should say something: buttons without a name.
  for (const el of controls) {
    if (el.matches("input, select, textarea") || el.closest("[aria-hidden=true]")) continue;
    const label = (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim();
    if (!label && !el.querySelector("img[alt]:not([alt=''])")) add("no-name", "error", "Bedienelement ohne Namen (weder Text noch aria-label).", el);
  }

  // 10. Text that is hard to read on its background (WCAG: 4.5:1, large and bold text 3:1). Catches colours fixed for the
  // light look that stay when the page is dark.
  const rgb = (c) => { const m = /rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/.exec(c); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const behind = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.backgroundImage !== "none" && !s.backgroundImage.startsWith("linear-gradient")) return null; // a picture: cannot tell
      const c = rgb(s.backgroundColor);
      if (c && c[3] > 0.9) return c;
    }
    return rgb(getComputedStyle(document.documentElement).backgroundColor) ?? [255, 255, 255, 1];
  };
  let looked = 0;
  for (const t of texts) {
    if (looked++ > 600) break;
    const s = getComputedStyle(t.el);
    const fg = rgb(s.color), bg = behind(t.el);
    if (!fg || !bg || fg[3] < 0.5 || t.el.closest("[aria-disabled=true], :disabled, .cm-editor")) continue;
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    const ratio = (a + 0.05) / (b + 0.05);
    const size = parseFloat(s.fontSize), bold = Number(s.fontWeight) >= 700;
    const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    if (ratio < need) add("contrast", ratio < 3 ? "error" : "warn", `Kontrast ${ratio.toFixed(1)}:1 (nötig ${need}:1).`, t.el);
  }

  return out;
})();
