import { run } from "uebersicht";

export const refreshFrequency = 1000 * 60 * 30; // 30 minutes
const NODE = "/Users/kamirov/.nvm/versions/node/v22.17.1/bin/node";
const TROUBLE_STORE =
  "/Users/kamirov/Projects/ubersicht-widgets/ObsidianQA.widget/trouble-questions.json";

export const command = `
"${NODE}" <<'EOF'
const fs = require("fs");

const STORE = ${JSON.stringify(TROUBLE_STORE)};

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
  if (!fs.existsSync(STORE)) {
    console.log(JSON.stringify({ items: [] }));
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
  const items = shuffle(store.items.slice());

  console.log(JSON.stringify({ items }));
}

main();
EOF
`;

const escapeForSingleQuotedShell = (value) =>
  String(value).replace(/'/g, "'\\''");

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
        storeError: String(event.error || "Could not remove item from trouble store."),
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
    return {
      ...prev,
      output: event.output,
      error: null,
      storeError: null,
      expanded: {},
      removed: {},
    };
  }

  return prev;
};

export const render = ({ output, error, storeError, expanded, removed }, dispatch) => {
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
        <div className="title">Trouble Questions</div>
        <div className="error">{data?.error || "No data yet."}</div>
        {data?.raw ? <pre className="raw">{data.raw}</pre> : null}
      </div>
    );
  }

  const items = Array.isArray(data.items) ? data.items : [];
  const visibleItems = items.filter((item) => item && item.id && !removed[item.id]);

  return (
    <div className="card">
      <div className="header">
        <div className="title">Trouble Questions</div>
      </div>

      {storeError ? <div className="warn">{storeError}</div> : null}

      {visibleItems.length === 0 ? (
        <div className="empty">No trouble questions yet.</div>
      ) : (
        <div className="list">
          {visibleItems.map((item, i) => {
            const topic = typeof item.topic === "string" ? item.topic : "";
            const question = typeof item.question === "string" ? item.question : "";
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
                <div className="qRow" onClick={() => dispatch({ type: "TOGGLE_ANSWER", idx: rowKey })}>
                  <span className="cb" onClick={onRemove}>
                    ✓
                  </span>
                  <div className="qBlock">
                    <div className="topic">{topic || "Unknown topic"}</div>
                    <div className="qText">{question || "(No question text)"}</div>
                  </div>
                  <button className="chatgptBtn" onClick={onChatGPT} title="Ask ChatGPT">
                    💬
                  </button>
                  <span className="chev">{isOpen ? "▾" : "▸"}</span>
                </div>

                {isOpen && answer ? <div className="answer">{answer}</div> : null}
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
  /* Adjust this value if the first widget's rendered height changes. */
  top: 420px;
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
    white-space: pre-wrap;
  }

  .error {
    color: rgba(255,120,120,0.95);
  }
`;
