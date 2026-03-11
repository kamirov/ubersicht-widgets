import { run } from "uebersicht";

export const refreshFrequency = 1000 * 60 * 15; // 15 minutes
const NODE = "/Users/kamirov/.nvm/versions/node/v22.17.1/bin/node";

const NOTES_DIR =
  "/Users/kamirov/Library/CloudStorage/GoogleDrive-andrei.khramtsov@gmail.com/My Drive/Hole In The Ground/👨‍⚕️ Medicine/Exploring";

const TROUBLE_STORE =
  "/Users/kamirov/Projects/ubersicht-widgets/ObsidianQA.widget/trouble-questions.json";

const LAST_NOTE_STORE = "/tmp/obsidianqa-last-note-selection.json";

// ===================== DATA FETCH =====================
export const command = `
"${NODE}" <<'EOF'
const fs = require("fs");
const path = require("path");

const NOTES_DIR = ${JSON.stringify(NOTES_DIR)};
const LAST_NOTE_STORE = ${JSON.stringify(LAST_NOTE_STORE)};

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

  if (starts.length === 0) return null;

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

function readPreviousSelection() {
  if (!fs.existsSync(LAST_NOTE_STORE)) return "";
  let raw = "";
  try {
    raw = fs.readFileSync(LAST_NOTE_STORE, "utf8");
  } catch {
    return "";
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.lastNotePath === "string"
      ? parsed.lastNotePath
      : "";
  } catch {
    return "";
  }
}

function writeSelection(pathValue) {
  try {
    fs.writeFileSync(
      LAST_NOTE_STORE,
      JSON.stringify({ lastNotePath: String(pathValue || "") }) + "\\n",
      "utf8",
    );
  } catch {
    // Best effort only; selection should still render if this fails.
  }
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
    if (qs.length === 0 || as.length === 0) continue;
    if (qs.length !== as.length) continue;

    const pairs = qs.map((q, i) => ({ q, a: as[i] }));
    candidates.push({
      file: path.basename(file),
      path: file,
      pairs,
    });
  }

  if (!candidates.length) {
    console.log(JSON.stringify({
      error: "No notes found with parseable numbered Questions/Answers of equal length."
    }));
    return;
  }

  const previousPath = readPreviousSelection();
  const filteredCandidates = previousPath
    ? candidates.filter((item) => item.path !== previousPath)
    : candidates;
  const selectionPool =
    filteredCandidates.length > 0 ? filteredCandidates : candidates;
  const selected =
    selectionPool[Math.floor(Math.random() * selectionPool.length)];

  writeSelection(selected.path);

  console.log(JSON.stringify({
    file: selected.file,
    path: selected.path,
    pairs: selected.pairs,
    selectedAt: new Date().toISOString(),
    selectionPoolSize: selectionPool.length,
    prevNotePathUsed: !!previousPath && filteredCandidates.length > 0
  }));
}

main();
EOF
`;

