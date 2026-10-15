// Pure checks for shared links: cleaning the address, recognising well-known providers and
// refusing addresses that must never be opened from our server or sent to people.
// Nothing here talks to the network, so it is easy to test.

export type Kind = "document" | "sheet" | "slides" | "form" | "folder" | "file" | "pdf" | "image" | "video" | "code" | "design" | "map" | "dataset" | "page";
export type Trust = "trusted" | "checked" | "caution";
/** Why a link is refused. */
export type Block = "not_a_link" | "too_long" | "credentials" | "ip_address" | "internal" | "port" | "executable" | "unsafe" | "unreachable" | "short_link" | "not_found";
/** Remarks shown with a link that was accepted. */
export type Note = "redirect" | "short_link" | "look_alike" | "odd_tld" | "archive" | "download" | "private" | "unreachable" | "official";

export type Normalized = { ok: true; url: string; host: string } | { ok: false; block: Block };

const TRACKING = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|yclid|_hsenc|_hsmi|ref_src)$/i;
const INTERNAL_SUFFIX = [".local", ".localhost", ".internal", ".lan", ".home", ".corp", ".intranet", ".test", ".invalid", ".example", ".onion"];
const EXECUTABLE = /\.(exe|msi|apk|dmg|bat|cmd|scr|jar|ps1|vbs|pkg|deb|rpm|appimage|lnk|com|sh|bin|run|iso|docm|xlsm|pptm)$/i;
const ARCHIVE = /\.(zip|rar|7z|tar|gz|tgz|bz2|xz)$/i;
const SHORTENERS = new Set(["bit.ly", "tinyurl.com", "t.co", "ow.ly", "is.gd", "buff.ly", "rebrand.ly", "cutt.ly", "shorturl.at", "rb.gy", "lnkd.in", "tiny.cc", "t.ly", "v.gd", "s.id", "urlz.fr", "trib.al", "bl.ink", "short.io", "qr.ae", "adf.ly", "clck.ru"]);
const ODD_TLD = new Set(["zip", "mov", "top", "xyz", "click", "country", "gq", "tk", "ml", "cf", "ga", "work", "support", "rest", "monster", "icu", "cam", "loan", "men", "date", "download", "racing", "review"]);

export const isShortener = (host: string) => SHORTENERS.has(host.replace(/^www\./, ""));

const hostIs = (host: string, ...domains: string[]) => domains.some((d) => host === d || host.endsWith(`.${d}`));

