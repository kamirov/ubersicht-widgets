import { run } from "uebersicht";

export const refreshFrequency = 1000 * 60 * 30; // 30 minutes

const NODE = "/Users/kamirov/.nvm/versions/node/v22.17.1/bin/node";
const NOTES_DIR =
  "/Users/kamirov/Library/CloudStorage/GoogleDrive-andrei.khramtsov@gmail.com/My Drive/Hole In The Ground/👨‍⚕️ Medicine/Exploring";
const SETTINGS_STORE =
  "/Users/kamirov/Projects/ubersicht-widgets/openai-settings.json";
const PENDING_QUESTIONS_STORE =
  "/Users/kamirov/Projects/ubersicht-widgets/ObsidianStep1QA.widget/pending-questions.json";
const WRONG_TOPIC_COUNTS_STORE =
  "/Users/kamirov/Projects/ubersicht-widgets/ObsidianStep1QA.widget/wrong-topic-counts.json";

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

function extractSection(text, header) {
  const esc = header.replace(/[.*+?^()[\\]{}|\\\\]/g, "\\\\$&");
  const re = new RegExp("^##\\\\s+" + esc + "\\\\s*$([\\\\s\\\\S]*?)(?=^##\\\\s+|\\\\Z)", "m");
  const m = text.match(re);
  if (!m) return "";
  let section = m[1] || "";
  section = section.replace(/^\\s*\\n+/, "").replace(/\\n+\\s*$/, "");
  return section.trim();
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

    const qSection = extractSection(text, "Questions");
    const aSection = extractSection(text, "Answers");
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
    });
  }

  if (!candidates.length) {
    console.log(JSON.stringify({
      error:
        "Need at least one parseable note file with numbered Questions/Answers to generate question modes.",
    }));
    return;
  }

  shuffle(candidates);
  const easy = candidates[0];
  const medium =
    candidates.find((candidate) => candidate.path !== easy.path) || easy;
  const hard =
    candidates.find(
      (candidate) =>
        candidate.path !== easy.path && candidate.path !== medium.path,
    ) ||
    candidates.find((candidate) => candidate.path !== medium.path) ||
    candidates.find((candidate) => candidate.path !== easy.path) ||
    medium ||
    easy;
  const distinctPathCount = new Set(
    [easy.path, medium.path, hard.path].filter(Boolean),
  ).size;
  const warning =
    distinctPathCount < 3
      ? `Only found ${distinctPathCount} distinct parseable note topic${distinctPathCount === 1 ? "" : "s"}; reusing topic context across easy, medium, and hard modes.`
      : null;

  console.log(
    JSON.stringify({
      contexts: [
        { mode: "easy", ...easy },
        { mode: "medium", ...medium },
        { mode: "hard", ...hard },
      ],
      warning,
    }),
  );
}

main();
EOF
`;

const escapeForSingleQuotedShell = (value) =>
  String(value).replace(/'/g, "'\\''");

const QUESTION_MODES = ["targeted", "easy", "medium", "hard"];
const QUESTION_DIFFICULTIES = ["easy", "medium", "hard"];
const CHOICE_KEYS = ["A", "B", "C", "D", "E"];
const DEFAULT_MODE = "easy";
const CURRENT_PENDING_QUESTIONS_VERSION = 2;
const LEGACY_CACHED_DIFFICULTY_BY_MODE = {
  targeted: "hard",
  easy: "easy",
  medium: "medium",
  hard: "hard",
};
const EMPTY_PENDING_QUESTION_STORE = {
  version: CURRENT_PENDING_QUESTIONS_VERSION,
  questions: {
    targeted: null,
    easy: null,
    medium: null,
    hard: null,
  },
};

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

const DIFFICULTY_PROFILES = {
  targeted: {
    label: "targeted",
    title: "Targeted",
    emoji: "🎯",
    promptMode: "medium",
    difficulty: "medium",
  },
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
const scheduledCacheMutationRequests = new Set();
const scheduledWrongTopicMutationRequests = new Set();
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

const normalizeWrongTopicKey = (topic) => {
  const normalized = typeof topic === "string" ? topic.trim() : "";
  return normalized || "Unknown topic";
};

const normalizeWrongTopicCounts = (input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out = {};
  for (const [rawTopic, rawCount] of Object.entries(input)) {
    const topic = normalizeWrongTopicKey(rawTopic);
    const count = Number(rawCount);
    if (!Number.isFinite(count) || count < 0) continue;
    const normalizedCount = Math.floor(count);
    if (normalizedCount <= 0) continue;
    out[topic] = (out[topic] || 0) + normalizedCount;
  }
  return out;
};

const pickWeightedTopic = (counts) => {
  const normalized = normalizeWrongTopicCounts(counts);
  const entries = Object.entries(normalized).filter(
    ([topic, count]) => !!topic && Number.isFinite(count) && count > 0,
  );
  if (!entries.length) return "";

  let total = 0;
  for (const [, count] of entries) total += count;
  if (!Number.isFinite(total) || total <= 0) return "";

  let roll = Math.random() * total;
  for (const [topic, count] of entries) {
    roll -= count;
    if (roll < 0) return topic;
  }
  return entries[entries.length - 1][0] || "";
};

const makeTargetedContextFromTopic = (topic, count) => {
  const safeTopic = normalizeWrongTopicKey(topic);
  const safeCount = Number.isFinite(Number(count))
    ? Math.max(1, Math.floor(Number(count)))
    : 1;
  return {
    topic: safeTopic,
    file: "wrong-topic-counts.json",
    path: WRONG_TOPIC_COUNTS_STORE,
    questionsCount: safeCount,
    answersCount: safeCount,
    samplePairs: [],
  };
};

const normalizeQuestion = (input) => {
  if (!input || typeof input !== "object") {
    return { question: null, error: "Model response is not an object." };
  }

  const stem = typeof input.stem === "string" ? input.stem.trim() : "";
  const correctKey = normalizeChoiceKey(input.correctKey);
  const correctExplanation =
    typeof input.correctExplanation === "string"
      ? input.correctExplanation.trim()
      : "";
  const choicesRaw = Array.isArray(input.choices) ? input.choices : [];

  if (!stem) return { question: null, error: "Question stem is missing." };
  if (!correctKey)
    return { question: null, error: "Correct answer key is invalid." };
  if (!correctExplanation) {
    return { question: null, error: "Correct answer explanation is missing." };
  }
  if (choicesRaw.length !== 5) {
    return { question: null, error: "Expected exactly 5 answer choices." };
  }

  const seen = new Set();
  const choices = [];
  for (const entry of choicesRaw) {
    const key = normalizeChoiceKey(entry && entry.key);
    const text =
      typeof (entry && entry.text) === "string" ? entry.text.trim() : "";
    const explanation =
      typeof (entry && entry.explanation) === "string"
        ? entry.explanation.trim()
        : "";

    if (!key) return { question: null, error: "Choice key must be A-E." };
    if (seen.has(key))
      return { question: null, error: "Choice keys must be unique." };
    if (!text)
      return { question: null, error: `Choice ${key} is missing text.` };
    if (!explanation) {
      return { question: null, error: `Choice ${key} is missing explanation.` };
    }

    seen.add(key);
    choices.push({ key, text, explanation });
  }

  for (const key of CHOICE_KEYS) {
    if (!seen.has(key)) {
      return { question: null, error: `Missing choice ${key}.` };
    }
  }

  choices.sort((a, b) => a.key.localeCompare(b.key));

  return {
    question: {
      stem,
      choices,
      correctKey,
      correctExplanation,
    },
    error: null,
  };
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

  if (!contexts.easy || !contexts.medium || !contexts.hard) return null;

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

const buildPromptMessages = ({ mode, topicContext, difficultyProfile }) => {
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
  const contextData =
    topicContext && typeof topicContext === "object" ? topicContext : {};
  const cleanedPairs = Array.isArray(contextData.samplePairs)
    ? contextData.samplePairs.slice(0, 3)
    : [];

  const systemMessage =
    "You create rigorous USMLE Step 1 single-best-answer questions. Return only valid JSON.";

  const noteExamples = cleanedPairs.length
    ? cleanedPairs
        .map(
          (pair, index) =>
            `${index + 1}. Q: ${pair.q}\n   A: ${pair.a}`,
        )
        .join("\n")
    : "No sample Q/A pairs available for this topic.";

  const userMessage = `Widget mode: ${safeMode.toUpperCase()}
