import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import https from "node:https";
import zlib from "node:zlib";
import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";
import { isPrivateAddress, normalizeUrl } from "./safety";

export type Page = {
  status: number;
  url: string;                 // address after redirects
  hops: string[];              // hosts visited, first to last
  contentType: string | null;
  contentLength: number | null;
  disposition: string | null;
  body: string | null;         // start of an HTML page, else null
};

export class FetchRefused extends Error {}

const MAX_REDIRECTS = 4;
const MAX_BODY = 400_000;
const TIMEOUT = 6000;
const agent = new https.Agent({ keepAlive: false, maxSockets: 8 });

/** Resolves the name and refuses anything that is not on the public internet, at connection time (so DNS tricks do not help). */
function safeLookup(hostname: string, options: { all?: boolean }, cb: (err: Error | null, address: string | LookupAddress[], family?: number) => void) {
  dnsLookup(hostname, { all: true }, (err, addresses) => {
    if (err) return cb(err, "");
    const ok = addresses.filter((a) => !isPrivateAddress(a.address));
    if (!ok.length) return cb(new FetchRefused("private address"), "");
    if (options.all) return cb(null, ok);
    cb(null, ok[0].address, ok[0].family);
  });
}

function get(url: URL): Promise<{ res: IncomingMessage; close: () => void }> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: url.hostname, port: 443, path: `${url.pathname}${url.search}`, method: "GET", agent, lookup: safeLookup as never, timeout: TIMEOUT,
      headers: {
        "user-agent": "HiveVoiceLinkPreview/1.0 (+https://hive-voice.vercel.app)",
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        "accept-language": "de,en;q=0.8",
        "accept-encoding": "gzip, deflate, br",
      },
    }, (res) => resolve({ res, close: () => req.destroy() }));
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

/**
 * Reads the start of a public web page for its preview. Redirects are followed by hand and every hop is
 * checked again; the body is capped; nothing is stored. Throws FetchRefused or a network error.
 */
export async function fetchPage(start: string): Promise<Page> {
  let current = new URL(start);
  if (isIP(current.hostname.replace(/^\[|\]$/g, "")) || current.protocol !== "https:") throw new FetchRefused("address refused");
  const hops = [current.hostname];
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const { res, close } = await get(current);
    const status = res.statusCode ?? 0;
    const location = res.headers.location;
    if (status >= 300 && status < 400 && location) {
      close();
      const next = normalizeUrl(new URL(location, current).toString());
      if (!next.ok) throw new FetchRefused(`redirect refused: ${next.block}`);
      current = new URL(next.url);
      if (isIP(current.hostname)) throw new FetchRefused("address refused");
      hops.push(current.hostname);
      continue;
    }
    const type = (res.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase() || null;
    const length = Number(res.headers["content-length"]);
    const page: Page = {
      status, url: current.toString(), hops, contentType: type, contentLength: Number.isFinite(length) && length > 0 ? length : null,
      disposition: (res.headers["content-disposition"] as string | undefined) ?? null, body: null,
    };
    if (type && /^(text\/html|application\/xhtml\+xml)$/.test(type) && status < 400) page.body = await readStart(res, close);
    else close();
    return page;
  }
  throw new FetchRefused("too many redirects");
}

function readStart(res: IncomingMessage, close: () => void): Promise<string> {
  return new Promise((resolve) => {
    const enc = (res.headers["content-encoding"] ?? "").toString().toLowerCase();
    const stream = enc === "gzip" ? res.pipe(zlib.createGunzip()) : enc === "deflate" ? res.pipe(zlib.createInflate()) : enc === "br" ? res.pipe(zlib.createBrotliDecompress()) : res;
    const chunks: Buffer[] = [];
    let size = 0;
    const finish = () => { close(); resolve(Buffer.concat(chunks).toString("utf8")); };
    const timer = setTimeout(finish, TIMEOUT);
    stream.on("data", (c: Buffer) => {
      chunks.push(c);
      size += c.length;
      if (size >= MAX_BODY || /<\/head>/i.test(c.toString("latin1"))) { clearTimeout(timer); finish(); }
    });
    stream.on("end", () => { clearTimeout(timer); finish(); });
    stream.on("error", () => { clearTimeout(timer); finish(); });
  });
}