/** Turns what someone pasted into a clean https address, or says why not. */
export function normalizeUrl(input: string): Normalized {
  let text = input.trim();
  if (!text) return { ok: false, block: "not_a_link" };
  if (text.length > 2000) return { ok: false, block: "too_long" };
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^https?:\/\//i.test(text)) return { ok: false, block: "not_a_link" };
  if (!/^https?:\/\//i.test(text)) {
    if (/\s/.test(text) || !/^[^\s/]+\.[^\s/]{2,}(\/|$|\?|#)/.test(text)) return { ok: false, block: "not_a_link" };
    text = `https://${text}`;
  }
  let u: URL;
  try { u = new URL(text); } catch { return { ok: false, block: "not_a_link" }; }
  if (u.username || u.password) return { ok: false, block: "credentials" };
  u.protocol = "https:"; // http is upgraded; the check below shows whether the site really speaks https
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || /^\[.*\]$/.test(host) || /^(0x[0-9a-f]+|\d+)$/i.test(host)) return { ok: false, block: "ip_address" };
  if (host === "localhost" || !host.includes(".") || INTERNAL_SUFFIX.some((s) => host.endsWith(s))) return { ok: false, block: "internal" };
  if (u.port && u.port !== "443") return { ok: false, block: "port" };
  u.port = "";
  u.hostname = host;
  for (const key of [...u.searchParams.keys()]) if (TRACKING.test(key)) u.searchParams.delete(key);
  if (EXECUTABLE.test(u.pathname)) return { ok: false, block: "executable" };
  const url = u.toString().replace(/\?$/, "");
  if (url.length > 2000) return { ok: false, block: "too_long" };
  return { ok: true, url, host };
}

export type Classified = {
  provider: string;       // "drive", "maps", "github" ... or "web"
  kind: Kind;
  trusted: boolean;       // a well-known provider: we do not second-guess the host
  titleHint: string | null;
  thumbnail: string | null;
  notes: Note[];
};

const clean = (s: string) => decodeURIComponent(s).replace(/[+_]/g, " ").replace(/\s+/g, " ").trim();
const lastSegment = (path: string) => path.split("/").filter(Boolean).pop() ?? "";

/** Recognises well-known providers by host and path. officialHosts: domains of public bodies (from the admin list). */
export function classify(url: string, officialHosts: string[] = []): Classified {
  const u = new URL(url);
  const host = u.hostname.replace(/^www\./, "");
  const path = u.pathname;
  const base: Classified = { provider: "web", kind: "page", trusted: false, titleHint: null, thumbnail: null, notes: [] };
  const done = (provider: string, kind: Kind, extra: Partial<Classified> = {}): Classified => ({ ...base, provider, kind, trusted: true, ...extra });
  const ext = (path.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? "").toLowerCase();

  // Google
  if (host === "docs.google.com") {
    const id = path.match(/\/d\/([\w-]{10,})/)?.[1];
    const thumb = id ? `https://drive.google.com/thumbnail?id=${id}&sz=w800` : null;
    if (path.startsWith("/document")) return done("docs", "document", { thumbnail: thumb });
    if (path.startsWith("/spreadsheets")) return done("docs", "sheet", { thumbnail: thumb });
    if (path.startsWith("/presentation")) return done("docs", "slides", { thumbnail: thumb });
    if (path.startsWith("/forms")) return done("docs", "form");
    return done("docs", "document", { thumbnail: thumb });
  }
  if (host === "forms.gle") return done("docs", "form");
  if (host === "drive.google.com") {
    const id = path.match(/\/(?:file\/d|folders)\/([\w-]{10,})/)?.[1] ?? u.searchParams.get("id");
    if (/\/folders\//.test(path)) return done("drive", "folder");
    return done("drive", "file", { thumbnail: id ? `https://drive.google.com/thumbnail?id=${id}&sz=w800` : null, notes: path.startsWith("/uc") ? ["download"] : [] });
  }
  if (host === "maps.app.goo.gl" || (host === "goo.gl" && path.startsWith("/maps")) || hostIs(host, "maps.google.com") || (/^google\.[a-z.]+$/.test(host) && path.startsWith("/maps"))) {
    const place = path.match(/\/maps\/(?:place|search)\/([^/@]+)/)?.[1];
    return done("maps", "map", { titleHint: place ? clean(place) : null });
  }
  if (hostIs(host, "maps.apple.com") || (host === "bing.com" && path.startsWith("/maps"))) return done("maps", "map");
  if (hostIs(host, "openstreetmap.org", "osm.org", "komoot.com", "outdooractive.com", "mapillary.com", "umap.openstreetmap.fr")) return done("maps", "map");
  // Files and folders
  if (hostIs(host, "dropbox.com")) return done("dropbox", /\/(sh|scl\/fo)\//.test(path) ? "folder" : "file");
  if (host === "dl.dropboxusercontent.com") return done("dropbox", "file", { notes: ["download"] });
  if (hostIs(host, "1drv.ms", "onedrive.live.com", "sharepoint.com")) return done("onedrive", /\/f\//.test(path) || path.includes("/folders") ? "folder" : "file");
  if (hostIs(host, "icloud.com")) return done("icloud", "file");
  if (hostIs(host, "mega.nz", "mega.io")) return done("mega", "file");
  if (hostIs(host, "wetransfer.com", "we.tl")) return done("wetransfer", "file");
  if (hostIs(host, "zenodo.org", "figshare.com", "osf.io")) return done("research", "dataset");
  if (hostIs(host, "arxiv.org", "doi.org", "overleaf.com", "researchgate.net")) return done("research", "document");
  if (hostIs(host, "kaggle.com", "data.europa.eu", "govdata.de", "destatis.de")) return done("data", "dataset");
  if (host === "huggingface.co") return done("code", /^\/datasets\//.test(path) ? "dataset" : "code");
  // Code
  if (hostIs(host, "github.com", "gitlab.com", "codeberg.org", "bitbucket.org", "sr.ht", "gist.github.com", "raw.githubusercontent.com")) {
    const [owner, repo] = path.split("/").filter(Boolean);
    return done("github", "code", { titleHint: owner && repo ? `${owner}/${repo}` : owner ?? null });
  }
  // Design
  if (hostIs(host, "figma.com")) {
    const name = path.match(/\/(?:file|design|proto|board|make|slides)\/[\w-]+\/([^/?]+)/)?.[1];
    return done("figma", "design", { titleHint: name ? clean(name) : null });
  }
  if (hostIs(host, "miro.com", "canva.com", "excalidraw.com", "penpot.app", "whimsical.com", "lucid.app")) return done("design", "design");
  // Documents and notes
  if (hostIs(host, "notion.so", "notion.site", "coda.io", "cryptpad.fr", "hedgedoc.org")) return done("notes", "document");
  if (hostIs(host, "airtable.com")) return done("notes", "sheet");
  if (hostIs(host, "trello.com", "github.io")) return done("notes", "page");
  // Video
  if (host === "youtu.be" || hostIs(host, "youtube.com", "youtube-nocookie.com")) {
    const id = host === "youtu.be" ? path.slice(1).split("/")[0] : u.searchParams.get("v") ?? path.match(/\/(?:shorts|embed|live)\/([\w-]{6,})/)?.[1];
    return done("video", "video", { thumbnail: id && /^[\w-]{6,15}$/.test(id) ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null });
  }
  if (hostIs(host, "vimeo.com", "media.ccc.de", "arte.tv", "ardmediathek.de", "zdf.de")) return done("video", "video");
  // Reference, recipes, public bodies
  if (hostIs(host, "wikipedia.org", "wikimedia.org", "wikidata.org", "wikibooks.org", "wikihow.com")) return done("wiki", ext === "pdf" ? "pdf" : "page");
  if (hostIs(host, "chefkoch.de", "kochbar.de", "eatsmarter.de", "essen-und-trinken.de", "springlane.de")) return done("recipes", "page");
  if (hostIs(host, "bund.de", "europa.eu", "bundestag.de", "bundesregierung.de") || /\.gov(\.[a-z]{2})?$/.test(host) || officialHosts.some((d) => hostIs(host, d))) {
    return done("official", ext === "pdf" ? "pdf" : "page", { notes: ["official"] });
  }
  // Anything else, by the file name
  if (ext === "pdf") return { ...base, kind: "pdf" };
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext)) return { ...base, kind: "image" };
  if (["doc", "docx", "odt", "rtf", "txt", "md", "epub"].includes(ext)) return { ...base, kind: "document" };
  if (["xls", "xlsx", "ods", "csv", "tsv"].includes(ext)) return { ...base, kind: "sheet" };
  if (["ppt", "pptx", "odp", "key"].includes(ext)) return { ...base, kind: "slides" };
  if (["mp4", "webm", "mov", "mkv", "mp3", "ogg", "wav", "m4a"].includes(ext)) return { ...base, kind: "video" };
  if (["gpx", "kml", "geojson"].includes(ext)) return { ...base, kind: "map" };
  if (["json", "xml", "parquet"].includes(ext)) return { ...base, kind: "dataset" };
  if (ARCHIVE.test(path)) return { ...base, kind: "file", notes: ["archive"] };
  return { ...base, titleHint: ext ? null : lastSegment(path) ? clean(lastSegment(path)) : null };
}

/** Remarks about the address itself, independent of what the site answers. */
export function addressNotes(host: string): Note[] {
  const notes: Note[] = [];
  if (host.split(".").some((l) => l.startsWith("xn--"))) notes.push("look_alike");
  if (ODD_TLD.has(host.split(".").pop() ?? "")) notes.push("odd_tld");
  if (isShortener(host)) notes.push("short_link");
  return notes;
}

/** True for addresses that are not on the public internet. Used before every connection. */
export function isPrivateAddress(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = v.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  if (v.includes(":")) {
    return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v) || v.startsWith("2001:db8") || v.startsWith("64:ff9b");
  }
  const p = v.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = p;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 192 && b === 0 && c === 0) || (a === 192 && b === 0 && c === 2)
    || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113);
}

export const SAFETY_NOTES_CAUTION: Note[] = ["redirect", "short_link", "look_alike", "odd_tld", "archive", "download", "private", "unreachable"];
