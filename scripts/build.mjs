// Build dist/ from src/ without TypeScript installed.
//
// The source only uses erasable TypeScript syntax (tsconfig: erasableSyntaxOnly),
// so Node's built-in type stripper turns it into plain JavaScript. This lets
// `npm install -g github:Pug-03/AI-Headroom` build the package even when npm
// skips devDependencies. `npm run typecheck` still uses tsc during development.
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");
const out = join(root, "dist");

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });

// Relative "./x.ts" specifiers become "./x.js" in the output.
const rewrite = (code) => code.replace(/((?:from\s+|import\()\s*)(["'])(\.{1,2}\/[^"']+)\.ts\2/g, "$1$2$3.js$2");

/** Map of dist-relative path -> JavaScript, for every file in src/. */
export function compile() {
  const files = new Map();
  for (const file of walk(src)) {
    const js = rewrite(stripTypeScriptTypes(readFileSync(file, "utf8"), { mode: "strip" }));
    files.set(relative(src, file).replace(/\.ts$/, ".js"), js);
  }
  return files;
}

// dist/ is committed so `npm install -g github:…` works without running scripts
// (npm 11 blocks install scripts for global installs). A test checks it is current.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  rmSync(out, { recursive: true, force: true });
  for (const [rel, js] of compile()) {
    const dest = join(out, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, js);
  }
  chmodSync(join(out, "cli.js"), 0o755);
  console.log(`built ${relative(root, out)}/`);
}
