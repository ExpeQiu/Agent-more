/**
 * Node.js compatibility types
 * These allow the use of require() in environments that support it.
 * In bundler environments, this will be replaced by the bundler's module resolution.
 */
declare function require(moduleName: string): any;
