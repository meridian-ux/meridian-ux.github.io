import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

type Example = "stat" | "prompt";
type Panel = {
  key(key: string, shift: boolean, control: boolean): boolean;
  frame(columns: number, rows: number): string;
  free(): void;
};
type PreviewModule = {
  default(): Promise<unknown>;
  BrowserPanel: new (bytes: Uint8Array) => Panel;
};
type Options = {
  screen: HTMLElement;
  demo: HTMLElement;
  choices: HTMLButtonElement[];
  reset: HTMLButtonElement;
  status: HTMLElement;
};

async function fixture(name: Example) {
  const response = await fetch(`/tui-preview/${name}.binpb`);
  if (!response.ok) throw new Error("Terminal fixture could not load");
  return new Uint8Array(await response.arrayBuffer());
}

export async function mountPreview({ screen, demo, choices, reset, status }: Options) {
  const moduleUrl = "/tui-preview/meridian_tui_preview.js";
  const [runtime, stat, prompt] = await Promise.all([
    import(/* @vite-ignore */ moduleUrl) as Promise<PreviewModule>,
    fixture("stat"),
    fixture("prompt"),
  ]);
  await runtime.default();

  const fixtures = { stat, prompt };
  const terminal = new Terminal({
    cursorBlink: false,
    scrollback: 0,
    screenReaderMode: true,
    fontSize: 13,
    fontFamily: "ui-monospace, monospace",
    theme: { background: "#131419", foreground: "#e9eaf3" },
  });
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  let active: Example = "stat";
  let panel = new runtime.BrowserPanel(stat);

  const draw = () => terminal.write(panel.frame(terminal.cols, terminal.rows));
  const select = (example: Example) => {
    const next = new runtime.BrowserPanel(fixtures[example]);
    panel.free();
    panel = next;
    active = example;
    for (const button of choices) button.setAttribute("aria-pressed", String(button.dataset.example === active));
    status.textContent = example === "stat" ? "Stat example loaded." : "Prompt example loaded. Focus the terminal to type.";
    draw();
  };
  const resize = new ResizeObserver(() => { fit.fit(); draw(); });

  try {
    demo.hidden = false;
    terminal.open(screen);
    terminal.attachCustomKeyEventHandler(event => {
      if (event.key === "Tab") return false;
      if (event.type !== "keydown" || active !== "prompt" ||
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
    resize.disconnect();
    panel.free();
    terminal.dispose();
    throw error;
  }
  for (const button of choices) {
    button.addEventListener("click", () => select(button.dataset.example === "prompt" ? "prompt" : "stat"));
  }
  reset.addEventListener("click", () => select(active));
  status.textContent = "Stat example loaded.";
  choices[0]?.focus();
}
