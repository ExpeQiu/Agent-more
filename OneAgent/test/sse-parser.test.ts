import { describe, expect, it } from "vitest";
import { parseSseBlock } from "../src/utils/sse-parser.js";

describe("sse-parser", () => {
  it("parses event and data lines", () => {
    const message = parseSseBlock("event: turn.started\ndata: {\"type\":\"turn.started\"}\n");
    expect(message?.event).toBe("turn.started");
    expect(message?.data).toBe("{\"type\":\"turn.started\"}");
  });

  it("returns undefined for empty block", () => {
    expect(parseSseBlock("   ")).toBeUndefined();
  });
});
