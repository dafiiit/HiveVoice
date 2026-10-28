import { describe, expect, it } from "vitest";
import { isBroken, withDeadline, withRetry } from "../src/lib/dbRetry";

const broken = () => Object.assign(new Error("closed"), { code: "CONNECTION_CLOSED" });

describe("a database connection that broke", () => {
  it("knows broken connections from failed queries", () => {
    expect(isBroken(broken())).toBe(true);
    expect(isBroken(Object.assign(new Error("x"), { code: "CONNECT_TIMEOUT" }))).toBe(true);
    expect(isBroken(Object.assign(new Error("x"), { code: "23505" }))).toBe(false);
    expect(isBroken(Object.assign(new Error("x"), { code: "57014" }))).toBe(false);
    expect(isBroken(new Error("plain"))).toBe(false);
    expect(isBroken(null)).toBe(false);
  });
  it("runs the work once more when it broke before it was done", async () => {
    let runs = 0;
    const out = await withRetry(async () => { if (++runs === 1) throw broken(); return "ok"; }, 0);
    expect(out).toBe("ok");
    expect(runs).toBe(2);
  });
  it("does not run it again when it broke during the commit (it may have gone through)", async () => {
    let runs = 0;
    await expect(withRetry(async (done) => { runs++; done(); throw broken(); }, 0)).rejects.toThrow("closed");
    expect(runs).toBe(1);
  });
  it("gives up after one more try, and leaves other errors alone", async () => {
    let runs = 0;
    await expect(withRetry(async () => { runs++; throw broken(); }, 0)).rejects.toThrow("closed");
    expect(runs).toBe(2);
    let other = 0;
    await expect(withRetry(async () => { other++; throw Object.assign(new Error("dup"), { code: "23505" }); }, 0)).rejects.toThrow("dup");
    expect(other).toBe(1);
  });
  it("notices work that does not answer in time, and leaves quick work alone", async () => {
    let late = 0;
    await expect(withDeadline(new Promise((r) => setTimeout(() => r("slow"), 30)), 5, () => late++)).resolves.toBe("slow");
    expect(late).toBe(1);
    await expect(withDeadline(Promise.resolve("quick"), 5, () => late++)).resolves.toBe("quick");
    await new Promise((r) => setTimeout(r, 10));
    expect(late).toBe(1);
  });
});
