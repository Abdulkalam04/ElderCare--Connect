import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
type PackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
) as PackageJson;
describe("package configuration", () => {
  it("contains the complete quality scripts", () => {
    expect(packageJson.scripts).toMatchObject({
      typecheck: "tsc --noEmit",
      test: "vitest run",
      "test:watch": "vitest",
      "test:coverage": "vitest run --coverage",
      check: "npm run typecheck && npm run lint && npm run test:coverage && npm run build",
    });
  });
  it("contains Vitest and V8 coverage", () => {
    expect(packageJson.devDependencies?.vitest).toBeDefined();
    expect(packageJson.devDependencies?.["@vitest/coverage-v8"]).toBeDefined();
  });
  it.each(["@vapi-ai/web", "tsconfck", "vite-tsconfig-paths"])(
    "does not contain the unused direct dependency %s",
    (dependency) => {
      expect(packageJson.dependencies?.[dependency]).toBeUndefined();
      expect(packageJson.devDependencies?.[dependency]).toBeUndefined();
    },
  );
});
