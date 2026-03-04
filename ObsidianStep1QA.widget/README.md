# ObsidianStep1QA

An Übersicht widget that generates one USMLE Step 1-style multiple choice question from your Obsidian notes.

## API Key Setup (Manual)

Set your OpenAI key in:

`/Users/kamirov/Projects/ubersicht-widgets/openai-settings.json`

Use this exact JSON shape:

```json
{
  "version": 1,
  "openaiApiKey": "sk-..."
}
```

Notes:

- The file is git-ignored.
- The widget reads this file automatically.

## Pending Question Cache

The widget persists unanswered questions per difficulty mode in:

`/Users/kamirov/Projects/ubersicht-widgets/ObsidianStep1QA.widget/pending-questions.json`

Schema:

```json
{
  "version": 1,
  "questions": {
    "easy": null,
    "hard": null
  }
}
```

Each non-null mode stores the full question payload, topic context, and `savedAt`.

Behavior:

- If `easy` or `hard` already has an unanswered cached question, that mode is not regenerated.
- New generation happens only for mode(s) missing from the cache.
- Selecting an answer marks that mode as answered and removes it from cache.
- This applies to both automatic refreshes and manual `🔄` refresh.
- If cache JSON is malformed, the widget shows a warning and continues with empty-cache behavior.

## Usage

- Click `🔄` to pull fresh note contexts and regenerate only missing mode(s).
- Unanswered cached mode(s) are preserved on both automatic and manual refresh.
- Click `💬` to ask ChatGPT about the current internal topic context.
- Select an answer choice to reveal:
  - Correct choice highlighted in faint green
  - Incorrect choices highlighted in faint red
  - Explanation shown for each choice
