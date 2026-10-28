// Reading what a Nextcloud answers, and refusing addresses and paths that lead somewhere they should not.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../src/lib/db", () => ({ asViewer: vi.fn(), sql: vi.fn() }));

const nc = await import("../src/lib/nextcloud");

describe("nextcloud", () => {
  it("reads every date of an expanded series, all-day dates and escaped text", () => {
    const ics = [
      "BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:a", "DTSTART:20261028T180000Z", "DTEND:20261028T200000Z", "SUMMARY:Chorprobe\\, Saal", "LOCATION:Pfarr", " saal", "RECURRENCE-ID:20261028T180000Z", "END:VEVENT",
      "BEGIN:VEVENT", "UID:a", "DTSTART:20261104T180000Z", "DURATION:PT1H30M", "SUMMARY:Chorprobe", "END:VEVENT",
      "BEGIN:VEVENT", "UID:b", "DTSTART;VALUE=DATE:20261101", "SUMMARY:Feiertag", "END:VEVENT",
      "BEGIN:VEVENT", "UID:c", "DTSTART:20261102T100000Z", "STATUS:CANCELLED", "SUMMARY:Fällt aus", "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    const list = nc.parseEvents(ics);
    expect(list.map((d) => [d.title, d.start, d.end, d.allDay])).toEqual([
      ["Chorprobe, Saal", "2026-10-28T18:00:00.000Z", "2026-10-28T20:00:00.000Z", false],
      ["Feiertag", "2026-11-01T00:00:00.000Z", "2026-11-02T00:00:00.000Z", true],
      ["Chorprobe", "2026-11-04T18:00:00.000Z", "2026-11-04T19:30:00.000Z", false],
    ]);
    expect(list[0].place).toBe("Pfarrsaal");
  });

  it("reads WebDAV answers: only properties that were found, entities decoded", () => {
    const xml = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/remote.php/dav/calendars/ada/garten%20kalender/</d:href><d:propstat><d:prop><d:displayname>Garten &amp; Hof</d:displayname><d:resourcetype><d:collection/><cal:calendar/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat><d:propstat><d:prop><d:getcontenttype/></d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat></d:response></d:multistatus>`;
    const [r] = nc.multistatus(xml);
    expect(r.href).toBe("/remote.php/dav/calendars/ada/garten kalender/");
    expect(r.value("displayname")).toBe("Garten & Hof");
    expect(r.has("calendar")).toBe(true);
    expect(r.value("getcontenttype")).toBeNull();
  });

  it("never leaves the chosen folder", () => {
    expect(nc.davPath("Fotos/Garten", "Beet 1.jpg")).toBe("Fotos/Garten/Beet%201.jpg");
    expect(() => nc.davPath("Fotos", "../geheim.txt")).toThrow("invalid_path");
    expect(() => nc.davPath("Fotos/./x")).toThrow("invalid_path");
  });

  it("takes public https addresses only (outside development)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(nc.checkServer("http://cloud.example.org")).rejects.toThrow("invalid_server");
    await expect(nc.checkServer("https://127.0.0.1")).rejects.toThrow("invalid_server");
    await expect(nc.checkServer("https://192.168.1.20/nextcloud")).rejects.toThrow("invalid_server");
    await expect(nc.checkServer("https://[::1]")).rejects.toThrow("invalid_server");
    await expect(nc.checkServer("https://user:pw@1.1.1.1")).rejects.toThrow("invalid_server");
    expect(await nc.checkServer("1.1.1.1/nextcloud/index.php/login")).toBe("https://1.1.1.1/nextcloud");
    vi.stubEnv("NEXTCLOUD_ALLOW_PRIVATE", "1");
    expect(await nc.checkServer("http://192.168.1.20")).toBe("http://192.168.1.20");
    vi.unstubAllEnvs();
  });
});
