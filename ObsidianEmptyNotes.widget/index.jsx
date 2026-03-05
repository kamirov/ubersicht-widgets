import { run } from "uebersicht";

export const refreshFrequency = 1000 * 60 * 60; // 1 hour

const NODE = "/Users/kamirov/.nvm/versions/node/v22.17.1/bin/node";
const NOTES_DIR =
  "/Users/kamirov/Library/CloudStorage/GoogleDrive-andrei.khramtsov@gmail.com/My Drive/Hole In The Ground/👨‍⚕️ Medicine/Exploring";
const NO_INELIGIBLE_NOTES_ERROR = "No ineligible notes found.";

export const command = `
"${NODE}" <<'EOF'
const fs = require("fs");
const path = require("path");

const NOTES_DIR = ${JSON.stringify(NOTES_DIR)};
const NO_INELIGIBLE_NOTES_ERROR = ${JSON.stringify(NO_INELIGIBLE_NOTES_ERROR)};

function walk(dir) {
  const results = [];
  let list;
  try {
    list = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of list) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(full));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      results.push(full);
    }
  }

  return results;
}

function extractSection(text, header) {
  const esc = header.replace(/[.*+?^()[\\]{}|\\\\]/g, "\\\\$&");
  const re = new RegExp(
    "^##\\\\s+" + esc + "\\\\s*$([\\\\s\\\\S]*?)(?=^##\\\\s+|\\\\Z)",
    "m",
  );
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

function isEligibleForQaWidget(text) {
  const qSection = extractSection(text, "Questions");
  const aSection = extractSection(text, "Answers");
  if (!qSection || !aSection) return false;

  const qs = splitNumberedList(qSection);
  const as = splitNumberedList(aSection);
  if (qs === null || as === null) return false;
  if (qs.length === 0 || as.length === 0) return false;
  if (qs.length !== as.length) return false;
  return true;
}

function main() {
  if (!fs.existsSync(NOTES_DIR)) {
    console.log(JSON.stringify({ error: "Notes directory not found: " + NOTES_DIR }));
    return;
  }

  const files = walk(NOTES_DIR);
  if (!files.length) {
    console.log(JSON.stringify({ error: "No .md files found under: " + NOTES_DIR }));
    return;
  }

  const candidates = [];
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }

    if (isEligibleForQaWidget(text)) continue;

    const base = path.basename(file);
    candidates.push({
      topic: base.replace(/\\.md$/i, ""),
      file: base,
      path: file,
    });
  }

  if (!candidates.length) {
    console.log(
      JSON.stringify({
        error: NO_INELIGIBLE_NOTES_ERROR,
        candidateCount: 0,
        totalMarkdownFiles: files.length,
        refreshedAt: Date.now(),
      }),
    );
    return;
  }

  const selected = candidates[Math.floor(Math.random() * candidates.length)];

  console.log(
    JSON.stringify({
      selected,
      candidateCount: candidates.length,
      totalMarkdownFiles: files.length,
      refreshedAt: Date.now(),
    }),
  );
}

main();
EOF
`;

const escapeForSingleQuotedShell = (value) =>
  String(value).replace(/'/g, "'\\''");

const normalizeWholeNumber = (value, fallback = 0) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
};

const parseCommandOutput = (output) => {
  const raw = typeof output === "string" ? output : "";
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: "No data yet.",
      isNoCandidates: false,
      raw,
      candidateCount: 0,
      totalMarkdownFiles: 0,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      ok: false,
      error: "Could not parse JSON output.",
      isNoCandidates: false,
      raw,
      candidateCount: 0,
      totalMarkdownFiles: 0,
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      error: "Unexpected JSON output shape.",
      isNoCandidates: false,
      raw,
      candidateCount: 0,
      totalMarkdownFiles: 0,
    };
  }

  const candidateCount = normalizeWholeNumber(parsed.candidateCount, 0);
  const totalMarkdownFiles = normalizeWholeNumber(parsed.totalMarkdownFiles, 0);
  const refreshedAt =
    parsed.refreshedAt === null || parsed.refreshedAt === undefined
      ? null
      : Number(parsed.refreshedAt);

  if (typeof parsed.error === "string" && parsed.error.trim()) {
    const errorText = parsed.error.trim();
    return {
      ok: false,
      error: errorText,
      isNoCandidates: errorText === NO_INELIGIBLE_NOTES_ERROR,
      raw: "",
      candidateCount,
      totalMarkdownFiles,
      refreshedAt: Number.isFinite(refreshedAt) ? refreshedAt : null,
    };
  }

  const selected =
    parsed.selected && typeof parsed.selected === "object"
      ? parsed.selected
      : null;
  if (!selected || Array.isArray(selected)) {
    return {
      ok: false,
      error: 'Unexpected data shape: "selected" is missing.',
      isNoCandidates: false,
      raw,
      candidateCount,
      totalMarkdownFiles,
    };
  }

  const path = typeof selected.path === "string" ? selected.path.trim() : "";
  const file = typeof selected.file === "string" ? selected.file.trim() : "";
  let topic = typeof selected.topic === "string" ? selected.topic.trim() : "";

  if (!path) {
    return {
      ok: false,
      error: 'Unexpected data shape: selected "path" is missing.',
      isNoCandidates: false,
      raw,
      candidateCount,
      totalMarkdownFiles,
    };
  }

  if (!topic) {
    topic = file.replace(/\.md$/i, "") || "Untitled note";
  }

  return {
    ok: true,
    selected: { topic, file, path },
    candidateCount: candidateCount > 0 ? candidateCount : 1,
    totalMarkdownFiles,
    refreshedAt: Number.isFinite(refreshedAt) ? refreshedAt : null,
    error: null,
    raw: "",
  };
};

