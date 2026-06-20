import { normalizeField } from "./compile-loop-draft.mjs";

const TRIGGER_PATTERNS = [
  /^(Whenever[^,.!?]+)/i,
  /^(When(?:ever)?[^,.!?]+)/i,
  /^(Each[^,.!?]+)/i,
  /^(Every[^,.!?]+)/i,
  /^(After[^,.!?]+)/i,
  /^(While[^,.!?]+)/i,
  /^(Run this when[^,.!?]+)/i,
  /^(Use (?:this|Revolve|Loop Harness|autonomy-loop|\$goal-planner-codex|\/clodex)[^,.!?]+)/i,
  /^(Continue[^,.!?]+)/i,
];

const STOP_PATTERNS = [
  /\bStop when ([^.!?]+)/i,
  /\bStop after ([^.!?]+)/i,
  /\bContinue until ([^.!?]+)/i,
  /\bRepeat until ([^.!?]+)/i,
  /\bFinish when ([^.!?]+)/i,
  /\bStop at ([^.!?]+)/i,
  /\bStop on ([^.!?]+)/i,
];

function clamp(value, maxLength) {
  const normalized = normalizeField(value);

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return normalized.slice(0, maxLength).replace(/\s+\S*$/, "").trim();
}

function stripUseWhenPrefix(value) {
  return normalizeField(value)
    .replace(/^Use this when\s+/i, "")
    .replace(/^Use this for\s+/i, "")
    .replace(/^Use when\s+/i, "")
    .replace(/^Use this\s+/i, "");
}

export function extractTriggerFromPrompt(prompt) {
  const normalized = normalizeField(prompt);

  for (const pattern of TRIGGER_PATTERNS) {
    const match = normalized.match(pattern);

    if (match?.[1]) {
      const fragment = match[1].trim();
      return /[.!?]$/.test(fragment) ? fragment : `${fragment}.`;
    }
  }

  return "";
}

export function extractStopRuleFromPrompt(prompt) {
  const normalized = normalizeField(prompt);

  for (const pattern of STOP_PATTERNS) {
    const match = normalized.match(pattern);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return "";
}

function deriveGoal(loop) {
  const fromUseWhen = stripUseWhenPrefix(loop.useWhen || "");

  if (fromUseWhen) {
    return fromUseWhen;
  }

  return normalizeField(loop.description || loop.summary || "");
}

function deriveScope(loop) {
  const steps = Array.isArray(loop.steps) ? loop.steps.filter(Boolean) : [];
  const note = normalizeField(loop.implementationNote || loop.note || "");
  const stepScope = steps.slice(0, 2).join(" ");
  const combined = [stepScope, note].filter(Boolean).join(" ");

  if (combined) {
    return combined;
  }

  return "Work only in the systems and files this loop describes. Ask before expanding scope.";
}

function deriveVerify(loop) {
  const title = normalizeField(loop.verification?.title || loop.verifyTitle || "");
  const detail = normalizeField(loop.verification?.detail || loop.verifyDetail || "");

  return [title, detail].filter(Boolean).join(" ");
}

export function catalogLoopToAnswers(loop) {
  if (!loop || typeof loop !== "object") {
    throw new Error("Expected a catalog loop.");
  }

  const prompt = normalizeField(loop.prompt || "");
  const goal = deriveGoal(loop);
  const trigger =
    extractTriggerFromPrompt(prompt) ||
    "When you ask the agent to run this workflow.";
  const verify =
    deriveVerify(loop) ||
    "The same check passes under the same conditions as the original loop.";
  const stopRule =
    extractStopRuleFromPrompt(prompt) ||
    verify ||
    "the defined success condition is met or progress stops.";

  return {
    goal: clamp(goal, 500),
    trigger: clamp(trigger, 300),
    scope: clamp(deriveScope(loop), 500),
    verify: clamp(verify, 400),
    stopRule: clamp(stopRule, 400),
    title: clamp(normalizeField(loop.title || ""), 120),
    sourceSlug: normalizeField(loop.slug || ""),
    sourceTitle: normalizeField(loop.title || ""),
    sourcePrompt: "",
  };
}

export function catalogLoopToExactDraft(loop) {
  const answers = catalogLoopToAnswers(loop);
  const prompt = normalizeField(loop.prompt || "");

  return {
    title: answers.title ? `${answers.title} (copy)` : "Custom agent loop (copy)",
    summary:
      normalizeField(loop.description || loop.useWhen || answers.goal) ||
      "Duplicated from a published Loop Library loop.",
    prompt,
    sourceSlug: answers.sourceSlug,
    sourceTitle: answers.sourceTitle,
    answers: {
      ...answers,
      sourcePrompt: prompt,
    },
  };
}

export function catalogLoopSearchText(loop) {
  return normalizeField(
    [
      loop.title,
      loop.description,
      loop.useWhen,
      loop.prompt,
      loop.category?.label,
      loop.author,
      ...(Array.isArray(loop.keywords) ? loop.keywords : []),
    ].join(" "),
  ).toLowerCase();
}
