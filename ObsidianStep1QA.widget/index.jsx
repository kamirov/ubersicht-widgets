import { run } from "uebersicht";

export const refreshFrequency = 1000 * 60 * 60; // 1 hour

const NODE = "/Users/kamirov/.nvm/versions/node/v22.17.1/bin/node";
const NOTES_DIR =
  "/Users/kamirov/Library/CloudStorage/GoogleDrive-andrei.khramtsov@gmail.com/My Drive/Hole In The Ground/👨‍⚕️ Medicine/Exploring";
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

    console.log(JSON.stringify({
      topic: path.basename(file).replace(/\\.md$/i, ""),
      file: path.basename(file),
      path: file,
      questionsCount: qs.length,
      answersCount: as.length,
      samplePairs,
    }));
    return;
  }

  console.log(JSON.stringify({
    error: "No notes found with parseable numbered Questions/Answers of equal length.",
  }));
}

main();
EOF
`;

const escapeForSingleQuotedShell = (value) =>
  String(value).replace(/'/g, "'\\''");

const normalizeChoiceKey = (key) => {
  const upper = String(key || "").trim().toUpperCase();
  return ["A", "B", "C", "D", "E"].includes(upper) ? upper : "";
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
  if (!correctKey) return { question: null, error: "Correct answer key is invalid." };
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
    const text = typeof (entry && entry.text) === "string" ? entry.text.trim() : "";
    const explanation =
      typeof (entry && entry.explanation) === "string"
        ? entry.explanation.trim()
        : "";

    if (!key) return { question: null, error: "Choice key must be A-E." };
    if (seen.has(key)) return { question: null, error: "Choice keys must be unique." };
    if (!text) return { question: null, error: `Choice ${key} is missing text.` };
    if (!explanation) {
      return { question: null, error: `Choice ${key} is missing explanation.` };
    }

    seen.add(key);
    choices.push({ key, text, explanation });
  }

  const requiredKeys = ["A", "B", "C", "D", "E"];
  for (const key of requiredKeys) {
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

const saveApiKey = (apiKey, dispatch) => {
  const nodeScript = `
const fs = require("fs");
const path = require("path");

const STORE = '${escapeForSingleQuotedShell(SETTINGS_STORE)}';
const TMP = STORE + ".tmp";
const VALUE = ${JSON.stringify(String(apiKey || ""))};

function main() {
  const dir = path.dirname(STORE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    TMP,
    JSON.stringify({ version: 1, openaiApiKey: VALUE }, null, 2) + "\\n",
    "utf8"
  );
  fs.renameSync(TMP, STORE);
  console.log(JSON.stringify({ ok: true }));
}

