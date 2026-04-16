import { run } from "uebersicht";

export const refreshFrequency = false;

const NODE = "/Users/kamirov/.nvm/versions/node/v22.17.1/bin/node";
const NOTES_DIR =
  "/Users/kamirov/Documents/The Destination/👨‍⚕️ Medicine/Exploring";
const SETTINGS_STORE =
  "/Users/kamirov/Projects/ubersicht-widgets/openai-settings.json";

export const command = `
"${NODE}" <<'EOF'
const fs = require("fs");
const path = require("path");

const NOTES_DIR = ${JSON.stringify(NOTES_DIR)};

function walk(dir) {
  const results = [];
  let list;
  try { list = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return results; }

  for (const entry of list) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walk(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) results.push(full);
  }

  return results;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function normalizeHeadingLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function extractSection(text, headers) {
  const normalized = String(text || "").replace(/\\r\\n/g, "\\n");
  const lines = normalized.split("\\n");
  const targets = new Set(
    (Array.isArray(headers) ? headers : [headers]).map(normalizeHeadingLabel),
  );

  let start = -1;
  let end = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith("#")) continue;

    const sectionName = normalizeHeadingLabel(trimmed.replace(/^#+\\s*/, ""));
    if (start === -1) {
      if (targets.has(sectionName)) start = i + 1;
      continue;
    }

    end = i;
    break;
  }

  if (start === -1) return "";
  return lines.slice(start, end).join("\\n").trim();
}

function splitNumberedList(sectionText) {
  const text = (sectionText || "").replace(/\\r\\n/g, "\\n").trim();
  if (!text) return [];

  const starts = [];
  const re = /^\\s*(\\d+)\\.(\\s+|$)/gm;
  let m;
  while ((m = re.exec(text)) !== null) starts.push(m.index);
  if (!starts.length) return null;

  const items = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1] : text.length;
    let chunk = text.slice(start, end).trim();
    chunk = chunk.replace(/^\\s*\\d+\\.\\s*/, "");
    items.push(chunk.trim());
  }
  return items;
}

function makeTopicTextPreview(text) {
  const normalized = String(text || "").replace(/\\r\\n/g, "\\n");
  const lines = normalized
    .split("\\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);
  const preview = lines.join("\\n").trim();
  return preview ? preview.slice(0, 900) : "";
}

function pickDistinctContexts(candidates, modes) {
  const pool = Array.isArray(candidates) ? candidates.slice() : [];
  const requestedModes = Array.isArray(modes) ? modes : [];
  if (!pool.length || !requestedModes.length) return [];

  const chosen = [];
  const usedTopicKeys = new Set();

  for (const mode of requestedModes) {
    let candidateIndex = pool.findIndex((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const key = [entry.path || "", entry.topic || ""].join("::");
      return key && !usedTopicKeys.has(key);
    });

    if (candidateIndex < 0) candidateIndex = chosen.length % pool.length;

    const candidate = pool[candidateIndex];
    if (!candidate) continue;

    const key = [candidate.path || "", candidate.topic || ""].join("::");
    if (key) usedTopicKeys.add(key);

    chosen.push({ mode, ...candidate });
  }

  return chosen;
}

function main() {
  if (!fs.existsSync(NOTES_DIR)) {
    console.log(JSON.stringify({ error: "Notes directory not found: " + NOTES_DIR }));
    return;
  }

  const files = shuffle(walk(NOTES_DIR));
  if (!files.length) {
    console.log(JSON.stringify({ error: "No .md files found under: " + NOTES_DIR }));
    return;
  }

  const candidates = [];
  for (const file of files) {
    let text;
    try { text = fs.readFileSync(file, "utf8"); }
    catch { continue; }

    const qSection = extractSection(text, ["Question", "Questions"]);
    const aSection = extractSection(text, ["Answer", "Answers"]);
    if (!qSection || !aSection) continue;

    const qs = splitNumberedList(qSection);
    const as = splitNumberedList(aSection);
    if (qs === null || as === null) continue;
    if (!qs.length || !as.length) continue;
    if (qs.length !== as.length) continue;

    const samplePairs = qs.slice(0, 3).map((q, i) => ({
      q: String(q || ""),
      a: String(as[i] || ""),
    }));

    candidates.push({
      topic: path.basename(file).replace(/\\.md$/i, ""),
      file: path.basename(file),
      path: file,
      questionsCount: qs.length,
      answersCount: as.length,
      samplePairs,
      topicTextPreview: makeTopicTextPreview(text),
      sourceType: "note",
    });
  }

  if (!candidates.length) {
    console.log(JSON.stringify({
      error:
        "Need at least one parseable note file with numbered Questions/Answers to generate a question.",
    }));
    return;
  }

  shuffle(candidates);
  const easy = candidates[0];

  console.log(
    JSON.stringify({
      contexts: [{ mode: "easy", ...easy }],
      warning: null,
    }),
  );
}

main();
EOF
`;

const AUTO_REFRESH_INTERVAL_MS = 1000 * 60 * 15;
const autoRefreshState = {
  started: false,
  timerId: null,
  dispatch: null,
};

const clearAutoRefreshTimer = () => {
  if (autoRefreshState.timerId !== null) {
    clearTimeout(autoRefreshState.timerId);
    autoRefreshState.timerId = null;
  }
};

const triggerAutoRefresh = (dispatch) => {
  dispatch({ type: "AUTO_REFRESH_TICK" });
};

const scheduleNextAutoRefresh = () => {
  clearAutoRefreshTimer();
  if (typeof autoRefreshState.dispatch !== "function") return;

  autoRefreshState.timerId = setTimeout(() => {
    autoRefreshState.timerId = null;
    triggerAutoRefresh(autoRefreshState.dispatch);
    scheduleNextAutoRefresh();
  }, AUTO_REFRESH_INTERVAL_MS);
};

const ensureAutoRefresh = (dispatch) => {
  if (autoRefreshState.dispatch !== dispatch) {
    autoRefreshState.dispatch = dispatch;
    scheduleNextAutoRefresh();
  }

  if (autoRefreshState.started) return;

  autoRefreshState.started = true;
  setTimeout(() => {
    triggerAutoRefresh(dispatch);
  }, 0);
};

