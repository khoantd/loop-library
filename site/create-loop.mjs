import {
  WIZARD_STEPS,
  compileLoopDraft,
  normalizeField,
  validateStep,
} from "../compile-loop-draft.mjs";
import {
  catalogLoopSearchText,
  catalogLoopToAnswers,
  catalogLoopToExactDraft,
} from "../catalog-loop-to-answers.mjs";

const STORAGE_KEY = "loop-library-create-draft";
const SUBMIT_PREFILL_KEY = "loop-library-submit-prefill";
const STARTER_RESULTS_LIMIT = 8;
const STARTER_SEARCH_MIN = 2;
const PROGRESS_LABELS = [
  "Goal",
  "Trigger",
  "Scope",
  "Verify",
  "Stop",
  "Name",
  "Review",
];

const wizard = document.querySelector("#loop-create-wizard");
const createWorkflow = document.querySelector(".create-workflow");
const stepMeta = document.querySelector("#create-step-meta");
const progressList = document.querySelector("#create-progress");
const stepPanels = [...document.querySelectorAll("[data-create-step]")];
const reviewPanel = document.querySelector('[data-create-step="review"]');
const createControls = document.querySelector(".create-controls");
const backButton = document.querySelector("#create-back");
const nextButton = document.querySelector("#create-next");
const nextButtonLabel = nextButton?.querySelector("span");
const restartButton = document.querySelector("#create-restart");
const copyButton = document.querySelector("#create-copy-prompt");
const submitButton = document.querySelector("#create-use-submit");
const reviewTitle = document.querySelector("#create-review-title");
const reviewSummary = document.querySelector("#create-review-summary");
const reviewPrompt = document.querySelector("#create-review-prompt");
const sourceBadge = document.querySelector("#create-source-badge");
const toast = document.querySelector("#toast");
const starterSection = document.querySelector("#create-starter");
const starterSummaryText = document.querySelector("#create-starter-summary-text");
const starterSummaryHint = document.querySelector("#create-starter-summary-hint");
const starterSearch = document.querySelector("#create-loop-search");
const starterResults = document.querySelector("#create-starter-results");
const starterStatus = document.querySelector("#create-starter-status");
const starterSelected = document.querySelector("#create-starter-selected");
const starterSelectedTitle = document.querySelector(
  "#create-starter-selected-title",
);
const starterClear = document.querySelector("#create-starter-clear");

let currentStepIndex = 0;
let answers = loadDraft();
let catalogLoops = [];
let catalogReady = false;

function loadDraft() {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);

    if (!stored) {
      return emptyAnswers();
    }

    const parsed = JSON.parse(stored);

    if (!parsed || typeof parsed !== "object") {
      return emptyAnswers();
    }

    return {
      ...emptyAnswers(),
      ...parsed,
    };
  } catch {
    return emptyAnswers();
  }
}

function emptyAnswers() {
  return {
    ...Object.fromEntries(WIZARD_STEPS.map((step) => [step.id, ""])),
    sourceSlug: "",
    sourceTitle: "",
    sourcePrompt: "",
  };
}

function saveDraft() {
  syncInputsToAnswers();

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
  } catch {
    // Draft still works for the current page view.
  }
}

function clearDraft() {
  answers = emptyAnswers();
  clearStarterSelection();

  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }

  populateInputs();
  updateStarterPanel();
}

function clearSourceMetadata() {
  answers.sourceSlug = "";
  answers.sourceTitle = "";
  answers.sourcePrompt = "";
  updateStarterPanel();
}

function syncInputsToAnswers() {
  for (const step of WIZARD_STEPS) {
    const input = wizard?.querySelector(`[name="${step.id}"]`);

    if (input) {
      answers[step.id] = normalizeField(input.value);
    }
  }
}

function populateInputs() {
  for (const step of WIZARD_STEPS) {
    const input = wizard?.querySelector(`[name="${step.id}"]`);

    if (input) {
      input.value = answers[step.id] || "";
    }
  }
}

function currentStep() {
  return WIZARD_STEPS[currentStepIndex];
}

function isReviewStep() {
  return currentStepIndex >= WIZARD_STEPS.length;
}

function showToast(message) {
  if (!toast) {
    return;
  }

  toast.textContent = message;
  toast.classList.add("is-visible");
  window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2200);
}

function setStarterStatus(message) {
  if (starterStatus) {
    starterStatus.textContent = message;
  }
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the selection-based copy path.
    }
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.append(textArea);
  textArea.select();
  const copied = document.execCommand("copy");
  textArea.remove();

  if (!copied) {
    throw new Error("Copy is unavailable.");
  }
}

