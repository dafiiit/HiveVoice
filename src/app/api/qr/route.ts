import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";

// A QR code for a link of this site. Other addresses are refused, so the route cannot be used as a general QR service.
export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("u") ?? "";
  let url: URL;
  try { url = new URL(target); } catch { return new NextResponse("Bad request", { status: 400 }); }
  const hosts = new Set([request.nextUrl.host, process.env.APP_URL ? new URL(process.env.APP_URL).host : ""]);
  if (target.length > 600 || !/^https?:$/.test(url.protocol) || !hosts.has(url.host)) return new NextResponse("Bad request", { status: 400 });
  const svg = await QRCode.toString(url.toString(), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#ffffff" } });
  return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" } });
}