const escapeForSingleQuotedShell = (value) =>
  String(value).replace(/'/g, "'\\''");

// Multi-mode support is temporarily collapsed to a single easy question.
const QUESTION_MODES = ["easy"];
const QUESTION_DIFFICULTIES = ["easy", "medium", "hard"];
const CHOICE_KEYS = ["A", "B", "C", "D", "E"];
const TOPIC_NATURES = [
  "disease",
  "drug",
  "organism",
  "anatomy",
  "physiology_process",
  "molecular_biology",
  "pathology_finding",
  "symptom_sign",
  "lab_or_measurement",
  "treatment_or_procedure",
  "gene_or_mutation",
  "developmental_embryology",
  "immune_concept",
  "histology_structure",
  "broad_concept",
];
const TOPIC_ROLES = [
  "hidden_diagnosis",
  "tested_mechanism",
  "drug_mechanism",
  "drug_indication",
  "drug_adverse_effect",
  "complication",
  "risk_factor",
  "pathogenesis",
  "histologic_correlate",
  "genetic_basis",
  "physiologic_principle",
  "lab_interpretation_target",
  "anatomic_localization",
  "clue_only",
];
const QUESTION_ARCHETYPES = [
  "diagnosis_from_vignette",
  "mechanism_after_diagnosis",
  "drug_selection",
  "drug_mechanism",
  "adverse_effect",
  "complication",
  "genetic_basis",
  "lab_interpretation",
  "anatomic_localization",
  "histology_identification",
  "physiology_prediction",
];
const STEM_TOPIC_USAGES = ["answer", "tested_concept", "clue_only"];
const VIGNETTE_STYLES = [
  "classic",
  "integrated_lab",
  "pathology",
  "pharmacology",
];
const DEFAULT_MODE = "easy";
const ANALYSIS_CACHE_TTL_MS = 1000 * 60 * 30;

/**
 * @typedef {"disease"|"drug"|"organism"|"anatomy"|"physiology_process"|"molecular_biology"|"pathology_finding"|"symptom_sign"|"lab_or_measurement"|"treatment_or_procedure"|"gene_or_mutation"|"developmental_embryology"|"immune_concept"|"histology_structure"|"broad_concept"} TopicNature
 * @typedef {"hidden_diagnosis"|"tested_mechanism"|"drug_mechanism"|"drug_indication"|"drug_adverse_effect"|"complication"|"risk_factor"|"pathogenesis"|"histologic_correlate"|"genetic_basis"|"physiologic_principle"|"lab_interpretation_target"|"anatomic_localization"|"clue_only"} TopicRole
 * @typedef {"diagnosis_from_vignette"|"mechanism_after_diagnosis"|"drug_selection"|"drug_mechanism"|"adverse_effect"|"complication"|"genetic_basis"|"lab_interpretation"|"anatomic_localization"|"histology_identification"|"physiology_prediction"} QuestionArchetype
 *
 * @typedef {{
 *   canonicalTopic: string,
 *   nature: TopicNature,
 *   confidence: number,
 *   appropriateRoles: TopicRole[],
 *   preferredArchetypes: QuestionArchetype[],
 *   distractorFamily: string,
 *   systems: string[],
 *   avoid: string[],
 *   reasoningNotes: string[],
 * }} TopicAnalysis
 *
 * @typedef {{
 *   chosenRole: TopicRole,
 *   chosenArchetype: QuestionArchetype,
 *   testedConcept: string,
 *   stemStrategy: {
 *     topicUsage: "answer"|"tested_concept"|"clue_only",
 *     shouldHideTopicName: boolean,
 *   },
 *   reasoningChain: string[],
 *   vignetteStyle: "classic"|"integrated_lab"|"pathology"|"pharmacology",
 *   distractorStrategy: string,
 *   difficulty: "easy"|"medium"|"hard",
 * }} QuestionPlan
 *
 * @typedef {{
 *   stem: string,
 *   choices: { key: "A"|"B"|"C"|"D"|"E", text: string, explanation: string }[],
 *   correctKey: "A"|"B"|"C"|"D"|"E",
 *   correctExplanation: string,
 *   metadata: {
 *     testedConcept: string,
 *     archetype: QuestionArchetype,
 *     nature: TopicNature,
 *     reasoningSteps: number,
 *   },
 * }} GeneratedQuestion
 *
 * @typedef {{
 *   valid: boolean,
 *   issues: string[],
 *   repairedQuestion?: GeneratedQuestion|null,
 * }} ValidationResult
 */

const DIFFICULTY_PROMPT_BLOCKS = {
  easy: `Easy
- Purpose: Test recognition of a single high-yield concept with minimal ambiguity.
- Reasoning depth: 1 reasoning step.
- Concept scope: Single concept or tightly linked pair of concepts.
- Stem characteristics:
  - Short vignette (2-5 sentences)
  - Clear, classic presentation
  - Minimal irrelevant information
  - Usually contains a recognizable pattern or classic description
  - Little to no diagnostic ambiguity
- Cognitive operations:
  - Recognition
  - Direct recall
  - Simple application of a known mechanism
- Typical question targets:
  - Identify a disease from a classic presentation
  - Match drug to mechanism
  - Identify enzyme deficiency
  - Recognize inheritance pattern
  - Identify classic histologic finding
  - Predict a basic physiologic change
- Distractor style:
  - Clearly incorrect alternatives
  - Distractors often from different conceptual categories
  - Limited similarity to correct answer
- Integration level: Minimal cross-system integration.
- Data interpretation: Minimal or none.`,
  medium: `Medium
- Purpose: Test applied understanding requiring interpretation and moderate integration.
- Reasoning depth: 2 reasoning steps.
- Concept scope: One primary concept plus one secondary linked concept.
- Stem characteristics:
  - Moderate vignette length (4-8 sentences)
  - Multiple findings that must be synthesized
  - Some irrelevant or competing details
  - Requires distinguishing between similar possibilities
- Cognitive operations:
  - Interpretation
  - Mechanism identification
  - Differentiation between related conditions
  - Applying knowledge to a clinical context
- Typical question targets:
  - Determine underlying mechanism of symptoms
  - Interpret lab patterns
  - Distinguish between similar diseases
  - Predict physiologic responses
  - Identify drug adverse effects
  - Infer mutation/pathway from clinical clues
- Distractor style:
  - Plausible alternatives
  - Distractors share overlapping features
  - Requires careful comparison
- Integration level: Moderate integration across subjects (for example pathology + physiology, microbiology + immunology).
- Data interpretation: Moderate (labs, exposures, medication history, pathology descriptions).`,
  hard: `Hard
- Purpose: Test deep mechanistic understanding and multi-step reasoning.
- Reasoning depth: 3 or more reasoning steps.
- Concept scope: Multi-domain integration and advanced understanding of mechanisms.
- Stem characteristics:
  - Dense vignette (6-12 sentences)
  - Realistic clinical complexity
  - Multiple clues mixed with irrelevant information
  - Requires prioritizing subtle findings
  - Diagnosis may not be explicitly obvious
- Cognitive operations:
  - Multi-step inference
  - Mechanistic reasoning
  - Integration across systems
  - Filtering signal from noise
  - Predicting downstream effects
- Typical question targets:
  - Infer molecular mechanism from clinical findings
  - Predict downstream physiologic consequences
  - Distinguish between closely related disorders
  - Determine mechanism of a treatment response
  - Identify pathway defects or signaling abnormalities
- Distractor style:
  - Very strong distractors
  - Near-neighbor concepts
  - Answers differ by subtle mechanistic distinctions
- Integration level: High integration across pathology, physiology, pharmacology, microbiology, immunology, biochemistry, anatomy, and genetics.
- Data interpretation: High and may require interpretation of labs, imaging descriptions, pathology, timelines, or treatment effects.`,
};

const DIFFICULTY_CONTROL_DIMENSIONS = `Difficulty control dimensions
- Reasoning steps: Easy = 1 step, Medium = 2 steps, Hard = 3+ steps.
- Diagnostic clarity: Easy = obvious classic presentation, Medium = multiple plausible diagnoses, Hard = diagnosis may be indirect or not the final target.
- Distractor similarity: Easy = broad distractors, Medium = related distractors, Hard = near-neighbor distractors.
- Integration level: Easy = single discipline, Medium = limited cross-discipline integration, Hard = multi-discipline integration.
- Data interpretation: Easy = minimal, Medium = moderate, Hard = substantial.
- Stem density: Easy = concise, Medium = moderate detail, Hard = dense and complex.`;

// Medium/hard profiles are intentionally kept for an eventual multi-mode restore.
const DIFFICULTY_PROFILES = {
  easy: {
    label: "easy",
    title: "Easy",
    emoji: "🥚",
    promptMode: "easy",
    difficulty: "easy",
  },
  medium: {
    label: "medium",
    title: "Medium",
    emoji: "🐣",
    promptMode: "medium",
    difficulty: "medium",
  },
  hard: {
    label: "hard",
    title: "Hard",
    emoji: "🐓",
    promptMode: "hard",
    difficulty: "hard",
  },
};

const scheduledGenerationRequests = new Set();
const scheduledRefreshRequests = new Set();
const OPENAI_TIMEOUT_MS = 60000;

const normalizeModeKey = (mode) => {
  const value = String(mode || "")
    .trim()
    .toLowerCase();
  return QUESTION_MODES.includes(value) ? value : "";
};

const normalizeDifficultyKey = (difficulty) => {
  const value = String(difficulty || "")
    .trim()
    .toLowerCase();
  return QUESTION_DIFFICULTIES.includes(value) ? value : "";
};

const getDifficultyProfile = (mode) => {
  const safeMode = normalizeModeKey(mode) || DEFAULT_MODE;
  return DIFFICULTY_PROFILES[safeMode] || DIFFICULTY_PROFILES[DEFAULT_MODE];
};

const getDifficultyForMode = (mode) =>
  normalizeDifficultyKey(getDifficultyProfile(mode).difficulty) || "easy";

const normalizeChoiceKey = (key) => {
  const upper = String(key || "")
    .trim()
    .toUpperCase();
  return CHOICE_KEYS.includes(upper) ? upper : "";
};

const makeModeMap = (valueFactory) => {
  const out = {};
  for (const mode of QUESTION_MODES) {
    out[mode] = valueFactory(mode);
  }
  return out;
};

const normalizeSamplePair = (pair) => {
  if (!pair || typeof pair !== "object") return null;
  const q = typeof pair.q === "string" ? pair.q.trim() : "";
  const a = typeof pair.a === "string" ? pair.a.trim() : "";
  return q && a ? { q, a } : null;
};

const normalizeTopicContext = (entry) => {
  if (!entry || typeof entry !== "object") return null;

  const topic = typeof entry.topic === "string" ? entry.topic.trim() : "";
  const file = typeof entry.file === "string" ? entry.file.trim() : "";
  const path = typeof entry.path === "string" ? entry.path.trim() : "";
  const questionsCount = Number(entry.questionsCount);
  const answersCount = Number(entry.answersCount);
  const topicTextPreview =
    typeof entry.topicTextPreview === "string"
      ? entry.topicTextPreview.trim()
      : "";
  const sourceType =
    entry.sourceType === "note" || entry.sourceType === "wrong-topic"
      ? entry.sourceType
      : undefined;

  const rawPairs = Array.isArray(entry.samplePairs) ? entry.samplePairs : [];
  const samplePairs = rawPairs
    .slice(0, 3)
    .map((pair) => normalizeSamplePair(pair))
    .filter(Boolean);

  if (!topic || !file || !path) return null;
  if (!Number.isFinite(questionsCount) || !Number.isFinite(answersCount)) {
    return null;
  }

  return {
    topic,
    file,
    path,
    questionsCount,
    answersCount,
    samplePairs,
    ...(topicTextPreview ? { topicTextPreview } : {}),
    ...(sourceType ? { sourceType } : {}),
  };
};

const parseModeContext = (entry) => {
  if (!entry || typeof entry !== "object") return null;

  const mode = normalizeModeKey(entry.mode);
  const topicContext = normalizeTopicContext(entry);
  if (!mode || !topicContext) return null;

  return {
    mode,
    ...topicContext,
  };
};

const parseCommandPayload = (rawOutput) => {
  let parsed;
  try {
    parsed = JSON.parse((rawOutput || "").trim());
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || parsed.error) return null;
  if (!Array.isArray(parsed.contexts)) return null;

  const contexts = makeModeMap(() => null);
  for (const entry of parsed.contexts) {
    const context = parseModeContext(entry);
    if (!context) return null;
    if (contexts[context.mode]) return null;
    contexts[context.mode] = context;
  }

  if (!contexts.easy) return null;

  const warning =
    typeof parsed.warning === "string" && parsed.warning.trim()
      ? parsed.warning.trim()
      : null;

  return { contexts, warning };
};

const shuffleInPlace = (arr) => {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const randomizeQuestionChoices = (question) => {
  if (!question || typeof question !== "object") return question;
  if (!Array.isArray(question.choices) || question.choices.length !== 5) {
    return question;
  }

  const tagged = question.choices.map((choice) => ({
    ...choice,
    __isCorrect: choice.key === question.correctKey,
  }));

  shuffleInPlace(tagged);

  const choices = [];
  let nextCorrectKey = "";

  for (let i = 0; i < tagged.length; i += 1) {
    const src = tagged[i];
    const key = CHOICE_KEYS[i];
    if (!key) continue;
    choices.push({
      key,
      text: src.text,
      explanation: src.explanation,
    });
    if (src.__isCorrect) nextCorrectKey = key;
  }

  if (!nextCorrectKey) return question;

  return {
    ...question,
    choices,
    correctKey: nextCorrectKey,
  };
};

const analysisCacheByTopicKey = new Map();

const GENERATED_QUESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    stem: { type: "string" },
    choices: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          key: { type: "string", enum: CHOICE_KEYS },
          text: { type: "string" },
          explanation: { type: "string" },
        },
        required: ["key", "text", "explanation"],
      },
    },
    correctKey: { type: "string", enum: CHOICE_KEYS },
    correctExplanation: { type: "string" },
    metadata: {
      type: "object",
      additionalProperties: false,
      properties: {
        testedConcept: { type: "string" },
        archetype: { type: "string", enum: QUESTION_ARCHETYPES },
        nature: { type: "string", enum: TOPIC_NATURES },
        reasoningSteps: { type: "number" },
      },
      required: ["testedConcept", "archetype", "nature", "reasoningSteps"],
    },
  },
  required: [
    "stem",
    "choices",
    "correctKey",
    "correctExplanation",
    "metadata",
  ],
};

const TOPIC_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    canonicalTopic: { type: "string" },
    nature: { type: "string", enum: TOPIC_NATURES },
    confidence: { type: "number" },
    appropriateRoles: {
      type: "array",
      items: { type: "string", enum: TOPIC_ROLES },
    },
    preferredArchetypes: {
      type: "array",
      items: { type: "string", enum: QUESTION_ARCHETYPES },
    },
    distractorFamily: { type: "string" },
    systems: {
      type: "array",
      items: { type: "string" },
    },
    avoid: {
      type: "array",
      items: { type: "string" },
    },
    reasoningNotes: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "canonicalTopic",
    "nature",
    "confidence",
    "appropriateRoles",
    "preferredArchetypes",
    "distractorFamily",
    "systems",
    "avoid",
    "reasoningNotes",
  ],
};

