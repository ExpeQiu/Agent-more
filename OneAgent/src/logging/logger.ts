import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export type Logger = {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
  child: (scope: string) => Logger;
};

export type LoggerOptions = {
  level?: LogLevel;
  file?: string;
  scope?: string;
};

function shouldLog(current: LogLevel, min: LogLevel): boolean {
  return LEVEL_ORDER[current] >= LEVEL_ORDER[min];
}

function formatLine(scope: string | undefined, level: LogLevel, message: string, meta?: Record<string, unknown>): string {
  const prefix = scope ? `[oneagent:${scope}]` : "[oneagent]";
  const metaText = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
  return `${new Date().toISOString()} ${prefix} ${level.toUpperCase()} ${message}${metaText}`;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const minLevel = options.level ?? "info";
  const filePath = options.file;
  const scope = options.scope;

  const write = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
    if (!shouldLog(level, minLevel)) {
      return;
    }
    const line = formatLine(scope, level, message, meta);
    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
    if (filePath) {
      mkdirSync(dirname(filePath), { recursive: true });
      appendFileSync(filePath, `${line}\n`, "utf8");
    }
  };

  return {
    debug: (message, meta) => write("debug", message, meta),
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta),
    child: (childScope) =>
      createLogger({
        level: minLevel,
        file: filePath,
        scope: scope ? `${scope}.${childScope}` : childScope,
      }),
  };
}
