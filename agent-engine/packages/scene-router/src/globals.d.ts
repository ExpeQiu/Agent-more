/**
 * Global type declarations
 */

declare const console: {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
};

declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined;
  }
}

declare const process: {
  env: NodeJS.ProcessEnv;
  exit: (code?: number) => never;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
};
