import coverage from "../content/coverage.json";
import { conformanceSource } from "../content/conformance_source";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type Preview =
  | { kind: "terminal"; fixture: string; label: string; snapshot: string; recording?: string; interactive: boolean; placeholder?: string }
  | { kind: "capture"; src: string; alt: string; caption: string; width: number; height: number }
  | { kind: "placeholder"; reason: string };

export const rendererChoices = [
  { id: "tui", label: "Terminal" },
  { id: "swiftui", label: "SwiftUI" },
] as const;
export const panelExamples = Object.entries(coverage.arms).map(([id, definition]) => ({
  id,
  label: id.replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase()),
  coverage: definition.renderers,
}));
const asset = (path: string) => resolve("public/tui-preview", path);

export function terminalPreview(fixture: string, label: string, placeholder?: string): Preview {
  const snapshot = asset(`snapshots/${fixture}.txt`);
  if (!existsSync(snapshot)) return { kind: "placeholder", reason: "The terminal preview assets are unavailable in this build." };
  return {
    kind: "terminal", fixture, label, placeholder,
    snapshot: readFileSync(snapshot, "utf8"),
    recording: existsSync(asset(`recordings/${fixture}.binpb`)) ? `/tui-preview/recordings/${fixture}.binpb` : undefined,
    interactive: ["prompt", "workspace-prompt", "llm_prompt"].includes(fixture),
  };
}

export function getPreview(fixture: string, renderer: string): Preview {
  const example = panelExamples.find(entry => entry.id === fixture);
  if (example && renderer === "swiftui") {
    const prefix = `/captures/swiftui/${conformanceSource.revision}/${fixture}`;
    const snapshot = `${prefix}.png`;
    const placeholder = `${prefix}.placeholder.png`;
    const isPlaceholder = !existsSync(resolve("public" + snapshot)) && existsSync(resolve("public" + placeholder));
    if (isPlaceholder || existsSync(resolve("public" + snapshot))) {
      return {
        kind: "capture",
        src: isPlaceholder ? placeholder : snapshot,
        width: 1280,
        height: 960,
        alt: isPlaceholder
          ? `${example.label}: the SwiftUI preview displays an unsupported panel message.`
          : `${example.label} as rendered by Meridian on macOS.`,
        caption: isPlaceholder
          ? "Renderer placeholder · macOS · Light · 640 × 480 pt"
          : "Native capture · macOS · Light · 640 × 480 pt",
      };
    }
  }
  if (!example || renderer !== "tui") return { kind: "placeholder", reason: "A preview is unavailable for this renderer." };
  return terminalPreview(example.id, example.label, "reason" in example.coverage.tui ? example.coverage.tui.reason : undefined);
}
