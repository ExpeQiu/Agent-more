/**
 * Schema Converter: OpenClaw Skill Schema → MCP JSON Schema
 * @package @enterprise-claw/skill-adapter
 *
 * OpenClaw Skill uses a simplified schema format.
 * This converter maps it to JSON Schema draft-07 for MCP compatibility.
 */

import type {
  OpenClawSkill,
  OpenClawInputSchema,
  OpenClawProperty,
  MCPSchema,
} from './types';

/**
 * Convert OpenClaw Skill input schema to MCP-compatible JSON Schema
 */
export function convertSkillInputToMCPSchema(skill: OpenClawSkill): MCPSchema {
  const input = skill.inputSchema as OpenClawInputSchema;
  const properties: Record<string, unknown> = {};
  const required: string[] = input.required ?? [];

  for (const [key, prop] of Object.entries(input.properties)) {
    properties[key] = convertProperty(prop);
  }

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
    additionalProperties: false,
  };
}

function convertProperty(prop: OpenClawProperty): unknown {
  const result: Record<string, unknown> = {};

  switch (prop.type) {
    case 'string':
      result.type = 'string';
      if (prop.format) result.format = prop.format;
      if (prop.pattern) result.pattern = prop.pattern;
      if (prop.minLength !== undefined) result.minLength = prop.minLength;
      if (prop.maxLength !== undefined) result.maxLength = prop.maxLength;
      if (prop.enum) result.enum = prop.enum;
      break;

    case 'number':
      result.type = 'number';
      if (prop.minimum !== undefined) result.minimum = prop.minimum;
      if (prop.maximum !== undefined) result.maximum = prop.maximum;
      break;

    case 'boolean':
      result.type = 'boolean';
      break;

    case 'array':
      result.type = 'array';
      if (prop.items) result.items = convertProperty(prop.items);
      break;

    case 'object':
      result.type = 'object';
      if (prop.items) {
        const objProps: Record<string, unknown> = {};
        const subProps = prop.items as OpenClawProperty;
        if (subProps.properties) {
          for (const [k, v] of Object.entries(subProps.properties)) {
            objProps[k] = convertProperty(v);
          }
        }
        result.properties = objProps;
      }
      break;

    case 'file':
      // OpenClaw file type → MCP uses string (path or URL)
      result.type = 'string';
      result.description = prop.description ?? 'File path or URL';
      break;

    case 'select':
      // OpenClaw select → MCP enum
      result.type = 'string';
      if (prop.enum) result.enum = prop.enum;
      break;

    default:
      result.type = 'string';
  }

  if (prop.description) result.description = prop.description;
  if (prop.default !== undefined) result.default = prop.default;

  return result;
}

/**
 * Validate input against MCP-compatible schema
 */
export function validateInput(
  input: Record<string, unknown>,
  schema: MCPSchema
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const properties = schema.properties as Record<string, unknown> | undefined;
  const required = (schema.required as string[] | undefined) ?? [];

  // Check required fields
  for (const field of required) {
    if (!(field in input) || input[field] === undefined || input[field] === null || input[field] === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Type check each provided field
  if (properties) {
    for (const [key, value] of Object.entries(input)) {
      if (!(key in properties)) {
        errors.push(`Unknown field: ${key}`);
        continue;
      }
      const propSchema = properties[key] as Record<string, unknown>;
      const expectedType = propSchema.type as string | undefined;

      if (expectedType && value !== null && value !== undefined) {
        const jsType = Array.isArray(value) ? 'array' : typeof value;
        if (jsType !== expectedType) {
          errors.push(`Field "${key}" expected type ${expectedType}, got ${jsType}`);
        }
      }

      // Enum check
      if (propSchema.enum && Array.isArray(propSchema.enum) && !propSchema.enum.includes(value)) {
        errors.push(`Field "${key}" must be one of: ${(propSchema.enum as unknown[]).join(', ')}`);
      }

      // String constraints
      if (expectedType === 'string' && typeof value === 'string') {
        const minLength = propSchema.minLength as number | undefined;
        const maxLength = propSchema.maxLength as number | undefined;
        const pattern = propSchema.pattern as string | undefined;

        if (minLength !== undefined && value.length < minLength) {
          errors.push(`Field "${key}" must be at least ${minLength} characters`);
        }
        if (maxLength !== undefined && value.length > maxLength) {
          errors.push(`Field "${key}" must be at most ${maxLength} characters`);
        }
        if (pattern && !new RegExp(pattern).test(value)) {
          errors.push(`Field "${key}" does not match pattern: ${pattern}`);
        }
      }

      // Number constraints
      if (expectedType === 'number' && typeof value === 'number') {
        const min = propSchema.minimum as number | undefined;
        const max = propSchema.maximum as number | undefined;
        if (min !== undefined && value < min) {
          errors.push(`Field "${key}" must be >= ${min}`);
        }
        if (max !== undefined && value > max) {
          errors.push(`Field "${key}" must be <= ${max}`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
