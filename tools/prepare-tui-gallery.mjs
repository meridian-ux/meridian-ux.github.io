import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fromJson, toBinary } from "@bufbuild/protobuf";
import { StructSchema } from "@bufbuild/protobuf/wkt";

const [root, output] = process.argv.slice(2);
if (!root || !output) throw Error("Usage: node tools/prepare-tui-gallery.mjs <Meridian checkout> <output>");
const corpus = resolve(root, "schemas/conformance");
const coverage = JSON.parse(readFileSync(join(corpus, "coverage.json"), "utf8"));
const { POPULATED_RESPONSES } = await import(pathToFileURL(join(corpus, "populated.ts")).href);
const ids = Object.keys(coverage.arms);
if (!ids.length || ids.some(id => !/^[a-z][a-z0-9_]*$/.test(id))) throw Error("Invalid fixture IDs");

const bin = join(output, "fixtures");
const recordings = join(output, "recordings");
const snapshots = join(output, "snapshots");
for (const dir of [bin, recordings, snapshots]) mkdirSync(dir, { recursive: true });

const { default: init, BrowserPanel } = await import(pathToFileURL(resolve(output, "meridian_tui_preview.js")).href);
await init({ module_or_path: readFileSync(join(output, "meridian_tui_preview_bg.wasm")) });
const examples = [...ids.map(id => [id, join(corpus, "binpb", id + ".binpb")]), ["workspace-prompt", join(output, "workspace-prompt.binpb")]];
const recordedAssertions = { table: "Ada", gallery: "PagerDuty", resource_cards: "PagerDuty" };
for (const [id, source] of examples) {
  copyFileSync(source, join(bin, id + ".binpb"));
  const panel = new BrowserPanel(readFileSync(source));
  try {
    if (Object.hasOwn(POPULATED_RESPONSES, id)) {
      const recording = toBinary(StructSchema, fromJson(StructSchema, POPULATED_RESPONSES[id]));
      writeFileSync(join(recordings, id + ".binpb"), recording);
      panel.set_recording(recording);
    }
    const snapshot = panel.frame(80, 20)
      .replace(/\x1b\[\d+;1H/g, "\n")
      .replace(/\x1b\[[?\d;]*[A-Za-z]/g, "")
      .trim()
      .split("\n").map(line => line.trimEnd()).join("\n");
    if (!snapshot || (recordedAssertions[id] && !snapshot.includes(recordedAssertions[id]))) {
      throw Error("Missing expected terminal content for " + id);
    }
    if (!panel.frame(38, 16)) throw Error("Missing narrow terminal preview for " + id);
    writeFileSync(join(snapshots, id + ".txt"), snapshot + "\n");
  } finally {
    panel.free();
  }
}
const interactive = new BrowserPanel(readFileSync(join(bin, "workspace-prompt.binpb")));
try {
  interactive.frame(60, 18);
  for (const key of "Orion") interactive.key(key, false, false);
  if (!interactive.frame(60, 18).includes("Orion")) throw Error("Prompt did not accept input");
  interactive.key("Enter", false, false);
  if (!interactive.frame(60, 18).includes("Submitted.")) throw Error("Prompt did not submit");
} finally {
  interactive.free();
}
console.log(`Built and exercised ${ids.length} TUI shapes and the guide prompt.`);
