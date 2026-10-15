import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate, sourceModule, main } from "./sync_conformance.mjs";
const fixture = () => JSON.parse(readFileSync(new URL("../src/content/coverage.json", import.meta.url), "utf8"));
test("the imported canonical snapshot is complete", () => assert.ok(validate(fixture())));
test("missing renderer cells fail rather than disappearing from a table", () => {
  const manifest = fixture();
  delete manifest.arms.table.renderers.swiftui;
  assert.throws(() => validate(manifest), /incomplete renderer/);
});
test("missing modality cells fail", () => {
  const manifest = fixture();
  delete manifest.modalities.conversation.arms.tool.renderers["chat-react"];
  assert.throws(() => validate(manifest), /incomplete renderer/);
});
test("unknown statuses and unexplained gaps fail", () => {
  const manifest = fixture();
  manifest.arms.table.renderers.swiftui.status = "probably";
  assert.throws(() => validate(manifest), /unknown status/);
  manifest.arms.table.renderers.swiftui.status = "unverified";
  delete manifest.arms.table.renderers.swiftui.reason;
  assert.throws(() => validate(manifest), /needs reason/);
});
test("provenance requires an immutable full revision", () => {
  assert.throws(() => sourceModule("main"), /full Git commit/);
  assert.match(sourceModule("a".repeat(40)), /meridian-ux\/meridian/);
});
test("offline imports cannot invent missing provenance", async () => {
  await assert.rejects(main(["--manifest", "some.json"]), /requires its source --revision/);
});
