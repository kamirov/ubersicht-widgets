# ObsidianQA

An Übersicht widget that shows random Q&A flashcard-style content from your Obsidian notes.

## Note Format

Your Markdown files must have two sections with matching numbered lists:

```markdown
## Questions

1. What is X?
2. Why does Y happen?

## Answers

1. X is ...
2. Y happens because ...
```

- Both sections must use numbered lists (`1.`, `2.`, etc.)
- Question and answer counts must match
- The widget picks a random file and displays its Q&A pairs

## Configuration

Edit `index.jsx` and set:

- **`NOTES_DIR`** — path to the folder containing your Obsidian notes (recursively scanned)
- **`NODE`** — path to your Node.js binary (if different from default)

## Usage

- Click a row to expand/collapse the answer
- Click the checkbox to mark items as reviewed
- Click **Open** to open the note in Obsidian
