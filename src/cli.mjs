import { parseArgs } from "node:util";

import { catalogLoopToAnswers } from "./lib/catalog-loop-to-answers.mjs";
import { findLoop, getLoops, loadCatalog } from "./catalog.mjs";
import {
  formatLoop,
  formatLoopList,
  formatRecommendations,
} from "./format.mjs";
import { recommendLoops, searchLoops } from "./search.mjs";

const HELP = `loop-library — find published agent loops from the Loop Library catalog

Usage:
  loop-library recommend <goal> [--json] [--online]
  loop-library search <query> [--json] [--online] [--limit <n>]
  loop-library show <slug|number> [--json] [--online]
  loop-library list [--category <slug>] [--json] [--online]
  loop-library adapt <slug> [--json] [--online]

Options:
  --json       Output JSON (default)
  --text       Output human-readable text
  --online     Fetch live catalog with bundled fallback
  --limit <n>  Max results for search (default 8)
  --category   Filter by category slug or label
  --help       Show this help
`;

function wantsJson(values) {
  if (values.text) {
    return false;
  }

  return values.json !== false;
}

function output(result, { json, text }) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(text);
}

export async function runCli(argv) {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      json: { type: "boolean", default: true },
      text: { type: "boolean", default: false },
      online: { type: "boolean", default: false },
      limit: { type: "string" },
      category: { type: "string" },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help || positionals.length === 0) {
    console.log(HELP.trim());
    return;
  }

  const command = positionals[0];
  const arg = positionals.slice(1).join(" ").trim();
  const json = wantsJson(values);
  const { catalog, source, warning } = await loadCatalog({
    online: values.online,
  });
  const loops = getLoops(catalog, { category: values.category });

  switch (command) {
    case "recommend": {
      if (!arg) {
        throw new Error('Missing goal. Example: loop-library recommend "keep docs current"');
      }

      const payload = {
        ...recommendLoops(loops, arg, { limit: 3 }),
        catalogUpdated: catalog.updated,
        source,
      };

      if (warning) {
        payload.warning = warning;
      }

      output(payload, {
        json,
        text: formatRecommendations(payload),
      });
      return;
    }

    case "search": {
      if (!arg) {
        throw new Error('Missing query. Example: loop-library search documentation');
      }

      const limit = values.limit ? Number(values.limit) : 8;
      const results = searchLoops(loops, arg, { limit });
      const payload = {
        query: arg,
        catalogUpdated: catalog.updated,
        source,
        results: results.map((result, index) => ({
          rank: index + 1,
          score: Math.round(result.score * 10) / 10,
          slug: result.loop.slug,
          number: result.loop.number,
          title: result.loop.title,
          url: result.loop.url,
          category: result.loop.category?.slug || "",
          matchedFields: result.matchedFields,
          matchedTerms: result.matchedTerms,
        })),
      };

      if (warning) {
        payload.warning = warning;
      }

      output(payload, {
        json,
        text:
          payload.results.length > 0
            ? payload.results
                .map(
                  (item) =>
                    `${item.rank}. ${item.title} (${item.slug}) — score ${item.score}`,
                )
                .join("\n")
            : "No loops matched that query.",
      });
      return;
    }

    case "show": {
      if (!arg) {
        throw new Error("Missing slug or number. Example: loop-library show 001");
      }

      const loop = findLoop(catalog, arg);

      if (!loop) {
        throw new Error(`No loop found for "${arg}".`);
      }

      const payload = { catalogUpdated: catalog.updated, source, loop };

      if (warning) {
        payload.warning = warning;
      }

      output(payload, {
        json,
        text: formatLoop(loop),
      });
      return;
    }

    case "list": {
      const payload = {
        catalogUpdated: catalog.updated,
        source,
        count: loops.length,
        loops: loops.map((loop) => ({
          number: loop.number,
          slug: loop.slug,
          title: loop.title,
          category: loop.category?.slug || "",
          url: loop.url,
        })),
      };

      if (warning) {
        payload.warning = warning;
      }

      output(payload, {
        json,
        text: formatLoopList(loops),
      });
      return;
    }

    case "adapt": {
      if (!arg) {
        throw new Error("Missing slug. Example: loop-library adapt overnight-docs-sweep");
      }

      const loop = findLoop(catalog, arg);

      if (!loop) {
        throw new Error(`No loop found for "${arg}".`);
      }

      const answers = catalogLoopToAnswers(loop);
      const payload = {
        catalogUpdated: catalog.updated,
        source,
        slug: loop.slug,
        title: loop.title,
        answers,
      };

      if (warning) {
        payload.warning = warning;
      }

      output(payload, {
        json,
        text: JSON.stringify(answers, null, 2),
      });
      return;
    }

    default:
      throw new Error(`Unknown command "${command}". Run loop-library --help.`);
  }
}