function updateProgress() {
  if (!progressList) {
    return;
  }

  progressList.querySelectorAll("[data-progress-step]").forEach((item) => {
    const stepIndex = Number(item.dataset.progressStep);
    const isComplete = isReviewStep()
      ? stepIndex < WIZARD_STEPS.length
      : stepIndex < currentStepIndex;
    const isCurrent = isReviewStep()
      ? stepIndex === WIZARD_STEPS.length
      : stepIndex === currentStepIndex;

    item.classList.toggle("is-complete", isComplete);
    item.setAttribute("aria-current", isCurrent ? "step" : "false");
  });
}

function updateStepMeta() {
  if (!stepMeta) {
    return;
  }

  const totalSteps = WIZARD_STEPS.length + 1;
  const stepNumber = isReviewStep() ? totalSteps : currentStepIndex + 1;
  const label = isReviewStep()
    ? "Review"
    : PROGRESS_LABELS[currentStepIndex] || currentStep()?.label || "";

  stepMeta.textContent = `Step ${stepNumber} of ${totalSteps} · ${label}`;
}

function updateStarterPanel() {
  const hasSource = Boolean(answers.sourceSlug && answers.sourceTitle);
  const onFirstStep = currentStepIndex === 0 && !isReviewStep();

  if (starterSection) {
    starterSection.hidden = isReviewStep();

    if (isReviewStep()) {
      starterSection.open = false;
    } else if (currentStepIndex > 0) {
      starterSection.open = false;
    } else if (onFirstStep && !hasSource) {
      starterSection.open = true;
    } else if (onFirstStep && hasSource) {
      starterSection.open = false;
    }
  }

  if (starterSummaryText) {
    starterSummaryText.textContent = hasSource
      ? `Starting from: ${answers.sourceTitle}`
      : "Optional: start from a published loop";
  }

  if (starterSummaryHint) {
    if (!isReviewStep() && currentStepIndex > 0) {
      starterSummaryHint.textContent = "Expand to change your starting loop";
    } else {
      starterSummaryHint.textContent = "";
    }
  }

  createWorkflow?.classList.toggle(
    "create-workflow--started",
    currentStepIndex > 0 || isReviewStep(),
  );

  updateSelectedSource();
  updateStepMeta();
}

function updateSelectedSource() {
  const hasSource = Boolean(answers.sourceSlug && answers.sourceTitle);

  if (starterSelected) {
    starterSelected.hidden = !hasSource;
  }

  if (starterSelectedTitle) {
    starterSelectedTitle.textContent = hasSource ? answers.sourceTitle : "";
  }

  if (sourceBadge) {
    sourceBadge.hidden = !hasSource;
    sourceBadge.textContent = hasSource
      ? `Based on ${answers.sourceTitle}`
      : "";
  }
}

function clearStarterSelection() {
  if (starterSearch) {
    starterSearch.value = "";
  }

  renderStarterResults("");
  setStarterStatus("");
}

function showStepPanel() {
  stepPanels.forEach((panel) => {
    const panelStep = panel.dataset.createStep;

    if (panelStep === "review") {
      panel.hidden = !isReviewStep();
      return;
    }

    const stepIndex = WIZARD_STEPS.findIndex((step) => step.id === panelStep);
    panel.hidden = stepIndex !== currentStepIndex;
  });

  updateProgress();
  updateStarterPanel();

  if (createControls) {
    createControls.hidden = isReviewStep();
  }

  if (backButton) {
    backButton.disabled = currentStepIndex === 0 && !isReviewStep();
  }

  if (nextButton && nextButtonLabel) {
    if (isReviewStep()) {
      nextButton.hidden = true;
    } else {
      nextButton.hidden = false;
      nextButtonLabel.textContent =
        currentStepIndex === WIZARD_STEPS.length - 1 ? "Review draft" : "Continue";
    }
  }

  if (restartButton) {
    restartButton.hidden = !isReviewStep();
  }

  if (copyButton) {
    copyButton.hidden = !isReviewStep();
  }

  if (submitButton) {
    submitButton.hidden = !isReviewStep();
  }

  const focusTarget = isReviewStep()
    ? reviewPanel?.querySelector("h2")
    : wizard?.querySelector(
        `[data-create-step="${currentStep()?.id}"] input, [data-create-step="${currentStep()?.id}"] textarea`,
      );

  if (focusTarget && typeof focusTarget.focus === "function") {
    window.requestAnimationFrame(() => {
      focusTarget.focus({ preventScroll: true });
    });
  }
}

