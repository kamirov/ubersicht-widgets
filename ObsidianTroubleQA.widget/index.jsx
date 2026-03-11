import { run } from "uebersicht";

export const refreshFrequency = false;
const NODE = "/Users/kamirov/.nvm/versions/node/v22.17.1/bin/node";
const TROUBLE_STORE =
  "/Users/kamirov/Projects/ubersicht-widgets/ObsidianQA.widget/trouble-questions.json";

export const command = `
"${NODE}" <<'EOF'
const fs = require("fs");

const STORE = ${JSON.stringify(TROUBLE_STORE)};
const MAX_VISIBLE = 4;

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
    if (typeof item.id !== "string" || !item.id || seen.has(item.id)) continue;
    seen.add(item.id);

    out.push({
      id: item.id,
      topic: typeof item.topic === "string" ? item.topic : "",
      question: typeof item.question === "string" ? item.question : "",
      answer: typeof item.answer === "string" ? item.answer : "",
      notePath: typeof item.notePath === "string" ? item.notePath : "",
      noteFile: typeof item.noteFile === "string" ? item.noteFile : "",
      createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
      timesMarked: Number.isFinite(item.timesMarked) && item.timesMarked > 0 ? Math.floor(item.timesMarked) : 1,
    });
  }

  return { version: 1, items: out };
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function main() {
  const refreshToken = Date.now();

  if (!fs.existsSync(STORE)) {
    console.log(JSON.stringify({ items: [], candidateItems: [], refreshToken }));
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

  const store = sanitizeStore(parsed);
  const candidateItems = shuffle(store.items.slice());
  const items =
    candidateItems.length <= MAX_VISIBLE
      ? candidateItems
      : candidateItems.slice(0, MAX_VISIBLE);

  console.log(JSON.stringify({ items, candidateItems, refreshToken }));
}

main();
EOF
`;

const AUTO_REFRESH_TARGET_MINUTE = 59;
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

const getMillisecondsUntilNextAutoRefresh = (now = new Date()) => {
  const next = new Date(now.getTime());
  next.setSeconds(0, 0);
  next.setMinutes(AUTO_REFRESH_TARGET_MINUTE);
  if (next.getTime() <= now.getTime()) {
    next.setHours(next.getHours() + 1);
  }
  return Math.max(0, next.getTime() - now.getTime());
};

const executeCommandRefresh = (dispatch) => {
  run(command)
    .then((refreshedOutput) => {
      dispatch({ output: String(refreshedOutput || "") });
    })
    .catch((err) => {
      dispatch({
        error: `Refresh failed: ${String(err && err.message ? err.message : err)}`,
      });
    });
};

const scheduleNextAutoRefresh = () => {
  clearAutoRefreshTimer();
  if (typeof autoRefreshState.dispatch !== "function") return;

  autoRefreshState.timerId = setTimeout(() => {
    autoRefreshState.timerId = null;
    executeCommandRefresh(autoRefreshState.dispatch);
    scheduleNextAutoRefresh();
  }, getMillisecondsUntilNextAutoRefresh());
};

const ensureAutoRefresh = (dispatch) => {
  if (autoRefreshState.dispatch !== dispatch) {
    autoRefreshState.dispatch = dispatch;
    scheduleNextAutoRefresh();
  }

  if (autoRefreshState.started) return;

  autoRefreshState.started = true;
  setTimeout(() => {
    executeCommandRefresh(dispatch);
  }, 0);
};

