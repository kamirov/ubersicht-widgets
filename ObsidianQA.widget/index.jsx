import { run } from "uebersicht";

export const refreshFrequency = 1000 * 60 * 30; // 30 minutes
const NODE = "/Users/kamirov/.nvm/versions/node/v22.17.1/bin/node";

const NOTES_DIR =
  "/Users/kamirov/Library/CloudStorage/GoogleDrive-andrei.khramtsov@gmail.com/My Drive/Hole In The Ground/👨‍⚕️ Medicine/Exploring";

// ===================== DATA FETCH =====================
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
    if (qs.length === 0 || as.length === 0) continue;
    if (qs.length !== as.length) continue;

    const pairs = qs.map((q, i) => ({ q, a: as[i] }));

    console.log(JSON.stringify({
      file: path.basename(file),
      path: file,
      pairs
    }));
    return;
  }

  console.log(JSON.stringify({
    error: "No notes found with parseable numbered Questions/Answers of equal length."
  }));
}

main();
EOF
`;

// ===================== STATE =====================
export const initialState = {
  output: "",
  error: null,
  expanded: {},
  checked: {},
};

export const updateState = (event, prev) => {
  if (event && event.type === "TOGGLE_ANSWER") {
    const idx = event.idx;
    const nextExpanded = { ...prev.expanded };
    nextExpanded[idx] = !nextExpanded[idx];
    return { ...prev, expanded: nextExpanded };
  }

  if (event && event.type === "TOGGLE_CHECK") {
    const idx = event.idx;
    const nextChecked = { ...prev.checked };
    nextChecked[idx] = !nextChecked[idx];
    return { ...prev, checked: nextChecked };
  }

  if (event && event.error) {
    return { ...prev, error: String(event.error) };
  }

  if (event && typeof event.output === "string") {
    return {
      ...prev,
      output: event.output,
      error: null,
      expanded: {},
      checked: {},
    };
  }

  return prev;
};

// ===================== UI =====================
export const render = ({ output, error, expanded, checked }, dispatch) => {
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
        <div className="error">{data?.error || "No data yet."}</div>
        {data?.raw ? <pre className="raw">{data.raw}</pre> : null}
      </div>
    );
  }

  const title = (data.file || "").replace(/\.md$/i, "");
  const obsidianUrl = `obsidian://open?path=${encodeURIComponent(data.path || "")}`;

  const onOpen = (e) => {
    e.stopPropagation();
    run(`open "${obsidianUrl}"`);
  };

  return (
    <div className="card">
      <div className="header">
        <div className="title">{title}</div>
        <button className="openBtn" onClick={onOpen}>
          Open
        </button>
      </div>

      <div className="list">
        {data.pairs.map((pair, i) => {
          const isOpen = !!expanded[i];
          const isChecked = !!checked[i];

          return (
            <div key={i} className="item">
              <button
                className="qRow"
                onClick={() => dispatch({ type: "TOGGLE_ANSWER", idx: i })}
              >
                <span
                  className={`cb ${isChecked ? "cbOn" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: "TOGGLE_CHECK", idx: i });
                  }}
                >
                  {isChecked ? "✓" : ""}
                </span>

                <span className="qIndex">{i + 1}.</span>
                <span className="qText">{pair.q}</span>
                <span className="chev">{isOpen ? "▾" : "▸"}</span>
              </button>

              {isOpen && <div className="answer">{pair.a}</div>}
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