Question difficulty: ${promptDifficulty.toUpperCase()}
Topic: ${contextData.topic}

You are generating a single USMLE Step 1-style multiple-choice question.

The item should resemble the style of Step 1: clinically grounded when appropriate, mechanism-focused, and designed to test applied understanding rather than simple recall.

Return JSON with this exact shape:
{
  "stem": "string",
  "choices": [
    { "key": "A", "text": "string", "explanation": "string" },
    { "key": "B", "text": "string", "explanation": "string" },
    { "key": "C", "text": "string", "explanation": "string" },
    { "key": "D", "text": "string", "explanation": "string" },
    { "key": "E", "text": "string", "explanation": "string" }
  ],
  "correctKey": "A|B|C|D|E",
  "correctExplanation": "string"
}

Rules:
- Exactly five choices A-E.
- Exactly one correct answer.
- Output valid JSON only.
- Do not include markdown fences or extra text outside JSON.
- Escape quotation marks correctly so the output is valid JSON.

Topic grounding:
- Stay tightly focused on the topic above.
- Use the sample note material when helpful, but write a fresh question rather than copying it.
- Sample note Q/A pairs:
${noteExamples}

Step 1 style requirements:
- Prefer a clinical vignette when the topic supports it.
- Use patient age, sex, presentation, relevant history, physical exam, labs, imaging, pathology, or pharmacology only when they meaningfully contribute to reasoning.
- Match the reasoning depth and integration level to the requested difficulty exactly.
- Focus on mechanisms, pathophysiology, pharmacology, microbiology, immunology, genetics, biochemistry, physiology, and pathology in an integrated way.
- Avoid pure trivia and avoid isolated fact recall unless the requested difficulty explicitly allows it.
- Avoid buzzword stacking and avoid making the diagnosis or answer too obvious from a single clue unless the requested difficulty is easy.
- Do not write stems that simply ask for a definition unless the requested difficulty is easy.
- Internally decide what the question is primarily testing: mechanism, diagnosis, pathology, pharmacology, microbiology, immunology, genetics, physiology, or biochemistry, and keep the item tightly focused on that.

Stem quality requirements:
- Make the stem concise but information-dense.
- Include enough information to discriminate among close answer choices.
- Keep the stem less cue-heavy and avoid obvious giveaway language.
- Use natural Step-style phrasing such as asking for the most likely mechanism, enzyme, receptor, mediator, organism feature, pathologic change, or downstream consequence.
- Do not use negative phrasing like EXCEPT or NOT.
- Avoid vague stems where multiple answers could be arguably correct.
- The stem must contain at least one discriminating clue that rules out the strongest distractor.

Choice quality requirements:
- All answer choices must belong to the same conceptual category whenever possible.
- Distractors must be plausible and closely related to the correct answer.
- Wrong answers should reflect common confusions, adjacent mechanisms, similar diseases, related organisms, nearby pathways, or drugs with overlapping uses or effects.
- Do not include obviously wrong answers, joke answers, or choices whose wording or length gives away the correct answer.
- The correct answer may be any key A-E; do not bias toward one position.

