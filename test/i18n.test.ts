import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_LANGUAGE, normalizeLanguage, t } from "../src/i18n.ts";

test("defaults to English and supports Chinese labels", () => {
  assert.equal(DEFAULT_LANGUAGE, "en");
  assert.equal(normalizeLanguage(null), "en");
  assert.equal(normalizeLanguage("zh"), "zh");
  assert.equal(t("en", "nav.repositories"), "Repositories");
  assert.equal(t("zh", "nav.repositories"), "镜像仓库");
});