// ===================== HELPERS =====================
const escapeForSingleQuotedShell = (value) =>
  String(value).replace(/'/g, "'\\''");

const sha1 = (value) => {
  const msg = unescape(encodeURIComponent(String(value)));
  const words = [];
  for (let i = 0; i < msg.length; i++) {
    words[i >> 2] |= msg.charCodeAt(i) << (24 - (i % 4) * 8);
  }
  words[msg.length >> 2] |= 0x80 << (24 - (msg.length % 4) * 8);
  words[(((msg.length + 8) >> 6) + 1) * 16 - 1] = msg.length * 8;

  const w = new Array(80);
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  for (let i = 0; i < words.length; i += 16) {
    for (let t = 0; t < 16; t++) w[t] = words[i + t] | 0;
    for (let t = 16; t < 80; t++) {
      const n = w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16];
      w[t] = (n << 1) | (n >>> 31);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let t = 0; t < 80; t++) {
      let f;
      let k;
      if (t < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (t < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (t < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }

      const temp = (((a << 5) | (a >>> 27)) + f + e + k + (w[t] | 0)) | 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }

  const hex = (n) => (n >>> 0).toString(16).padStart(8, "0");
  return [hex(h0), hex(h1), hex(h2), hex(h3), hex(h4)].join("");
};

const makeItemId = (notePath, question) =>
  sha1(`${notePath || ""}::${question || ""}`);

const parseOutputData = (output) => {
  try {
    const parsed = JSON.parse((output || "").trim());
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const escapeHtml = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sanitizeMarkdownLink = (href) => {
  if (typeof href !== "string") return "";
  const trimmed = href.trim();
  if (!trimmed) return "";
  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) return "";

  try {
    const parsed = new URL(trimmed);
    const protocol = String(parsed.protocol || "").toLowerCase();
    if (
      protocol === "http:" ||
      protocol === "https:" ||
      protocol === "mailto:"
    ) {
      return parsed.href;
    }
    return "";
  } catch {
    return "";
  }
};

const renderInlineMarkdown = (input) => {
  if (typeof input !== "string" || !input) return "";

  const codeTokens = [];
  let html = String(input).replace(/`([^`\n]+?)`/g, (_, code) => {
    const token = `\u0000CODE${codeTokens.length}\u0000`;
    codeTokens.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  html = escapeHtml(html);

  html = html.replace(
    /\[([^\]\n]+)\]\(([^)\n]+)\)/g,
    (_, labelText, linkTarget) => {
      const safeHref = sanitizeMarkdownLink(linkTarget);
      const label = String(labelText || "");
      if (!safeHref) return label;
      return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    },
  );

  html = html.replace(/\*\*([^*\n][\s\S]*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");

  html = html.replace(/\u0000CODE(\d+)\u0000/g, (_, idxText) => {
    const idx = Number(idxText);
    return Number.isInteger(idx) && codeTokens[idx] ? codeTokens[idx] : "";
  });

  return html;
};

const renderMarkdownToHtml = (input) => {
  if (typeof input !== "string" || !input.trim()) return "";

  try {
    const lines = input.replace(/\r\n/g, "\n").split("\n");
    const blocks = [];
    let paragraph = [];
    let listType = "";
    let listItems = [];
    let inCodeBlock = false;
    let codeLines = [];

    const flushParagraph = () => {
      if (paragraph.length === 0) return;
      const text = paragraph.join("\n").trim();
      paragraph = [];
      if (!text) return;
      blocks.push(
        `<p>${renderInlineMarkdown(text).replace(/\n/g, "<br />")}</p>`,
      );
    };

    const flushList = () => {
      if (!listType || listItems.length === 0) {
        listType = "";
        listItems = [];
        return;
      }
      const tag = listType === "ol" ? "ol" : "ul";
      const itemsHtml = listItems
        .map((item) => `<li>${renderInlineMarkdown(item)}</li>`)
        .join("");
      blocks.push(`<${tag}>${itemsHtml}</${tag}>`);
      listType = "";
      listItems = [];
    };

    const flushCodeBlock = () => {
      if (!inCodeBlock) return;
      blocks.push(
        `<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`,
      );
      inCodeBlock = false;
      codeLines = [];
    };

    for (const rawLine of lines) {
      const line = String(rawLine || "");

      if (inCodeBlock) {
        if (/^\s*```/.test(line)) {
          flushCodeBlock();
        } else {
          codeLines.push(line);
        }
        continue;
      }

      if (/^\s*```/.test(line)) {
        flushParagraph();
        flushList();
        inCodeBlock = true;
        codeLines = [];
        continue;
      }

      if (!line.trim()) {
        flushParagraph();
        flushList();
        continue;
      }

      const headingMatch = line.match(/^\s*(#{1,6})\s+(.+?)\s*$/);
      if (headingMatch) {
        flushParagraph();
        flushList();
        const level = headingMatch[1].length;
        const text = headingMatch[2];
        blocks.push(`<h${level}>${renderInlineMarkdown(text)}</h${level}>`);
        continue;
      }

      const orderedMatch = line.match(/^\s*\d+\.\s+(.+?)\s*$/);
      if (orderedMatch) {
        flushParagraph();
        if (listType && listType !== "ol") flushList();
        listType = "ol";
        listItems.push(orderedMatch[1]);
        continue;
      }

      const unorderedMatch = line.match(/^\s*[-*+]\s+(.+?)\s*$/);
      if (unorderedMatch) {
        flushParagraph();
        if (listType && listType !== "ul") flushList();
        listType = "ul";
        listItems.push(unorderedMatch[1]);
        continue;
      }

      flushList();
      paragraph.push(line.trim());
    }

    flushParagraph();
    flushList();
    flushCodeBlock();

    return blocks.join("") || escapeHtml(input).replace(/\n/g, "<br />");
  } catch {
    return escapeHtml(input).replace(/\n/g, "<br />");
  }
};

const loadVisibleStoreMembership = (ids, dispatch) => {
  if (!Array.isArray(ids) || ids.length === 0) {
    dispatch({ type: "STORE_SYNCED", ids: {}, syncError: null });
    return;
  }

  const nodeScript = `
const fs = require("fs");

const STORE = '${escapeForSingleQuotedShell(TROUBLE_STORE)}';
const TARGET_IDS = ${JSON.stringify(ids)};

function isValidStore(data) {
  return (
    data &&
    typeof data === "object" &&
    Number(data.version) === 1 &&
    Array.isArray(data.items)
  );
}

function main() {
  if (!fs.existsSync(STORE)) {
    const empty = {};
    for (const id of TARGET_IDS) empty[id] = false;
    console.log(JSON.stringify({ ids: empty }));
    return;
  }

  let raw;
  try {
    raw = fs.readFileSync(STORE, "utf8");
  } catch (err) {
    console.log(JSON.stringify({ error: "Could not read trouble store: " + String(err && err.message ? err.message : err) }));
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.log(JSON.stringify({ error: "Trouble store JSON is malformed." }));
    return;
  }

  if (!isValidStore(parsed)) {
    console.log(JSON.stringify({ error: "Trouble store has invalid structure." }));
    return;
  }

  const lookup = new Set(parsed.items.map((item) => item && item.id).filter(Boolean));
  const out = {};
  for (const id of TARGET_IDS) out[id] = lookup.has(id);

  console.log(JSON.stringify({ ids: out }));
}

main();
`;

  run(`"${NODE}" <<'EOF'\n${nodeScript}\nEOF`)
    .then((result) => {
      try {
        const data = JSON.parse(String(result || "").trim());
        if (data && data.error) {
          dispatch({
            type: "STORE_SYNCED",
            ids: {},
            syncError: String(data.error),
          });
          return;
        }
        dispatch({
          type: "STORE_SYNCED",
          ids: data && data.ids && typeof data.ids === "object" ? data.ids : {},
          syncError: null,
        });
      } catch {
        dispatch({
          type: "STORE_SYNCED",
          ids: {},
          syncError: "Could not parse store sync response.",
        });
      }
    })
    .catch((err) => {
      dispatch({
        type: "STORE_SYNCED",
        ids: {},
        syncError: `Store sync failed: ${String(err && err.message ? err.message : err)}`,
      });
    });
};

const mutateTroubleStore = ({ action, item }, dispatch) => {
  const payload = { action, item };

  const nodeScript = `
const fs = require("fs");
const path = require("path");

const STORE = '${escapeForSingleQuotedShell(TROUBLE_STORE)}';
const TMP = STORE + ".tmp";
const BAK = STORE + ".bak";
const PAYLOAD = ${JSON.stringify(payload)};

function defaultStore() {
  return { version: 1, items: [] };
}

function sanitizeStore(input) {
  if (!input || typeof input !== "object") return defaultStore();
  if (Number(input.version) !== 1 || !Array.isArray(input.items)) return defaultStore();

  const out = [];
  const seen = new Set();
  for (const item of input.items) {
    if (!item || typeof item !== "object") continue;
    const id = typeof item.id === "string" ? item.id : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);

    out.push({
      id,
      topic: typeof item.topic === "string" ? item.topic : "",
      question: typeof item.question === "string" ? item.question : "",
      answer: typeof item.answer === "string" ? item.answer : "",
      notePath: typeof item.notePath === "string" ? item.notePath : "",
      noteFile: typeof item.noteFile === "string" ? item.noteFile : "",
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
      timesMarked: Number.isFinite(item.timesMarked) && item.timesMarked > 0 ? Math.floor(item.timesMarked) : 1,
    });
  }

  return { version: 1, items: out };
}

function loadStore() {
  if (!fs.existsSync(STORE)) return defaultStore();

  let raw;
  try {
    raw = fs.readFileSync(STORE, "utf8");
  } catch {
    return defaultStore();
  }

  try {
    return sanitizeStore(JSON.parse(raw));
  } catch {
    try { fs.copyFileSync(STORE, BAK); } catch {}
    return defaultStore();
  }
}

function writeStore(store) {
  const dir = path.dirname(STORE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(TMP, JSON.stringify(store, null, 2) + "\\n", "utf8");
  fs.renameSync(TMP, STORE);
}

function main() {
  const payload = PAYLOAD || {};
  const action = payload.action;
  const item = payload.item || {};

  if (action !== "add" && action !== "remove") {
    console.log(JSON.stringify({ error: "Invalid action." }));
    return;
  }

  if (!item || typeof item.id !== "string" || !item.id) {
    console.log(JSON.stringify({ error: "Invalid item id." }));
    return;
  }

  const store = loadStore();
  const now = new Date().toISOString();
  const idx = store.items.findIndex((it) => it.id === item.id);

  if (action === "add") {
    if (idx >= 0) {
      const prev = store.items[idx];
      store.items[idx] = {
        ...prev,
        topic: typeof item.topic === "string" ? item.topic : prev.topic,
        question: typeof item.question === "string" ? item.question : prev.question,
        answer: typeof item.answer === "string" ? item.answer : prev.answer,
        notePath: typeof item.notePath === "string" ? item.notePath : prev.notePath,
        noteFile: typeof item.noteFile === "string" ? item.noteFile : prev.noteFile,
        updatedAt: now,
        timesMarked: (Number.isFinite(prev.timesMarked) ? prev.timesMarked : 1) + 1,
      };
    } else {
      store.items.push({
        id: item.id,
        topic: typeof item.topic === "string" ? item.topic : "",
        question: typeof item.question === "string" ? item.question : "",
        answer: typeof item.answer === "string" ? item.answer : "",
        notePath: typeof item.notePath === "string" ? item.notePath : "",
        noteFile: typeof item.noteFile === "string" ? item.noteFile : "",
        createdAt: now,
        updatedAt: now,
        timesMarked: 1,
      });
    }
  }

  if (action === "remove") {
    if (idx >= 0) store.items.splice(idx, 1);
  }

  writeStore(store);
  console.log(JSON.stringify({
    ok: true,
    id: item.id,
    checked: action === "add",
    itemCount: store.items.length
  }));
}

try {
  main();
} catch (err) {
  console.log(JSON.stringify({ error: String(err && err.message ? err.message : err) }));
}
`;

  run(`"${NODE}" <<'EOF'\n${nodeScript}\nEOF`)
    .then((result) => {
      try {
        const data = JSON.parse(String(result || "").trim());
        if (!data || data.error) {
          dispatch({
            type: "STORE_MUTATION_RESULT",
            ok: false,
            id: item.id,
            expectedChecked: action === "add",
            error: data && data.error ? String(data.error) : "Mutation failed",
          });
          return;
        }

        dispatch({
          type: "STORE_MUTATION_RESULT",
          ok: true,
          id: String(data.id || item.id),
          checked: !!data.checked,
          error: null,
        });
      } catch {
        dispatch({
          type: "STORE_MUTATION_RESULT",
          ok: false,
          id: item.id,
          expectedChecked: action === "add",
          error: "Could not parse mutation response.",
        });
      }
    })
    .catch((err) => {
      dispatch({
        type: "STORE_MUTATION_RESULT",
        ok: false,
        id: item.id,
        expectedChecked: action === "add",
        error: `Mutation command failed: ${String(err && err.message ? err.message : err)}`,
      });
    });
};

// ===================== STATE =====================
export const initialState = {
  output: "",
  error: null,
  storeError: null,
  expanded: {},
  checked: {},
  persistedIds: {},
  visibleIds: [],
  syncingStore: false,
  syncedKey: "",
  lastNotePath: "",
  lastRefreshLabel: "",
  lastSelectionPoolSize: 0,
  lastPrevNotePathUsed: false,
};

export const updateState = (event, prev) => {
  if (event && event.type === "TOGGLE_ANSWER") {
    const idx = event.idx;
    const nextExpanded = { ...prev.expanded };
    nextExpanded[idx] = !nextExpanded[idx];
    return { ...prev, expanded: nextExpanded };
  }

  if (event && event.type === "SYNC_STORE_START") {
    return { ...prev, syncingStore: true, storeError: null };
  }

  if (event && event.type === "STORE_SYNCED") {
    return {
      ...prev,
      syncingStore: false,
      persistedIds: event.ids && typeof event.ids === "object" ? event.ids : {},
      syncedKey: Array.isArray(prev.visibleIds)
        ? prev.visibleIds.join("|")
        : "",
      storeError: event.syncError || null,
    };
  }

  if (event && event.type === "TOGGLE_CHECK_OPTIMISTIC") {
    const id = String(event.id || "");
    if (!id) return prev;

    const nextChecked = { ...prev.checked, [id]: !!event.nextChecked };
    const nextPersisted = { ...prev.persistedIds, [id]: !!event.nextChecked };

    return {
      ...prev,
      checked: nextChecked,
      persistedIds: nextPersisted,
      storeError: null,
    };
  }

  if (event && event.type === "STORE_MUTATION_RESULT") {
    const id = String(event.id || "");
    if (!id) return prev;

    if (!event.ok) {
      const rollbackChecked = { ...prev.checked, [id]: !event.expectedChecked };
      const rollbackPersisted = {
        ...prev.persistedIds,
        [id]: !event.expectedChecked,
      };
      return {
        ...prev,
        checked: rollbackChecked,
        persistedIds: rollbackPersisted,
        storeError: String(event.error || "Trouble store mutation failed."),
      };
    }

    const nextChecked = { ...prev.checked, [id]: !!event.checked };
    const nextPersisted = { ...prev.persistedIds, [id]: !!event.checked };

    return {
      ...prev,
      checked: nextChecked,
      persistedIds: nextPersisted,
      storeError: null,
    };
  }

  if (event && event.error) {
    return { ...prev, error: String(event.error) };
  }

  if (event && typeof event.output === "string") {
    const parsed = parseOutputData(event.output);
    const nextVisible = [];
    let nextLastNotePath = prev.lastNotePath;
    let nextLastRefreshLabel = "";
    let nextLastSelectionPoolSize = 0;
    let nextLastPrevNotePathUsed = false;

    if (parsed && !parsed.error && Array.isArray(parsed.pairs)) {
      const notePath = typeof parsed.path === "string" ? parsed.path : "";
      for (const pair of parsed.pairs) {
        if (!pair || typeof pair.q !== "string") continue;
        nextVisible.push(makeItemId(notePath, pair.q));
      }
      if (notePath) nextLastNotePath = notePath;

      if (typeof parsed.selectedAt === "string") {
        const parsedDate = new Date(parsed.selectedAt);
        if (!Number.isNaN(parsedDate.getTime())) {
          nextLastRefreshLabel = parsedDate.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          });
        }
      }

      if (
        Number.isFinite(parsed.selectionPoolSize) &&
        parsed.selectionPoolSize > 0
      ) {
        nextLastSelectionPoolSize = Math.floor(parsed.selectionPoolSize);
      }

      nextLastPrevNotePathUsed = !!parsed.prevNotePathUsed;
    }

    return {
      ...prev,
      output: event.output,
      error: null,
      storeError: null,
      expanded: {},
      checked: {},
      visibleIds: nextVisible,
      syncingStore: false,
      syncedKey: "",
      lastNotePath: nextLastNotePath,
      lastRefreshLabel: nextLastRefreshLabel,
      lastSelectionPoolSize: nextLastSelectionPoolSize,
      lastPrevNotePathUsed: nextLastPrevNotePathUsed,
    };
  }

  return prev;
};

// ===================== UI =====================
export const render = (
  {
    output,
    error,
    storeError,
    expanded,
    checked,
    persistedIds,
    visibleIds,
    syncingStore,
    syncedKey,
    lastRefreshLabel,
    lastSelectionPoolSize,
    lastPrevNotePathUsed,
  },
  dispatch,
) => {
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

  const visibleKey = Array.isArray(visibleIds) ? visibleIds.join("|") : "";
  if (visibleKey && visibleKey !== syncedKey && !syncingStore) {
    dispatch({ type: "SYNC_STORE_START" });
    loadVisibleStoreMembership(visibleIds, dispatch);
  }

  if (!data || data.error) {
    return (
      <div className="card">
        <div className="error">{data?.error || "No data yet."}</div>
        {data?.raw ? <pre className="raw">{data.raw}</pre> : null}
      </div>
    );
  }

  if (!Array.isArray(data.pairs)) {
    return (
      <div className="card">
        <div className="error">Unexpected data shape: "pairs" is missing.</div>
      </div>
    );
  }

  const title = (data.file || "").replace(/\.md$/i, "");
  const obsidianUrl = `obsidian://open?path=${encodeURIComponent(data.path || "")}`;

  const onOpen = (e) => {
    e.stopPropagation();
    run(`open '${escapeForSingleQuotedShell(obsidianUrl)}'`);
  };

  const onTopicChatGPT = (e) => {
    e.stopPropagation();
    const prompt = `Tell me about ${title}. I'm studying for USMLE Step 1, so keep things relevant`;
    const url = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
    run(`open '${escapeForSingleQuotedShell(url)}'`);
  };

  return (
    <div className="card">
      <div className="header">
        <div className="title">{title}</div>
        <div className="headerBtns">
          <button className="openBtn" onClick={onOpen}>
            Open
          </button>
          <button
            className="topicChatgptBtn"
            onClick={onTopicChatGPT}
            title="Ask ChatGPT about topic"
          >
            💬
          </button>
        </div>
      </div>

      {storeError ? <div className="warn">{storeError}</div> : null}

      <div className="list">
        {data.pairs.map((pair, i) => {
          const safePair =
            pair && typeof pair === "object" ? pair : { q: "", a: "" };
          const question = typeof safePair.q === "string" ? safePair.q : "";
          const answer = typeof safePair.a === "string" ? safePair.a : "";
          const id = makeItemId(data.path || "", question);

          const isOpen = !!expanded[i];
          const optimistic = Object.prototype.hasOwnProperty.call(checked, id)
            ? checked[id]
            : null;
          const persisted = !!persistedIds[id];
          const isChecked = optimistic === null ? persisted : !!optimistic;

          const onChatGPT = (e) => {
            e.stopPropagation();
            const prompt = `(${title}) ${question}. Please include detail as would be appropriate to studying for Step 1`;
            const url = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
            run(`open '${escapeForSingleQuotedShell(url)}'`);
          };

          const onToggleCheck = (e) => {
            e.stopPropagation();
            const nextChecked = !isChecked;

            dispatch({ type: "TOGGLE_CHECK_OPTIMISTIC", id, nextChecked });

            mutateTroubleStore(
              {
                action: nextChecked ? "add" : "remove",
                item: {
                  id,
                  topic: title,
                  question,
                  answer,
                  notePath: data.path || "",
                  noteFile: data.file || "",
                },
              },
              dispatch,
            );
          };

          return (
            <div key={id || i} className="item">
              <div
                className="qRow"
                onClick={() => dispatch({ type: "TOGGLE_ANSWER", idx: i })}
              >
                <span
                  className={`cb ${isChecked ? "cbOn" : ""}`}
                  onClick={onToggleCheck}
                >
                  {isChecked ? "✓" : ""}
                </span>

                <span className="qIndex">{i + 1}.</span>
                <span className="qText">{question}</span>
                <button
                  className="chatgptBtn"
                  onClick={onChatGPT}
                  title="Ask ChatGPT"
                >
                  💬
                </button>
                <span className="chev">{isOpen ? "▾" : "▸"}</span>
              </div>

              {isOpen && answer ? (
                <div
                  className="answer markdown"
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdownToHtml(answer),
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ===================== STYLE =====================
export const className = `
  left: 24px;
  top: 24px;
  width: 560px;

  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
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
  }

  .headerBtns {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .openBtn {
    border: 1px solid rgba(255,255,255,0.18);
    background: rgba(255,255,255,0.10);
    color: white;
    border-radius: 10px;
    padding: 6px 10px;
    cursor: pointer;
  }

  .openBtn:hover {
    background: rgba(255,255,255,0.18);
  }

  .topicChatgptBtn {
    border: 1px solid rgba(255,255,255,0.18);
    background: rgba(255,255,255,0.10);
    color: white;
    border-radius: 10px;
    padding: 6px 8px;
    cursor: pointer;
    font-size: 14px;
    margin-right:2px
  }

  .topicChatgptBtn:hover {
    background: rgba(255,255,255,0.18);
  }

  .warn {
    margin: 0 0 10px;
    padding: 8px 10px;
    border-radius: 10px;
    color: rgba(255, 196, 120, 0.98);
    background: rgba(120, 60, 0, 0.28);
    border: 1px solid rgba(255, 196, 120, 0.2);
    font-size: 13px;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .meta {
    margin-top: 10px;
    font-size: 12px;
    opacity: 0.68;
  }

  .item {
    border-radius: 12px;
    background: rgba(255,255,255,0.06);
    overflow: hidden;
  }

  .qRow {
    width: 100%;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .qRow:hover {
    background: rgba(255,255,255,0.08);
  }

  .cb {
    width: 18px;
    height: 18px;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.25);
    background: rgba(255,255,255,0.08);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
  }

  .cbOn {
    background: rgba(255,255,255,0.25);
  }

  .qIndex {
    opacity: 0.7;
    font-weight: 600;
  }

  .qText {
    flex: 1;
    font-size: 14px;
  }

  .chatgptBtn {
    flex-shrink: 0;
    padding: 4px 6px;
    border: 0;
    background: transparent;
    cursor: pointer;
    font-size: 14px;
    opacity: 0.7;
    border-radius: 6px;
  }

  .chatgptBtn:hover {
    opacity: 1;
    background: rgba(255,255,255,0.1);
  }

  .chev {
    opacity: 0.7;
  }

  .answer {
    padding: 12px 12px 12px 46px;
    font-size: 14px;
    opacity: 0.9;
    border-top: 1px solid rgba(255,255,255,0.1);
    line-height: 1.45;
  }

  .answer.markdown p {
    margin: 0 0 8px;
  }

  .answer.markdown p:last-child {
    margin-bottom: 0;
  }

  .answer.markdown h1,
  .answer.markdown h2,
  .answer.markdown h3,
  .answer.markdown h4,
  .answer.markdown h5,
  .answer.markdown h6 {
    margin: 0 0 8px;
    font-weight: 650;
    line-height: 1.3;
  }

  .answer.markdown h1 { font-size: 18px; }
  .answer.markdown h2 { font-size: 17px; }
  .answer.markdown h3 { font-size: 16px; }
  .answer.markdown h4,
  .answer.markdown h5,
  .answer.markdown h6 { font-size: 15px; }

  .answer.markdown ul,
  .answer.markdown ol {
    margin: 0 0 8px 18px;
    padding: 0;
  }

  .answer.markdown li {
    margin: 0 0 4px;
  }

  .answer.markdown li:last-child {
    margin-bottom: 0;
  }

  .answer.markdown code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 0.92em;
    background: rgba(255,255,255,0.14);
    border-radius: 4px;
    padding: 1px 4px;
  }

  .answer.markdown pre {
    margin: 0 0 10px;
    padding: 10px;
    border-radius: 10px;
    background: rgba(0,0,0,0.35);
    border: 1px solid rgba(255,255,255,0.1);
    overflow-x: auto;
  }

  .answer.markdown pre code {
    background: transparent;
    padding: 0;
    border-radius: 0;
    font-size: 0.9em;
    white-space: pre;
  }

  .answer.markdown a {
    color: rgba(150, 210, 255, 0.98);
    text-decoration: underline;
  }

  .error {
    color: rgba(255,120,120,0.95);
  }
`;
