# Feedback Recap

A Claude Code skill that reads the comments **you** left across a set of Google Docs and turns them into a single, themed recap — the recurring notes you keep giving, with real examples and the fix you usually suggest.

## The problem

If you review a lot of writing, your most valuable feedback is scattered across dozens of docs, one comment at a time. The people you review are eager to fix things — but the *pattern* in your feedback (the same five notes you give over and over) never gets surfaced. That pattern is the actually useful part.

## What it does

You hand it a few Google Doc links. It:

1. Pulls every comment **you** wrote — including replies buried inside other people's threads.
2. Separates real editorial feedback from one-off logistics (`"image here"`, `"link the video?"`).
3. Clusters the feedback into recurring themes, each with quoted examples and the fix you tend to recommend.
4. Flags anything still **open** so nothing unresolved slips through.
5. Writes the whole thing into a fresh, formatted **Google Doc**.

Nothing is sent to anyone. The recap is yours — you decide what to share.

## What you get

A Google Doc with:

- **Recurring themes** — e.g. *"Push for concrete numbers"* (×4), with real quotes
- **Still open** — unresolved comments that may need follow-up
- **Appendix** — the one-off/logistical notes, grouped by doc

## How it works

- The comment data comes from the **Google Drive comments API** (via Claude's Google connector), which returns each comment with its author, text, thread, and open/resolved status.
- A small Node script (`scripts/extract-comments.mjs`) does the deterministic work: parse the exports, filter to your name, flag signals.
- Claude does the judgment: what's substantive vs logistical, and how the notes cluster into themes.

## Requirements

- Claude Code with a **Google Drive connection** (needs `read_file_content` with comments, `get_file_metadata`, and `create_file`)
- Node.js

## Usage

1. Copy `config.example.json` → `config.json` and set `reviewerName` to the name your comments show up under in Google Docs.
2. Run the skill and paste your doc links when asked:

   ```
   /feedback-recap
   ```

3. Open the Google Doc it gives you back.

## Privacy

It only reads the docs you explicitly hand it, and the recap is built from your own words. Your `config.json` (with your name) is git-ignored so it never lands in the public repo.

## Roadmap

- [ ] A public web-app version (paste links in a browser, no Claude Code needed)

---

Built by [David Bustos](https://david.sendgoodemails.com) · part of a "build small tools to kill everyday friction" habit.