const QUESTION_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    chosenRole: { type: "string", enum: TOPIC_ROLES },
    chosenArchetype: { type: "string", enum: QUESTION_ARCHETYPES },
    testedConcept: { type: "string" },
    stemStrategy: {
      type: "object",
      additionalProperties: false,
      properties: {
        topicUsage: { type: "string", enum: STEM_TOPIC_USAGES },
        shouldHideTopicName: { type: "boolean" },
      },
      required: ["topicUsage", "shouldHideTopicName"],
    },
    reasoningChain: {
      type: "array",
      items: { type: "string" },
    },
    vignetteStyle: { type: "string", enum: VIGNETTE_STYLES },
    distractorStrategy: { type: "string" },
    difficulty: { type: "string", enum: QUESTION_DIFFICULTIES },
  },
  required: [
    "chosenRole",
    "chosenArchetype",
    "testedConcept",
    "stemStrategy",
    "reasoningChain",
    "vignetteStyle",
    "distractorStrategy",
    "difficulty",
  ],
};

const VALIDATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    valid: { type: "boolean" },
    issues: {
      type: "array",
      items: { type: "string" },
    },
    repairedQuestion: {
      anyOf: [GENERATED_QUESTION_SCHEMA, { type: "null" }],
    },
  },
  required: ["valid", "issues", "repairedQuestion"],
};

const normalizeNonEmptyString = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizeStringArray = (value, { maxItems = 12 } = {}) => {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of value) {
    const normalized = normalizeNonEmptyString(entry);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= maxItems) break;
  }
  return out;
};

const normalizeEnumArray = (value, allowed, { maxItems = 8 } = {}) => {
  if (!Array.isArray(value)) return [];
  const allowedSet = new Set(allowed);
  const seen = new Set();
  const out = [];
  for (const entry of value) {
    const normalized = normalizeNonEmptyString(entry);
    if (!allowedSet.has(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= maxItems) break;
  }
  return out;
};

const removeLeadingReasoningPrefix = (value) =>
  normalizeNonEmptyString(value).replace(
    /^(step\s*\d+[:.)-]?\s*|reasoning\s*step\s*\d+[:.)-]?\s*)/i,
    "",
  );

const normalizeComparisonString = (value) =>
  normalizeNonEmptyString(value)
    .toLowerCase()
    .replace(/\s+/g, " ");

const compactReasoningChain = (reasoningChain, { testedConcept, analysis } = {}) => {
  const normalizedTestedConcept = normalizeComparisonString(testedConcept);
  const normalizedCanonicalTopic = normalizeComparisonString(
    analysis && analysis.canonicalTopic,
  );
  const compacted = [];
  const seen = new Set();

  for (const rawStep of Array.isArray(reasoningChain) ? reasoningChain : []) {
    const cleaned = removeLeadingReasoningPrefix(rawStep);
    const normalized = normalizeComparisonString(cleaned);
    if (!normalized || seen.has(normalized)) continue;

    const isBareTopicRestatement =
      normalizedCanonicalTopic &&
      (normalized === normalizedCanonicalTopic ||
        normalized === `identify ${normalizedCanonicalTopic}` ||
        normalized === `recognize ${normalizedCanonicalTopic}` ||
        normalized === `diagnose ${normalizedCanonicalTopic}`);

    const isBareTestedConceptRestatement =
      normalizedTestedConcept &&
      (normalized === normalizedTestedConcept ||
        normalized === `test ${normalizedTestedConcept}` ||
        normalized === `ask about ${normalizedTestedConcept}` ||
        normalized === `determine ${normalizedTestedConcept}`);

    if (isBareTopicRestatement || isBareTestedConceptRestatement) continue;

    seen.add(normalized);
    compacted.push(cleaned);
  }

  return compacted;
};

const summarizeTopicContext = (topicContext) => {
  const context = topicContext && typeof topicContext === "object" ? topicContext : {};
  const samplePairs = Array.isArray(context.samplePairs)
    ? context.samplePairs.slice(0, 3)
    : [];
  const noteExamples = samplePairs.length
    ? samplePairs
        .map(
          (pair, index) =>
            `${index + 1}. Q: ${pair.q}\n   A: ${pair.a}`,
        )
        .join("\n")
    : "No sample Q/A pairs available.";
  const preview = normalizeNonEmptyString(context.topicTextPreview);
  const sourceType =
    context.sourceType === "note" || context.sourceType === "wrong-topic"
      ? context.sourceType
      : "note";

  return [
    `Topic: ${normalizeNonEmptyString(context.topic) || "Unknown topic"}`,
    `Source type: ${sourceType}`,
    `Source file: ${normalizeNonEmptyString(context.file) || "Unknown file"}`,
    `Source path: ${normalizeNonEmptyString(context.path) || "Unknown path"}`,
    `Question count in note: ${Number.isFinite(Number(context.questionsCount)) ? Number(context.questionsCount) : 0}`,
    `Answer count in note: ${Number.isFinite(Number(context.answersCount)) ? Number(context.answersCount) : 0}`,
    preview ? `Topic preview:\n${preview}` : "Topic preview: None available.",
    `Sample note Q/A pairs:\n${noteExamples}`,
  ].join("\n\n");
};

const getPromptSettings = ({ mode, difficultyProfile }) => {
  const safeMode = normalizeModeKey(mode) || DEFAULT_MODE;
  const profile =
    difficultyProfile && typeof difficultyProfile === "object"
      ? difficultyProfile
      : getDifficultyProfile(safeMode);
  const promptMode =
    normalizeModeKey(profile && profile.promptMode) || safeMode;
  const promptDifficulty =
    normalizeDifficultyKey(profile && profile.difficulty) ||
    getDifficultyForMode(promptMode) ||
    getDifficultyForMode(safeMode);
  const difficultyBlock =
    DIFFICULTY_PROMPT_BLOCKS[promptDifficulty] ||
    DIFFICULTY_PROMPT_BLOCKS.easy;
  return { safeMode, promptMode, promptDifficulty, difficultyBlock };
};

const isReasoningStepsCompatible = (difficulty, reasoningSteps) => {
  const steps = Number(reasoningSteps);
  if (!Number.isFinite(steps) || steps <= 0) return false;
  if (difficulty === "easy") return steps <= 2;
  if (difficulty === "medium") return steps >= 2 && steps <= 3;
  if (difficulty === "hard") return steps >= 3;
  return true;
};

const isArchetypeCompatibleWithNature = (nature, archetype) => {
  const normalizedNature = normalizeNonEmptyString(nature);
  const normalizedArchetype = normalizeNonEmptyString(archetype);
  if (!normalizedNature || !normalizedArchetype) return false;

  // Light sanity checks only; the LLM prompts remain the primary selector.
  switch (normalizedNature) {
    case "drug":
      return [
        "drug_selection",
        "drug_mechanism",
        "adverse_effect",
        "mechanism_after_diagnosis",
        "complication",
        "diagnosis_from_vignette",
      ].includes(normalizedArchetype);
    case "disease":
    case "organism":
    case "broad_concept":
      return [
        "diagnosis_from_vignette",
        "mechanism_after_diagnosis",
        "complication",
        "lab_interpretation",
        "physiology_prediction",
        "histology_identification",
        "genetic_basis",
      ].includes(normalizedArchetype);
    case "anatomy":
    case "developmental_embryology":
      return [
        "anatomic_localization",
        "diagnosis_from_vignette",
        "physiology_prediction",
        "mechanism_after_diagnosis",
        "lab_interpretation",
      ].includes(normalizedArchetype);
    case "histology_structure":
    case "pathology_finding":
      return [
        "histology_identification",
        "diagnosis_from_vignette",
        "mechanism_after_diagnosis",
        "complication",
        "lab_interpretation",
        "physiology_prediction",
      ].includes(normalizedArchetype);
    case "lab_or_measurement":
    case "physiology_process":
      return [
        "lab_interpretation",
        "physiology_prediction",
        "mechanism_after_diagnosis",
        "diagnosis_from_vignette",
        "complication",
      ].includes(normalizedArchetype);
    case "gene_or_mutation":
    case "molecular_biology":
    case "immune_concept":
      return [
        "genetic_basis",
        "mechanism_after_diagnosis",
        "physiology_prediction",
        "lab_interpretation",
        "complication",
        "diagnosis_from_vignette",
      ].includes(normalizedArchetype);
    case "symptom_sign":
      return [
        "diagnosis_from_vignette",
        "anatomic_localization",
        "lab_interpretation",
        "physiology_prediction",
        "mechanism_after_diagnosis",
      ].includes(normalizedArchetype);
    case "treatment_or_procedure":
      return [
        "drug_selection",
        "adverse_effect",
        "complication",
        "mechanism_after_diagnosis",
        "diagnosis_from_vignette",
      ].includes(normalizedArchetype);
    default:
      return QUESTION_ARCHETYPES.includes(normalizedArchetype);
  }
};

const normalizeChoiceFingerprint = (text) =>
  normalizeNonEmptyString(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");

const normalizeTopicAnalysis = (input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { analysis: null, error: "Topic analysis is not an object." };
  }

  const canonicalTopic = normalizeNonEmptyString(input.canonicalTopic);
  const nature = normalizeNonEmptyString(input.nature);
  const confidence = Number(input.confidence);
  const appropriateRoles = normalizeEnumArray(input.appropriateRoles, TOPIC_ROLES);
  const preferredArchetypes = normalizeEnumArray(
    input.preferredArchetypes,
    QUESTION_ARCHETYPES,
  );
  const distractorFamily = normalizeNonEmptyString(input.distractorFamily);
  const systems = normalizeStringArray(input.systems);
  const avoid = normalizeStringArray(input.avoid);
  const reasoningNotes = normalizeStringArray(input.reasoningNotes);

  if (!canonicalTopic) {
    return { analysis: null, error: "Topic analysis canonicalTopic is missing." };
  }
  if (!TOPIC_NATURES.includes(nature)) {
    return { analysis: null, error: "Topic analysis nature is invalid." };
  }
  if (!Number.isFinite(confidence)) {
    return { analysis: null, error: "Topic analysis confidence is invalid." };
  }
  if (!appropriateRoles.length) {
    return { analysis: null, error: "Topic analysis appropriateRoles is empty." };
  }
  if (!preferredArchetypes.length) {
    return {
      analysis: null,
      error: "Topic analysis preferredArchetypes is empty.",
    };
  }
  if (!distractorFamily) {
    return {
      analysis: null,
      error: "Topic analysis distractorFamily is missing.",
    };
  }

  return {
    analysis: {
      canonicalTopic,
      nature,
      confidence: Math.max(0, Math.min(1, confidence)),
      appropriateRoles,
      preferredArchetypes,
      distractorFamily,
      systems,
      avoid,
      reasoningNotes,
    },
    error: null,
  };
};