function renderReview() {
  syncInputsToAnswers();

  const draft = answers.sourcePrompt
    ? {
        title:
          answers.title ||
          (answers.sourceTitle
            ? `${answers.sourceTitle} (copy)`
            : "Custom agent loop (copy)"),
        summary:
          normalizeField(answers.goal) ||
          (answers.sourceTitle
            ? `Duplicated from ${answers.sourceTitle}.`
            : "Duplicated from a published Loop Library loop."),
        prompt: answers.sourcePrompt,
      }
    : compileLoopDraft(answers);

  if (reviewTitle) {
    reviewTitle.textContent = draft.title;
  }

  if (reviewSummary) {
    reviewSummary.textContent = draft.summary;
  }

  if (reviewPrompt) {
    reviewPrompt.textContent = draft.prompt;
  }

  return draft;
}

function goBack() {
  if (isReviewStep()) {
    currentStepIndex = WIZARD_STEPS.length - 1;
  } else if (currentStepIndex > 0) {
    currentStepIndex -= 1;
  }

  showStepPanel();
}

function goNext() {
  syncInputsToAnswers();
  const step = currentStep();
  const result = validateStep(step.id, answers);

  if (!result.valid) {
    showToast(result.message);
    const input = wizard?.querySelector(`[name="${step.id}"]`);
    input?.focus();
    input?.reportValidity?.();
    return;
  }

  answers[step.id] = result.value;
  saveDraft();

  if (currentStepIndex === WIZARD_STEPS.length - 1) {
    currentStepIndex = WIZARD_STEPS.length;
    renderReview();
    showStepPanel();
    return;
  }

  currentStepIndex += 1;
  showStepPanel();
}

function prefillSubmitForm(draft) {
  try {
    window.sessionStorage.setItem(
      SUBMIT_PREFILL_KEY,
      JSON.stringify({
        loop_title: draft.title,
        instructions: draft.prompt,
      }),
    );
  } catch {
    // Fall through to hash-based prefill on the home page.
  }

  const params = new URLSearchParams({
    prefill: "1",
    loop_title: draft.title,
    instructions: draft.prompt,
  });

  window.location.href = `../#submit?${params.toString()}`;
}

function applyAnswers(nextAnswers, { exactPrompt = false } = {}) {
  answers = {
    ...emptyAnswers(),
    ...nextAnswers,
  };

  if (!exactPrompt) {
    answers.sourcePrompt = "";
  }

  populateInputs();
  saveDraft();
  updateStarterPanel();
}

function adaptCatalogLoop(loop) {
  applyAnswers(catalogLoopToAnswers(loop));
  currentStepIndex = 0;
  showStepPanel();
  showToast(`Filled wizard from "${loop.title}". Edit answers, then review.`);
}

