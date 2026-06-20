export const WIZARD_STEPS = [
  {
    id: "goal",
    label: "Goal",
    question: "What would you like the agent to get done?",
    hint: "Describe the outcome in plain language.",
    required: true,
    maxLength: 500,
    multiline: true,
  },
  {
    id: "trigger",
    label: "Trigger",
    question: "When should it run?",
    hint: "On demand, on a schedule, or after something happens.",
    required: true,
    maxLength: 300,
    multiline: false,
  },
  {
    id: "scope",
    label: "Scope",
    question: "What can it look at or change? What is off-limits?",
    hint: "Name systems, files, or actions the agent may and may not touch.",
    required: true,
    maxLength: 500,
    multiline: true,
  },
  {
    id: "verify",
    label: "Verification",
    question: "How will you know it worked?",
    hint: "Tests, benchmarks, rubrics, logs, or a review step you can repeat.",
    required: true,
    maxLength: 400,
    multiline: true,
  },
  {
    id: "stopRule",
    label: "Stop or escalate",
    question: "When should it stop or ask you for help?",
    hint: "Success, no-op, budget limit, or when approval is required.",
    required: true,
    maxLength: 400,
    multiline: true,
  },
  {
    id: "title",
    label: "Name",
    question: "Name this loop",
    hint: "Optional. We suggest one from your goal if you leave this blank.",
    required: false,
    maxLength: 120,
    multiline: false,
  },
];

const REQUIRED_STEP_IDS = WIZARD_STEPS.filter((step) => step.required).map(
  (step) => step.id,
);

export function normalizeField(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, " ");
}

export function validateStep(stepId, answers = {}) {
  const step = WIZARD_STEPS.find((candidate) => candidate.id === stepId);

  if (!step) {
    return { valid: false, message: "Unknown step." };
  }

  const value = normalizeField(answers[stepId] || "");

  if (step.required && !value) {
    return { valid: false, message: "This answer is required." };
  }

  if (value.length > step.maxLength) {
    return {
      valid: false,
      message: `Keep this under ${step.maxLength} characters.`,
    };
  }

  return { valid: true, value };
}

export function validateAnswers(answers = {}) {
  for (const stepId of REQUIRED_STEP_IDS) {
    const result = validateStep(stepId, answers);

    if (!result.valid) {
      return result;
    }
  }

  const titleResult = validateStep("title", answers);

  if (!titleResult.valid) {
    return titleResult;
  }

  return { valid: true };
}

function sentence(value) {
  const normalized = normalizeField(value);

  if (!normalized) {
    return "";
  }

  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function lowercaseFirst(value) {
  if (!value) {
    return "";
  }

  return value.charAt(0).toLowerCase() + value.slice(1);
}

export function suggestTitle(goal) {
  const normalizedGoal = normalizeField(goal);

  if (!normalizedGoal) {
    return "Custom agent loop";
  }

  let fragment = normalizedGoal.split(/[.!?]/)[0] || normalizedGoal;

  if (fragment.length > 72) {
    fragment = fragment.slice(0, 72).replace(/\s+\S*$/, "").trim();
  }

  fragment = fragment.replace(/^the\s+/i, "");
  fragment = fragment.replace(/\s+loop$/i, "");

  if (!fragment) {
    return "Custom agent loop";
  }

  const titled = fragment.charAt(0).toUpperCase() + fragment.slice(1);
  return `The ${titled} loop`;
}

export function compileLoopDraft(answers = {}) {
  const goal = normalizeField(answers.goal);
  const trigger = normalizeField(answers.trigger);
  const scope = normalizeField(answers.scope);
  const verify = normalizeField(answers.verify);
  const stopRule = normalizeField(answers.stopRule);
  const explicitTitle = normalizeField(answers.title);
  const title = explicitTitle || suggestTitle(goal);

  const triggerLead = sentence(trigger);
  const goalLead = lowercaseFirst(sentence(goal));
  const scopeLead = sentence(scope);
  const verifyLead = lowercaseFirst(sentence(verify));
  const stopLead = lowercaseFirst(sentence(stopRule));

  const promptParts = [];

  if (triggerLead && goalLead) {
    promptParts.push(`${triggerLead} ${goalLead}`);
  } else if (goalLead) {
    promptParts.push(goalLead.charAt(0).toUpperCase() + goalLead.slice(1));
  } else if (triggerLead) {
    promptParts.push(triggerLead);
  }

  if (scopeLead) {
    promptParts.push(scopeLead.charAt(0).toUpperCase() + scopeLead.slice(1));
  }

  if (verifyLead) {
    promptParts.push(
      `After each meaningful attempt, ${verifyLead.replace(/\.$/, "")}.`,
    );
  }

  if (stopLead) {
    promptParts.push(`Stop when ${stopLead.replace(/\.$/, "")}.`);
  }

  promptParts.push(
    "Ask before destructive, irreversible, production, or external actions that were not explicitly allowed.",
  );

  const prompt = promptParts.join(" ").replace(/\s+/g, " ").trim();
  const summary = goal
    ? `${goal.charAt(0).toUpperCase()}${goal.slice(1).replace(/\.$/, "")}, with a clear check and stop rule.`
    : "A bounded agent workflow with explicit verification and stopping conditions.";

  return {
    title,
    summary,
    prompt,
  };
}