const normalizeQuestionPlan = (input, { analysis } = {}) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { plan: null, error: "Question plan is not an object." };
  }

  const chosenRole = normalizeNonEmptyString(input.chosenRole);
  const chosenArchetype = normalizeNonEmptyString(input.chosenArchetype);
  const testedConcept = normalizeNonEmptyString(input.testedConcept);
  const stemStrategy =
    input.stemStrategy && typeof input.stemStrategy === "object"
      ? input.stemStrategy
      : null;
  const topicUsage = normalizeNonEmptyString(stemStrategy && stemStrategy.topicUsage);
  const shouldHideTopicName =
    stemStrategy && typeof stemStrategy.shouldHideTopicName === "boolean"
      ? stemStrategy.shouldHideTopicName
      : null;
  const reasoningChainRaw = normalizeStringArray(input.reasoningChain, {
    maxItems: 8,
  });
  const reasoningChain = compactReasoningChain(reasoningChainRaw, {
    testedConcept,
    analysis,
  });
  const vignetteStyle = normalizeNonEmptyString(input.vignetteStyle);
  const distractorStrategy = normalizeNonEmptyString(input.distractorStrategy);
  const difficulty = normalizeDifficultyKey(input.difficulty);

  if (!TOPIC_ROLES.includes(chosenRole)) {
    return { plan: null, error: "Question plan chosenRole is invalid." };
  }
  if (!QUESTION_ARCHETYPES.includes(chosenArchetype)) {
    return { plan: null, error: "Question plan chosenArchetype is invalid." };
  }
  if (!testedConcept) {
    return { plan: null, error: "Question plan testedConcept is missing." };
  }
  if (!STEM_TOPIC_USAGES.includes(topicUsage)) {
    return { plan: null, error: "Question plan topicUsage is invalid." };
  }
  if (typeof shouldHideTopicName !== "boolean") {
    return {
      plan: null,
      error: "Question plan shouldHideTopicName is invalid.",
    };
  }
  if (!reasoningChain.length) {
    return { plan: null, error: "Question plan reasoningChain is empty." };
  }
  if (!VIGNETTE_STYLES.includes(vignetteStyle)) {
    return { plan: null, error: "Question plan vignetteStyle is invalid." };
  }
  if (!distractorStrategy) {
    return {
      plan: null,
      error: "Question plan distractorStrategy is missing.",
    };
  }
  if (!difficulty) {
    return { plan: null, error: "Question plan difficulty is invalid." };
  }
  if (!isReasoningStepsCompatible(difficulty, reasoningChain.length)) {
    return {
      plan: null,
      error: `Question plan reasoning depth does not match ${difficulty} difficulty after normalization (steps=${reasoningChain.length}; chain=${JSON.stringify(reasoningChain)}).`,
    };
  }
  if (analysis && Array.isArray(analysis.appropriateRoles)) {
    const roleAllowed = analysis.appropriateRoles.includes(chosenRole);
    if (!roleAllowed) {
      return {
        plan: null,
        error: "Question plan chose a role outside topic analysis guidance.",
      };
    }
  }
  if (analysis && Array.isArray(analysis.preferredArchetypes)) {
    const archetypeAllowed = analysis.preferredArchetypes.includes(chosenArchetype);
    if (!archetypeAllowed) {
      return {
        plan: null,
        error:
          `Question plan chose an archetype outside topic analysis guidance (nature=${analysis.nature}; preferred=${JSON.stringify(analysis.preferredArchetypes)}; chosen=${JSON.stringify(chosenArchetype)}).`,
      };
    }
  }

  return {
    plan: {
      chosenRole,
      chosenArchetype,
      testedConcept,
      stemStrategy: {
        topicUsage,
        shouldHideTopicName,
      },
      reasoningChain,
      vignetteStyle,
      distractorStrategy,
      difficulty,
    },
    error: null,
  };
};

const normalizeGeneratedQuestion = (
  input,
  { difficulty, analysis, plan, topicContext } = {},
) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { question: null, error: "Generated question is not an object." };
  }

  const stem = normalizeNonEmptyString(input.stem);
  const correctKey = normalizeChoiceKey(input.correctKey);
  const correctExplanation = normalizeNonEmptyString(input.correctExplanation);
  const choicesRaw = Array.isArray(input.choices) ? input.choices : [];
  const metadata =
    input.metadata && typeof input.metadata === "object" ? input.metadata : null;

  if (!stem) return { question: null, error: "Question stem is missing." };
  if (!correctKey) {
    return { question: null, error: "Correct answer key is invalid." };
  }
  if (!correctExplanation) {
    return {
      question: null,
      error: "Correct answer explanation is missing.",
    };
  }
  if (choicesRaw.length !== 5) {
    return { question: null, error: "Expected exactly 5 answer choices." };
  }
  if (!metadata) {
    return { question: null, error: "Question metadata is missing." };
  }

  const seenKeys = new Set();
  const seenChoiceFingerprints = new Set();
  const choices = [];
  for (const entry of choicesRaw) {
    const key = normalizeChoiceKey(entry && entry.key);
    const text = normalizeNonEmptyString(entry && entry.text);
    const explanation = normalizeNonEmptyString(entry && entry.explanation);
    const fingerprint = normalizeChoiceFingerprint(text);

    if (!key) return { question: null, error: "Choice key must be A-E." };
    if (seenKeys.has(key)) {
      return { question: null, error: "Choice keys must be unique." };
    }
    if (!text) {
      return { question: null, error: `Choice ${key} is missing text.` };
    }
    if (!explanation) {
      return {
        question: null,
        error: `Choice ${key} is missing explanation.`,
      };
    }
    if (!fingerprint || seenChoiceFingerprints.has(fingerprint)) {
      return {
        question: null,
        error: "Choice texts must be distinct and non-duplicate.",
      };
    }

    seenKeys.add(key);
    seenChoiceFingerprints.add(fingerprint);
    choices.push({ key, text, explanation });
  }

  for (const key of CHOICE_KEYS) {
    if (!seenKeys.has(key)) {
      return { question: null, error: `Missing choice ${key}.` };
    }
  }

  const metadataTestedConcept = normalizeNonEmptyString(metadata.testedConcept);
  const metadataArchetype = normalizeNonEmptyString(metadata.archetype);
  const metadataNature = normalizeNonEmptyString(metadata.nature);
  const metadataReasoningSteps = Math.round(Number(metadata.reasoningSteps));

  if (!metadataTestedConcept) {
    return { question: null, error: "Question metadata.testedConcept is missing." };
  }
  if (!QUESTION_ARCHETYPES.includes(metadataArchetype)) {
    return { question: null, error: "Question metadata.archetype is invalid." };
  }
  if (!TOPIC_NATURES.includes(metadataNature)) {
    return { question: null, error: "Question metadata.nature is invalid." };
  }
  if (
    !Number.isFinite(metadataReasoningSteps) ||
    metadataReasoningSteps <= 0
  ) {
    return {
      question: null,
      error: "Question metadata.reasoningSteps is invalid.",
    };
  }

  if (difficulty && !isReasoningStepsCompatible(difficulty, metadataReasoningSteps)) {
    return {
      question: null,
      error: `Question reasoning depth does not match ${difficulty} difficulty.`,
    };
  }
  if (analysis && metadataNature !== analysis.nature) {
    return {
      question: null,
      error: "Question metadata nature drifted from topic analysis.",
    };
  }
  if (analysis && !isArchetypeCompatibleWithNature(analysis.nature, metadataArchetype)) {
    return {
      question: null,
      error: "Question archetype is incompatible with topic nature.",
    };
  }
  if (plan && metadataArchetype !== plan.chosenArchetype) {
    return {
      question: null,
      error: "Question metadata archetype drifted from the plan.",
    };
  }
  if (plan && plan.stemStrategy && plan.stemStrategy.shouldHideTopicName) {
    const topicText =
      topicContext && typeof topicContext === "object" ? topicContext.topic : "";
    if (
      normalizeComparisonString(topicText) &&
      normalizeComparisonString(stem).includes(normalizeComparisonString(topicText))
    ) {
      return {
        question: null,
        error: "Question stem exposed the topic name despite a hidden-topic plan.",
      };
    }
  }

  choices.sort((a, b) => a.key.localeCompare(b.key));

  return {
    question: {
      stem,
      choices,
      correctKey,
      correctExplanation,
      metadata: {
        testedConcept: metadataTestedConcept,
        archetype: metadataArchetype,
        nature: metadataNature,
        reasoningSteps: metadataReasoningSteps,
      },
    },
    error: null,
  };
};

const normalizeQuestion = (input, options = {}) =>
  normalizeGeneratedQuestion(input, options);

const normalizeValidationResult = (
  input,
  { difficulty, analysis, plan, topicContext, requireRepair = false } = {},
) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { validation: null, error: "Validation result is not an object." };
  }

  const valid = typeof input.valid === "boolean" ? input.valid : null;
  const issues = normalizeStringArray(input.issues, { maxItems: 12 });
  const repairedQuestionInput =
    Object.prototype.hasOwnProperty.call(input, "repairedQuestion")
      ? input.repairedQuestion
      : undefined;

  if (typeof valid !== "boolean") {
    return { validation: null, error: "Validation result valid flag is invalid." };
  }

  let repairedQuestion = null;
  if (repairedQuestionInput !== null && typeof repairedQuestionInput !== "undefined") {
    const normalizedRepaired = normalizeGeneratedQuestion(repairedQuestionInput, {
      difficulty,
      analysis,
      plan,
      topicContext,
    });
    if (!normalizedRepaired.question) {
      return {
        validation: null,
        error:
          normalizedRepaired.error ||
          "Validation repairedQuestion has invalid shape.",
      };
    }
    repairedQuestion = normalizedRepaired.question;
  }

  if (!valid && requireRepair && !repairedQuestion) {
    return {
      validation: null,
      error: "Validation rejected the question without providing a repair.",
    };
  }

  return {
    validation: {
      valid,
      issues,
      repairedQuestion,
    },
    error: null,
  };
};

const buildTopicAnalysisMessages = ({ topicContext, difficultyProfile, mode }) => {
  const { safeMode, promptDifficulty } = getPromptSettings({
    mode,
    difficultyProfile,
  });
  const systemMessage =
    "You are the topic-analysis stage of a USMLE Step 1 question pipeline. Return only valid JSON.";
  const userMessage = `Widget mode: ${safeMode.toUpperCase()}
Requested difficulty: ${promptDifficulty.toUpperCase()}

${summarizeTopicContext(topicContext)}

Task:
- Infer what kind of entity the topic is from the topic name plus any note preview and sample note Q/A pairs.
- Infer how it should function best in a USMLE Step 1 item.
- Given the topic, infer whether it should function best as the hidden answer, the tested concept, or a clue inside the vignette. Prefer indirect testing when appropriate.
- Do not overfit the analysis to a single difficulty; identify the genuinely appropriate roles and archetypes that later planning could adapt across easy, medium, and hard variants.
- Avoid pure definition-style questions unless the topic and requested difficulty strongly support it.
- Output only roles and archetypes that are genuinely appropriate for this topic.

Analysis expectations:
- Choose one TopicNature.
- appropriateRoles should contain only realistic ways the topic can be used.
- preferredArchetypes should prioritize the most Step 1-like item styles for this topic.
- distractorFamily should describe what family the answer choices should come from.
- systems should identify relevant organ systems or disciplines.
- avoid should list obvious bad directions or common low-quality question styles to avoid.
- reasoningNotes should capture concise internal justifications for later planning.

Return JSON only.`;

  return { systemMessage, userMessage };
};

