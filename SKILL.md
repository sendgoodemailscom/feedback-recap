---
name: feedback-recap
description: Collect the comments YOU left across a set of Google Docs, cluster them into recurring themes (with real examples and the fix you usually suggest), and write it all into a fresh Google Doc. Use when someone wants to recap the feedback they gave reviewing docs — spot the patterns in their own notes, or hand writers a summary of the most common fixes. On-demand: the user supplies the doc links.
---

# feedback-recap

Turns scattered Google Doc comments into a pattern. You give it a list of doc links →
it pulls out **your** comments (including replies buried in other people's threads) →
separates real editorial feedback from one-off logistics → clusters the feedback into
recurring themes with quoted examples → writes a clean Google Doc.

The heavy lifting is split cleanly:
- **A helper script** does the deterministic part — parse the exports, filter to the reviewer, flag signals.
- **You (Claude)** do the judgment part — classify substantive vs logistical, cluster into themes, write the recap.

## Requirements

- **Google Drive connector** with these tools available: `read_file_content`
  (must support `includeComments: true`), `get_file_metadata`, and `create_file`.
  These are the Google Drive MCP tools; the exact tool prefix varies by environment.
  If they're unavailable, stop and tell the user the Google connection is needed.
- **Node.js** (for the extraction script).

## Folder layout

```
feedback-recap/
├── SKILL.md
├── README.md
├── config.json            # local, git-ignored: { reviewerName, aliases }
├── config.example.json    # template for the public repo
└── scripts/
    └── extract-comments.mjs
```

Use the session scratchpad directory for all temp files (raw exports, manifest,
`reviewer-comments.json`). Never write temp files into the repo folder.

---

## Step 0 — Who is the reviewer?

The tool needs the reviewer's name exactly as it appears on their Google comments
(comments carry `authorName`, e.g. "David Bustos").

1. Read `config.json` (next to this file). If it has `reviewerName`, use it (plus any `aliases`).
2. If there's no config, **ask the user**: "What name do your comments show up under in
   Google Docs?" — then offer to save it to `config.json` for next time.

Never hard-code a specific person here — this skill is meant to be reusable and public.

## Step 1 — Collect the doc links

Ask the user for the Google Doc links (they can paste several). Accept full URLs or bare IDs.
Extract the file ID from each with: `/\/d\/([A-Za-z0-9_-]+)/` (a bare ID is `[A-Za-z0-9_-]{20,}`).

If the user gives zero links, ask for at least one.

## Step 2 — Pull each doc's comments

For **each** doc:

1. Call `get_file_metadata` (fileId) → grab the document **title**.
2. Call `read_file_content` with `{ fileId, includeComments: true }`.
3. Save the **raw JSON** output to a temp file in the scratchpad, e.g. `doc-1.json`.
   - Large docs: the harness may already persist the output to a file and hand you a path —
     use that path directly instead of re-saving.
   - The saved content must be the pure JSON object (`{"commentThreads":[...],"fileContent":"..."}`).

Then build a **manifest** file `manifest.json` in the scratchpad:

```json
[
  { "title": "Doc title", "url": "https://docs.google.com/document/d/<id>/edit", "path": "/abs/path/doc-1.json" },
  { "title": "...",       "url": "...",                                          "path": "/abs/path/doc-2.json" }
]
```

## Step 3 — Extract the reviewer's comments

Run the script (from the skill folder):

```bash
node scripts/extract-comments.mjs --manifest <scratchpad>/manifest.json --reviewer "<Reviewer Name>" --out <scratchpad>/reviewer-comments.json
```

(Omit `--reviewer` if it's set in `config.json`.) Read back `reviewer-comments.json`. Each
comment has: `doc`, `url`, `status` (OPEN/RESOLVED), `role` (head/reply), `text`,
`respondingTo` (what they replied to, or null), and `signals` (`urlOnly`, `veryShort`).

If `totalReviewerComments` is 0, tell the user — likely the reviewer name doesn't match the
`authorName` on the comments. Offer to try a different name/alias.

## Step 4 — Classify: substantive vs logistical

Go through the extracted comments and split them into two buckets. Use judgment; the
`signals` are hints, not rules.

- **Substantive editorial feedback** — a note about the writing itself: clarity, structure,
  tone, evidence, framing, formatting rules, brand/accuracy. These get clustered into themes.
  _e.g._ "do we have a number? feels a bit empty…", "bold whole phrases, not fragments".
- **Logistical / one-off** — procedural or throwaway: "image here", "link the video or the
  landing?", "ok", "agree", pure URLs, quick approvals. These go in an appendix, not the themes.

When unsure, lean toward keeping it as substantive — better to over-include than lose a real note.

## Step 5 — Cluster the substantive feedback into themes

Group the substantive comments into **recurring themes** — the patterns in how this person
reviews. Aim for roughly 3–7 themes. For each theme capture:

- **A short name** — the pattern in a few words (e.g. "Push for concrete numbers").
- **How often** — count of comments that fit.
- **The pattern** — one sentence describing the recurring note.
- **2–4 real examples** — quoted verbatim, each tagged with its doc and OPEN/RESOLVED.
  Keep examples in their original language (don't translate the quotes).
- **The fix** — one or two sentences: what this reviewer typically recommends doing about it.

A theme needs at least 2 examples. Genuinely singular notes go under a short "Other notes" heading.

Write the recap prose in **English**, even when the quoted examples are in another language.

## Step 6 — Compose the recap document (HTML)

Build a single HTML document (it converts cleanly to a Google Doc). Structure:

1. **Title** — `Feedback Recap — {Reviewer} — {today's date}`
2. **Summary line** — docs scanned, total comments, split of substantive vs logistical,
   and OPEN vs RESOLVED counts.
3. **How to read this** — one line: these are patterns in your own feedback, with examples.
4. **Recurring themes** — one section per theme (name + count, pattern, examples, the fix).
5. **Still open — may need follow-up** — bullet list of OPEN comments (quote + doc), so
   nothing unresolved slips through.
6. **Other notes** — genuinely singular substantive comments.
7. **Appendix — one-off & logistical** — brief bullets, grouped by doc.

Use real headings (`<h1>`/`<h2>`/`<h3>`). Render **each example as its own paragraph**,
not as `<blockquote>` — Drive merges adjacent blockquotes, so consecutive examples run
together. Use this shape per example:

```html
<p>"the quoted comment" — <em>Doc title · open/resolved</em></p>
```

Keep it clean — this is a document, not a webpage.

## Step 7 — Create the Google Doc

Call `create_file`:

```
title:           "Feedback Recap — <date>"
textContent:     <the HTML from Step 6>
contentMimeType: "text/html"
```

Leave conversion ON (do **not** set `disableConversionToGoogleType`) so Drive turns the HTML
into a native Google Doc with real formatting. Optionally pass `parentId` if the user names a
target folder; otherwise it lands in My Drive.

If HTML conversion ever misbehaves, fall back to `contentMimeType: "text/markdown"` with a
Markdown version of the same content.

## Step 8 — Report back

In chat, give the user:
- The **link** to the new Google Doc (from the `create_file` result).
- A 3–5 line summary: how many of their comments were found, the theme names with counts,
  and how many items are still open.

Keep it short — the Doc is the deliverable.

---

## Notes

- **Privacy** — only read the docs the user explicitly provides. The recap is built from the
  user's *own* words. Don't pull in other people's comments except as brief context for a reply.
- **Dedupe** — if the same note appears near-verbatim across docs, keep one example and note it recurred.
- **Replies matter** — a lot of the best feedback lives in replies inside threads other people
  started; the script already captures these (`role: "reply"`, with `respondingTo`).
- **Scale** — comment exports can be large and get persisted to a file; always parse via the
  script rather than eyeballing raw JSON.