export const initialState = {
  output: "",
  error: null,
  refreshing: false,
};

export const updateState = (event, prev) => {
  if (event && event.type === "REFRESH_CLICKED") {
    return {
      ...prev,
      refreshing: true,
      error: null,
    };
  }

  if (event && event.type === "REFRESH_DONE") {
    if (typeof event.output !== "string") {
      return {
        ...prev,
        refreshing: false,
        error: "Refresh completed without output.",
      };
    }
    return {
      ...prev,
      output: event.output,
      refreshing: false,
      error: null,
    };
  }

  if (event && event.type === "REFRESH_FAILED") {
    return {
      ...prev,
      refreshing: false,
      error: String(event.error || "Refresh failed."),
    };
  }

  if (event && event.error) {
    return {
      ...prev,
      refreshing: false,
      error: String(event.error),
    };
  }

  if (event && typeof event.output === "string") {
    return {
      ...prev,
      output: event.output,
      error: null,
      refreshing: false,
    };
  }

  return prev;
};

export const render = ({ output, error, refreshing }, dispatch) => {
  const onRefresh = (e) => {
    e.stopPropagation();
    if (refreshing) return;

    dispatch({ type: "REFRESH_CLICKED" });
    run(command)
      .then((nextOutput) => {
        dispatch({ type: "REFRESH_DONE", output: String(nextOutput || "") });
      })
      .catch((err) => {
        dispatch({
          type: "REFRESH_FAILED",
          error: `Refresh failed: ${String(err && err.message ? err.message : err)}`,
        });
      });
  };

  const parsed = parseCommandOutput(output);
  const selected = parsed.ok ? parsed.selected : null;
  const title =
    selected && selected.topic ? selected.topic : "Empty Note Nudge";
  const notePath = selected && selected.path ? selected.path : "";

  const onOpen = (e) => {
    e.stopPropagation();
    if (!notePath) return;

    const obsidianUrl = `obsidian://open?path=${encodeURIComponent(notePath)}`;
    run(`open '${escapeForSingleQuotedShell(obsidianUrl)}'`);
  };

  return (
    <div className="card">
      <div className="header">
        <div className="title" title={title}>
          {title}
        </div>
        <div className="headerBtns">
          <button className="openBtn" onClick={onOpen} disabled={!notePath}>
            Open
          </button>
          <button
            className="refreshBtn"
            onClick={onRefresh}
            disabled={refreshing}
            title="Refresh"
          >
            {refreshing ? "..." : "🔄"}
          </button>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      {!error && !output.trim() ? (
        <div className="loading">Loading note scan...</div>
      ) : null}

      {!error && output.trim() && !parsed.ok ? (
        parsed.isNoCandidates ? (
          <div>
            <div className="empty">No ineligible notes found.</div>
            <div className="meta">
              {parsed.totalMarkdownFiles} markdown notes scanned.
            </div>
          </div>
        ) : (
          <div>
            <div className="error">
              {parsed.error || "Could not load notes."}
            </div>
            {parsed.raw ? <pre className="raw">{parsed.raw}</pre> : null}
          </div>
        )
      ) : null}

      {!error && parsed.ok ? (
        <div className="meta">{parsed.candidateCount} notes remain</div>
      ) : null}
    </div>
  );
};

export const className = `
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
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
    gap: 10px;
    margin-bottom: 10px;
  }

  .title {
    font-size: 18px;
    font-weight: 650;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    flex: 1;
  }

  .headerBtns {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .openBtn,
  .refreshBtn {
    border: 1px solid rgba(255,255,255,0.18);
    background: rgba(255,255,255,0.10);
    color: white;
    border-radius: 10px;
    padding: 6px 10px;
    cursor: pointer;
    min-width: 40px;
  }

  .openBtn:hover,
  .refreshBtn:hover,
  .openBtn:focus-visible,
  .refreshBtn:focus-visible {
    background: rgba(255,255,255,0.18);
  }

  .openBtn:disabled,
  .refreshBtn:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .nudge {
    font-size: 14px;
    line-height: 1.4;
    opacity: 0.9;
  }

  .meta {
  text-align: center;
    margin-top: 8px;
    font-size: 12px;
    opacity: 0.72;
  }

  .loading {
    font-size: 14px;
    opacity: 0.78;
  }

  .empty {
    font-size: 14px;
    opacity: 0.86;
  }

  .error {
    color: rgba(255,120,120,0.95);
    font-size: 14px;
  }

  .raw {
    margin-top: 8px;
    padding: 8px;
    border-radius: 8px;
    background: rgba(0,0,0,0.3);
    border: 1px solid rgba(255,255,255,0.1);
    font-size: 12px;
    line-height: 1.35;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 150px;
    overflow: auto;
  }
`;
