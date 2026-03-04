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

## Usage

- Click `🔄` to pull a new random note topic and generate a new question.
- Click `💬` to ask ChatGPT about the current internal topic context.
- Select an answer choice to reveal:
  - Correct choice highlighted in faint green
  - Incorrect choices highlighted in faint red
  - Explanation shown for each choice
