import { catalogLoopSearchText } from "./lib/catalog-loop-to-answers.mjs";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "into",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "that",
  "the",
  "their",
  "them",
  "they",
  "this",
  "to",
  "up",
  "us",
  "we",
  "what",
  "when",
  "with",
  "you",
  "your",
]);

const FIELD_WEIGHTS = {
  useWhen: 3.0,
  keywords: 2.5,
  title: 2.0,
  description: 1.5,
  verification: 1.5,
  prompt: 1.0,
  category: 0.5,
};

export function tokenizeQuery(query) {
  return [
    ...new Set(
      String(query)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 2 && !STOP_WORDS.has(token)),
    ),
  ];
}

function fieldText(loop, field) {
  switch (field) {
    case "useWhen":
      return loop.useWhen || "";
    case "title":
      return loop.title || "";
    case "description":
      return loop.description || "";
    case "prompt":
      return loop.prompt || "";
    case "verification":
      return [loop.verification?.title, loop.verification?.detail]
        .filter(Boolean)
        .join(" ");
    case "category":
      return loop.category?.label || "";
    case "keywords":
      return Array.isArray(loop.keywords) ? loop.keywords.join(" ") : "";
    default:
      return "";
  }
}

function countTokenMatches(text, tokens) {
  const normalized = String(text).toLowerCase();
  const matchedTerms = [];

  for (const token of tokens) {
    if (normalized.includes(token)) {
      matchedTerms.push(token);
    }
  }

  return matchedTerms;
}

function keywordMatches(loop, tokens) {
  const keywords = Array.isArray(loop.keywords) ? loop.keywords : [];
  const matchedTerms = [];

  for (const keyword of keywords) {
    const normalizedKeyword = keyword.toLowerCase();

    for (const token of tokens) {
      if (
        normalizedKeyword.includes(token) ||
        token.includes(normalizedKeyword)
      ) {
        matchedTerms.push(keyword);
        break;
      }
    }
  }

  return matchedTerms;
}

export function scoreLoop(loop, query, tokens = tokenizeQuery(query)) {
  if (tokens.length === 0) {
    return null;
  }

  const matchedFields = new Set();
  const matchedTerms = new Set();
  let score = 0;

  for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
    if (field === "keywords") {
      const keywordHits = keywordMatches(loop, tokens);

      if (keywordHits.length > 0) {
        matchedFields.add("keywords");
        keywordHits.forEach((term) => matchedTerms.add(term));
        score += keywordHits.length * weight;
      }

      continue;
    }

    const hits = countTokenMatches(fieldText(loop, field), tokens);

    if (hits.length > 0) {
      matchedFields.add(field);
      hits.forEach((term) => matchedTerms.add(term));
      score += hits.length * weight;
    }
  }

  const phrase = String(query).trim().toLowerCase();

  if (phrase.length >= 4) {
    if (fieldText(loop, "useWhen").toLowerCase().includes(phrase)) {
      score += 4;
      matchedFields.add("useWhen");
    }

    if (fieldText(loop, "title").toLowerCase().includes(phrase)) {
      score += 3;
      matchedFields.add("title");
    }
  }

  if (score <= 0) {
    return null;
  }

  return {
    loop,
    score,
    matchedFields: [...matchedFields],
    matchedTerms: [...matchedTerms],
  };
}

export function searchLoops(loops, query, { limit = 8, minQueryLength = 2 } = {}) {
  const normalizedQuery = String(query).trim().toLowerCase();

  if (normalizedQuery.length < minQueryLength) {
    return [];
  }

  const tokens = tokenizeQuery(normalizedQuery);

  if (tokens.length === 0) {
    return [];
  }

  const pool =
    normalizedQuery.length >= 2 && loops.length > 50
      ? loops.filter((loop) => {
          const text = catalogLoopSearchText(loop);
          return (
            text.includes(normalizedQuery) ||
            tokens.some((token) => text.includes(token))
          );
        })
      : loops;

  return (pool.length > 0 ? pool : loops)
    .map((loop) => scoreLoop(loop, normalizedQuery, tokens))
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function recommendLoops(loops, query, { limit = 3 } = {}) {
  const normalizedQuery = String(query).trim();

  if (!normalizedQuery) {
    return {
      query: normalizedQuery,
      recommendations: [],
      hint: "Provide a goal describing what the user wants the agent to accomplish.",
    };
  }

  const results = searchLoops(loops, normalizedQuery, {
    limit,
    minQueryLength: 1,
  });

  if (results.length === 0) {
    return {
      query: normalizedQuery,
      recommendations: [],
      hint:
        "No published loops matched this goal. Switch to the design interview or try broader outcome terms.",
    };
  }

  return {
    query: normalizedQuery,
    recommendations: results.map((result, index) =>
      formatRecommendation(result, index + 1),
    ),
  };
}

export function formatRecommendation(result, rank) {
  const { loop, score, matchedFields, matchedTerms } = result;

  return {
    rank,
    score: Math.round(score * 10) / 10,
    slug: loop.slug,
    number: loop.number,
    title: loop.title,
    url: loop.url,
    category: loop.category?.slug || "",
    useWhen: loop.useWhen,
    matchedFields,
    matchedTerms,
    prompt: loop.prompt,
  };
}
