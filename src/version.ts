import { createRequire } from "node:module";

declare const __BUILD_VERSION__: string | undefined;

function readPackageVersion(): string {
  const require = createRequire(import.meta.url);
  const pkg = require("../package.json") as { version?: unknown };
  if (typeof pkg.version !== "string" || pkg.version.length === 0) {
    throw new Error("package.json carries no version string");
  }
  return pkg.version;
}

export const VERSION: string =
  typeof __BUILD_VERSION__ !== "undefined"
    ? __BUILD_VERSION__
    : readPackageVersion();