Explanation requirements:
- "correctExplanation" should briefly explain why the correct answer is right, referencing the key discriminating clues and the underlying mechanism.
- Each choice "explanation" should briefly explain why that option is wrong in this vignette or why it is less likely than the correct answer.
- Keep explanations concise, specific, high-yield, and mechanistic.
- Do not merely restate the answer choice.

Topic-specific content guidance:
- When appropriate, ask about mechanism of action, adverse effect, resistance mechanism, toxin effect, virulence factor, signaling pathway, enzyme deficiency, inheritance pattern, histologic finding, receptor effect, compensatory physiologic response, or biochemical consequence.

Difficulty requirements:
- Use ${promptDifficulty.toUpperCase()} difficulty for this item.
- Apply this exact rubric:
${difficultyBlock}
- ${DIFFICULTY_CONTROL_DIMENSIONS}
- Keep the stem, distractors, integration level, and reasoning chain aligned with ${promptDifficulty.toUpperCase()} rather than drifting easier or harder.

Quality control before finalizing:
- Ensure only one answer is unambiguously correct.
- Ensure the vignette supports the correct answer better than any distractor.
- Ensure the item feels like a Step 1 preparation question rather than a basic classroom quiz.
- Ensure the answer can be solved from the information in the stem plus standard foundational medical knowledge.`;

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

const emptyCachedByMode = () => ({ targeted: null, easy: null, hard: null });

const parsePendingQuestionsStore = (rawOutput) => {
  let parsed;
  try {
    parsed = JSON.parse((rawOutput || "").trim());
  } catch {
    return {
      cachedQuestionByMode: emptyCachedByMode(),
      warning:
        "Pending question cache file is malformed JSON. Ignoring cached questions.",
    };
  }

  if (!parsed || typeof parsed !== "object" || Number(parsed.version) !== 1) {
    return {
      cachedQuestionByMode: emptyCachedByMode(),
      warning:
        "Pending question cache schema is invalid. Ignoring cached questions.",
    };
  }

  const questions =
    parsed.questions && typeof parsed.questions === "object"
      ? parsed.questions
      : null;
  if (!questions) {
    return {
      cachedQuestionByMode: emptyCachedByMode(),
      warning:
        "Pending question cache is missing `questions`. Ignoring cached questions.",
    };
  }

  const cachedQuestionByMode = emptyCachedByMode();
  const invalidModes = [];
  for (const mode of QUESTION_MODES) {
    const entry = questions[mode];
    if (entry === null || typeof entry === "undefined") continue;
    if (!entry || typeof entry !== "object") {
      invalidModes.push(mode);
      continue;
    }

    const normalized = normalizeQuestion(entry.question);
    const topicContext = normalizeTopicContext(entry.topicContext);
    const savedAt =
      typeof entry.savedAt === "string" && entry.savedAt.trim()
        ? entry.savedAt.trim()
        : "";

    if (
      !normalized.question ||
      !topicContext ||
      !savedAt ||
      !Number.isFinite(Date.parse(savedAt))
    ) {
      invalidModes.push(mode);
      continue;
    }

    cachedQuestionByMode[mode] = {
      question: normalized.question,
      topicContext,
      savedAt,
    };
  }

  const warning =
    invalidModes.length > 0
      ? `Pending question cache had invalid entry for: ${invalidModes.join(", ")}. Ignoring those mode(s).`
      : null;

  return { cachedQuestionByMode, warning };
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

const loadPendingQuestionsCache = (dispatch) => {
  const nodeScript = `
const fs = require("fs");

const STORE = '${escapeForSingleQuotedShell(PENDING_QUESTIONS_STORE)}';

function main() {
  if (!fs.existsSync(STORE)) {
    console.log(JSON.stringify({
      ok: true,
      exists: false,
      raw: JSON.stringify({
        version: 1,
        questions: { targeted: null, easy: null, hard: null },
      }),
      warning: null,
    }));
    return;
  }

  let raw;
  try {
    raw = fs.readFileSync(STORE, "utf8");
  } catch (err) {
    console.log(JSON.stringify({
      ok: false,
      error: "Could not read pending question cache: " + String(err && err.message ? err.message : err),
    }));
    return;
  }

  console.log(JSON.stringify({ ok: true, exists: true, raw, warning: null }));
}

main();
`;

  run(`"${NODE}" <<'EOF'\n${nodeScript}\nEOF`)
    .then((result) => {
      try {
        const data = JSON.parse(String(result || "").trim());
        if (!data || !data.ok || typeof data.raw !== "string") {
          dispatch({
            type: "LOAD_CACHE_RESULT",
            ok: false,
            cachedQuestionByMode: emptyCachedByMode(),
            warning: null,
            error: String(
              (data && data.error) || "Could not load pending question cache.",
            ),
          });
          return;
        }

        const parsed = parsePendingQuestionsStore(data.raw);
        dispatch({
          type: "LOAD_CACHE_RESULT",
          ok: true,
          cachedQuestionByMode: parsed.cachedQuestionByMode,
          warning:
            parsed.warning ||
            (typeof data.warning === "string" ? data.warning : null),
          error: null,
        });
      } catch {
        dispatch({
          type: "LOAD_CACHE_RESULT",
          ok: false,
          cachedQuestionByMode: emptyCachedByMode(),
          warning: null,
          error: "Could not parse pending question cache load response.",
        });
      }
    })
    .catch((err) => {
      dispatch({
        type: "LOAD_CACHE_RESULT",
        ok: false,
        cachedQuestionByMode: emptyCachedByMode(),
        warning: null,
        error: `Pending question cache load failed: ${String(err && err.message ? err.message : err)}`,
      });
    });
};

const persistPendingQuestionForMode = ({ mode, cachedEntry }, dispatch) => {
  const safeMode = normalizeModeKey(mode);
  if (!safeMode) return;

  const payload = cachedEntry
    ? {
        question: cachedEntry.question,
        topicContext: cachedEntry.topicContext,
        savedAt:
          typeof cachedEntry.savedAt === "string" && cachedEntry.savedAt.trim()
            ? cachedEntry.savedAt.trim()
            : new Date().toISOString(),
      }
    : null;

  const nodeScript = `