const buildQuestionPlanMessages = ({
  topicContext,
  difficultyProfile,
  analysis,
  mode,
}) => {
  const { safeMode, promptDifficulty, difficultyBlock } = getPromptSettings({
    mode,
    difficultyProfile,
  });
  const systemMessage =
    "You are the planning stage of a USMLE Step 1 question pipeline. Return only valid JSON.";
  const userMessage = `Widget mode: ${safeMode.toUpperCase()}
Requested difficulty: ${promptDifficulty.toUpperCase()}

${summarizeTopicContext(topicContext)}

Topic analysis:
${JSON.stringify(analysis, null, 2)}

Task:
- Choose the single best archetype for the requested difficulty.
- Choose the single best role for the topic.
- Choose the tested concept that should actually be assessed.
- Choose whether the topic should act as the hidden answer, the tested concept, or a clue only.
- Choose the most Step 1-like archetype for this topic and difficulty. The topic should not be named in the stem unless directly necessary.

Difficulty control:
${difficultyBlock}
${DIFFICULTY_CONTROL_DIMENSIONS}

Planning requirements:
- Easy must be 1 step, or at most 2 only when the second step is a trivial bridge.
- Medium should usually be 2-step.
- Hard should be 3+ steps and more integrated.
- Hard may use integrated archetypes that cross disease, mechanism, lab, physiology, histology, or genetics boundaries when they remain Step 1-like and keep distractors in the same conceptual family.
- The topic name should usually NOT appear in the stem unless the role is adverse-effect or direct pharmacology after treatment.
- Distractors must stay in the same family.
- Keep reasoningChain concise and explicitly sequenced.
- reasoningChain must contain only the essential scored inference steps, not setup details, stem facts, diagnosis labels, or restatements of the tested concept.
- For easy, return a reasoningChain array of length 1, or 2 only if absolutely necessary.
- stemStrategy.shouldHideTopicName should usually be true when the topic is the hidden answer or tested concept.

Return JSON only.`;

  return { systemMessage, userMessage };
};

const buildQuestionGenerationMessages = ({
  topicContext,
  difficultyProfile,
  analysis,
  plan,
  mode,
}) => {
  const { safeMode, promptDifficulty, difficultyBlock } = getPromptSettings({
    mode,
    difficultyProfile,
  });
  const systemMessage =
    "You are the generation stage of a USMLE Step 1 question pipeline. Return only valid JSON.";
  const userMessage = `Widget mode: ${safeMode.toUpperCase()}
Requested difficulty: ${promptDifficulty.toUpperCase()}

${summarizeTopicContext(topicContext)}

Topic analysis:
${JSON.stringify(analysis, null, 2)}

Question plan:
${JSON.stringify(plan, null, 2)}

Task:
- Generate a clinical item that tests the topic through reasoning, not a direct definition.
- Generate from the plan, not directly from the raw topic.
- If plan.stemStrategy.topicUsage is "answer", the stem should lead to the topic as the hidden diagnosis or answer.
- If plan.stemStrategy.topicUsage is "tested_concept", the stem should lead to a scenario and then ask about mechanism, pathway, target, or downstream concept.
- If plan.stemStrategy.topicUsage is "clue_only", the topic should appear only as a clue, not as the answer.

Output requirements:
- Exactly five choices A-E.
- One best answer only.
- Keep all answer choices in the same conceptual category.
- Include at least one discriminating clue that defeats the strongest distractor.
- No EXCEPT or NOT questions.
- Make the item feel like Step 1 rather than a classroom definition quiz.
- metadata.testedConcept must match the plan.
- metadata.archetype must match the plan.
- metadata.nature must match the analysis nature.
- metadata.reasoningSteps should reflect the plan complexity.

Difficulty control:
${difficultyBlock}
${DIFFICULTY_CONTROL_DIMENSIONS}

Return JSON only.`;

  return { systemMessage, userMessage };
};

const buildQuestionValidationMessages = ({
  topicContext,
  difficultyProfile,
  analysis,
  plan,
  question,
  mode,
}) => {
  const { safeMode, promptDifficulty, difficultyBlock } = getPromptSettings({
    mode,
    difficultyProfile,
  });
  const systemMessage =
    "You are the validation-and-repair stage of a USMLE Step 1 question pipeline. Return only valid JSON.";
  const userMessage = `Widget mode: ${safeMode.toUpperCase()}
Requested difficulty: ${promptDifficulty.toUpperCase()}

${summarizeTopicContext(topicContext)}

Topic analysis:
${JSON.stringify(analysis, null, 2)}

Question plan:
${JSON.stringify(plan, null, 2)}

Generated question:
${JSON.stringify(question, null, 2)}

Validation checklist:
- Is there only one best answer?
- Are distractors in the same family and plausible?
- Is the stem solvable from the clues?
- Does the item match requested difficulty?
- Does it feel like Step 1 rather than a classroom definition quiz?
- Is the topic hidden, tested, or clue-used appropriately?
- Reject questions where the answer is obvious from a single buzzword or where distractors are cross-category.

Repair requirements:
- If the question is valid, return valid=true, issues as a concise list, and repairedQuestion=null.
- If the question is invalid, repair it and return repairedQuestion in full GeneratedQuestion shape.
- Preserve the core topic, plan intent, same-family distractor strategy, and requested difficulty.
- Do not introduce negative phrasing such as EXCEPT or NOT.

Difficulty control:
${difficultyBlock}
${DIFFICULTY_CONTROL_DIMENSIONS}

Return JSON only.`;

  return { systemMessage, userMessage };
};

const extractJsonFromText = (text) => {
  const raw = String(text || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    // Continue to fallback extraction.
  }

  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      // Continue to fallback extraction.
    }
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const chunk = raw.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(chunk);
    } catch {
      return null;
    }
  }

  return null;
};

const extractResponseText = (data) => {
  if (data && typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const output = data && Array.isArray(data.output) ? data.output : [];
  const fragments = [];

  for (const item of output) {
    const content = item && Array.isArray(item.content) ? item.content : [];
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      if (typeof block.text === "string" && block.text.trim()) {
        fragments.push(block.text.trim());
      }
    }
  }

  return fragments.join("\n").trim();
};
const callResponsesJson = async ({
  apiKey,
  schemaName,
  schema,
  messages,
  model = "gpt-5-mini",
}) => {
  let timeoutId = null;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: (Array.isArray(messages) ? messages : []).map((message) => ({
          role: message.role,
          content: [{ type: "input_text", text: message.text }],
        })),
        text: {
          format: {
            type: "json_schema",
            name: schemaName,
            schema,
            strict: true,
          },
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `OpenAI request failed (${response.status}): ${body.slice(0, 300)}`,
      );
    }

    const data = await response.json();
    const text = extractResponseText(data);
    const json = extractJsonFromText(text);
    if (!json) {
      throw new Error("OpenAI returned non-JSON content.");
    }
    return json;
  } catch (err) {
    const isTimeout =
      err && typeof err === "object" && err.name === "AbortError";
    if (isTimeout) {
      throw new Error(
        `OpenAI request timed out after ${Math.round(OPENAI_TIMEOUT_MS / 1000)}s.`,
      );
    }
    throw err;
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
};

const analyzeTopic = async ({ apiKey, mode, difficultyProfile, topicContext }) => {
  const { systemMessage, userMessage } = buildTopicAnalysisMessages({
    mode,
    difficultyProfile,
    topicContext,
  });
  const json = await callResponsesJson({
    apiKey,
    schemaName: "step1_topic_analysis",
    schema: TOPIC_ANALYSIS_SCHEMA,
    messages: [
      { role: "system", text: systemMessage },
      { role: "user", text: userMessage },
    ],
  });
  const normalized = normalizeTopicAnalysis(json);
  if (!normalized.analysis) {
    throw new Error(normalized.error || "Topic analysis schema was invalid.");
  }
  return normalized.analysis;
};

const planQuestion = async ({
  apiKey,
  mode,
  difficultyProfile,
  topicContext,
  analysis,
}) => {
  const { systemMessage, userMessage } = buildQuestionPlanMessages({
    mode,
    difficultyProfile,
    topicContext,
    analysis,
  });
  const json = await callResponsesJson({
    apiKey,
    schemaName: "step1_question_plan",
    schema: QUESTION_PLAN_SCHEMA,
    messages: [
      { role: "system", text: systemMessage },
      { role: "user", text: userMessage },
    ],
  });
  const normalized = normalizeQuestionPlan(json, { analysis });
  if (!normalized.plan) {
    throw new Error(normalized.error || "Question plan schema was invalid.");
  }
  return normalized.plan;
};

const generateQuestionFromPlan = async ({
  apiKey,
  mode,
  difficultyProfile,
  topicContext,
  analysis,
  plan,
}) => {
  const { systemMessage, userMessage } = buildQuestionGenerationMessages({
    mode,
    difficultyProfile,
    topicContext,
    analysis,
    plan,
  });
  const json = await callResponsesJson({
    apiKey,
    schemaName: "step1_generated_question",
    schema: GENERATED_QUESTION_SCHEMA,
    messages: [
      { role: "system", text: systemMessage },
      { role: "user", text: userMessage },
    ],
  });
  const normalized = normalizeGeneratedQuestion(json, {
    difficulty: plan && plan.difficulty,
    analysis,
    plan,
    topicContext,
  });
  if (!normalized.question) {
    throw new Error(
      normalized.error || "Generated question schema was invalid.",
    );
  }
  return normalized.question;
};

const validateOrRepairQuestion = async ({
  apiKey,
  mode,
  difficultyProfile,
  topicContext,
  analysis,
  plan,
  question,
}) => {
  const { systemMessage, userMessage } = buildQuestionValidationMessages({
    mode,
    difficultyProfile,
    topicContext,
    analysis,
    plan,
    question,
  });
  const json = await callResponsesJson({
    apiKey,
    schemaName: "step1_validation_result",
    schema: VALIDATION_SCHEMA,
    messages: [
      { role: "system", text: systemMessage },
      { role: "user", text: userMessage },
    ],
  });
  const normalized = normalizeValidationResult(json, {
    difficulty: plan && plan.difficulty,
    analysis,
    plan,
    topicContext,
    requireRepair: true,
  });
  if (!normalized.validation) {
    throw new Error(
      normalized.error || "Validation result schema was invalid.",
    );
  }
  return normalized.validation;
};

const getMemoizedTopicAnalysis = async ({
  apiKey,
  mode,
  difficultyProfile,
  topicContext,
  topicKey,
}) => {
  const cacheKey = normalizeNonEmptyString(topicKey);
  if (!cacheKey) {
    return analyzeTopic({ apiKey, mode, difficultyProfile, topicContext });
  }

  const now = Date.now();
  const existing = analysisCacheByTopicKey.get(cacheKey);
  if (
    existing &&
    existing.analysis &&
    Number.isFinite(existing.savedAt) &&
    now - existing.savedAt <= ANALYSIS_CACHE_TTL_MS
  ) {
    return existing.analysis;
  }
  if (existing && existing.promise) {
    return existing.promise;
  }

  const promise = analyzeTopic({
    apiKey,
    mode,
    difficultyProfile,
    topicContext,
  })
    .then((analysis) => {
      analysisCacheByTopicKey.set(cacheKey, {
        analysis,
        savedAt: Date.now(),
      });
      return analysis;
    })
    .catch((err) => {
      analysisCacheByTopicKey.delete(cacheKey);
      throw err;
    });

  analysisCacheByTopicKey.set(cacheKey, { promise, savedAt: now });
  return promise;
};

