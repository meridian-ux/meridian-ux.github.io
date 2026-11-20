#!/usr/bin/env bash
set -euo pipefail
source_dir="$(cd "${1:?Usage: bash tools/capture-swiftui.sh <pinned Meridian checkout> [fixture ...]}" && pwd)"
shift
site="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "$(uname -s)" != Darwin ]]; then
  echo "SwiftUI captures require macOS with Xcode." >&2
  exit 1
fi

revision="$(cat "$site/tools/meridian-revision.txt")"
if [[ "$(git -C "$source_dir" rev-parse HEAD)" != "$revision" ]] ||
   ! git -C "$source_dir" diff --quiet HEAD; then
  echo "Use a clean checkout of Meridian at $revision." >&2
  exit 1
fi

capture_test="$source_dir/packages/swiftui/Tests/MeridianUITests/GalleryCaptureTests.swift"
if [[ -e "$capture_test" ]]; then
  echo "Capture test slot already exists: $capture_test" >&2
  exit 1
fi
staging="$(mktemp -d)"
trap 'rm -f "$capture_test"; rm -rf "$staging"' EXIT
cp "$site/tools/GalleryCaptureTests.swift" "$capture_test"

fixtures="$(python3 - "$source_dir/schemas/conformance/coverage.json" "$@" <<'PY'
import json, sys
with open(sys.argv[1]) as source:
    ids = list(json.load(source)["arms"])
wanted = list(dict.fromkeys(sys.argv[2:])) or ids
if invalid := set(wanted) - set(ids):
    raise SystemExit("Unknown fixture IDs: " + ", ".join(sorted(invalid)))
print(" ".join(wanted))
PY
)"
if [[ " $fixtures " == *" table "* ]]; then
  node --experimental-strip-types --input-type=module - "$source_dir" "$staging" <<'JS'
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [source, output] = process.argv.slice(2);
const { POPULATED_RESPONSES } = await import(pathToFileURL(join(source, "schemas/conformance/populated.ts")));
writeFileSync(join(output, "table.json"), JSON.stringify(POPULATED_RESPONSES.table));
JS
fi
(cd "$source_dir" && MERIDIAN_CAPTURE_OUTPUT="$staging" MERIDIAN_CAPTURE_FIXTURES="$fixtures" \
    swift test --filter GalleryCaptureTests/testExportNativePanels)
for id in $fixtures; do
  [[ -s "$staging/$id.png" ]]
done

destination="$site/public/captures/swiftui/$revision"
mkdir -p "$destination"
python3 - "$staging" "$destination" "$source_dir/schemas/conformance/swiftui" $fixtures <<'PY'
from pathlib import Path
import shutil
import struct
import sys

staging, destination, projections = map(Path, sys.argv[1:4])
for fixture in sys.argv[4:]:
    image = staging / (fixture + ".png")
    header = image.read_bytes()[:24]
    if header[:8] != b"\x89PNG\r\n\x1a\n" or struct.unpack(">II", header[16:24]) != (1280, 960):
        raise SystemExit("Unexpected PNG format or dimensions: " + fixture)
    projection = (projections / (fixture + ".txt")).read_text(encoding="utf-8")
    suffix = ".placeholder.png" if "This panel is not supported by this SwiftUI preview yet." in projection else ".png"
    path = destination / (fixture + suffix)
    shutil.copyfile(image, path)
    path.chmod(0o644)
PY