const fs = require("fs");
const path = require("path");

const STORE = '${escapeForSingleQuotedShell(PENDING_QUESTIONS_STORE)}';
const MODE = ${JSON.stringify(safeMode)};
const ENTRY = ${JSON.stringify(payload)};

function readCurrentStore() {
  if (!fs.existsSync(STORE)) {
    return { version: 1, questions: { targeted: null, easy: null, hard: null } };
  }

  try {
    const raw = fs.readFileSync(STORE, "utf8");
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      Number(parsed.version) === 1 &&
      parsed.questions &&
      typeof parsed.questions === "object"
    ) {
      return {
        version: 1,
        questions: {
          targeted:
            typeof parsed.questions.targeted === "undefined"
              ? null
              : parsed.questions.targeted,
          easy:
            typeof parsed.questions.easy === "undefined"
              ? null
              : parsed.questions.easy,
          hard:
            typeof parsed.questions.hard === "undefined"
              ? null
              : parsed.questions.hard,
        },
      };
    }
  } catch {
    return { version: 1, questions: { targeted: null, easy: null, hard: null } };
  }

  return { version: 1, questions: { targeted: null, easy: null, hard: null } };
}

function main() {
  const current = readCurrentStore();
  current.questions[MODE] = ENTRY;

  try {
    fs.mkdirSync(path.dirname(STORE), { recursive: true });
    fs.writeFileSync(STORE, JSON.stringify(current, null, 2), "utf8");
  } catch (err) {
    console.log(JSON.stringify({
      ok: false,
      error: "Could not write pending question cache: " + String(err && err.message ? err.message : err),
    }));
    return;
  }

  console.log(JSON.stringify({ ok: true }));
}

main();
`;

  run(`"${NODE}" <<'EOF'\n${nodeScript}\nEOF`)
    .then((result) => {
      try {
        const data = JSON.parse(String(result || "").trim());
        dispatch({
          type: "PERSIST_CACHE_RESULT",
          mode: safeMode,
          ok: !!(data && data.ok),
          error:
            data && data.ok
              ? null
              : String(
                  (data && data.error) ||
                    "Could not persist pending question cache.",
                ),
        });
      } catch {
        dispatch({
          type: "PERSIST_CACHE_RESULT",
          mode: safeMode,
          ok: false,
          error: "Could not parse pending question cache persist response.",
        });
      }
    })
    .catch((err) => {
      dispatch({
        type: "PERSIST_CACHE_RESULT",
        mode: safeMode,
        ok: false,
        error: `Pending question cache persist failed: ${String(err && err.message ? err.message : err)}`,
      });
    });
};

const loadWrongTopicCounts = (dispatch) => {
  const nodeScript = `
const fs = require("fs");

const STORE = '${escapeForSingleQuotedShell(WRONG_TOPIC_COUNTS_STORE)}';

function main() {
  if (!fs.existsSync(STORE)) {
    console.log(JSON.stringify({
      ok: true,
      counts: {},
      warning: null,
    }));
    return;
  }

  let raw;
  try {
    raw = fs.readFileSync(STORE, "utf8");
  } catch (err) {
    console.log(JSON.stringify({
      ok: false,
      error: "Could not read wrong topic counts: " + String(err && err.message ? err.message : err),
    }));
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.log(JSON.stringify({
      ok: true,
      counts: {},
      warning: "Wrong topic counts are malformed JSON. Using empty map.",
    }));
    return;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.log(JSON.stringify({
      ok: true,
      counts: {},
      warning: "Wrong topic counts schema is invalid. Using empty map.",
    }));
    return;
  }

  console.log(JSON.stringify({
    ok: true,
    counts: parsed,
    warning: null,
  }));
}

main();
`;

  run(`"${NODE}" <<'EOF'\n${nodeScript}\nEOF`)
    .then((result) => {
      try {
        const data = JSON.parse(String(result || "").trim());
        dispatch({
          type: "LOAD_WRONG_TOPICS_RESULT",
          ok: !!(data && data.ok),
          counts:
            data && data.counts && typeof data.counts === "object"
              ? data.counts
              : {},
          warning:
            data && typeof data.warning === "string" ? data.warning : null,
          error:
            data && data.ok
              ? null
              : String(
                  (data && data.error) || "Could not load wrong topic counts.",
                ),
        });
      } catch {
        dispatch({
          type: "LOAD_WRONG_TOPICS_RESULT",
          ok: false,
          counts: {},
          warning: null,
          error: "Could not parse wrong topic count load response.",
        });
      }
    })
    .catch((err) => {
      dispatch({
        type: "LOAD_WRONG_TOPICS_RESULT",
        ok: false,
        counts: {},
        warning: null,
        error: `Wrong topic count load failed: ${String(err && err.message ? err.message : err)}`,
      });
    });
};

const mutateWrongTopicCount = ({ topic, delta, deleteAtZero }, dispatch) => {
  const normalizedTopic = normalizeWrongTopicKey(topic);
  const safeDelta = Number.isFinite(Number(delta))
    ? Math.floor(Number(delta))
    : 0;
  if (!safeDelta) return;

  const nodeScript = `
