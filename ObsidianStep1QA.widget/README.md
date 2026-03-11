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
  "version": 2,
  "questions": {
    "targeted": null,
    "easy": null,
    "medium": null,
    "hard": null
  }
}
```

Each non-null mode stores the full question payload, topic context, `savedAt`, and explicit `difficulty` (`easy`, `medium`, or `hard`).

Behavior:

- If `targeted`, `easy`, `medium`, or `hard` already has an unanswered cached question, that mode is not regenerated.
- New generation happens only for mode(s) missing from the cache.
- Selecting an answer marks that mode as answered and removes it from cache.
- This applies to both automatic refreshes and manual `🔄` refresh.
- If cache JSON is malformed, the widget shows a warning and continues with empty-cache behavior.
- Legacy version `1` caches are still readable. Old targeted questions are invalidated because targeted now uses medium difficulty instead of hard.

## Wrong Topic Counts

The widget tracks incorrect answers by topic in:

`/Users/kamirov/Projects/ubersicht-widgets/ObsidianStep1QA.widget/wrong-topic-counts.json`

Schema:

```json
{
  "Renal physiology": 3,
  "Pharmacology - autonomics": 1,
  "Unknown topic": 2
}
```

Behavior:

- Selecting an incorrect answer increments that topic count by `1` (all modes).
- Selecting a correct answer in `easy`/`medium`/`hard` does not update this file.
- Selecting a correct answer in `targeted` decrements that topic by `1`.
- If a `targeted` decrement reaches `0`, that topic key is deleted.
- Missing or blank topics are counted under `"Unknown topic"`.
- If JSON is malformed, the next mutation self-heals the file by resetting to a valid map and applying the update.

## Targeted Mode

The widget includes four difficulty buttons:

- `🎯` targeted
- `🥚` easy
- `🐣` medium
- `🐓` hard

- Targeted mode chooses a topic from `wrong-topic-counts.json`.
- Topic selection is weighted by count value (`higher count => higher chance`).
- Targeted questions use medium-style difficulty behavior.
- If there are no topics with count `> 0`, targeted mode does not generate and shows a warning.
- Unanswered targeted questions are cached and preserved exactly like other modes.

## Usage

- Click `🔄` to pull fresh note contexts and regenerate only missing mode(s).
- Unanswered cached mode(s) are preserved on both automatic and manual refresh.
- Click `💬` to ask ChatGPT about the current internal topic context.
- Select an answer choice to reveal:
  - Correct choice highlighted in faint green
  - Incorrect choices highlighted in faint red
  - Explanation shown for each choice
