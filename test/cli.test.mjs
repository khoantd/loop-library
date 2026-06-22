import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

import { catalogLoopToAnswers } from "../src/lib/catalog-loop-to-answers.mjs";
import { findLoop, getLoops, loadCatalog } from "../src/catalog.mjs";
import { recommendLoops, searchLoops } from "../src/search.mjs";
import { runCli } from "../src/cli.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const binPath = path.join(root, "bin", "loop-library.mjs");

async function runBin(args) {
  const { stdout, stderr } = await execFileAsync(process.execPath, [binPath, ...args], {
    cwd: root,
    env: process.env,
  });

  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

test("loadCatalog returns bundled catalog with loops", async () => {
  const { catalog, source } = await loadCatalog();
  assert.equal(source, "bundled");
  assert.ok(Array.isArray(catalog.loops));
  assert.ok(catalog.loops.length >= 31);
});

test("recommend returns at most 3 results sorted by score", async () => {
  const { catalog } = await loadCatalog();
  const payload = recommendLoops(catalog.loops, "documentation drift");

  assert.ok(payload.recommendations.length <= 3);
  assert.ok(payload.recommendations.length > 0);

  for (let index = 1; index < payload.recommendations.length; index += 1) {
    assert.ok(
      payload.recommendations[index - 1].score >=
        payload.recommendations[index].score,
    );
  }
});

test("documentation drift recommends overnight-docs-sweep in top 3", async () => {
  const { catalog } = await loadCatalog();
  const payload = recommendLoops(catalog.loops, "documentation drift");
  const slugs = payload.recommendations.map((item) => item.slug);

  assert.ok(slugs.includes("overnight-docs-sweep"));
});

test("show resolves slug and number to the same loop", async () => {
  const { catalog } = await loadCatalog();
  const bySlug = findLoop(catalog, "overnight-docs-sweep");
  const byNumber = findLoop(catalog, "001");

  assert.ok(bySlug);
  assert.ok(byNumber);
  assert.equal(bySlug.slug, byNumber.slug);
});

test("list filters by engineering category", async () => {
  const { catalog } = await loadCatalog();
  const engineering = getLoops(catalog, { category: "engineering" });

  assert.ok(engineering.length > 0);
  assert.ok(
    engineering.every((loop) => loop.category.slug === "engineering"),
  );
});

test("adapt returns wizard answer shape", async () => {
  const { catalog } = await loadCatalog();
  const loop = findLoop(catalog, "overnight-docs-sweep");
  const answers = catalogLoopToAnswers(loop);

  assert.ok(answers.goal);
  assert.ok(answers.trigger);
  assert.ok(answers.scope);
  assert.ok(answers.verify);
  assert.ok(answers.stopRule);
  assert.equal(answers.sourceSlug, "overnight-docs-sweep");
});

test("search returns ranked results", async () => {
  const { catalog } = await loadCatalog();
  const results = searchLoops(catalog.loops, "documentation", { limit: 8 });

  assert.ok(results.length > 0);
  assert.ok(results[0].score >= results[results.length - 1].score);
});

test("runCli recommend outputs valid JSON", async () => {
  const logs = [];
  const originalLog = console.log;

  console.log = (...args) => {
    logs.push(args.join(" "));
  };

  try {
    await runCli(["recommend", "keep docs in sync with code", "--json"]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(logs.length, 1);
  const payload = JSON.parse(logs[0]);
  assert.ok(Array.isArray(payload.recommendations));
  assert.equal(payload.query, "keep docs in sync with code");
});

test("bin recommend outputs valid JSON on stdout", async () => {
  const { stdout, stderr } = await runBin([
    "recommend",
    "documentation drift",
    "--json",
  ]);

  assert.equal(stderr, "");
  const payload = JSON.parse(stdout);
  assert.ok(payload.recommendations.length > 0);
});

test("bin errors on unknown loop", async () => {
  await assert.rejects(
    () => runBin(["show", "does-not-exist", "--json"]),
    (error) => error.code === 1,
  );
});
