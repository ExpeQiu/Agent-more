import { describe, expect, it } from "vitest";
import { expandCapabilityPatterns } from "../src/profile/task-enricher.js";

describe("task-enricher", () => {
  it("expands wildcard capability patterns", () => {
    const allIds = ["http_fetch", "skill_activate", "skillforge.lint", "skillforge.format"];
    const allowed = expandCapabilityPatterns(allIds, ["skillforge.*", "skill_activate"]);
    expect(allowed).toEqual(["skillforge.lint", "skillforge.format", "skill_activate"]);
  });
});