const fs = require("fs");
const path = require("path");

const STORE = '${escapeForSingleQuotedShell(WRONG_TOPIC_COUNTS_STORE)}';
const TOPIC = ${JSON.stringify(normalizedTopic)};
const DELTA = ${JSON.stringify(safeDelta)};
const DELETE_AT_ZERO = ${JSON.stringify(!!deleteAtZero)};

function toMap(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function toNonNegativeNumber(value) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function main() {
  let map = {};

  if (fs.existsSync(STORE)) {
    try {
      const raw = fs.readFileSync(STORE, "utf8");
      map = toMap(raw);
    } catch {
      map = {};
    }
  }

  const current = toNonNegativeNumber(map[TOPIC]);
  const nextValue = Math.max(0, current + DELTA);
  if (DELETE_AT_ZERO && nextValue === 0) {
    delete map[TOPIC];
  } else {
    map[TOPIC] = nextValue;
  }

  try {
    fs.mkdirSync(path.dirname(STORE), { recursive: true });
    fs.writeFileSync(STORE, JSON.stringify(map, null, 2), "utf8");
  } catch (err) {
    console.log(JSON.stringify({
      ok: false,
      error: "Could not write wrong topic counts: " + String(err && err.message ? err.message : err),
    }));
    return;
  }

  console.log(JSON.stringify({ ok: true, counts: map }));
}

main();
`;

  run(`"${NODE}" <<'EOF'\n${nodeScript}\nEOF`)
    .then((result) => {
      try {
        const data = JSON.parse(String(result || "").trim());
        dispatch({
          type: "MUTATE_WRONG_TOPIC_RESULT",
          ok: !!(data && data.ok),
          counts:
            data && data.counts && typeof data.counts === "object"
              ? data.counts
              : null,
          error:
            data && data.ok
              ? null
              : String(
                  (data && data.error) ||
                    "Could not mutate wrong topic counts.",
                ),
        });
      } catch {
        dispatch({
          type: "MUTATE_WRONG_TOPIC_RESULT",
          ok: false,
          counts: null,
          error: "Could not parse wrong topic count mutation response.",
        });
      }
    })
    .catch((err) => {
      dispatch({
        type: "MUTATE_WRONG_TOPIC_RESULT",
        ok: false,
        counts: null,
        error: `Wrong topic count mutation failed: ${String(err && err.message ? err.message : err)}`,
      });
    });
};

const generateStepQuestion = async (
  { apiKey, mode, difficultyProfile, topicContext, generationId, topicKey },
  dispatch,
) => {
  const safeMode = normalizeModeKey(mode) || DEFAULT_MODE;
  const { systemMessage, userMessage } = buildPromptMessages({
    mode: safeMode,
    difficultyProfile,
    topicContext,
  });

  const schema = {
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
    },
    required: ["stem", "choices", "correctKey", "correctExplanation"],
  };

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
        model: "gpt-5-mini",
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: systemMessage }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: userMessage }],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "step1_question",
            schema,
            strict: true,
          },
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      dispatch({
        type: "GENERATE_RESULT",
        mode: safeMode,
        ok: false,
        generationId,
        topicKey,
        error: `OpenAI request failed (${response.status}): ${body.slice(0, 300)}`,
      });
      return;
    }

    const data = await response.json();
    const text = extractResponseText(data);
    const json = extractJsonFromText(text);

    if (!json) {
      dispatch({
        type: "GENERATE_RESULT",
        mode: safeMode,
        ok: false,
        generationId,
        topicKey,
        error: "OpenAI returned non-JSON content.",
      });
      return;
    }

    const normalized = normalizeQuestion(json);
    if (!normalized.question) {
      dispatch({
        type: "GENERATE_RESULT",
        mode: safeMode,
        ok: false,
        generationId,
        topicKey,
        error: normalized.error || "Model response has invalid shape.",
      });
      return;
    }

    const randomizedQuestion = randomizeQuestionChoices(normalized.question);
    const normalizedTopicContext = normalizeTopicContext(topicContext);
    const cachedEntry =
      randomizedQuestion && normalizedTopicContext
        ? {
            question: randomizedQuestion,
            topicContext: normalizedTopicContext,
            savedAt: new Date().toISOString(),
          }
        : null;

    dispatch({
      type: "GENERATE_RESULT",
      mode: safeMode,
      ok: true,
      generationId,
      topicKey,
      question: randomizedQuestion,
      cachedEntry,
    });

    if (cachedEntry) {
      persistPendingQuestionForMode({ mode: safeMode, cachedEntry }, dispatch);
    }
  } catch (err) {
    const isTimeout =
      err && typeof err === "object" && err.name === "AbortError";
    dispatch({
      type: "GENERATE_RESULT",
      mode: safeMode,
      ok: false,
      generationId,
      topicKey,
      error: isTimeout
        ? `OpenAI request timed out after ${Math.round(OPENAI_TIMEOUT_MS / 1000)}s.`
        : `OpenAI request error: ${String(err && err.message ? err.message : err)}`,
    });
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
};

const emptyPendingByMode = () => ({ targeted: null, easy: null, hard: null });
const emptyContextByMode = () => ({ targeted: null, easy: null, hard: null });
const emptyQuestionByMode = () => ({ targeted: null, easy: null, hard: null });
const emptyErrorByMode = () => ({ targeted: null, easy: null, hard: null });
const emptySelectedByMode = () => ({ targeted: "", easy: "", hard: "" });
const emptyRevealedByMode = () => ({
  targeted: false,
  easy: false,
  hard: false,
});
const emptyResultByMode = () => ({ targeted: "", easy: "", hard: "" });
const emptyLoadingByMode = () => ({
  targeted: false,
  easy: false,
  hard: false,
});
const emptyGenerationIdByMode = () => ({ targeted: 0, easy: 0, hard: 0 });

const makeTopicKey = (mode, context) => {
  const safeMode = normalizeModeKey(mode);
  if (!safeMode || !context || typeof context !== "object") return "";
  const topic = typeof context.topic === "string" ? context.topic : "";
  const path = typeof context.path === "string" ? context.path : "";
  return `${safeMode}::${path}::${topic}`;
};

const scheduleGenerationForContexts = (baseState, payload) => {
  const payloadContexts = payload && payload.contexts ? payload.contexts : null;
  if (!payloadContexts || !payloadContexts.easy || !payloadContexts.hard) {
    return {
      ...baseState,
      topicContextByMode: emptyContextByMode(),
      loadingByMode: emptyLoadingByMode(),
      errorByMode: emptyErrorByMode(),
      questionByMode: emptyQuestionByMode(),
      selectedKeyByMode: emptySelectedByMode(),
      revealedByMode: emptyRevealedByMode(),
      resultByMode: emptyResultByMode(),
      pendingGenerationByMode: emptyPendingByMode(),
      latestGenerationIdByMode: emptyGenerationIdByMode(),
    };
  }

  const cacheLoaded = !!baseState.cacheLoaded;
  const wrongTopicLoaded = !!baseState.wrongTopicLoaded;
  if (!cacheLoaded || !wrongTopicLoaded) {
    return {
      ...baseState,
      activeMode: DEFAULT_MODE,
      topicContextByMode: {
        targeted: null,
        easy: payloadContexts.easy,
        hard: payloadContexts.hard,
      },
      loadingByMode: emptyLoadingByMode(),
      errorByMode: emptyErrorByMode(),
      pendingGenerationByMode: emptyPendingByMode(),
    };
  }

  const wrongTopicCounts = normalizeWrongTopicCounts(
    baseState.wrongTopicCounts,
  );
  const pickedTargetedTopic = pickWeightedTopic(wrongTopicCounts);
  const targetedContext = pickedTargetedTopic
    ? makeTargetedContextFromTopic(
        pickedTargetedTopic,
        wrongTopicCounts[pickedTargetedTopic],
      )
    : null;
  const contexts = {
    targeted: targetedContext,
    easy: payloadContexts.easy,
    hard: payloadContexts.hard,
  };

  const hasApiKey =
    typeof baseState.apiKey === "string" && baseState.apiKey.trim().length > 0;
  let nextGenerationCounter = Number(baseState.generationCounter);
  const nextTopicContextByMode = emptyContextByMode();
  const nextLoadingByMode = emptyLoadingByMode();
  const nextQuestionByMode = emptyQuestionByMode();
  const nextErrorByMode = emptyErrorByMode();
  const nextSelectedByMode = emptySelectedByMode();
  const nextRevealedByMode = emptyRevealedByMode();
  const nextResultByMode = emptyResultByMode();
  const nextPendingByMode = emptyPendingByMode();
  const nextGenerationIdByMode = {
    ...baseState.latestGenerationIdByMode,
  };

  for (const mode of QUESTION_MODES) {
    const context = contexts[mode];
    const cachedEntry =
      baseState.cachedQuestionByMode &&
      baseState.cachedQuestionByMode[mode] &&
      typeof baseState.cachedQuestionByMode[mode] === "object"
        ? baseState.cachedQuestionByMode[mode]
        : null;

    if (cachedEntry) {
      nextTopicContextByMode[mode] =
        cachedEntry.topicContext || context || null;
      nextQuestionByMode[mode] = cachedEntry.question || null;
      nextLoadingByMode[mode] = false;
      nextErrorByMode[mode] = null;
      continue;
    }

    nextTopicContextByMode[mode] = context || null;
    nextQuestionByMode[mode] = null;

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
      if (mode === "targeted" && !context) {
        nextErrorByMode[mode] =
          "No targeted topics available yet. Miss a question first.";
      }
    }
  }

  return {
    ...baseState,
    activeMode: DEFAULT_MODE,
    topicContextByMode: nextTopicContextByMode,
    loadingByMode: nextLoadingByMode,
    errorByMode: nextErrorByMode,
    questionByMode: nextQuestionByMode,
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
  needsCacheLoad: true,
  cacheLoaded: false,
  cacheLoading: false,
  cacheWarning: null,
  cachedQuestionByMode: emptyCachedByMode(),
  needsWrongTopicLoad: true,
  wrongTopicLoaded: false,
  wrongTopicLoading: false,
  wrongTopicWarning: null,
  wrongTopicCounts: {},

  activeMode: DEFAULT_MODE,
  loadingByMode: emptyLoadingByMode(),
  errorByMode: emptyErrorByMode(),
  questionByMode: emptyQuestionByMode(),
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
  if (event && event.type === "LOAD_WRONG_TOPICS_START") {
    return {
      ...prev,
      needsWrongTopicLoad: false,
      wrongTopicLoading: true,
      wrongTopicWarning: null,
    };
  }

  if (event && event.type === "LOAD_WRONG_TOPICS_RESULT") {
    const next = {
      ...prev,
      needsWrongTopicLoad: false,
      wrongTopicLoaded: true,
      wrongTopicLoading: false,
      wrongTopicWarning: event.ok ? event.warning || null : event.error || null,
      wrongTopicCounts:
        event.ok && event.counts && typeof event.counts === "object"
          ? normalizeWrongTopicCounts(event.counts)
          : {},
    };

    if (next.pendingCommandRefreshNonce !== null) {
      return next;
    }

    const parsedPayload = parseCommandPayload(next.output);
    if (parsedPayload) {
      return scheduleGenerationForContexts(next, parsedPayload);
    }

    return next;
  }

  if (event && event.type === "LOAD_CACHE_START") {
    return {
      ...prev,
      needsCacheLoad: false,
      cacheLoading: true,
      cacheWarning: null,
    };
  }

  if (event && event.type === "LOAD_CACHE_RESULT") {
    const next = {
      ...prev,
      needsCacheLoad: false,
      cacheLoaded: true,
      cacheLoading: false,
      cacheWarning: event.ok ? event.warning || null : event.error || null,
      cachedQuestionByMode:
        event.ok &&
        event.cachedQuestionByMode &&
        typeof event.cachedQuestionByMode === "object"
          ? {
              targeted: event.cachedQuestionByMode.targeted || null,
              easy: event.cachedQuestionByMode.easy || null,
              hard: event.cachedQuestionByMode.hard || null,
            }
          : emptyCachedByMode(),
    };

    const parsedPayload = parseCommandPayload(next.output);
    if (parsedPayload) {
      return scheduleGenerationForContexts(next, parsedPayload);
    }

    return next;
  }

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

  if (event && event.type === "REFRESH_CLICKED") {
    const nextNonce = Number(prev.refreshNonce) + 1;
    return {
      ...prev,
      activeMode: DEFAULT_MODE,
      refreshNonce: nextNonce,
      pendingCommandRefreshNonce: nextNonce,
      needsWrongTopicLoad: true,
      wrongTopicLoaded: false,
      wrongTopicLoading: false,
      wrongTopicWarning: null,
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

  if (event && event.type === "MODE_SELECTED") {
    const mode = normalizeModeKey(event.mode);
    if (!mode) return prev;
    return {
      ...prev,
      activeMode: mode,
    };
  }

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
      cachedQuestionByMode: {
        ...prev.cachedQuestionByMode,
        [mode]:
          event.cachedEntry && typeof event.cachedEntry === "object"
            ? event.cachedEntry
            : null,
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
      cachedQuestionByMode: {
        ...prev.cachedQuestionByMode,
        [mode]: null,
      },
      resultByMode: {
        ...prev.resultByMode,
        [mode]: nextResult,
      },
    };
  }

  if (event && event.type === "PERSIST_CACHE_RESULT") {
    if (event.ok) return prev;
    return {
      ...prev,
      cacheWarning:
        String(event.error || "").trim() ||
        "Could not persist pending question cache.",
    };
  }

  if (event && event.type === "MUTATE_WRONG_TOPIC_RESULT") {
    if (event.ok) {
      return {
        ...prev,
        wrongTopicCounts:
          event.counts && typeof event.counts === "object"
            ? normalizeWrongTopicCounts(event.counts)
            : prev.wrongTopicCounts,
      };
    }
    return {
      ...prev,
      cacheWarning:
        String(event.error || "").trim() ||
        "Could not mutate wrong topic counts.",
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
    cacheLoaded,
    needsCacheLoad,
    cacheLoading,
    cacheWarning,
    cachedQuestionByMode,
    wrongTopicLoaded,
    needsWrongTopicLoad,
    wrongTopicLoading,
    wrongTopicWarning,
    apiKeyLoaded,
    needsApiKeyLoad,
    apiKeyLoading,
    apiKey,
    apiKeyWarning,
    activeMode,
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
  if (needsApiKeyLoad && !apiKeyLoaded && !apiKeyLoading) {
    setTimeout(() => {
      dispatch({ type: "LOAD_API_KEY_START" });
      loadApiKey(dispatch);
    }, 0);
  }

  if (needsCacheLoad && !cacheLoaded && !cacheLoading) {
    setTimeout(() => {
      dispatch({ type: "LOAD_CACHE_START" });
      loadPendingQuestionsCache(dispatch);
    }, 0);
  }

  if (needsWrongTopicLoad && !wrongTopicLoaded && !wrongTopicLoading) {
    setTimeout(() => {
      dispatch({ type: "LOAD_WRONG_TOPICS_START" });
      loadWrongTopicCounts(dispatch);
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

  const mode = normalizeModeKey(activeMode) || DEFAULT_MODE;
  const activeProfile = DIFFICULTY_PROFILES[mode];
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
    for (const modeKey of QUESTION_MODES) {
      const pending = pendingGenerationByMode[modeKey];
      const context = topicContextByMode[modeKey];
      if (!pending || !context) continue;

      const requestKey = `${modeKey}::${pending.generationId}::${pending.topicKey}`;
      if (scheduledGenerationRequests.has(requestKey)) continue;

      scheduledGenerationRequests.add(requestKey);
      setTimeout(() => {
        scheduledGenerationRequests.delete(requestKey);
        dispatch({
          type: "GENERATION_REQUEST_SENT",
          mode: modeKey,
          topicKey: pending.topicKey,
          generationId: pending.generationId,
        });
        generateStepQuestion(
          {
            apiKey: apiKey.trim(),
            mode: modeKey,
            difficultyProfile: DIFFICULTY_PROFILES[modeKey],
            topicContext: context,
            generationId: pending.generationId,
            topicKey: pending.topicKey,
          },
          dispatch,
        );
      }, 0);
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

  const persistQuestionRemoval = (modeKey) => {
    const safeMode = normalizeModeKey(modeKey);
    if (!safeMode) return;
    const requestKey = `${safeMode}::remove`;
    if (scheduledCacheMutationRequests.has(requestKey)) return;
    scheduledCacheMutationRequests.add(requestKey);
    setTimeout(() => {
      scheduledCacheMutationRequests.delete(requestKey);
      persistPendingQuestionForMode(
        { mode: safeMode, cachedEntry: null },
        dispatch,
      );
    }, 0);
  };

  const persistWrongTopicIncrement = ({ modeKey, topic, question }) => {
    const safeMode = normalizeModeKey(modeKey);
    if (!safeMode) return;
    const safeTopic = normalizeWrongTopicKey(topic);
    const questionObject =
      question && typeof question === "object" ? question : {};
    const dedupeQuestionKey =
      (typeof questionObject.stem === "string"
        ? questionObject.stem.trim()
        : "") ||
      normalizeChoiceKey(questionObject.correctKey) ||
      "unknown-question";
    const requestKey = `${safeMode}::${safeTopic}::${dedupeQuestionKey}`;
    if (scheduledWrongTopicMutationRequests.has(requestKey)) return;
    scheduledWrongTopicMutationRequests.add(requestKey);
    setTimeout(() => {
      scheduledWrongTopicMutationRequests.delete(requestKey);
      mutateWrongTopicCount(
        {
          topic: safeTopic,
          delta: 1,
          deleteAtZero: false,
        },
        dispatch,
      );
    }, 0);
  };

  const persistTargetedCorrectDecrement = ({ modeKey, topic, question }) => {
    const safeMode = normalizeModeKey(modeKey);
    if (safeMode !== "targeted") return;
    const safeTopic = normalizeWrongTopicKey(topic);
    const questionObject =
      question && typeof question === "object" ? question : {};
    const dedupeQuestionKey =
      (typeof questionObject.stem === "string"
        ? questionObject.stem.trim()
        : "") ||
      normalizeChoiceKey(questionObject.correctKey) ||
      "unknown-question";
    const requestKey = `${safeMode}::decrement::${safeTopic}::${dedupeQuestionKey}`;
    if (scheduledWrongTopicMutationRequests.has(requestKey)) return;
    scheduledWrongTopicMutationRequests.add(requestKey);
    setTimeout(() => {
      scheduledWrongTopicMutationRequests.delete(requestKey);
      mutateWrongTopicCount(
        {
          topic: safeTopic,
          delta: -1,
          deleteAtZero: true,
        },
        dispatch,
      );
    }, 0);
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

  const getModeButtonClassName = (modeKey) => {
    const classes = ["modeBtn"];
    if (mode === modeKey) classes.push("modeBtnActive");
    const modeResult =
      resultByMode && typeof resultByMode[modeKey] === "string"
        ? resultByMode[modeKey]
        : "";
    if (modeResult === "correct") classes.push("modeBtnCorrect");
    if (modeResult === "incorrect") classes.push("modeBtnWrong");
    return classes.join(" ");
  };

  return (
    <div className="card">
      <div className="header">
        <div className="title">USMLE Question</div>
        <div className="headerBtns">
          <button
            className={getModeButtonClassName("targeted")}
            onClick={() =>
              dispatch({ type: "MODE_SELECTED", mode: "targeted" })
            }
            title="Targeted mode"
          >
            {DIFFICULTY_PROFILES.targeted.emoji}
          </button>
          <button
            className={getModeButtonClassName("easy")}
            onClick={() => dispatch({ type: "MODE_SELECTED", mode: "easy" })}
            title="Easy mode"
          >
            {DIFFICULTY_PROFILES.easy.emoji}
          </button>
          <button
            className={getModeButtonClassName("hard")}
            onClick={() => dispatch({ type: "MODE_SELECTED", mode: "hard" })}
            title="Hard mode"
          >
            {DIFFICULTY_PROFILES.hard.emoji}
          </button>
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

      {apiKeyWarning ? <div className="warn">{apiKeyWarning}</div> : null}
      {cacheWarning ? <div className="warn">{cacheWarning}</div> : null}
      {wrongTopicWarning ? (
        <div className="warn">{wrongTopicWarning}</div>
      ) : null}
      {commandWarning ? <div className="warn">{commandWarning}</div> : null}

      {!hasApiKey ? (
        <div className="warn">
          Set `openai-settings.json` with your OpenAI key.
        </div>
      ) : null}

      {activeLoading ? (
        <div className="loading">
          Generating {activeProfile.label} Step 1 question...
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
                <button className="stemTopicLink" onClick={onOpenRevealedTopic}>
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
                    onClick={() => {
                      const alreadyRevealed = !!revealed;
                      const wasCorrect =
                        !!activeQuestion &&
                        typeof activeQuestion === "object" &&
                        normalizeChoiceKey(activeQuestion.correctKey) === key;
                      const topicForWrongCount =
                        activeContext && typeof activeContext.topic === "string"
                          ? activeContext.topic
                          : "";
                      dispatch({ type: "SELECT_ANSWER", mode, key });
                      if (!alreadyRevealed && !wasCorrect) {
                        persistWrongTopicIncrement({
                          modeKey: mode,
                          topic: topicForWrongCount,
                          question: activeQuestion,
                        });
                      }
                      if (
                        !alreadyRevealed &&
                        wasCorrect &&
                        mode === "targeted"
                      ) {
                        persistTargetedCorrectDecrement({
                          modeKey: mode,
                          topic: topicForWrongCount,
                          question: activeQuestion,
                        });
                      }
                      if (!alreadyRevealed && cachedQuestionByMode[mode]) {
                        persistQuestionRemoval(mode);
                      }
                    }}
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
  );
};

export const className = `
  top: 24px;
  right: 24px;
  width: 560px;

  font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  color: rgba(255,255,255,0.92);

  .card {
    padding: 14px 16px;
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
    margin-bottom: 10px;
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
