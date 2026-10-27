import { expect, test } from "@playwright/test";
import { login } from "./auth";

const signedIn = !!process.env.TEST_USER_EMAIL;

// What a page costs on the wire. The text catalog used to travel inside every page (three quarters of the 200 KB); now it is part of
// the program files, which the browser keeps, and a page is 50 to 65 KB before compression. These limits keep it that way.
test.describe("what a page weighs", () => {
  test.skip(!signedIn, "needs a test account");
  test.skip(!process.env.E2E_BASE_URL, "sizes are only meaningful in a production build (E2E_BASE_URL)");

  for (const [path, limit] of [["/friends", 80_000], ["/me/notes", 80_000], ["/community", 80_000]] as const) {
    test(`${path} stays under ${limit / 1000} KB of HTML (uncompressed)`, async ({ page }, info) => {
      test.skip(info.project.name !== "desktop", "same page on both");
      await login(page);
      const res = await page.request.get(path, { headers: { "accept-encoding": "identity" } });
      expect(res.status()).toBe(200);
      const bytes = (await res.body()).length;
      info.annotations.push({ type: "bytes", description: String(bytes) });
      expect(bytes, `${path} is ${bytes} bytes`).toBeLessThan(limit);
    });
  }

  test("asking whether anything changed costs a few bytes, not a page", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "same on both");
    await login(page);
    const res = await page.request.get("/api/stamp?scope=friends");
    expect(res.status()).toBe(200);
    expect((await res.body()).length).toBeLessThan(200);
  });
});
