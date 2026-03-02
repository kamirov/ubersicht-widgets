# AGENTS.md

## Repository Overview

This repository contains one or more **Übersicht** widgets for macOS.

Übersicht widgets are small desktop components written in JavaScript/JSX that:

- Execute a shell `command`
- Receive stdout as `output`
- Render UI using a React-like environment provided by Übersicht
- Maintain local state via `initialState` and `updateState`
- Style themselves via `className`

This repository is intended to be a collection of independent widgets.
Each widget should be self-contained and not assume the presence of others.

---

## Core Constraints

When modifying or adding widgets in this repository:

1. **No external React imports**
   - Do NOT import `react`.
   - Übersicht provides a React-compatible runtime automatically.

2. **No external dependencies**
   - Avoid `npm install` dependencies.
   - Widgets must work as standalone `.jsx` files.

3. **All parsing logic must live inside the widget**
   - If a widget needs Node.js logic, embed it in the `command` heredoc.
   - Do not rely on separate build steps or bundlers.

4. **Widgets must fail gracefully**
   - If parsing fails, render a visible error.
   - Never assume JSON shape without validating.

---

## Standard Widget Structure

Every widget should follow this structure:

```js
export const refreshFrequency = 1000 * 60 * 30;

export const command = `
# shell command here
`;

export const initialState = { ... };

export const updateState = (event, prev) => { ... };

export const render = (state, dispatch) => { ... };

export const className = `
  /* CSS */
`;
```

---

## Data Flow Model

1. `command` runs in a shell.
2. Its stdout becomes `output`.
3. `output` is passed into `render` and `updateState`.
4. `updateState` must explicitly parse JSON if JSON is expected.
5. `render` must defensively validate parsed data.

Never assume:

- JSON is valid
- Required fields exist
- Arrays are defined

Always guard against:

```js
if (!data || !Array.isArray(data.pairs)) { ... }
```

---

## State Management Rules

- Use plain objects for UI state.
- Avoid React hooks (`useState`, `useEffect`, etc.).
- Use `dispatch({ type: "...", ... })` to trigger updates.
- Keep state minimal and serializable.

---

## Styling Rules

- All styling must live inside `export const className`.
- Use system fonts:
  ```
  -apple-system, BlinkMacSystemFont, system-ui, sans-serif
  ```
- Avoid global CSS assumptions.
- Keep styles scoped via class selectors.

---

## Shell + Node Usage

If a widget embeds Node.js:

- Use a heredoc (`<<'EOF'`) to avoid shell escaping issues.
- Always print JSON via `console.log(JSON.stringify(...))`.
- Never print extra logs (they break parsing).

Example pattern:

```js
export const command = `
node <<'EOF'
console.log(JSON.stringify({ ok: true }));
EOF
`;
```

---

## Error Handling Philosophy

Widgets must:

- Display meaningful errors in the UI
- Never crash the renderer
- Never assume shape of `output`
- Handle empty output safely

If a widget reloads or re-executes commands, ensure:

- It does not unintentionally randomize state
- It does not break JSON parsing
- It does not rely on side effects

---

## Extending This Repository

When adding a new widget:

- Keep it independent.
- Avoid shared globals.
- Do not modify existing widgets unless necessary.
- Ensure it runs correctly inside Übersicht without extra configuration.

If refactoring:

- Preserve public exports.
- Maintain backward compatibility where possible.
- Avoid introducing dependencies or build steps.

---

## Non-Goals

This repository is NOT:

- A React app
- A Next.js project
- A Node server
- A bundled frontend application

It is a collection of lightweight, self-contained Übersicht widgets.

---

## Final Rule

If something breaks:

- Assume JSON parsing failed.
- Assume stdout contains unexpected content.
- Validate everything.
- Keep widgets simple.

Minimalism > Cleverness.