const loadApiKey = (dispatch) => {
  const nodeScript = `
const fs = require("fs");

const STORE = '${escapeForSingleQuotedShell(SETTINGS_STORE)}';

function main() {
  if (!fs.existsSync(STORE)) {
    console.log(JSON.stringify({ ok: true, openaiApiKey: "", warning: null }));
    return;
  }

  let raw;
  try {
    raw = fs.readFileSync(STORE, "utf8");
  } catch (err) {
    console.log(JSON.stringify({
      ok: true,
      openaiApiKey: "",
      warning: "Could not read settings file: " + String(err && err.message ? err.message : err),
    }));
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.log(JSON.stringify({
      ok: true,
      openaiApiKey: "",
      warning: "Settings JSON is malformed. Save your key again.",
    }));
    return;
  }

  if (!parsed || typeof parsed !== "object" || Number(parsed.version) !== 1) {
    console.log(JSON.stringify({
      ok: true,
      openaiApiKey: "",
      warning: "Settings schema is invalid. Save your key again.",
    }));
    return;
  }

  const openaiApiKey =
    typeof parsed.openaiApiKey === "string" ? parsed.openaiApiKey.trim() : "";

  console.log(JSON.stringify({ ok: true, openaiApiKey, warning: null }));
}

main();
`;

  run(`"${NODE}" <<'EOF'\n${nodeScript}\nEOF`)
    .then((result) => {
      try {
        const data = JSON.parse(String(result || "").trim());
        dispatch({
          type: "LOAD_API_KEY_RESULT",
          ok: !!(data && data.ok),
          openaiApiKey:
            data && typeof data.openaiApiKey === "string"
              ? data.openaiApiKey
              : "",
          warning:
            data && typeof data.warning === "string" ? data.warning : null,
          error:
            data && data.ok
              ? null
              : String((data && data.error) || "Could not load API key."),
        });
      } catch {
        dispatch({
          type: "LOAD_API_KEY_RESULT",
          ok: false,
          openaiApiKey: "",
          warning: null,
          error: "Could not parse API key load response.",
        });
      }
    })
    .catch((err) => {
      dispatch({
        type: "LOAD_API_KEY_RESULT",
        ok: false,
        openaiApiKey: "",
        warning: null,
        error: `API key load failed: ${String(err && err.message ? err.message : err)}`,
      });
    });
};

// Old one-pass "topic -> final question" generation was replaced here with a
// four-stage pipeline: analysis -> planning -> generation -> validation/repair.
const generateQuestionPipeline = async (
  { apiKey, mode, difficultyProfile, topicContext, generationId, topicKey },
  dispatch,
) => {
  const safeMode = normalizeModeKey(mode) || DEFAULT_MODE;
  const normalizedTopicContext = normalizeTopicContext(topicContext);
  if (!normalizedTopicContext) {
    dispatch({
      type: "GENERATE_RESULT",
      mode: safeMode,
      ok: false,
      generationId,
      topicKey,
      error: "Question analysis failed: topic context is invalid.",
    });
    return;
  }

  const promptDifficulty = getDifficultyForMode(safeMode);
  const analysisTopicKey = makeAnalysisTopicKey(normalizedTopicContext);
  let currentStage = "analysis";

  try {
    const analysis = await getMemoizedTopicAnalysis({
      apiKey,
      mode: safeMode,
      difficultyProfile,
      topicContext: normalizedTopicContext,
      topicKey: analysisTopicKey,
    });

    currentStage = "planning";
    const plan = await planQuestion({
      apiKey,
      mode: safeMode,
      difficultyProfile,
      topicContext: normalizedTopicContext,
      analysis,
    });

    currentStage = "generation";
    const generatedQuestion = await generateQuestionFromPlan({
      apiKey,
      mode: safeMode,
      difficultyProfile,
      topicContext: normalizedTopicContext,
      analysis,
      plan,
    });

    currentStage = "validation";
    const validation = await validateOrRepairQuestion({
      apiKey,
      mode: safeMode,
      difficultyProfile,
      topicContext: normalizedTopicContext,
      analysis,
      plan,
      question: generatedQuestion,
    });

    const finalCandidate = validation.valid
      ? generatedQuestion
      : validation.repairedQuestion;
    const normalizedFinalQuestion = normalizeGeneratedQuestion(finalCandidate, {
      difficulty: promptDifficulty,
      analysis,
      plan,
      topicContext: normalizedTopicContext,
    });
    if (!normalizedFinalQuestion.question) {
      throw new Error(
        normalizedFinalQuestion.error ||
          "Validated question has invalid final shape.",
      );
    }

    const randomizedQuestion = randomizeQuestionChoices(
      normalizedFinalQuestion.question,
    );

    dispatch({
      type: "GENERATE_RESULT",
      mode: safeMode,
      ok: true,
      generationId,
      topicKey,
      question: randomizedQuestion,
      analysis,
      plan,
      validationIssues: validation.issues,
    });
  } catch (err) {
    dispatch({
      type: "GENERATE_RESULT",
      mode: safeMode,
      ok: false,
      generationId,
      topicKey,
      error: `Question ${currentStage} failed: ${String(err && err.message ? err.message : err)}`,
    });
  }
};

const emptyPendingByMode = () => makeModeMap(() => null);
const emptyContextByMode = () => makeModeMap(() => null);
const emptyQuestionByMode = () => makeModeMap(() => null);
const emptyErrorByMode = () => makeModeMap(() => null);
const emptyAnalysisByMode = () => makeModeMap(() => null);
const emptyPlanByMode = () => makeModeMap(() => null);
const emptyValidationIssuesByMode = () => makeModeMap(() => []);
const emptySelectedByMode = () => makeModeMap(() => "");
const emptyRevealedByMode = () => makeModeMap(() => false);
const emptyResultByMode = () => makeModeMap(() => "");
const emptyLoadingByMode = () => makeModeMap(() => false);
const emptyGenerationIdByMode = () => makeModeMap(() => 0);

const makeTopicKey = (mode, context) => {
  const safeMode = normalizeModeKey(mode);
  if (!safeMode || !context || typeof context !== "object") return "";
  const topic = typeof context.topic === "string" ? context.topic : "";
  const path = typeof context.path === "string" ? context.path : "";
  return `${safeMode}::${path}::${topic}`;
};

const makeAnalysisTopicKey = (context) => {
  if (!context || typeof context !== "object") return "";
  const topic = typeof context.topic === "string" ? context.topic : "";
  const path = typeof context.path === "string" ? context.path : "";
  return `${path}::${topic}`;
};

const scheduleGenerationForContexts = (baseState, payload) => {
  const payloadContexts = payload && payload.contexts ? payload.contexts : null;
  if (!payloadContexts || !payloadContexts.easy) {
    return {
      ...baseState,
      topicContextByMode: emptyContextByMode(),
      loadingByMode: emptyLoadingByMode(),
      errorByMode: emptyErrorByMode(),
      questionByMode: emptyQuestionByMode(),
      analysisByMode: emptyAnalysisByMode(),
      planByMode: emptyPlanByMode(),
      validationIssuesByMode: emptyValidationIssuesByMode(),
      selectedKeyByMode: emptySelectedByMode(),
      revealedByMode: emptyRevealedByMode(),
      resultByMode: emptyResultByMode(),
      pendingGenerationByMode: emptyPendingByMode(),
      latestGenerationIdByMode: emptyGenerationIdByMode(),
    };
  }
  const contexts = {
    easy: payloadContexts.easy || null,
  };

  const hasApiKey =
    typeof baseState.apiKey === "string" && baseState.apiKey.trim().length > 0;
  let nextGenerationCounter = Number(baseState.generationCounter);
  const nextTopicContextByMode = emptyContextByMode();
  const nextLoadingByMode = emptyLoadingByMode();
  const nextQuestionByMode = emptyQuestionByMode();
  const nextErrorByMode = emptyErrorByMode();
  const nextAnalysisByMode = emptyAnalysisByMode();
  const nextPlanByMode = emptyPlanByMode();
  const nextValidationIssuesByMode = emptyValidationIssuesByMode();
  const nextSelectedByMode = emptySelectedByMode();
  const nextRevealedByMode = emptyRevealedByMode();
  const nextResultByMode = emptyResultByMode();
  const nextPendingByMode = emptyPendingByMode();
  const nextGenerationIdByMode = {
    ...baseState.latestGenerationIdByMode,
  };

  for (const mode of QUESTION_MODES) {
    const context = contexts[mode];

    nextTopicContextByMode[mode] = context || null;
    nextQuestionByMode[mode] = null;
    nextAnalysisByMode[mode] = null;
    nextPlanByMode[mode] = null;
    nextValidationIssuesByMode[mode] = [];

    if (hasApiKey && context) {
      const nextGenerationId = nextGenerationCounter + 1;
      nextGenerationCounter = nextGenerationId;
      nextLoadingByMode[mode] = true;
      nextPendingByMode[mode] = {
        generationId: nextGenerationId,
        topicKey: makeTopicKey(mode, context),
      };
      nextGenerationIdByMode[mode] = nextGenerationId;
    } else {
      nextLoadingByMode[mode] = false;
    }
  }

  return {
    ...baseState,
    activeMode: DEFAULT_MODE,
    topicContextByMode: nextTopicContextByMode,
    loadingByMode: nextLoadingByMode,
    errorByMode: nextErrorByMode,
    questionByMode: nextQuestionByMode,
    analysisByMode: nextAnalysisByMode,
    planByMode: nextPlanByMode,
    validationIssuesByMode: nextValidationIssuesByMode,
    selectedKeyByMode: nextSelectedByMode,
    revealedByMode: nextRevealedByMode,
    resultByMode: nextResultByMode,
    pendingGenerationByMode: nextPendingByMode,
    latestGenerationIdByMode: nextGenerationIdByMode,
    generationCounter: nextGenerationCounter,
  };
};

export const initialState = {
  output: "",
  error: null,

  needsApiKeyLoad: true,
  apiKeyLoaded: false,
  apiKeyLoading: false,
  apiKey: "",
  apiKeyWarning: null,

  activeMode: DEFAULT_MODE,
  loadingByMode: emptyLoadingByMode(),
  errorByMode: emptyErrorByMode(),
  questionByMode: emptyQuestionByMode(),
  analysisByMode: emptyAnalysisByMode(),
  planByMode: emptyPlanByMode(),
  validationIssuesByMode: emptyValidationIssuesByMode(),
  selectedKeyByMode: emptySelectedByMode(),
  revealedByMode: emptyRevealedByMode(),
  resultByMode: emptyResultByMode(),
  topicContextByMode: emptyContextByMode(),
  pendingGenerationByMode: emptyPendingByMode(),
  latestGenerationIdByMode: emptyGenerationIdByMode(),
  generationCounter: 0,

  refreshNonce: 0,
  pendingCommandRefreshNonce: null,
};

