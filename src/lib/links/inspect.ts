import "server-only";
import { addressNotes, classify, isShortener, normalizeUrl, SAFETY_NOTES_CAUTION, type Block, type Kind, type Note, type Trust } from "./safety";
import { fetchPage, FetchRefused, type Page } from "./fetch";

export type Preview = { title: string | null; description: string | null; image: string | null; site: string | null; mime: string | null; bytes: number | null; filename: string | null };

export type Inspection =
  | { ok: true; url: string; host: string; provider: string; kind: Kind; trust: Trust; notes: Note[]; preview: Preview; suggestedTitle: string }
  | { ok: false; block: Block };

const decode = (s: string) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, n) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[n as "amp"]);
const tidy = (s: string | null | undefined, max: number) => {
  const t = decode(s ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

/** Looks up a meta tag in the start of a page, whichever way round name/property and content are written. */
function meta(html: string, ...names: string[]) {
  for (const name of names) {
    const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*?content=["']([^"']*)["']`, "i"));
    const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*?(?:property|name)=["']${name}["']`, "i"));
    const v = a?.[1] ?? b?.[1];
    if (v) return v;
  }
  return null;
}

function readHtml(page: Page): Preview {
  const html = page.body ?? "";
  const head = html.slice(0, 120_000);
  const title = tidy(meta(head, "og:title", "twitter:title") ?? head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1], 200);
  const description = tidy(meta(head, "og:description", "twitter:description", "description"), 500);
  let image: string | null = null;
  const raw = meta(head, "og:image:secure_url", "og:image", "twitter:image");
  if (raw) {
    try {
      const u = new URL(decode(raw), page.url);
      if (u.protocol === "https:" && u.hostname.includes(".") && !/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)) image = u.toString().slice(0, 1000);
    } catch { /* ignore a broken image address */ }
  }
  return { title, description, image, site: tidy(meta(head, "og:site_name"), 80), mime: page.contentType, bytes: page.contentLength, filename: null };
}

const filenameOf = (page: Page) => {
  const d = page.disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1];
  const name = d ?? new URL(page.url).pathname.split("/").filter(Boolean).pop() ?? null;
  try { return name ? decodeURIComponent(name).slice(0, 160) : null; } catch { return name; }
};

/** Optional extra check against Google Safe Browsing (set SAFE_BROWSING_API_KEY). Fails open: a lookup problem never blocks. */
async function knownBad(urls: string[]): Promise<boolean> {
  const key = process.env.SAFE_BROWSING_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client: { clientId: "hivevoice", clientVersion: "1.0" },
        threatInfo: {
          threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
          platformTypes: ["ANY_PLATFORM"], threatEntryTypes: ["URL"], threatEntries: urls.map((url) => ({ url })),
        },
      }),
      signal: AbortSignal.timeout(4000),
    });
    const body = (await res.json()) as { matches?: unknown[] };
    return Array.isArray(body.matches) && body.matches.length > 0;
  } catch {
    return false;
  }
}

/**
 * Everything we want to know before a link is shared: is it allowed, what is it, how much do we trust it,
 * and what does it look like. The page is read for its preview only and not kept.
 */