const escapeForSingleQuotedShell = (value) =>
  String(value).replace(/'/g, "'\\''");

const MAX_VISIBLE = 4;

const pickVisibleItems = (items, lastShownIds) => {
  if (!Array.isArray(items)) return [];
  if (items.length <= MAX_VISIBLE) return items;

  const prevSet = new Set(
    Array.isArray(lastShownIds)
      ? lastShownIds.filter((id) => typeof id === "string" && id)
      : [],
  );

  const neverShown = [];
  const previouslyShown = [];
  for (const item of items) {
    const id = item && typeof item.id === "string" ? item.id : "";
    if (!id) continue;
    if (prevSet.has(id)) {
      previouslyShown.push(item);
    } else {
      neverShown.push(item);
    }
  }

  const chosen = neverShown.slice(0, MAX_VISIBLE);
  if (chosen.length < MAX_VISIBLE) {
    chosen.push(...previouslyShown.slice(0, MAX_VISIBLE - chosen.length));
  }

  return chosen;
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
      blocks.push(`<p>${renderInlineMarkdown(text).replace(/\n/g, "<br />")}</p>`);
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
      blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
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

const removeTroubleItem = (id, dispatch) => {
  const nodeScript = `
const fs = require("fs");
const path = require("path");

const STORE = '${escapeForSingleQuotedShell(TROUBLE_STORE)}';
const TMP = STORE + ".tmp";
const TARGET_ID = ${JSON.stringify(id)};

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
    if (typeof item.id !== "string" || !item.id || seen.has(item.id)) continue;
    seen.add(item.id);

    out.push(item);
  }

  return { version: 1, items: out };
}

function loadStore() {
  if (!fs.existsSync(STORE)) return defaultStore();
  try {
    const raw = fs.readFileSync(STORE, "utf8");
    return sanitizeStore(JSON.parse(raw));
  } catch {
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
  const store = loadStore();
  const prevCount = store.items.length;
  store.items = store.items.filter((item) => item.id !== TARGET_ID);
  writeStore(store);

  console.log(JSON.stringify({
    ok: true,
    id: TARGET_ID,
    removed: store.items.length !== prevCount,
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
        if (data && data.error) {
          dispatch({
            type: "REMOVE_RESULT",
            ok: false,
            id,
            error: String(data.error),
          });
          return;
        }

        dispatch({
          type: "REMOVE_RESULT",
          ok: true,
          id,
          error: null,
        });
      } catch {
        dispatch({
          type: "REMOVE_RESULT",
          ok: false,
          id,
          error: "Could not parse removal response.",
        });
      }
    })
    .catch((err) => {
      dispatch({
        type: "REMOVE_RESULT",
        ok: false,
        id,
        error: `Removal failed: ${String(err && err.message ? err.message : err)}`,
      });
    });
};

export const initialState = {
  output: "",
  error: null,
  storeError: null,
  expanded: {},
  removed: {},
  lastShownIds: [],
  lastRefreshToken: null,
};

export const updateState = (event, prev) => {
  if (event && event.type === "TOGGLE_ANSWER") {
    const idx = event.idx;
    const nextExpanded = { ...prev.expanded };
    nextExpanded[idx] = !nextExpanded[idx];
    return { ...prev, expanded: nextExpanded };
  }

  if (event && event.type === "REMOVE_OPTIMISTIC") {
    const id = String(event.id || "");
    if (!id) return prev;
    return {
      ...prev,
      removed: { ...prev.removed, [id]: true },
      storeError: null,
    };
  }

  if (event && event.type === "REMOVE_RESULT") {
    const id = String(event.id || "");
    if (!id) return prev;

    if (!event.ok) {
      const rollback = { ...prev.removed, [id]: false };
      return {
        ...prev,
        removed: rollback,
        storeError: String(
          event.error || "Could not remove item from trouble store.",
        ),
      };
    }

    return {
      ...prev,
      removed: { ...prev.removed, [id]: true },
      storeError: null,
    };
  }

  if (event && event.error) {
    return { ...prev, error: String(event.error) };
  }

  if (event && typeof event.output === "string") {
    let nextOutput = event.output;
    let nextLastShownIds = Array.isArray(prev.lastShownIds)
      ? prev.lastShownIds
      : [];
    let nextRefreshToken = prev.lastRefreshToken ?? null;

    try {
      const parsed = JSON.parse((event.output || "").trim());
      if (parsed && !parsed.error && typeof parsed === "object") {
        const token =
          parsed.refreshToken === null || parsed.refreshToken === undefined
            ? null
            : String(parsed.refreshToken);
        const canRotate = token !== null && token !== prev.lastRefreshToken;

        const candidateItems = Array.isArray(parsed.candidateItems)
          ? parsed.candidateItems
          : Array.isArray(parsed.items)
            ? parsed.items
            : [];

        const items = canRotate
          ? pickVisibleItems(candidateItems, prev.lastShownIds)
          : Array.isArray(parsed.items)
            ? parsed.items
            : [];

        nextLastShownIds = items
          .map((item) => (item && typeof item.id === "string" ? item.id : ""))
          .filter(Boolean);
        nextRefreshToken = token;

        nextOutput = JSON.stringify({
          ...parsed,
          items,
          refreshToken: parsed.refreshToken ?? null,
        });
      }
    } catch {
      // Preserve raw output; render handles malformed JSON safely.
    }

    return {
      ...prev,
      output: nextOutput,
      error: null,
      storeError: null,
      expanded: {},
      removed: {},
      lastShownIds: nextLastShownIds,
      lastRefreshToken: nextRefreshToken,
    };
  }

  return prev;
};

export const render = (
  { output, error, storeError, expanded, removed },
  dispatch,
) => {
  ensureAutoRefresh(dispatch);

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
        <div className="title">Review Questions</div>
        <div className="error">{data?.error || "No data yet."}</div>
        {data?.raw ? <pre className="raw">{data.raw}</pre> : null}
      </div>
    );
  }

  const items = Array.isArray(data.items) ? data.items : [];
  const visibleItems = items.filter(
    (item) => item && item.id && !removed[item.id],
  );

  return (
    <div className="card">
      <div className="header">
        <div className="title">Review Questions</div>
      </div>

      {storeError ? <div className="warn">{storeError}</div> : null}

      {visibleItems.length === 0 ? (
        <div className="empty">No review questions yet.</div>
      ) : (
        <div className="list">
          {visibleItems.map((item, i) => {
            const topic = typeof item.topic === "string" ? item.topic : "";
            const question =
              typeof item.question === "string" ? item.question : "";
            const answer = typeof item.answer === "string" ? item.answer : "";
            const rowKey = item.id || String(i);
            const isOpen = !!expanded[rowKey];

            const onChatGPT = (e) => {
              e.stopPropagation();
              const prompt = `(${topic}) ${question}. Please include detail as would be appropriate to studying for Step 1`;
              const url = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
              run(`open '${escapeForSingleQuotedShell(url)}'`);
            };

            const onRemove = (e) => {
              e.stopPropagation();
              dispatch({ type: "REMOVE_OPTIMISTIC", id: rowKey });
              removeTroubleItem(rowKey, dispatch);
            };

            return (
              <div key={rowKey} className="item">
                <div
                  className="qRow"
                  onClick={() =>
                    dispatch({ type: "TOGGLE_ANSWER", idx: rowKey })
                  }
                >
                  <span className="cb" onClick={onRemove}>
                    ✓
                  </span>
                  <div className="qBlock">
                    <div className="topic">{topic || "Unknown topic"}</div>
                    <div className="qText">
                      {question || "(No question text)"}
                    </div>
                  </div>
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
      )}
    </div>
  );
};

export const className = `
  left: 24px;
  /* This widget is intentionally above the main QA widget. */
  bottom: 24px;
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

  .warn {
    margin: 0 0 10px;
    padding: 8px 10px;
    border-radius: 10px;
    color: rgba(255, 196, 120, 0.98);
    background: rgba(120, 60, 0, 0.28);
    border: 1px solid rgba(255, 196, 120, 0.2);
    font-size: 13px;
  }

  .empty {
    font-size: 14px;
    opacity: 0.8;
    padding: 6px 2px;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
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
    background: rgba(255,255,255,0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    flex-shrink: 0;
  }

  .qBlock {
    flex: 1;
    min-width: 0;
  }

  .topic {
    font-size: 12px;
    opacity: 0.7;
    margin-bottom: 3px;
  }

  .qText {
    font-size: 14px;
    line-height: 1.35;
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
