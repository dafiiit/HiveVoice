import { describe, expect, it } from "vitest";
import { buildIcs, fold, icsText } from "../src/lib/ics";
import { fromFields, toFields, dayKey } from "../src/components/calendar/time";

describe("calendar times", () => {
  it("reads a typed date and time in Berlin, summer and winter", () => {
    expect(fromFields("2027-03-18", "19:00", "Europe/Berlin").toISOString()).toBe("2027-03-18T18:00:00.000Z");
    expect(fromFields("2027-07-01", "19:00", "Europe/Berlin").toISOString()).toBe("2027-07-01T17:00:00.000Z");
    // The night of the switch: 03:30 exists only in summer time.
    expect(fromFields("2027-03-28", "03:30", "Europe/Berlin").toISOString()).toBe("2027-03-28T01:30:00.000Z");
    expect(toFields("2027-07-01T17:00:00Z", "Europe/Berlin")).toEqual({ date: "2027-07-01", time: "19:00" });
    expect(dayKey("2027-07-01T22:30:00Z", "Europe/Berlin")).toBe("2027-07-02");
  });
});

describe("ics", () => {
  it("escapes text and folds long lines", () => {
    expect(icsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const long = "DESCRIPTION:" + "ä".repeat(80);
    const folded = fold(long);
    expect(folded.split("\r\n ").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(folded.replaceAll("\r\n ", "")).toBe(long);
  });

  it("writes events with times, whole days, cancellations and alarms", () => {
    const out = buildIcs("Test", [
      { uid: "a@x", start: new Date("2027-03-18T18:00:00Z"), minutes: 90, allDay: false, title: "Probe", place: "Saal", alarms: [1440, 60] },
      { uid: "b@x", start: new Date("2027-03-19T23:00:00Z"), minutes: 1440, allDay: true, title: "Fest", cancelled: true, alarms: [60] },
    ], "Europe/Berlin", new Date("2027-01-01T00:00:00Z"));
    expect(out).toContain("DTSTART:20270318T180000Z\r\nDTEND:20270318T193000Z");
    expect(out).toContain("TRIGGER:-PT1440M");
    expect(out).toContain("DTSTART;VALUE=DATE:20270320\r\nDTEND;VALUE=DATE:20270321");
    expect(out).toContain("STATUS:CANCELLED");
    expect(out.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(out.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
