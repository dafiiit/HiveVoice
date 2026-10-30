// Is every item of a menu that just opened on top and reachable? Run in the browser, around the click that opens it:
// `remember()` before, `check()` after. The most common slip of this app: a menu that opens under a bar or the next column.
// Plain JavaScript sent as text, like checks.js.
({
  ITEMS: "a, button, input, select, textarea, summary, label, [role=menuitem], [role=option], [role=button], li",
  visible(el) {
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return false;
    // A closed <details> keeps its contents laid out, with a size, so only this tells they cannot be seen.
    if (!el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) return false;
    for (let e = el.parentElement; e; e = e.parentElement) {
      if (e.tagName === "DETAILS" && !e.open && !el.closest("summary")) return false;
    }
    return true;
  },
  remember() {
    window.__menuBefore = new Set([...document.querySelectorAll(this.ITEMS)].filter((el) => this.visible(el)));
    return true;
  },
  name(el) {
    const label = el.getAttribute("aria-label") || el.getAttribute("title") || (el.textContent || "").trim().replace(/\s+/g, " ") || el.getAttribute("placeholder") || "";
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${label ? ` "${label.slice(0, 40)}"` : ""}`;
  },
  /**
   * A box with overflow hidden or clip that cuts this element off. Scrolling would hide the fault, since people cannot scroll such a
   * box; a box that scrolls in between can bring the element back, so looking stops there, and the check on top decides afterwards.
   */
  clippedBy(el) {
    const r = el.getBoundingClientRect();
    let position = getComputedStyle(el).position;
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      if (position === "fixed") return null;
      const s = getComputedStyle(e);
      if (position === "absolute" && s.position === "static" && s.transform === "none") continue;
      position = s.position;
      if (/auto|scroll/.test(s.overflowX + s.overflowY)) return null;
      const c = e.getBoundingClientRect();
      if (/hidden|clip/.test(s.overflowX) && (r.right > c.right + 1 || r.left < c.left - 1)) return e;
      if (/hidden|clip/.test(s.overflowY) && (r.bottom > c.bottom + 1 || r.top < c.top - 1)) return e;
    }
    return null;
  },
  check() {
    const before = window.__menuBefore ?? new Set();
    const fresh = [...document.querySelectorAll(this.ITEMS)].filter((el) => !before.has(el) && this.visible(el));
    const leaves = fresh.filter((el) => !fresh.some((other) => other !== el && el.contains(other)));
    const findings = [];
    // A layer that lets clicks through still covers what is under it, so everything counts for this look.
    const style = document.createElement("style");
    style.textContent = "*{pointer-events:auto!important}";
    document.head.append(style);
    for (const el of leaves.slice(0, 80)) {
      const clip = this.clippedBy(el);
      if (clip) {
        const c = el.getBoundingClientRect();
        findings.push({ kind: "menu-covered", level: "error", text: `Wird abgeschnitten von ${this.name(clip).slice(0, 60)}.`, where: this.name(el), box: { x: Math.round(c.x), y: Math.round(c.y + scrollY), w: Math.round(c.width), h: Math.round(c.height) } });
        continue;
      }
      el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" }); // a smooth scroll would still be at its start
      const r = el.getBoundingClientRect();
      const inside = r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
      const fully = r.top >= -1 && r.left >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1;
      const add = (kind, text) => findings.push({ kind, level: "error", text, where: this.name(el), box: { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) } });
      if (!inside || !fully) { add("menu-unreachable", `Liegt außerhalb des Fensters und lässt sich nicht hineinscrollen (x ${Math.round(r.left)}, y ${Math.round(r.top)}, Fenster ${innerWidth}×${innerHeight}).`); continue; }
      const points = [[0.5, 0.5], [0.15, 0.2], [0.85, 0.2], [0.15, 0.8], [0.85, 0.8]];
      const blockers = new Set();
      for (const [fx, fy] of points) {
        const hit = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
        if (!hit || hit === el || el.contains(hit) || hit.contains(el)) continue;
        const shared = hit.closest("label, li, a, button") ;
        if (shared && shared.contains(el)) continue;
        blockers.add(hit);
      }
      if (blockers.size) add("menu-covered", `Wird überdeckt von ${[...blockers].slice(0, 2).map((b) => this.name(b)).join(", ")}.`);
    }
    style.remove();
    return { findings, newItems: leaves.length };
  },
})
