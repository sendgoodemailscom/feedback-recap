#!/usr/bin/env node
/**
 * extract-comments.mjs
 *
 * Pulls ONE reviewer's comments out of Google Doc comment exports and emits a
 * clean, structured JSON list ready for theme clustering.
 *
 * Input: a manifest JSON file — an array of { title, url, path } where `path`
 *        points to the raw output of the Drive `read_file_content` tool
 *        (called with includeComments: true) saved for that document.
 *
 * Usage:
 *   node extract-comments.mjs --manifest manifest.json --reviewer "Jane Doe" [--out out.json]
 *   node extract-comments.mjs --manifest manifest.json        # reviewer read from ../config.json
 *
 * Output: writes the structured list to --out (default: reviewer-comments.json)
 *         and prints a short human summary to stderr.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const manifestPath = flag('manifest');
if (!manifestPath) {
  console.error('Error: --manifest <path> is required.');
  process.exit(1);
}
const outPath = flag('out', 'reviewer-comments.json');

// Reviewer identity: --reviewer wins, otherwise read from ../config.json
let reviewerName = flag('reviewer');
let aliases = [];
try {
  const cfg = JSON.parse(readFileSync(resolve(__dirname, '..', 'config.json'), 'utf8'));
  reviewerName = reviewerName || cfg.reviewerName;
  aliases = Array.isArray(cfg.aliases) ? cfg.aliases : [];
} catch { /* no config file — fine as long as --reviewer was passed */ }

if (!reviewerName) {
  console.error('Error: no reviewer. Pass --reviewer "Name" or set reviewerName in config.json.');
  process.exit(1);
}
const names = new Set([reviewerName, ...aliases].map((n) => n.trim().toLowerCase()));
const isReviewer = (author) => !!author && names.has(author.trim().toLowerCase());

// ── helpers ──────────────────────────────────────────────────────────────────
const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
const URL_ONLY = /^https?:\/\/\S+$/i;
const snippet = (s, n = 160) => {
  const c = clean(s);
  return c.length > n ? c.slice(0, n - 1) + '…' : c;
};

// ── process ──────────────────────────────────────────────────────────────────
const manifest = JSON.parse(readFileSync(resolve(manifestPath), 'utf8'));
const comments = [];
const perDoc = [];

for (const entry of manifest) {
  const { title = '(untitled)', url = '', path } = entry;
  let data;
  try {
    data = JSON.parse(readFileSync(resolve(path), 'utf8'));
  } catch (e) {
    console.error(`! Skipping "${title}" — could not read/parse ${path}: ${e.message}`);
    continue;
  }

  const threads = Array.isArray(data.commentThreads) ? data.commentThreads : [];
  let docCount = 0;

  for (const t of threads) {
    const status = t.status || 'UNKNOWN'; // OPEN | RESOLVED
    const head = t.headPost || {};
    const replies = Array.isArray(t.replies) ? t.replies : [];
    const posts = [{ ...head, role: 'head' }, ...replies.map((r) => ({ ...r, role: 'reply' }))];

    for (const p of posts) {
      const text = clean(p.content);
      if (!text) continue;                 // skip empty "resolve-tick" posts
      if (!isReviewer(p.authorName)) continue;

      // If this is a reply, capture what the reviewer was responding to.
      let respondingTo = null;
      if (p.role === 'reply' && !isReviewer(head.authorName) && clean(head.content)) {
        respondingTo = { author: head.authorName || '(unknown)', snippet: snippet(head.content) };
      }

      comments.push({
        doc: title,
        url,
        status,
        role: p.role,                      // head | reply
        text,
        respondingTo,
        chars: text.length,
        signals: { urlOnly: URL_ONLY.test(text), veryShort: text.length < 25 },
      });
      docCount++;
    }
  }
  perDoc.push({ title, url, reviewerComments: docCount });
}

// ── summarise + write ────────────────────────────────────────────────────────
const byStatus = comments.reduce((a, c) => ((a[c.status] = (a[c.status] || 0) + 1), a), {});
const result = { reviewer: reviewerName, totalReviewerComments: comments.length, byStatus, perDoc, comments };

writeFileSync(resolve(outPath), JSON.stringify(result, null, 2));

console.error(`\nReviewer: ${reviewerName}`);
console.error(`Docs scanned: ${manifest.length}`);
console.error(`Reviewer comments found: ${comments.length}  (${JSON.stringify(byStatus)})`);
for (const d of perDoc) console.error(`  • ${String(d.reviewerComments).padStart(3)}  ${d.title}`);
console.error(`\nWrote → ${resolve(outPath)}`);
