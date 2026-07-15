export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    return variables[key] ?? "";
  });
}

export function resolveProfileVariables(
  definitions: Record<string, { type?: string; default?: string; enum?: string[] } | string> | undefined,
  overrides: Record<string, string> | undefined,
  fallbackTenant: string,
): Record<string, string> {
  const resolved: Record<string, string> = {
    "tenant.name": fallbackTenant,
  };

  for (const [key, definition] of Object.entries(definitions ?? {})) {
    if (typeof definition === "string") {
      resolved[key] = definition;
      continue;
    }
    resolved[key] = definition.default ?? "";
  }

  for (const [key, value] of Object.entries(overrides ?? {})) {
    resolved[key] = value;
  }

  return resolved;
}