export const updateState = (event, prev) => {
  if (event && event.type === "LOAD_API_KEY_START") {
    return {
      ...prev,
      needsApiKeyLoad: false,
      apiKeyLoading: true,
      apiKeyWarning: null,
    };
  }

  if (event && event.type === "LOAD_API_KEY_RESULT") {
    const nextKey = event.ok ? String(event.openaiApiKey || "") : "";
    const next = {
      ...prev,
      needsApiKeyLoad: false,
      apiKeyLoaded: true,
      apiKeyLoading: false,
      apiKey: nextKey,
      apiKeyWarning: event.ok ? event.warning || null : event.error || null,
    };

    const hadApiKey =
      typeof prev.apiKey === "string" && prev.apiKey.trim().length > 0;
    const hasApiKey = nextKey.trim().length > 0;
    if (!hasApiKey) {
      return {
        ...next,
        loadingByMode: emptyLoadingByMode(),
        pendingGenerationByMode: emptyPendingByMode(),
      };
    }

    if (!hadApiKey) {
      const parsedPayload = parseCommandPayload(prev.output);
      if (parsedPayload) {
        return scheduleGenerationForContexts(next, parsedPayload);
      }
    }

    return next;
  }

  if (event && event.type === "AUTO_REFRESH_TICK") {
    if (!prev.revealedByMode.easy) {
      return prev;
    }
    const nextNonce = Number(prev.refreshNonce) + 1;
    return {
      ...prev,
      refreshNonce: nextNonce,
      pendingCommandRefreshNonce: nextNonce,
      error: null,
    };
  }

  if (event && event.type === "REFRESH_CLICKED") {
    const nextNonce = Number(prev.refreshNonce) + 1;
    return {
      ...prev,
      refreshNonce: nextNonce,
      pendingCommandRefreshNonce: nextNonce,
      error: null,
    };
  }

  if (event && event.type === "FORCE_COMMAND_REFRESH") {
    if (Number(event.nonce) !== Number(prev.pendingCommandRefreshNonce)) {
      return prev;
    }
    return {
      ...prev,
      pendingCommandRefreshNonce: null,
    };
  }

  // MODE_SELECTED is intentionally unused while single-question easy mode is active.

  if (event && event.type === "GENERATION_REQUEST_SENT") {
    const mode = normalizeModeKey(event.mode);
    if (!mode) return prev;

    const pending = prev.pendingGenerationByMode[mode];
    if (!pending) return prev;
    if (Number(event.generationId) !== Number(pending.generationId)) {
      return prev;
    }
    if (String(event.topicKey || "") !== String(pending.topicKey || "")) {
      return prev;
    }

    return {
      ...prev,
      pendingGenerationByMode: {
        ...prev.pendingGenerationByMode,
        [mode]: null,
      },
    };
  }

  if (event && event.type === "GENERATE_RESULT") {
    const mode = normalizeModeKey(event.mode);
    if (!mode) return prev;

    if (
      Number(event.generationId) !== Number(prev.latestGenerationIdByMode[mode])
    ) {
      return prev;
    }

    if (!event.ok) {
      return {
        ...prev,
        loadingByMode: {
          ...prev.loadingByMode,
          [mode]: false,
        },
        questionByMode: {
          ...prev.questionByMode,
          [mode]: null,
        },
        analysisByMode: {
          ...prev.analysisByMode,
          [mode]: null,
        },
        planByMode: {
          ...prev.planByMode,
          [mode]: null,
        },
        validationIssuesByMode: {
          ...prev.validationIssuesByMode,
          [mode]: [],
        },
        errorByMode: {
          ...prev.errorByMode,
          [mode]: String(event.error || "Could not generate question."),
        },
        selectedKeyByMode: {
          ...prev.selectedKeyByMode,
          [mode]: "",
        },
        revealedByMode: {
          ...prev.revealedByMode,
          [mode]: false,
        },
        resultByMode: {
          ...prev.resultByMode,
          [mode]: "",
        },
      };
    }

    return {
      ...prev,
      loadingByMode: {
        ...prev.loadingByMode,
        [mode]: false,
      },
      errorByMode: {
        ...prev.errorByMode,
        [mode]: null,
      },
      questionByMode: {
        ...prev.questionByMode,
        [mode]: event.question || null,
      },
      analysisByMode: {
        ...prev.analysisByMode,
        [mode]:
          event.analysis && typeof event.analysis === "object"
            ? event.analysis
            : null,
      },
      planByMode: {
        ...prev.planByMode,
        [mode]:
          event.plan && typeof event.plan === "object" ? event.plan : null,
      },
      validationIssuesByMode: {
        ...prev.validationIssuesByMode,
        [mode]: Array.isArray(event.validationIssues)
          ? normalizeStringArray(event.validationIssues, { maxItems: 12 })
          : [],
      },
      selectedKeyByMode: {
        ...prev.selectedKeyByMode,
        [mode]: "",
      },
      revealedByMode: {
        ...prev.revealedByMode,
        [mode]: false,
      },
      resultByMode: {
        ...prev.resultByMode,
        [mode]: "",
      },
    };
  }

  if (event && event.type === "SELECT_ANSWER") {
    const mode =
      normalizeModeKey(event.mode) || normalizeModeKey(prev.activeMode);
    if (!mode || prev.revealedByMode[mode]) return prev;

    const key = normalizeChoiceKey(event.key);
    if (!key) return prev;

    const question =
      prev.questionByMode && prev.questionByMode[mode]
        ? prev.questionByMode[mode]
        : null;
    const isCorrect =
      question &&
      typeof question === "object" &&
      normalizeChoiceKey(question.correctKey) === key;
    const hasValidCorrectKey =
      !!question &&
      typeof question === "object" &&
      !!normalizeChoiceKey(question.correctKey);
    const nextResult = hasValidCorrectKey
      ? isCorrect
        ? "correct"
        : "incorrect"
      : "";

    return {
      ...prev,
      selectedKeyByMode: {
        ...prev.selectedKeyByMode,
        [mode]: key,
      },
      revealedByMode: {
        ...prev.revealedByMode,
        [mode]: true,
      },
      resultByMode: {
        ...prev.resultByMode,
        [mode]: nextResult,
      },
    };
  }

  if (event && event.error) {
    return { ...prev, error: String(event.error) };
  }

  if (event && typeof event.output === "string") {
    const base = {
      ...prev,
      output: event.output,
      error: null,
      pendingCommandRefreshNonce: null,
    };
    const parsedPayload = parseCommandPayload(event.output);
    if (!parsedPayload) {
      return {
        ...base,
        activeMode: DEFAULT_MODE,
        loadingByMode: emptyLoadingByMode(),
        errorByMode: emptyErrorByMode(),
        questionByMode: emptyQuestionByMode(),
        analysisByMode: emptyAnalysisByMode(),
        planByMode: emptyPlanByMode(),
        validationIssuesByMode: emptyValidationIssuesByMode(),
        selectedKeyByMode: emptySelectedByMode(),
        revealedByMode: emptyRevealedByMode(),
        resultByMode: emptyResultByMode(),
        topicContextByMode: emptyContextByMode(),
        pendingGenerationByMode: emptyPendingByMode(),
        latestGenerationIdByMode: emptyGenerationIdByMode(),
      };
    }

    return scheduleGenerationForContexts(base, parsedPayload);
  }

  return prev;
};

