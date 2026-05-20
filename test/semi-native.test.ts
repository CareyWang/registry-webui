import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("app does not use custom visual wrapper components", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  for (const componentName of ["PageFrame", "FieldLabel", "MetricCard", "LanguageSwitcher"]) {
    assert.equal(source.includes(componentName), false, `${componentName} should be replaced by Semi components`);
  }
});
