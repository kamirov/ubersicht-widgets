import { run } from "uebersicht";

export const refreshFrequency = false;

const NODE = "/Users/kamirov/.nvm/versions/node/v22.17.1/bin/node";
const NOTES_DIR =
  "/Users/kamirov/Documents/The Destination/👨‍⚕️ Medicine/Exploring";
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

function isEligibleForQaWidget(text) {
  const qSection = extractSection(text, ["Question", "Questions"]);
  const aSection = extractSection(text, ["Answer", "Answers"]);
  return Boolean(qSection && aSection);
}

function isDateToday(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return false;
  const now = new Date();
  return (
    value.getFullYear() === now.getFullYear() &&
    value.getMonth() === now.getMonth() &&
    value.getDate() === now.getDate()
  );
}

function main() {
  if (!fs.existsSync(NOTES_DIR)) {
    console.log(
      JSON.stringify({
        error: "Notes directory not found: " + NOTES_DIR,
        completedTodayCount: 0,
      }),
    );
    return;
  }

  const files = walk(NOTES_DIR);
  if (!files.length) {
    console.log(
      JSON.stringify({
        error: "No .md files found under: " + NOTES_DIR,
        completedTodayCount: 0,
      }),
    );
    return;
  }

  const candidates = [];
  let completedTodayCount = 0;
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }

    if (isEligibleForQaWidget(text)) {
      let stats;
      try {
        stats = fs.statSync(file);
      } catch {
        stats = null;
      }

      if (stats && isDateToday(stats.mtime)) {
        completedTodayCount += 1;
      }
      continue;
    }

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
        completedTodayCount,
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
      completedTodayCount,
      totalMarkdownFiles: files.length,
      refreshedAt: Date.now(),
    }),
  );
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

const executeWidgetRefresh = (dispatch) => {
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

const scheduleNextAutoRefresh = () => {
  clearAutoRefreshTimer();
  if (typeof autoRefreshState.dispatch !== "function") return;

  autoRefreshState.timerId = setTimeout(() => {
    autoRefreshState.timerId = null;
    executeWidgetRefresh(autoRefreshState.dispatch);
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
    executeWidgetRefresh(dispatch);
  }, 0);
};

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
      completedTodayCount: 0,
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
      completedTodayCount: 0,
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
      completedTodayCount: 0,
      totalMarkdownFiles: 0,
    };
  }

  const candidateCount = normalizeWholeNumber(parsed.candidateCount, 0);
  const completedTodayCount = normalizeWholeNumber(parsed.completedTodayCount, 0);
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
      completedTodayCount,
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
      completedTodayCount,
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
      completedTodayCount,
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
    completedTodayCount,
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
  ensureAutoRefresh(dispatch);

  const onRefresh = (e) => {
    e.stopPropagation();
    if (refreshing) return;
    executeWidgetRefresh(dispatch);
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

      <div className="cardBody">
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
          <div className="meta">
            <div className="metaItem metaItemLeft">
              <strong>{parsed.candidateCount}</strong> notes
            </div>
            <div className="metaItem metaItemRight">
              <strong>{parsed.completedTodayCount}</strong> completed today
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const className = `
  top: 24px;
  left: 24px;
  width: 460px;

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
    gap: 10px;
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
    margin-top: 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 12px;
    opacity: 0.72;
  }

  .metaItem {
    min-width: 0;
  }

  .metaItemLeft {
    text-align: left;
  }

  .metaItemRight {
    text-align: right;
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