export const render = (
  {
    output,
    error,
    apiKeyLoaded,
    needsApiKeyLoad,
    apiKeyLoading,
    apiKey,
    apiKeyWarning,
    loadingByMode,
    errorByMode,
    questionByMode,
    selectedKeyByMode,
    revealedByMode,
    resultByMode,
    topicContextByMode,
    pendingGenerationByMode,
    pendingCommandRefreshNonce,
  },
  dispatch,
) => {
  ensureAutoRefresh(dispatch);

  if (needsApiKeyLoad && !apiKeyLoaded && !apiKeyLoading) {
    setTimeout(() => {
      dispatch({ type: "LOAD_API_KEY_START" });
      loadApiKey(dispatch);
    }, 0);
  }

  if (error) {
    return (
      <div className="card">
        <div className="error">{String(error)}</div>
      </div>
    );
  }

  let rawData;
  try {
    rawData = JSON.parse((output || "").trim());
  } catch {
    rawData = { error: "Could not parse JSON output.", raw: output };
  }

  if (!rawData || rawData.error) {
    return (
      <div className="card">
        <div className="title">USMLE Question</div>
        <div className="error">{rawData?.error || "No data yet."}</div>
      </div>
    );
  }

  const parsedPayload = parseCommandPayload(output);
  if (!parsedPayload) {
    return (
      <div className="card">
        <div className="title">USMLE Question</div>
        <div className="error">Unexpected data shape from command output.</div>
      </div>
    );
  }

  const mode = "easy";
  const contexts = parsedPayload.contexts;
  const activeContext = topicContextByMode[mode] || contexts[mode];
  const commandWarning =
    parsedPayload.warning ||
    (typeof rawData.warning === "string" ? rawData.warning : null);

  const hasApiKey = typeof apiKey === "string" && apiKey.trim().length > 0;

  if (pendingCommandRefreshNonce !== null) {
    const refreshKey = String(pendingCommandRefreshNonce);
    if (!scheduledRefreshRequests.has(refreshKey)) {
      scheduledRefreshRequests.add(refreshKey);
      setTimeout(() => {
        scheduledRefreshRequests.delete(refreshKey);
        dispatch({
          type: "FORCE_COMMAND_REFRESH",
          nonce: pendingCommandRefreshNonce,
        });
        run(command)
          .then((refreshedOutput) => {
            dispatch({ output: String(refreshedOutput || "") });
          })
          .catch((err) => {
            dispatch({
              error: `Refresh failed: ${String(err && err.message ? err.message : err)}`,
            });
          });
      }, 0);
    }
  }

  if (hasApiKey) {
    const pending = pendingGenerationByMode.easy;
    const context = topicContextByMode.easy;
    if (pending && context) {
      const requestKey = `easy::${pending.generationId}::${pending.topicKey}`;
      if (!scheduledGenerationRequests.has(requestKey)) {
        scheduledGenerationRequests.add(requestKey);
        setTimeout(() => {
          scheduledGenerationRequests.delete(requestKey);
          dispatch({
            type: "GENERATION_REQUEST_SENT",
            mode: "easy",
            topicKey: pending.topicKey,
            generationId: pending.generationId,
          });
          generateQuestionPipeline(
            {
              apiKey: apiKey.trim(),
              mode: "easy",
              difficultyProfile: DIFFICULTY_PROFILES.easy,
              topicContext: context,
              generationId: pending.generationId,
              topicKey: pending.topicKey,
            },
            dispatch,
          );
        }, 0);
      }
    }
  }

  const activeQuestion =
    questionByMode && questionByMode[mode] ? questionByMode[mode] : null;
  const activeLoading = !!(loadingByMode && loadingByMode[mode]);
  const activeQuestionError =
    errorByMode && typeof errorByMode[mode] === "string"
      ? errorByMode[mode]
      : null;
  const selectedKey =
    selectedKeyByMode && typeof selectedKeyByMode[mode] === "string"
      ? selectedKeyByMode[mode]
      : "";
  const revealed = !!(revealedByMode && revealedByMode[mode]);
  const revealedTopicLabel =
    activeContext && typeof activeContext.topic === "string"
      ? activeContext.topic.trim()
      : "";
  const revealedTopicPath =
    activeContext && typeof activeContext.path === "string"
      ? activeContext.path.trim()
      : "";
  const revealedTopicUrl =
    revealedTopicPath && /\.md$/i.test(revealedTopicPath)
      ? `obsidian://open?path=${encodeURIComponent(revealedTopicPath)}`
      : "obsidian://open";

  const onRefresh = (e) => {
    e.stopPropagation();
    dispatch({ type: "REFRESH_CLICKED" });
  };

  const onTopicChatGPT = (e) => {
    e.stopPropagation();
    const topic =
      activeContext && typeof activeContext.topic === "string"
        ? activeContext.topic
        : "USMLE Step 1 topic";
    const questionObject =
      activeQuestion && typeof activeQuestion === "object"
        ? activeQuestion
        : null;
    const stem =
      questionObject && typeof questionObject.stem === "string"
        ? questionObject.stem.trim()
        : "";
    const correctKey = normalizeChoiceKey(
      questionObject && typeof questionObject.correctKey === "string"
        ? questionObject.correctKey
        : "",
    );
    const choices =
      questionObject && Array.isArray(questionObject.choices)
        ? questionObject.choices
        : [];
    const correctChoice = choices.find((choice) => {
      if (!choice || typeof choice !== "object") return false;
      return normalizeChoiceKey(choice.key) === correctKey;
    });
    const correctChoiceText =
      correctChoice && typeof correctChoice.text === "string"
        ? correctChoice.text.trim()
        : "";
    const correctExplanation =
      questionObject && typeof questionObject.correctExplanation === "string"
        ? questionObject.correctExplanation.trim()
        : "";

    const hasQuestionContext = !!(stem || correctKey || correctExplanation);
    const prompt = hasQuestionContext
      ? [
          `Topic: ${topic}`,
          `Question: ${stem || "Unavailable"}`,
          `Correct Answer: ${correctKey || "Unavailable"}. ${correctChoiceText || "Unavailable"}`,
          `Official Explanation: ${correctExplanation || "Unavailable"}`,
          "Request: Explain this in more detail assuming I know nothing. Start from first principles, define every important term, walk through why the correct answer is right, and explain common traps that make the wrong answers tempting.",
        ].join("\n\n")
      : `Tell me about ${topic}. I'm studying for USMLE Step 1. Assume I know nothing, start from first principles, define key terms, and explain clearly with beginner-friendly detail.`;
    const url = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
    run(`open '${escapeForSingleQuotedShell(url)}'`);
  };

  const onOpenRevealedTopic = (e) => {
    e.stopPropagation();
    run(`open '${escapeForSingleQuotedShell(revealedTopicUrl)}'`);
  };

  return (
    <div className="card">
      <div className="header">
        <div className="title">USMLE Question</div>
        <div className="headerBtns">
          {/* Multi-mode buttons intentionally hidden while only easy mode is active. */}
          <button
            className="refreshBtn"
            onClick={onRefresh}
            title="Refresh topics"
          >
            🔄
          </button>

          <button
            className="topicChatgptBtn"
            onClick={onTopicChatGPT}
            title="Ask GPT about active topic"
          >
            💬
          </button>
        </div>
      </div>

      <div className="cardBody">
        {apiKeyWarning ? <div className="warn">{apiKeyWarning}</div> : null}
        {commandWarning ? <div className="warn">{commandWarning}</div> : null}

        {!hasApiKey ? (
          <div className="warn">
            Set `openai-settings.json` with your OpenAI key.
          </div>
        ) : null}

        {activeLoading ? (
          <div className="loading">
            Generating Step 1 question...
          </div>
        ) : null}

        {!activeLoading && activeQuestionError ? (
          <div className="error">{activeQuestionError}</div>
        ) : null}

        {!activeLoading && !activeQuestion && !activeQuestionError ? (
          <div className="loading">Question not generated yet.</div>
        ) : null}

        {!activeLoading && activeQuestion ? (
          <div className="questionWrap">
            <div className="stem">
              {activeQuestion.stem}
              {revealed && revealedTopicLabel ? (
                <span>
                  {" ["}
                  <button
                    className="stemTopicLink"
                    onClick={onOpenRevealedTopic}
                  >
                    {revealedTopicLabel}
                  </button>
                  {"]"}
                </span>
              ) : null}
            </div>
            <div className="choices">
              {activeQuestion.choices.map((choice) => {
                const key = choice.key;
                const selected = selectedKey === key;
                const isCorrect = key === activeQuestion.correctKey;

                const stateClass = revealed
                  ? isCorrect
                    ? "choiceCorrect"
                    : "choiceWrong"
                  : selected
                    ? "choiceSelected"
                    : "";

                const selectedResultClass =
                  revealed && selected
                    ? isCorrect
                      ? "choiceBtnSelectedCorrect"
                      : "choiceBtnSelectedWrong"
                    : "";

                return (
                  <div key={key} className={`choiceWrap ${stateClass}`}>
                    <button
                      className={`choiceBtn ${selectedResultClass}`}
                      onClick={() =>
                        dispatch({ type: "SELECT_ANSWER", mode, key })
                      }
                    >
                      <span className="choiceKey">{key}.</span>
                      <span className="choiceText">{choice.text}</span>
                    </button>
                    {revealed ? (
                      <div className="choiceExplanation">
                        {choice.explanation}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {revealed ? (
              <div className="correctExplain">
                Correct answer: <strong>{activeQuestion.correctKey}</strong>.{" "}
                {activeQuestion.correctExplanation}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const className = `
  top: 24px;
  right: 24px;
  width: 560px;

  font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  color: rgba(255,255,255,0.92);

  .card {
    display: flex;
    flex-direction: column;
    padding: 14px 16px;
    max-height: calc(100vh - 48px);
    border-radius: 16px;
    background: rgba(0,0,0,0.45);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    box-shadow: 0 10px 30px rgba(0,0,0,0.25);
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    margin-bottom: 10px;
  }

  .cardBody {
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .title {
    font-size: 18px;
    font-weight: 650;
    max-width: 360px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .headerBtns {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .refreshBtn,
  .modeBtn,
  .topicChatgptBtn {
    border: 1px solid rgba(255,255,255,0.18);
    background: rgba(255,255,255,0.10);
    color: white;
    border-radius: 10px;
    padding: 6px 10px;
    cursor: pointer;
  }

  .refreshBtn:hover,
  .modeBtn:hover,
  .topicChatgptBtn:hover,
  .refreshBtn:focus-visible,
  .modeBtn:focus-visible,
  .topicChatgptBtn:focus-visible {
    background: rgba(255,255,255,0.18);
  }

  .modeBtn {
    padding: 6px 8px;
    min-width: 34px;
  }

  .modeBtnActive {
    border-color: rgba(255,255,255,0.42);
    background: rgba(255,255,255,0.26);
  }

  .modeBtnCorrect,
  .modeBtnCorrect:hover,
  .modeBtnCorrect:focus-visible {
    background: rgba(55, 130, 70, 0.28);
    border-color: rgba(110, 210, 130, 0.42);
  }

  .modeBtnWrong,
  .modeBtnWrong:hover,
  .modeBtnWrong:focus-visible {
    background: rgba(145, 65, 65, 0.26);
    border-color: rgba(220, 120, 120, 0.36);
  }

  .modeBtnActive.modeBtnCorrect {
    background: rgba(65, 150, 80, 0.38);
    border-color: rgba(125, 220, 145, 0.52);
  }

  .modeBtnActive.modeBtnWrong {
    background: rgba(165, 72, 72, 0.36);
    border-color: rgba(235, 135, 135, 0.48);
  }

  .loading {
    margin: 8px 0 4px;
    font-size: 14px;
    opacity: 0.9;
  }

  .warn {
    margin: 0 0 8px;
    padding: 8px 10px;
    border-radius: 10px;
    color: rgba(255, 196, 120, 0.98);
    background: rgba(120, 60, 0, 0.28);
    border: 1px solid rgba(255, 196, 120, 0.2);
    font-size: 13px;
  }

  .error {
    margin: 0 0 8px;
    color: rgba(255,120,120,0.95);
    font-size: 13px;
    white-space: pre-wrap;
  }

  .questionWrap {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .stem {
    font-size: 14px;
    line-height: 1.4;
    white-space: pre-wrap;
  }

  .stemTopicLink {
    appearance: none;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    line-height: inherit;
    padding: 0;
    margin: 0;
    cursor: pointer;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 2px;
    opacity: 0.92;
  }

  .stemTopicLink:hover,
  .stemTopicLink:focus-visible {
    opacity: 1;
  }

  .choices {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .choiceWrap {
    border-radius: 12px;
    background: rgba(255,255,255,0.06);
    overflow: hidden;
    border: 1px solid transparent;
  }

  .choiceBtn {
    width: 100%;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    background: transparent;
    border: 0;
    color: inherit;
    text-align: left;
    padding: 10px 12px;
    cursor: pointer;
  }

  .choiceBtn:hover {
    background: rgba(255,255,255,0.08);
  }

  .choiceBtnSelectedCorrect {
    background: rgba(90, 175, 105, 0.28);
  }

  .choiceBtnSelectedWrong {
    background: rgba(185, 90, 90, 0.28);
  }

  .choiceKey {
    font-weight: 650;
    opacity: 0.85;
  }

  .choiceText {
    flex: 1;
    font-size: 14px;
    line-height: 1.35;
  }

  .choiceSelected {
    border-color: rgba(255,255,255,0.32);
  }

  .choiceCorrect {
    background: rgba(55, 130, 70, 0.22);
    border-color: rgba(110, 210, 130, 0.38);
  }

  .choiceWrong {
    background: rgba(145, 65, 65, 0.20);
    border-color: rgba(220, 120, 120, 0.32);
  }

  .choiceExplanation {
    padding: 12px 12px 10px 34px;
    font-size: 13px;
    line-height: 1.35;
    opacity: 0.92;
    white-space: pre-wrap;
  }

  .correctExplain {
    margin-top: 2px;
    font-size: 13px;
    line-height: 1.4;
    color: rgba(208, 245, 215, 0.95);
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid rgba(120, 205, 140, 0.28);
    background: rgba(40, 95, 50, 0.22);
  }
`;
