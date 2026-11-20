import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

type Panel = {
  key(key: string, shift: boolean, control: boolean): boolean;
  frame(columns: number, rows: number): string;
  set_recording(bytes: Uint8Array): void;
  free(): void;
};
type PreviewModule = {
  default(): Promise<unknown>;
  BrowserPanel: new (bytes: Uint8Array) => Panel;
};

let runtime: Promise<PreviewModule> | undefined;
function loadRuntime() {
  const url = "/tui-preview/meridian_tui_preview.js";
  runtime ??= (import(/* @vite-ignore */ url) as Promise<PreviewModule>)
    .then(async module => { await module.default(); return module; })
    .catch(error => { runtime = undefined; throw error; });
  return runtime;
}

async function bytes(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw Error("Terminal asset could not load");
  return new Uint8Array(await response.arrayBuffer());
}

export async function mountPreview(root: HTMLElement) {
  const screen = root.querySelector<HTMLElement>("[data-screen]")!;
  const demo = root.querySelector<HTMLElement>("[data-demo]")!;
  const status = root.querySelector<HTMLElement>("[data-status]")!;
  const help = root.querySelector<HTMLElement>("[data-help]")!;
  const reset = root.querySelector<HTMLButtonElement>("[data-reset]")!;
  const choices = [...root.querySelectorAll<HTMLButtonElement>("[data-choice]")];
  const examples = [...root.querySelectorAll<HTMLElement>("[data-example]")].map(element => ({
    id: element.dataset.example!,
    label: element.dataset.label!,
    recording: element.dataset.recording,
    interactive: element.dataset.interactive === "true",
  }));
  type Example = typeof examples[number];
  const module = await loadRuntime();
  const cache = new Map<Example, Promise<[Uint8Array, Uint8Array | undefined]>>();
  const newPanel = async (example: Example) => {
    let asset = cache.get(example);
    if (!asset) {
      asset = Promise.all([
        bytes(`/tui-preview/fixtures/${example.id}.binpb`),
        example.recording ? bytes(example.recording) : undefined,
      ]);
      cache.set(example, asset);
    }
    const [descriptor, recording] = await asset.catch(error => { cache.delete(example); throw error; });
    const panel = new module.BrowserPanel(descriptor);
    try {
      if (recording) panel.set_recording(recording);
      return panel;
    } catch (error) {
      panel.free();
      throw error;
    }
  };

  let active = examples[0];
  let panel = await newPanel(active);
  const terminal = new Terminal({
    cursorBlink: false, scrollback: 0, screenReaderMode: true, fontSize: 13,
    fontFamily: "ui-monospace, monospace",
    theme: { background: "#131419", foreground: "#e9eaf3" },
  });
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  const draw = () => terminal.write(panel.frame(terminal.cols, terminal.rows));
  const describe = () => {
    for (const button of choices) button.setAttribute("aria-pressed", String(button.dataset.choice === active.id));
    status.textContent = active.label + " example loaded.";
    help.textContent = active.interactive
      ? "Focus the terminal to type. Enter submits or previews, Escape cancels, and Tab leaves the terminal."
      : "This preview displays the terminal output. Any recorded data is served locally.";
  };
  const resize = new ResizeObserver(() => { fit.fit(); draw(); });

  try {
    demo.hidden = false;
    terminal.open(screen);
    terminal.attachCustomKeyEventHandler(event => {
      if (event.key === "Tab") return false;
      if (event.type !== "keydown" || !active.interactive ||
          event.altKey || event.metaKey || event.isComposing ||
          (event.ctrlKey && event.key.toLowerCase() !== "u")) return true;
      if (!panel.key(event.key, event.shiftKey, event.ctrlKey)) return true;
      event.preventDefault();
      draw();
      return false;
    });
    fit.fit();
    draw();
    resize.observe(screen);
  } catch (error) {
    demo.hidden = true;
    resize.disconnect();
    panel.free();
    terminal.dispose();
    throw error;
  }

  const select = async (example: Example) => {
    for (const button of [...choices, reset]) button.disabled = true;
    try {
      const next = await newPanel(example);
      panel.free();
      panel = next;
      active = example;
      draw();
      describe();
    } catch {
      status.textContent = "The example could not load. Try again or open the text preview.";
    } finally {
      for (const button of [...choices, reset]) button.disabled = false;
    }
  };
  choices.forEach((button, index) => button.addEventListener("click", () => { void select(examples[index]); }));
  reset.addEventListener("click", () => { void select(active); });
  describe();
  (choices[0] ?? reset).focus();
}
