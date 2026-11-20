import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const [dependencies, mode] = process.argv.slice(2);
if (!dependencies || (mode && mode !== "--check")) {
  throw new Error("Usage: node tools/gen-react-reference.mjs <node_modules> [--check]");
}
const require = createRequire(import.meta.url);
const ts = require(resolve(dependencies, "typescript"));
const packageDir = resolve(dependencies, "@savvifi/meridian-web-react");
const pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
const parse = (path) => ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
const index = parse(join(packageDir, pkg.exports["."].types));
const selected = new Map([
  ["MeridianProvider", "components"],
  ["PanelRenderer", "components"],
  ["ViewRenderer", "components"],
  ["MeridianContextValue", "contracts"],
  ["MeridianProviderProps", "contracts"],
  ["ShapeProps", "contracts"],
  ["ActionBarProps", "contracts"],
  ["htmlKit", "kits"],
  ["shadcnKit", "kits"],
  ["reactWebRenderer", "kits"],
]);
const groups = { components: [], contracts: [], kits: [], hooks: [] };
const seen = new Set();

function signature(node, source) {
  if (ts.isVariableStatement(node)) {
    const declaration = node.declarationList.declarations[0];
    return `const ${declaration.name.getText(source)}: ${declaration.type.getText(source)};`;
  }
  return node.getText(source).replace(/^export (declare )?/, "");
}
function description(node) {
  return ts.getJSDocCommentsAndTags(node)
    .flatMap(doc => typeof doc.comment === "string" ? [doc.comment] : [])
    .join("\n\n");
}
let slots;
for (const statement of index.statements) {
  if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier ||
      !statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;
  const source = parse(join(dirname(index.fileName), statement.moduleSpecifier.text.replace(/\.js$/, ".d.ts")));
  for (const item of statement.exportClause.elements) {
    const name = item.name.text;
    const original = (item.propertyName ?? item.name).text;
    const declarations = source.statements.filter(node => node.name?.text === original ||
      (ts.isVariableStatement(node) && node.declarationList.declarations[0]?.name.getText(source) === original));
    const first = declarations[0];
    if (!first) continue;
    if (name === "ComponentKit" && ts.isInterfaceDeclaration(first)) {
      slots = first.members.map(member => ({
        name: member.name.getText(source),
        optional: Boolean(member.questionToken),
        signature: member.getText(source),
        description: description(member),
      }));
      continue;
    }
    const component = ts.isFunctionDeclaration(first) && /^[A-Z]/.test(name) &&
      /^(ReactNode|ReactElement|(?:React\.)?JSX\.Element)\b/.test(first.type?.getText(source) ?? "");
    const group = selected.get(name) ?? (component ? "components" : name.startsWith("use") ? "hooks" : undefined);
    if (!group) continue;
    seen.add(name);
    groups[group].push({ name, description: description(first), signature: declarations.map(node => signature(node, source)).join("\n") });
  }
}
if (!slots?.length || [...selected.keys()].some(name => !seen.has(name))) {
  throw new Error("A documented React declaration is missing from the public entry point.");
}
for (const entries of Object.values(groups)) entries.sort((a, b) => a.name.localeCompare(b.name, "en"));
const destination = new URL("../src/content/react-reference.json", import.meta.url);
const rendered = JSON.stringify({ package: pkg.name, version: pkg.version, groups, slots }, null, 2) + "\n";
if (mode === "--check") {
  if (readFileSync(destination, "utf8") !== rendered) throw new Error("Regenerate the React reference.");
} else writeFileSync(destination, rendered);
console.log(`React reference: ${Object.values(groups).reduce((n, entries) => n + entries.length, 0)} exports, ${slots.length} kit members from ${pkg.name}@${pkg.version}`);
