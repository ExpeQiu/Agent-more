import { describe, expect, it } from "vitest";
import { renderTemplate, resolveProfileVariables } from "../src/profile/template-renderer.js";

describe("template-renderer", () => {
  it("renders persona variables", () => {
    const text = renderTemplate("Hello {{tenant.name}} / {{style.tone}}", {
      "tenant.name": "Acme",
      "style.tone": "严谨",
    });
    expect(text).toBe("Hello Acme / 严谨");
  });

  it("resolves defaults and overrides", () => {
    const vars = resolveProfileVariables(
      {
        "style.tone": { default: "友好", enum: ["严谨", "友好"] },
      },
      { "style.tone": "严谨" },
      "default-tenant",
    );
    expect(vars["tenant.name"]).toBe("default-tenant");
    expect(vars["style.tone"]).toBe("严谨");
  });
});
