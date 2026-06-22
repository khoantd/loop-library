import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const bundledCatalogPath = path.join(packageRoot, "data", "catalog.json");

export async function loadCatalog({ online = false } = {}) {
  if (online) {
    try {
      const bundled = JSON.parse(await readFile(bundledCatalogPath, "utf8"));
      const catalogUrl = bundled.catalogUrl;

      if (!catalogUrl) {
        throw new Error("Bundled catalog is missing catalogUrl.");
      }

      const response = await fetch(catalogUrl, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch live catalog (${response.status}).`);
      }

      const catalog = await response.json();
      return { catalog, source: "online" };
    } catch (error) {
      const bundled = JSON.parse(await readFile(bundledCatalogPath, "utf8"));
      return {
        catalog: bundled,
        source: "bundled",
        warning:
          error instanceof Error
            ? `Live catalog unavailable; using bundled copy. ${error.message}`
            : "Live catalog unavailable; using bundled copy.",
      };
    }
  }

  const catalog = JSON.parse(await readFile(bundledCatalogPath, "utf8"));
  return { catalog, source: "bundled" };
}

export function getLoops(catalog, { category } = {}) {
  const loops = Array.isArray(catalog.loops) ? catalog.loops : [];

  if (!category) {
    return loops;
  }

  const normalized = category.toLowerCase();
  return loops.filter(
    (loop) =>
      loop.category?.slug?.toLowerCase() === normalized ||
      loop.category?.label?.toLowerCase() === normalized,
  );
}

export function findLoop(catalog, identifier) {
  const loops = getLoops(catalog);
  const normalized = String(identifier).trim().toLowerCase();

  return (
    loops.find((loop) => loop.slug.toLowerCase() === normalized) ||
    loops.find((loop) => loop.number === normalized.padStart(3, "0")) ||
    loops.find((loop) => loop.number === normalized) ||
    loops.find((loop) => loop.title.toLowerCase() === normalized) ||
    null
  );
}