export async function inspectLink(input: string, officialHosts: string[] = []): Promise<Inspection> {
  const norm = normalizeUrl(input);
  if (!norm.ok) return norm;
  let url = norm.url;
  let host = norm.host;
  const notes = new Set<Note>(addressNotes(host));
  let c = classify(url, officialHosts);
  c.notes.forEach((n) => notes.add(n));

  let page: Page | null = null;
  try {
    page = await fetchPage(url);
  } catch (e) {
    if (e instanceof FetchRefused && /private|refused/.test(e.message)) return { ok: false, block: "internal" };
    if (!c.trusted) return { ok: false, block: "unreachable" };
    notes.add("unreachable");
  }

  if (page) {
    if (page.status === 404 || page.status === 410) return { ok: false, block: "not_found" };
    if (page.status === 401 || page.status === 403) notes.add("private");
    else if (page.status >= 500) notes.add("unreachable");
    const final = new URL(page.url);
    const finalHost = final.hostname.replace(/^www\./, "");
    // Landed on a sign-in page: the file is not public. Its title would only say "Sign in".
    if (/^(accounts|login|auth|sso|id)\./.test(finalHost) || /\/(login|signin|sign-in|sso|auth)(\/|$)/i.test(final.pathname)) {
      notes.add("private");
      page = { ...page, body: null, contentType: null };
    }
    if (finalHost !== host.replace(/^www\./, "")) {
      if (isShortener(host)) {
        // A short link hides where it leads: show and keep the real destination instead.
        const real = normalizeUrl(page.url);
        if (!real.ok || isShortener(real.host)) return { ok: false, block: "short_link" };
        url = real.url;
        host = real.host;
        c = classify(url, officialHosts);
        c.notes.forEach((n) => notes.add(n));
        addressNotes(host).filter((n) => n !== "short_link").forEach((n) => notes.add(n));
        notes.add("short_link");
      } else {
        // A well-known provider forwarding inside its own family (youtu.be to youtube.com) is normal.
        const same = classify(page.url, officialHosts);
        if (!(c.trusted && same.trusted && same.provider === c.provider) && !(c.trusted && /(^|\.)(google|googleusercontent|youtube)\.com$/.test(finalHost))) notes.add("redirect");
      }
    }
    if (page.contentType && /^application\/(octet-stream|x-msdownload|x-dosexec|vnd\.microsoft\.portable-executable|x-apple-diskimage|vnd\.android\.package-archive|x-sh)$/.test(page.contentType)) {
      if (/executable|x-dosexec|msdownload|portable|apple-diskimage|android|x-sh/.test(page.contentType)) return { ok: false, block: "executable" };
      notes.add("download");
    }
    if (page.contentType && /^application\/(zip|x-rar|x-7z|gzip|x-tar)/.test(page.contentType)) notes.add("archive");
    if (page.disposition && /attachment/i.test(page.disposition)) notes.add("download");
    if (page.contentType === "application/pdf" && (c.kind === "page" || c.kind === "document")) c = { ...c, kind: "pdf" };
    if (page.contentType?.startsWith("image/") && c.kind === "page") c = { ...c, kind: "image" };
    if (page.contentType?.startsWith("video/") && c.kind === "page") c = { ...c, kind: "video" };
  }

  if (await knownBad(page ? [url, page.url] : [url])) return { ok: false, block: "unsafe" };

  const preview: Preview = page?.body ? readHtml(page) : { title: null, description: null, image: null, site: null, mime: page?.contentType ?? null, bytes: page?.contentLength ?? null, filename: page ? filenameOf(page) : null };
  if (!preview.image && c.thumbnail) preview.image = c.thumbnail;
  if (page && !page.body) { preview.mime = page.contentType; preview.bytes = page.contentLength; preview.filename = filenameOf(page); }

  const cautious = [...notes].some((n) => SAFETY_NOTES_CAUTION.includes(n));
  const trust: Trust = cautious ? "caution" : c.trusted ? "trusted" : "checked";
  // Maps and Figma pages all call themselves "Google Maps" or "Figma": the name in the address is better.
  const generic = c.titleHint && (c.provider === "maps" || c.provider === "figma" || c.provider === "github");
  const cleaned = preview.title?.replace(/^GitHub\s*[-–]\s*/, "").replace(/\s*[·|-]\s*GitHub$/, "") ?? null;
  const suggestedTitle = (generic ? c.titleHint : null) ?? cleaned ?? c.titleHint ?? preview.filename ?? host.replace(/^www\./, "");
  return { ok: true, url, host, provider: c.provider, kind: c.kind, trust, notes: [...notes], preview, suggestedTitle: suggestedTitle.slice(0, 200) };
}
