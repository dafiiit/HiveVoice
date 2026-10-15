import { describe, expect, it } from "vitest";
import { addressNotes, classify, isPrivateAddress, normalizeUrl } from "../src/lib/links/safety";

describe("normalizeUrl", () => {
  it("cleans tracking, upgrades http and adds https to bare domains", () => {
    expect(normalizeUrl("http://example.org/a?utm_source=x&id=3&fbclid=abc")).toEqual({ ok: true, url: "https://example.org/a?id=3", host: "example.org" });
    expect(normalizeUrl("example.org/rezept")).toMatchObject({ ok: true, url: "https://example.org/rezept" });
    expect(normalizeUrl("  https://Example.ORG:443/x?utm_medium=y  ")).toMatchObject({ ok: true, url: "https://example.org/x" });
  });
  it("refuses what must never be opened", () => {
    const block = (s: string) => (normalizeUrl(s) as { ok: false; block: string }).block;
    expect(block("javascript:alert(1)")).toBe("not_a_link");
    expect(block("data:text/html,hi")).toBe("not_a_link");
    expect(block("file:///etc/passwd")).toBe("not_a_link");
    expect(block("ftp://example.org/a")).toBe("not_a_link");
    expect(block("hallo welt")).toBe("not_a_link");
    expect(block("https://user:pw@example.org")).toBe("credentials");
    expect(block("https://127.0.0.1/admin")).toBe("ip_address");
    expect(block("https://[::1]/")).toBe("ip_address");
    expect(block("https://2130706433/")).toBe("ip_address");
    expect(block("https://localhost/")).toBe("internal");
    expect(block("https://intranet/")).toBe("internal");
    expect(block("https://printer.local/")).toBe("internal");
    expect(block("https://example.org:8080/")).toBe("port");
    expect(block("https://example.org/setup.exe")).toBe("executable");
    expect(block(`https://example.org/${"a".repeat(2100)}`)).toBe("too_long");
  });
});

describe("classify", () => {
  it("knows the usual places", () => {
    expect(classify("https://docs.google.com/document/d/1AbCdEfGhIjKlMn/edit")).toMatchObject({ provider: "docs", kind: "document", trusted: true });
    expect(classify("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMn/edit").kind).toBe("sheet");
    expect(classify("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMn").kind).toBe("folder");
    expect(classify("https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view").thumbnail).toContain("thumbnail?id=1AbCdEfGhIjKlMn");
    expect(classify("https://www.google.com/maps/place/Westpark,+M%C3%BCnchen/@48.1,11.5,15z")).toMatchObject({ provider: "maps", kind: "map", titleHint: "Westpark, München" });
    expect(classify("https://maps.app.goo.gl/abc123").kind).toBe("map");
    expect(classify("https://www.dropbox.com/scl/fo/abc/def?rlkey=x").kind).toBe("folder");
    expect(classify("https://github.com/supabase/supabase")).toMatchObject({ provider: "github", kind: "code", titleHint: "supabase/supabase" });
    expect(classify("https://www.figma.com/design/AbC123/Plakat-Entwurf?node-id=1")).toMatchObject({ provider: "figma", kind: "design", titleHint: "Plakat-Entwurf" });
    expect(classify("https://youtu.be/dQw4w9WgXcQ").thumbnail).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    expect(classify("https://de.wikipedia.org/wiki/Linsensuppe")).toMatchObject({ provider: "wiki", trusted: true });
    expect(classify("https://www.chefkoch.de/rezepte/1")).toMatchObject({ provider: "recipes", kind: "page" });
  });
  it("treats unknown sites as not trusted and reads the file type", () => {
    expect(classify("https://example.org/skript.pdf")).toMatchObject({ provider: "web", kind: "pdf", trusted: false });
    expect(classify("https://example.org/daten.csv").kind).toBe("sheet");
    expect(classify("https://example.org/paket.zip").notes).toContain("archive");
    expect(classify("https://example.org/seite").trusted).toBe(false);
  });
  it("trusts public bodies from the admin list", () => {
    expect(classify("https://stadt.muenchen.de/infos.pdf", ["muenchen.de"])).toMatchObject({ provider: "official", trusted: true, kind: "pdf" });
    expect(classify("https://evil-muenchen.de/", ["muenchen.de"]).trusted).toBe(false);
  });
});

describe("addressNotes", () => {
  it("warns about look-alikes, odd endings and short links", () => {
    expect(addressNotes("xn--pypal-4ve.com")).toContain("look_alike");
    expect(addressNotes("download.zip")).toContain("odd_tld");
    expect(addressNotes("bit.ly")).toContain("short_link");
    expect(addressNotes("github.com")).toEqual([]);
  });
});

describe("isPrivateAddress", () => {
  it("blocks everything that is not the public internet", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.16.0.1", "172.31.255.255", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fe80::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "140.82.121.4", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});
