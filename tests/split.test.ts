import { describe, expect, it } from "vitest";
import { parseAmount, parseNumber, splitCents } from "../src/lib/split";

describe("splitCents", () => {
  it("always adds up and gives left-over cents to the largest remainders, then to the first", () => {
    expect(splitCents(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(splitCents(1000, [2, 1])).toEqual([667, 333]);
    expect(splitCents(4806, [50, 50])).toEqual([2403, 2403]);
    expect(splitCents(1, [1, 1])).toEqual([1, 0]);
    expect(splitCents(1000, [0, 0])).toEqual([0, 0]);
  });
});

describe("parseAmount", () => {
  it("reads German and English ways of writing money", () => {
    expect(parseAmount("12,50")).toBe(1250);
    expect(parseAmount("12.5")).toBe(1250);
    expect(parseAmount("1.234,56")).toBe(123456);
    expect(parseAmount("1,234.56")).toBe(123456);
    expect(parseAmount("1.234")).toBe(123400);
    expect(parseAmount("7 €")).toBe(700);
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseNumber("33,3")).toBe(33.3);
  });
});
