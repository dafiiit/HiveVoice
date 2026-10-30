import { describe, expect, it } from "vitest";
import { acceptReport, clean, deviceOf, isPoor, routeOf } from "../src/lib/report";

describe("reports", () => {
  it("takes what names somebody out of error texts", () => {
    expect(clean("no user anna@example.org with 7ee2cdaf-6661-4c62-b5ba-7c26bf600653 at https://x.de/a?token=geheim phone 01761234567"))
      .toBe("no user [mail] with [id] at https://x.de/a phone [n]");
    expect(clean("x".repeat(500))).toHaveLength(300);
  });

  it("keeps the route and drops the personal part of the address", () => {
    expect(routeOf("/community/listings?q=fahrrad")).toBe("/community/listings");
    expect(routeOf("/groups/wg-lindwurm/tools")).toBe("/groups/:id/tools");
    expect(routeOf("/profile/mia-schuster")).toBe("/profile/:id");
    expect(routeOf("/events/7ee2cdaf-6661-4c62-b5ba-7c26bf600653")).toBe("/events/:id");
    expect(routeOf("/")).toBe("/");
  });

  it("knows the device class and nothing more", () => {
    expect(deviceOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("ios");
    expect(deviceOf("Mozilla/5.0 (Linux; Android 15; Pixel 7)")).toBe("android");
    expect(deviceOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("desktop");
  });

  it("accepts only known shapes, whatever a browser sends", () => {
    expect(acceptReport({ kind: "vital", name: "LCP", value: 2100, path: "/me?x=1", device: "ios" })).toEqual({ kind: "vital", name: "LCP", value: 2100, path: "/me", device: "ios" });
    expect(acceptReport({ kind: "vital", name: "Anything", value: 1, path: "/" })).toBeNull();
    expect(acceptReport({ kind: "vital", name: "LCP", value: -1, path: "/" })).toBeNull();
    expect(acceptReport({ kind: "server-error", name: "forged", path: "/" })).toBeNull();
    expect(acceptReport({ kind: "browser-error", name: "boom", path: "/", device: "toaster" })?.device).toBe("desktop");
    expect(acceptReport("nonsense")).toBeNull();
  });

  it("marks bad measurements", () => {
    expect(isPoor("INP", 600)).toBe(true);
    expect(isPoor("INP", 100)).toBe(false);
    expect(isPoor("unknown", 1e9)).toBe(false);
  });
});