function duplicateCatalogLoop(loop) {
  const exact = catalogLoopToExactDraft(loop);
  applyAnswers(exact.answers, { exactPrompt: true });
  currentStepIndex = WIZARD_STEPS.length;
  renderReview();
  showStepPanel();
  showToast(`Copied "${loop.title}" prompt. Submit as-is or start over to edit.`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderStarterResults(query) {
  if (!starterResults) {
    return;
  }

  const normalizedQuery = normalizeField(query).toLowerCase();

  starterResults.innerHTML = "";

  if (!catalogReady) {
    starterResults.hidden = true;
    if (starterSearch) {
      starterSearch.setAttribute("aria-expanded", "false");
    }
    return;
  }

  if (!normalizedQuery || normalizedQuery.length < STARTER_SEARCH_MIN) {
    starterResults.hidden = true;
    if (starterSearch) {
      starterSearch.setAttribute("aria-expanded", "false");
    }

    if (normalizedQuery.length === 1) {
      setStarterStatus("Type at least 2 characters to search.");
    } else {
      setStarterStatus("Search by outcome, category, or keyword.");
    }

    return;
  }

  const matches = catalogLoops
    .filter((loop) => catalogLoopSearchText(loop).includes(normalizedQuery))
    .slice(0, STARTER_RESULTS_LIMIT);

  if (matches.length === 0) {
    starterResults.hidden = true;
    if (starterSearch) {
      starterSearch.setAttribute("aria-expanded", "false");
    }

    setStarterStatus(
      `No loops match "${query}". Try a broader outcome or category.`,
    );

    return;
  }

  starterResults.hidden = false;
  if (starterSearch) {
    starterSearch.setAttribute("aria-expanded", "true");
  }

  setStarterStatus(
    matches.length === 1
      ? "Showing 1 matching loop."
      : `Showing ${matches.length} matching loops.`,
  );

  for (const loop of matches) {
    const item = document.createElement("li");
    item.className = "create-starter-result";
    item.setAttribute("role", "presentation");
    const adaptHelpId = `starter-adapt-help-${escapeHtml(loop.slug)}`;
    const duplicateHelpId = `starter-duplicate-help-${escapeHtml(loop.slug)}`;

    item.innerHTML = `
      <article class="create-starter-card" aria-labelledby="starter-${escapeHtml(loop.slug)}">
        <div class="create-starter-card-copy">
          <h3 class="create-starter-card-title" id="starter-${escapeHtml(loop.slug)}">
            ${escapeHtml(loop.title)}
          </h3>
          <p class="create-starter-card-meta">
            <span class="loop-category">${escapeHtml(loop.category?.label || "Loop")}</span>
            <span>${escapeHtml(loop.author || "")}</span>
          </p>
          <p class="create-starter-card-summary">${escapeHtml(loop.description || loop.useWhen || "")}</p>
        </div>
        <div class="create-starter-card-actions">
          <div class="create-starter-action-group">
            <button
              class="create-starter-action create-starter-action--primary"
              type="button"
              data-action="adapt"
              data-slug="${escapeHtml(loop.slug)}"
              aria-describedby="${adaptHelpId}"
            >
              Fill wizard from this loop
            </button>
            <p class="create-starter-action-help" id="${adaptHelpId}">
              Pre-fills Goal through Stop with editable answers.
            </p>
          </div>
          <div class="create-starter-action-group">
            <button
              class="create-starter-action create-starter-action--secondary"
              type="button"
              data-action="duplicate"
              data-slug="${escapeHtml(loop.slug)}"
              aria-describedby="${duplicateHelpId}"
            >
              Copy published prompt
            </button>
            <p class="create-starter-action-help" id="${duplicateHelpId}">
              Skips to review with the exact library prompt.
            </p>
          </div>
          <a
            class="create-starter-link"
            href="../loops/${escapeHtml(loop.slug)}/"
          >
            View loop
          </a>
        </div>
      </article>
    `;

    starterResults.append(item);
  }
}

function findCatalogLoop(slug) {
  return catalogLoops.find((loop) => loop.slug === slug);
}

async function loadCatalog() {
  try {
    const response = await fetch("../catalog.json", {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Catalog request failed with ${response.status}`);
    }

    const catalog = await response.json();
    catalogLoops = Array.isArray(catalog.loops) ? catalog.loops : [];
    catalogReady = true;
    renderStarterResults(starterSearch?.value || "");
  } catch {
    catalogReady = false;
    setStarterStatus(
      "Published loops could not be loaded. You can still build from scratch.",
    );
  }
}

if (wizard) {
  populateInputs();
  showStepPanel();
  loadCatalog();

  wizard.addEventListener("submit", (event) => {
    event.preventDefault();
    goNext();
  });

  wizard.addEventListener("input", () => {
    if (answers.sourcePrompt) {
      answers.sourcePrompt = "";
    }

    syncInputsToAnswers();
    saveDraft();
  });

  backButton?.addEventListener("click", () => {
    goBack();
  });

  nextButton?.addEventListener("click", () => {
    goNext();
  });

  restartButton?.addEventListener("click", () => {
    clearDraft();
    currentStepIndex = 0;
    showStepPanel();
    showToast("Draft cleared. Start again when you are ready.");
  });

  copyButton?.addEventListener("click", async () => {
    const draft = renderReview();
    const label = copyButton.querySelector("span");

    try {
      await copyText(draft.prompt);
      if (label) {
        const defaultLabel = label.textContent;
        label.textContent = "Copied";
        showToast("Loop prompt copied to clipboard.");
        window.setTimeout(() => {
          label.textContent = defaultLabel;
        }, 1800);
      }
    } catch {
      showToast("Copy failed. Select the prompt text instead.");
    }
  });

  submitButton?.addEventListener("click", () => {
    const draft = renderReview();
    prefillSubmitForm(draft);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !isReviewStep()) {
      event.preventDefault();
      goBack();
    }
  });
}

if (starterSearch) {
  starterSearch.addEventListener("input", () => {
    renderStarterResults(starterSearch.value);
  });

  starterSearch.addEventListener("search", () => {
    renderStarterResults(starterSearch.value);
  });
}

starterResults?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action][data-slug]");

  if (!button) {
    return;
  }

  const loop = findCatalogLoop(button.dataset.slug);

  if (!loop) {
    showToast("That loop is no longer available. Refresh and try again.");
    return;
  }

  if (button.dataset.action === "adapt") {
    adaptCatalogLoop(loop);
    return;
  }

  if (button.dataset.action === "duplicate") {
    duplicateCatalogLoop(loop);
  }
});

starterClear?.addEventListener("click", () => {
  clearSourceMetadata();
  saveDraft();
  clearStarterSelection();
  updateStarterPanel();
  showToast("Cleared the published loop starting point.");
});

export {
  SUBMIT_PREFILL_KEY,
  catalogLoopToAnswers,
  compileLoopDraft,
  normalizeField,
};
