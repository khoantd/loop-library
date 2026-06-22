export function formatLoopList(loops) {
  if (loops.length === 0) {
    return "No loops found.";
  }

  return loops
    .map(
      (loop) =>
        `${loop.number}  ${loop.title}  (${loop.category?.label || "uncategorized"})  ${loop.slug}`,
    )
    .join("\n");
}

export function formatRecommendations(payload) {
  if (!payload.recommendations?.length) {
    return payload.hint || "No recommendations found.";
  }

  return payload.recommendations
    .map((item) => {
      const fields = item.matchedFields?.length
        ? `matched: ${item.matchedFields.join(", ")}`
        : "";
      return [
        `${item.rank}. ${item.title} (${item.slug}) — score ${item.score}`,
        `   ${item.useWhen}`,
        fields ? `   ${fields}` : "",
        `   ${item.url}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

export function formatLoop(loop) {
  return [
    `${loop.number} — ${loop.title}`,
    `Slug: ${loop.slug}`,
    `Category: ${loop.category?.label || "uncategorized"}`,
    `URL: ${loop.url}`,
    "",
    `Use when: ${loop.useWhen}`,
    "",
    `Prompt: ${loop.prompt}`,
    "",
    `Verify: ${loop.verification?.title || ""} ${loop.verification?.detail || ""}`.trim(),
  ].join("\n");
}
