#!/usr/bin/env bash
# Run against the Meridian source checkout containing the browser TUI host.
set -euo pipefail
meridian_dir="$(cd "${1:?Usage: bash tools/build-tui-preview.sh /path/to/meridian}" && pwd)"
site_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output="$site_dir/public/tui-preview"
staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT

if [[ "$(wasm-bindgen --version)" != "wasm-bindgen 0.2.105" ]]; then
  echo "Install wasm-bindgen-cli 0.2.105, matching Meridian’s Cargo dependency." >&2
  exit 1
fi

cd "$meridian_dir"
# Rust panic locations are part of the binary. Keep workstation paths out of the public asset.
registry_root="${CARGO_HOME:-$HOME/.cargo}"
remap="$(printf "%s\037%s" "--remap-path-prefix=$meridian_dir=/src/meridian" "--remap-path-prefix=$registry_root=/cargo")"
CARGO_ENCODED_RUSTFLAGS="$remap" cargo rustc --locked --lib -p meridian-tui --release --target wasm32-unknown-unknown \
  --target-dir "$meridian_dir/target" --crate-type cdylib
wasm-bindgen --target web --no-typescript --out-dir "$staging" \
  --out-name meridian_tui_preview "$meridian_dir/target/wasm32-unknown-unknown/release/meridian_tui.wasm"
# Precompiled std carries its own panic paths, beyond rustc's remap. Replace
# their sysroot prefix without changing WASM offsets or Rust string lengths.
node --input-type=module - "$staging/meridian_tui_preview_bg.wasm" "$(rustc --print sysroot)" <<'JS'
import { readFileSync, writeFileSync } from "node:fs";
const [file, sysroot] = process.argv.slice(2);
const bytes = readFileSync(file);
const prefix = Buffer.from(sysroot);
const replacement = Buffer.alloc(prefix.length, "/");
replacement.write("/rust");
for (let at = bytes.indexOf(prefix); at !== -1; at = bytes.indexOf(prefix, at + prefix.length)) {
  replacement.copy(bytes, at);
}
if (!WebAssembly.validate(bytes)) throw new Error("Invalid browser terminal WASM.");
writeFileSync(file, bytes);
JS
cp schemas/conformance/binpb/stat.binpb "$staging/stat.binpb"
protoc -I schemas -I third_party/googleapis --encode=meridian.ui.v1.PanelDescriptor proto/panel.proto \
  < "$site_dir/src/examples/tui-preview/prompt.textproto" > "$staging/prompt.binpb"

mkdir -p "$output"
cp "$staging"/{meridian_tui_preview.js,meridian_tui_preview_bg.wasm,stat.binpb,prompt.binpb} "$output/"
