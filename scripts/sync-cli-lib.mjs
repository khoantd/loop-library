import { copyFile, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptsDir = path.join(root, "scripts");
const libDir = path.join(root, "src", "lib");

const files = ["catalog-loop-to-answers.mjs", "compile-loop-draft.mjs"];

await mkdir(libDir, { recursive: true });

for (const file of files) {
  const sourcePath = path.join(scriptsDir, file);
  const targetPath = path.join(libDir, file);
  await copyFile(sourcePath, targetPath);
}

if (process.argv.includes("--verify")) {
  let failed = false;

  for (const file of files) {
    const [source, target] = await Promise.all([
      readFile(path.join(scriptsDir, file), "utf8"),
      readFile(path.join(libDir, file), "utf8"),
    ]);

    if (source !== target) {
      console.error(`CLI lib drift: src/lib/${file} does not match scripts/${file}`);
      failed = true;
    }
  }

  if (failed) {
    process.exit(1);
  }

  console.log(`Verified ${files.length} CLI lib files match scripts/.`);
}
