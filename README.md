# Chatbot

A local chat app that talks to Google's Gemini API (free, no credit card)
and answers questions the way ChatGPT does, including remembering earlier
turns in the same conversation.

## Features

- **Streaming answers** - text appears as it is generated; press the stop
  button to cut it off (the partial answer is kept).
- **Markdown rendering** - headings, lists, tables, links and syntax-
  highlighted code blocks (sanitized with DOMPurify).
- **Copy buttons** on code blocks and whole answers, plus **Regenerate**.
- **Model picker** in the top bar (remembered between visits).
- **Attach files** - images (png, jpg, webp, gif), PDFs and text/code files.
  Use the paperclip, drag & drop onto the page, or paste an image. Images
  are sent to Gemini as vision input; PDFs and text files have their text
  extracted and included (scanned PDFs with no selectable text aren't
  supported). Limits: 10 MB per file, 5 files per message.
- **Edit a sent message** - hover your message and click Edit; the chat
  re-runs from that point and later messages are replaced.
- **Rename chats** (pencil in the sidebar) and **search chats** by title or
  message text.
- Multi-line input (Enter sends, Shift+Enter adds a new line).
- Sidebar with saved chats, new chat and delete; collapsible on mobile.
- Conversation memory, with older messages trimmed from what is sent to
  the model so very long chats don't hit token limits.
- Safer storage: file lock + atomic writes for `data/conversations.json`.

## Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Get a free API key at https://ai.google.dev
   -> sign in with a Google account -> "Get API key".
3. Copy `.env.example` to `.env` and paste your key in:
   ```bash
   cp .env.example .env
   ```
4. Run it:
   ```bash
   python app.py
   ```
5. Open http://127.0.0.1:5001 in your browser.

## Configuration (`.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | - | your key (required) |
| `GEMINI_MODEL` | `gemini-3.5-flash` | default model |
| `GEMINI_MODELS` | gemini-3.5-flash, gemini-3.5-flash-lite | comma-separated list for the dropdown |
| `MAX_HISTORY_MESSAGES` | `40` | how many recent messages are sent to the model |
| `FLASK_DEBUG` | `1` | set to `0` for anything other than local use |

## Notes

- Conversations are stored in `data/conversations.json`, and uploaded files
  in `data/uploads/`, on your machine. Deleting a chat deletes its uploads.
- The Gemini free tier has daily/per-minute limits, and Google may use
  free-tier prompts to improve its models - avoid private or sensitive data.
- The page loads Tailwind, marked, DOMPurify and highlight.js from CDNs,
  so it needs an internet connection in the browser.
- Never commit or share your real `.env` file.

- Google retires old models over time. If you see a "404 / no longer available" error,
  update `GEMINI_MODEL` and `GEMINI_MODELS` in `.env` to current model names
  (see https://ai.google.dev/gemini-api/docs/models).
