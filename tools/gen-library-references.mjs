import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const [dependencies, mode] = process.argv.slice(2);
if (!dependencies || (mode && mode !== "--check")) {
  throw new Error("Usage: node tools/gen-library-references.mjs <node_modules> [--check]");
}
const ts = createRequire(import.meta.url)(resolve(dependencies, "typescript"));
const libraries = {
  chat: "Chat",
  launchpad: "Launchpad",
  "mui-kit": "MUI kit",
  "proto-ts": "Protobuf types",
  schemas: "Schemas and runtime helpers",
};
const references = Object.entries(libraries).map(([slug, title]) => {
  const dir = resolve(dependencies, "@savvifi", "meridian-" + slug);
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const entries = [];
  const modulePatterns = [];
  for (const [specifier, conditions] of Object.entries(pkg.exports)) {
    const declaration = conditions.types;
    if (!declaration) continue;
    if (specifier.includes("*")) {
      const [prefix, suffix] = declaration.split("*");
      const modules = readdirSync(join(dir, prefix)).filter(file => file.endsWith(suffix))
        .map(file => pkg.name + specifier.slice(1).replace("*", file.slice(0, -suffix.length))).sort();
      modulePatterns.push({ specifier: pkg.name + specifier.slice(1), modules });
    } else entries.push({ specifier: pkg.name + (specifier === "." ? "" : specifier.slice(1)), path: join(dir, declaration) });
  }
  const program = ts.createProgram(entries.map(entry => entry.path), {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const entrypoints = entries.map(({ specifier, path }) => {
    const source = program.getSourceFile(path);
    const module = source && checker.getSymbolAtLocation(source);
    if (!module) throw new Error("Missing public declaration module " + path);
    const exports = checker.getExportsOfModule(module).map(symbol => {
      const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      const declarations = (target.declarations ?? []).filter(node => node.getSourceFile().fileName.startsWith(dir + "/"));
      return {
        name: symbol.name,
        description: ts.displayPartsToString(target.getDocumentationComment(checker)),
        signature: declarations.map(node => {
          if (ts.isVariableDeclaration(node)) return "const " + node.getText() + ";";
          return node.getText().replace(/^export (declare )?/, "").replace(/^declare /, "");
        }).join("\n"),
      };
    }).sort((a, b) => a.name.localeCompare(b.name, "en"));
    return { specifier, exports };
  });
  return { slug, title, package: pkg.name, version: pkg.version, entrypoints, modulePatterns };
});
const destination = new URL("../src/content/library-references.json", import.meta.url);
const rendered = JSON.stringify(references, null, 2) + "\n";
if (mode === "--check") {
  if (readFileSync(destination, "utf8") !== rendered) throw new Error("Regenerate the library references.");
} else writeFileSync(destination, rendered);
for (const library of references) console.log(library.package + "@" + library.version + " · " + library.entrypoints.map(entry => entry.exports.length).join("/") + " exports by entry point");