try {
  main();
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) }));
}
`;

  run(`"${NODE}" <<'EOF'\n${nodeScript}\nEOF`)
    .then((result) => {
      try {
        const data = JSON.parse(String(result || "").trim());
        dispatch({
          type: "SAVE_API_KEY_RESULT",
          ok: !!(data && data.ok),
          openaiApiKey: String(apiKey || ""),
          error:
            data && data.ok
              ? null
              : String((data && data.error) || "Could not save API key."),
        });
      } catch {
        dispatch({
          type: "SAVE_API_KEY_RESULT",
          ok: false,
          openaiApiKey: "",
          error: "Could not parse API key save response.",
        });
      }
    })
    .catch((err) => {
      dispatch({
        type: "SAVE_API_KEY_RESULT",
        ok: false,
        openaiApiKey: "",
        error: `API key save failed: ${String(err && err.message ? err.message : err)}`,
      });
    });
};

const generateStepQuestion = async (
  { apiKey, topic, file, path, samplePairs, generationId, topicKey },
  dispatch,
) => {
  const cleanedPairs = Array.isArray(samplePairs) ? samplePairs.slice(0, 3) : [];
  const context = cleanedPairs
    .map((pair, idx) => {
      const q = pair && typeof pair.q === "string" ? pair.q.trim() : "";
      const a = pair && typeof pair.a === "string" ? pair.a.trim() : "";
      return `${idx + 1}. Q: ${q}\nA: ${a}`;
    })
    .join("\n\n");

  const systemMessage =
    "You create rigorous USMLE Step 1 single-best-answer questions. Return only valid JSON.";
  const userMessage = [
    `Topic: ${topic || "Unknown topic"}`,
    `Source file: ${file || "Unknown file"}`,
    `Source path: ${path || "Unknown path"}`,
    "Use this source context to design one clinically relevant Step 1 question:",
    context || "(No source Q/A snippets available)",
    "",
    "Return JSON with this exact shape:",
    "{",
    '  "stem": "string",',
    '  "choices": [',
    '    { "key": "A", "text": "string", "explanation": "string" },',
    '    { "key": "B", "text": "string", "explanation": "string" },',
    '    { "key": "C", "text": "string", "explanation": "string" },',
    '    { "key": "D", "text": "string", "explanation": "string" },',
    '    { "key": "E", "text": "string", "explanation": "string" }',
    "  ],",
    '  "correctKey": "A|B|C|D|E",',
    '  "correctExplanation": "string"',
    "}",
    "",
    "Rules:",
    "- Exactly five choices A-E.",
    "- Exactly one correct answer.",
    "- Keep explanations concise but specific and mechanistic.",
    "- Do not include markdown fences or extra text outside JSON.",
  ].join("\n");

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
            key: { type: "string", enum: ["A", "B", "C", "D", "E"] },
            text: { type: "string" },
            explanation: { type: "string" },
          },
          required: ["key", "text", "explanation"],
        },
      },
      correctKey: { type: "string", enum: ["A", "B", "C", "D", "E"] },
      correctExplanation: { type: "string" },
    },
    required: ["stem", "choices", "correctKey", "correctExplanation"],
  };

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.2",
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
        ok: false,
        generationId,
        topicKey,
        error: normalized.error || "Model response has invalid shape.",
      });
      return;
    }

    dispatch({
      type: "GENERATE_RESULT",
      ok: true,
      generationId,
      topicKey,
      question: normalized.question,
    });
  } catch (err) {
    dispatch({
      type: "GENERATE_RESULT",
      ok: false,
      generationId,
      topicKey,
      error: `OpenAI request error: ${String(err && err.message ? err.message : err)}`,
    });
  }
};

export const initialState = {
  output: "",
  error: null,

  needsApiKeyLoad: true,
  apiKeyLoaded: false,
  apiKeyLoading: false,
  apiKey: "",
  apiKeyInput: "",
  apiKeyPanelOpen: false,
  apiKeyStatus: null,
  apiKeyWarning: null,

  loadingQuestion: false,
  questionError: null,
  question: null,
  selectedKey: "",
  revealed: false,

  generationId: 0,
  lastGeneratedTopicKey: "",
  pendingGenerationTopicKey: null,
  pendingGenerationId: null,
};

export const updateState = (event, prev) => {
  const parseCommandPayload = (rawOutput) => {
    try {
      const parsed = JSON.parse((rawOutput || "").trim());
      if (!parsed || typeof parsed !== "object" || parsed.error) return null;

      const topic = typeof parsed.topic === "string" ? parsed.topic : "";
      const file = typeof parsed.file === "string" ? parsed.file : "";
      const path = typeof parsed.path === "string" ? parsed.path : "";
      const samplePairs = Array.isArray(parsed.samplePairs) ? parsed.samplePairs : [];
      const hasShape =
        !!topic &&
        !!file &&
        !!path &&
        Number.isFinite(Number(parsed.questionsCount)) &&
        Number.isFinite(Number(parsed.answersCount));

      if (!hasShape) return null;
      return { topic, path, samplePairs };
    } catch {
      return null;
    }
  };

  const maybeScheduleGeneration = (baseState, parsedPayload) => {
    const hasApiKey =
      typeof baseState.apiKey === "string" && baseState.apiKey.trim().length > 0;
    if (!hasApiKey || !parsedPayload) {
      return {
        ...baseState,
        loadingQuestion: false,
        pendingGenerationTopicKey: null,
        pendingGenerationId: null,
      };
    }

    const topicKey = `${parsedPayload.path}::${parsedPayload.topic}`;
    if (baseState.lastGeneratedTopicKey === topicKey) {
      return {
        ...baseState,
        pendingGenerationTopicKey: null,
        pendingGenerationId: null,
      };
    }

    const nextGenerationId = Number(baseState.generationId) + 1;
    return {
      ...baseState,
      loadingQuestion: true,
      questionError: null,
      question: null,
      selectedKey: "",
      revealed: false,
      generationId: nextGenerationId,
      pendingGenerationTopicKey: topicKey,
      pendingGenerationId: nextGenerationId,
    };
  };

  if (event && event.type === "TOGGLE_API_KEY_PANEL") {
    return { ...prev, apiKeyPanelOpen: !prev.apiKeyPanelOpen };
  }

  if (event && event.type === "API_KEY_INPUT") {
    return {
      ...prev,
      apiKeyInput: String(event.value || ""),
      apiKeyStatus: null,
    };
  }

  if (event && event.type === "LOAD_API_KEY_START") {
    return {
      ...prev,
      needsApiKeyLoad: false,
      apiKeyLoading: true,
      apiKeyStatus: null,
      apiKeyWarning: null,
    };
  }

  if (event && event.type === "LOAD_API_KEY_RESULT") {
    const key = event.ok ? String(event.openaiApiKey || "") : "";
    return {
      ...prev,
      needsApiKeyLoad: false,
      apiKeyLoaded: true,
      apiKeyLoading: false,
      apiKey: key,
      apiKeyInput: key,
      apiKeyWarning: event.ok ? event.warning || null : event.error || null,
      apiKeyStatus: event.ok ? null : event.error || "Could not load API key.",
    };
  }

  if (event && event.type === "SAVE_API_KEY_START") {
    return {
      ...prev,
      apiKeyStatus: "Saving API key...",
      apiKeyWarning: null,
    };
  }

  if (event && event.type === "SAVE_API_KEY_RESULT") {
    if (!event.ok) {
      return {
        ...prev,
        apiKeyStatus: String(event.error || "Could not save API key."),
      };
    }

    const base = {
      ...prev,
      apiKey: String(event.openaiApiKey || ""),
      apiKeyInput: String(event.openaiApiKey || ""),
      apiKeyStatus: "API key saved.",
      apiKeyWarning: null,
      questionError: null,
      question: null,
      selectedKey: "",
      revealed: false,
      lastGeneratedTopicKey: "",
      pendingGenerationTopicKey: null,
      pendingGenerationId: null,
    };

    return maybeScheduleGeneration(base, parseCommandPayload(prev.output));
  }

  if (event && event.type === "GENERATION_REQUEST_SENT") {
    if (
      Number(event.generationId) !== Number(prev.pendingGenerationId) ||
      String(event.topicKey || "") !== String(prev.pendingGenerationTopicKey || "")
    ) {
      return prev;
    }
    return {
      ...prev,
      pendingGenerationTopicKey: null,
      pendingGenerationId: null,
    };
  }

  if (event && event.type === "GENERATE_RESULT") {
    if (Number(event.generationId) !== Number(prev.generationId)) return prev;

    if (!event.ok) {
      return {
        ...prev,
        loadingQuestion: false,
        question: null,
        questionError: String(event.error || "Could not generate question."),
        lastGeneratedTopicKey: String(event.topicKey || ""),
        pendingGenerationTopicKey: null,
        pendingGenerationId: null,
      };
    }

    return {
      ...prev,
      loadingQuestion: false,
      questionError: null,
      question: event.question || null,
      selectedKey: "",
      revealed: false,
      lastGeneratedTopicKey: String(event.topicKey || ""),
      pendingGenerationTopicKey: null,
      pendingGenerationId: null,
    };
  }

  if (event && event.type === "SELECT_ANSWER") {
    if (prev.revealed) return prev;
    const key = normalizeChoiceKey(event.key);
    if (!key) return prev;
    return {
      ...prev,
      selectedKey: key,
      revealed: true,
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
      loadingQuestion: false,
      questionError: null,
      question: null,
      selectedKey: "",
      revealed: false,
      lastGeneratedTopicKey: "",
      pendingGenerationTopicKey: null,
      pendingGenerationId: null,
    };
    return maybeScheduleGeneration(base, parseCommandPayload(event.output));
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
    apiKeyInput,
    apiKeyPanelOpen,
    apiKeyStatus,
    apiKeyWarning,
    loadingQuestion,
    questionError,
    question,
    selectedKey,
    revealed,
    lastGeneratedTopicKey,
    pendingGenerationTopicKey,
    pendingGenerationId,
  },
  dispatch,
) => {
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

  let data;
  try {
    data = JSON.parse((output || "").trim());
  } catch {
    data = { error: "Could not parse JSON output.", raw: output };
  }

  if (!data || data.error) {
    return (
      <div className="card">
        <div className="title">Step 1 Question</div>
        <div className="error">{data?.error || "No data yet."}</div>
      </div>
    );
  }

  const topic = typeof data.topic === "string" ? data.topic : "";
  const file = typeof data.file === "string" ? data.file : "";
  const path = typeof data.path === "string" ? data.path : "";
  const samplePairs = Array.isArray(data.samplePairs) ? data.samplePairs : [];
  const hasShape =
    !!topic &&
    !!file &&
    !!path &&
    Number.isFinite(Number(data.questionsCount)) &&
    Number.isFinite(Number(data.answersCount));

  if (!hasShape) {
    return (
      <div className="card">
        <div className="title">Step 1 Question</div>
        <div className="error">Unexpected data shape from command output.</div>
      </div>
    );
  }

  const hasApiKey = typeof apiKey === "string" && apiKey.trim().length > 0;

  if (
    hasApiKey &&
    pendingGenerationTopicKey &&
    pendingGenerationId !== null &&
    pendingGenerationTopicKey !== lastGeneratedTopicKey
  ) {
    setTimeout(() => {
      dispatch({
        type: "GENERATION_REQUEST_SENT",
        topicKey: pendingGenerationTopicKey,
        generationId: pendingGenerationId,
      });
      generateStepQuestion(
        {
          apiKey: apiKey.trim(),
          topic,
          file,
          path,
          samplePairs,
          generationId: pendingGenerationId,
          topicKey: pendingGenerationTopicKey,
        },
        dispatch,
      );
    }, 0);
  }

  const onTopicChatGPT = (e) => {
    e.stopPropagation();
    const prompt = `Tell me about ${topic}. I'm studying for USMLE Step 1, so keep things relevant`;
    const url = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
    run(`open '${escapeForSingleQuotedShell(url)}'`);
  };

  const onSaveApiKey = (e) => {
    e.stopPropagation();
    dispatch({ type: "SAVE_API_KEY_START" });
    saveApiKey(String(apiKeyInput || "").trim(), dispatch);
  };

  return (
    <div className="card">
      <div className="header">
        <div className="title">{topic || "Step 1 Question"}</div>
        <div className="headerBtns">
          <button
            className="topicChatgptBtn"
            onClick={onTopicChatGPT}
            title="Ask GPT about topic"
          >
            💬
          </button>
          <button
            className="apiKeyBtn"
            onClick={() => dispatch({ type: "TOGGLE_API_KEY_PANEL" })}
            title="OpenAI API key"
          >
            API Key
          </button>
        </div>
      </div>

      {apiKeyPanelOpen ? (
        <div className="apiKeyPanel">
          <input
            className="apiKeyInput"
            type="password"
            placeholder="sk-..."
            value={apiKeyInput}
            onInput={(e) =>
              dispatch({
                type: "API_KEY_INPUT",
                value:
                  e &&
                  e.target &&
                  typeof e.target.value === "string"
                    ? e.target.value
                    : "",
              })
            }
          />
          <button className="saveBtn" onClick={onSaveApiKey}>
            Save
          </button>
        </div>
      ) : null}

      {apiKeyStatus ? <div className="info">{apiKeyStatus}</div> : null}
      {apiKeyWarning ? <div className="warn">{apiKeyWarning}</div> : null}

      <div className="meta">
        <span>{file}</span>
        <span>
          {Number(data.questionsCount)} Q / {Number(data.answersCount)} A
        </span>
      </div>

      {!hasApiKey ? (
        <div className="warn">
          Add your OpenAI API key to generate a Step 1 question for this topic.
        </div>
      ) : null}

      {hasApiKey && loadingQuestion ? (
        <div className="loading">Generating Step 1 question...</div>
      ) : null}

      {hasApiKey && !loadingQuestion && questionError ? (
        <div className="error">{questionError}</div>
      ) : null}

      {hasApiKey && !loadingQuestion && question ? (
        <div className="questionWrap">
          <div className="stem">{question.stem}</div>
          <div className="choices">
            {question.choices.map((choice) => {
              const key = choice.key;
              const selected = selectedKey === key;
              const isCorrect = key === question.correctKey;

              const stateClass = revealed
                ? isCorrect
                  ? "choiceCorrect"
                  : "choiceWrong"
                : selected
                  ? "choiceSelected"
                  : "";

              return (
                <div key={key} className={`choiceWrap ${stateClass}`}>
                  <button
                    className="choiceBtn"
                    onClick={() => dispatch({ type: "SELECT_ANSWER", key })}
                  >
                    <span className="choiceKey">{key}.</span>
                    <span className="choiceText">{choice.text}</span>
                  </button>
                  {revealed ? (
                    <div className="choiceExplanation">{choice.explanation}</div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {revealed ? (
            <div className="correctExplain">
              Correct answer: <strong>{question.correctKey}</strong>.{" "}
              {question.correctExplanation}
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

  .topicChatgptBtn,
  .apiKeyBtn,
  .saveBtn {
    border: 1px solid rgba(255,255,255,0.18);
    background: rgba(255,255,255,0.10);
    color: white;
    border-radius: 10px;
    padding: 6px 10px;
    cursor: pointer;
  }

  .topicChatgptBtn:hover,
  .apiKeyBtn:hover,
  .saveBtn:hover {
    background: rgba(255,255,255,0.18);
  }

  .apiKeyPanel {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }

  .apiKeyInput {
    flex: 1;
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 10px;
    background: rgba(255,255,255,0.08);
    color: white;
    padding: 7px 10px;
    outline: none;
  }

  .apiKeyInput::placeholder {
    color: rgba(255,255,255,0.45);
  }

  .meta {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    opacity: 0.75;
    margin: 2px 0 10px;
  }

  .loading {
    margin: 8px 0 4px;
    font-size: 14px;
    opacity: 0.9;
  }

  .info {
    margin: 0 0 8px;
    padding: 8px 10px;
    border-radius: 10px;
    font-size: 13px;
    color: rgba(170, 210, 255, 0.98);
    background: rgba(30, 60, 120, 0.28);
    border: 1px solid rgba(170, 210, 255, 0.2);
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
    padding: 0 12px 10px 34px;
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
