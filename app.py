"""
Chatbot - Flask backend

A local chat app that talks to Google's free Gemini API (through its
OpenAI-compatible endpoint). Features:
  * streaming responses, regenerate, model picker
  * full conversation memory
  * rename / search / delete chats
  * edit a sent message and re-run from that point
  * attach images, PDFs and text/code files

Setup:
    1. pip install -r requirements.txt
    2. Get a free key (no credit card) at https://ai.google.dev
    3. Copy .env.example to .env and add your own GEMINI_API_KEY
    4. python app.py
    5. Open http://127.0.0.1:5001
"""

import base64
import json
import os
import re
import shutil
import threading
import time
import uuid
from io import BytesIO
from pathlib import Path

from dotenv import load_dotenv
from flask import (Flask, Response, abort, jsonify, render_template, request,
                   send_from_directory)
from openai import OpenAI

load_dotenv()  # reads variables from a local .env file, if present

app = Flask(__name__)

# --- LLM client -----------------------------------------------------
api_key = os.environ.get("GEMINI_API_KEY")
client = (
    OpenAI(
        api_key=api_key,
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
    )
    if api_key
    else None
)

MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

# Models shown in the dropdown. Override with GEMINI_MODELS="a,b,c" in .env
AVAILABLE_MODELS = [
    m.strip()
    for m in os.environ.get(
        "GEMINI_MODELS", "gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.5-pro"
    ).split(",")
    if m.strip()
]
if MODEL not in AVAILABLE_MODELS:
    AVAILABLE_MODELS.insert(0, MODEL)

# Only the most recent N messages are sent to the model, so very long
# chats don't hit token limits. The full chat is still stored on disk.
MAX_HISTORY_MESSAGES = int(os.environ.get("MAX_HISTORY_MESSAGES", "40"))

SYSTEM_PROMPT = (
    "You are a helpful, knowledgeable assistant. Answer the user's "
    "questions as clearly and completely as you can. Use Markdown for "
    "formatting (lists, tables, and fenced code blocks with a language "
    "tag). If you are genuinely unsure about something, say so rather "
    "than making it up."
)

# --- Storage -------------------------------------------------------------
DATA_FILE = Path(__file__).parent / "data" / "conversations.json"
UPLOAD_DIR = Path(__file__).parent / "data" / "uploads"
DATA_FILE.parent.mkdir(exist_ok=True)
UPLOAD_DIR.mkdir(exist_ok=True)
store_lock = threading.Lock()

# --- Uploads -------------------------------------------------------------
IMAGE_TYPES = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
    "gif": "image/gif",
}
TEXT_EXTS = {
    "txt", "md", "csv", "json", "py", "js", "ts", "html", "css", "java",
    "c", "cpp", "sql", "yaml", "yml", "xml", "log",
}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024   # per file
MAX_ATTACHMENTS = 5                   # per message
MAX_DOC_CHARS = 60_000                # text sent to the model per document
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024

ATT_ID_RE = re.compile(r"^[0-9a-f]{32}$")


def load_conversations():
    if not DATA_FILE.exists():
        return {}
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_conversations(conversations):
    # Write to a temp file and swap it in, so a crash mid-write can't
    # leave a half-written (corrupt) conversations file behind.
    tmp = DATA_FILE.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(conversations, f, indent=2, ensure_ascii=False)
    os.replace(tmp, DATA_FILE)


def sse(payload):
    """Format one Server-Sent Event frame."""
    return f"data: {json.dumps(payload)}\n\n"


def load_attachment_meta(att_id):
    if not isinstance(att_id, str) or not ATT_ID_RE.match(att_id):
        return None
    try:
        with open(UPLOAD_DIR / att_id / "meta.json", "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def looks_like_image(ext, data):
    sig = {
        "png": data.startswith(b"\x89PNG"),
        "jpg": data.startswith(b"\xff\xd8"),
        "jpeg": data.startswith(b"\xff\xd8"),
        "gif": data.startswith(b"GIF8"),
        "webp": data[:4] == b"RIFF" and data[8:12] == b"WEBP",
    }
    return sig.get(ext, False)


def extract_pdf_text(data):
    try:
        from pypdf import PdfReader
    except ImportError:
        raise ValueError("PDF support needs one more package: pip install pypdf")
    try:
        reader = PdfReader(BytesIO(data))
        pages = [(p.extract_text() or "") for p in reader.pages]
    except Exception:  # noqa: BLE001
        raise ValueError("Couldn't read that PDF (it may be damaged or password-protected).")
    text = "\n\n".join(p.strip() for p in pages if p.strip())
    if not text:
        raise ValueError("That PDF has no selectable text (it may be a scan).")
    return text


# --- Routes --------------------------------------------------------------

@app.route("/")
def home():
    with store_lock:
        conversations = load_conversations()
    sidebar_chats = [
        {"id": cid, "title": c["title"]}
        for cid, c in sorted(
            conversations.items(), key=lambda kv: kv[1]["created_at"], reverse=True
        )
    ]
    return render_template(
        "index.html",
        chats=sidebar_chats,
        models=AVAILABLE_MODELS,
        default_model=MODEL,
    )


@app.route("/api/conversations/<conversation_id>", methods=["GET"])
def get_conversation(conversation_id):
    with store_lock:
        convo = load_conversations().get(conversation_id)
    if not convo:
        return jsonify({"error": "Conversation not found"}), 404
    return jsonify(convo)


@app.route("/api/conversations/<conversation_id>", methods=["PATCH"])
def rename_conversation(conversation_id):
    body = request.get_json(silent=True) or {}
    title = " ".join(str(body.get("title") or "").split())[:80]
    if not title:
        return jsonify({"error": "Title cannot be empty"}), 400
    with store_lock:
        conversations = load_conversations()
        convo = conversations.get(conversation_id)
        if not convo:
            return jsonify({"error": "Conversation not found"}), 404
        convo["title"] = title
        save_conversations(conversations)
    return jsonify({"ok": True, "title": title})


@app.route("/api/conversations/<conversation_id>", methods=["DELETE"])
def delete_conversation(conversation_id):
    with store_lock:
        conversations = load_conversations()
        convo = conversations.pop(conversation_id, None)
        save_conversations(conversations)
    # Remove uploaded files that belonged to this chat.
    for m in (convo or {}).get("messages", []):
        for a in m.get("attachments") or []:
            if isinstance(a.get("id"), str) and ATT_ID_RE.match(a["id"]):
                shutil.rmtree(UPLOAD_DIR / a["id"], ignore_errors=True)
    return jsonify({"ok": True})


@app.route("/api/search")
def search_conversations():
    q = (request.args.get("q") or "").strip().lower()
    if not q:
        return jsonify({"ids": []})
    with store_lock:
        conversations = load_conversations()
    ids = []
    for cid, c in conversations.items():
        haystack = [c.get("title", "")]
        for m in c.get("messages", []):
            haystack.append(m.get("content") or "")
            haystack.extend(a.get("name", "") for a in m.get("attachments") or [])
        if any(q in h.lower() for h in haystack):
            ids.append(cid)
    return jsonify({"ids": ids})


@app.route("/api/upload", methods=["POST"])
def upload():
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify({"error": "No file received"}), 400

    name = Path(f.filename.replace("\\", "/")).name[:120] or "file"
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    data = f.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        return jsonify({"error": f"{name} is larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB."}), 413

    text = None
    if ext in IMAGE_TYPES:
        if not looks_like_image(ext, data):
            return jsonify({"error": f"{name} doesn't look like a valid .{ext} image."}), 400
        kind, mime = "image", IMAGE_TYPES[ext]
    elif ext == "pdf":
        try:
            text = extract_pdf_text(data)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        kind, mime = "document", "application/pdf"
    elif ext in TEXT_EXTS:
        text = data.decode("utf-8", errors="replace")
        kind, mime = "document", "text/plain"
    else:
        return jsonify({"error": "Unsupported file type. Use an image (png, jpg, webp, gif), "
                                 "a PDF, or a text/code file."}), 400

    att_id = uuid.uuid4().hex
    folder = UPLOAD_DIR / att_id
    folder.mkdir(parents=True)
    stored = f"original.{ext}"
    (folder / stored).write_bytes(data)
    if text is not None:
        (folder / "text.txt").write_text(text, encoding="utf-8")
    meta = {"id": att_id, "name": name, "kind": kind, "mime": mime, "file": stored}
    (folder / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
    return jsonify({"id": att_id, "name": name, "kind": kind, "mime": mime})


@app.route("/api/uploads/<att_id>")
def serve_upload(att_id):
    meta = load_attachment_meta(att_id)
    if not meta:
        abort(404)
    is_image = meta["kind"] == "image"
    # Only images are shown inline; everything else downloads, so an
    # uploaded .html file can never run in the page's origin.
    return send_from_directory(
        UPLOAD_DIR / att_id,
        meta["file"],
        mimetype=meta["mime"] if is_image else "application/octet-stream",
        as_attachment=not is_image,
        download_name=meta["name"],
    )


# Temporary Google-side errors are retried automatically (seconds to wait
# before each retry), as long as no text has been streamed yet.
RETRY_DELAYS = (1.5, 3, 6)


def is_retryable(exc):
    text = str(exc)
    return any(code in text for code in ("503", "500", "504")) or "UNAVAILABLE" in text


def friendly_error(exc):
    text = str(exc)
    if "503" in text or "UNAVAILABLE" in text or "high demand" in text:
        return ("Gemini is overloaded right now (this is on Google's side and usually "
                "passes quickly). Try again in a moment, or pick a different model "
                "such as gemini-2.5-flash-lite.")
    if "429" in text or "quota" in text.lower() or "rate limit" in text.lower():
        return ("Rate limit reached on the Gemini free tier. "
                "Wait a minute and try again, or pick a different model.")
    if "401" in text or "403" in text or "API key" in text:
        return "The Gemini API key was rejected. Check GEMINI_API_KEY in your .env file."
    return f"Gemini request failed: {text}"


def message_to_api(m):
    """Convert a stored message into the API format, inlining attachments."""
    atts = m.get("attachments") or []
    if m["role"] != "user" or not atts:
        return {"role": m["role"], "content": m["content"]}

    text_parts, image_parts = [], []
    for a in atts:
        meta = load_attachment_meta(a.get("id"))
        name = a.get("name", "file")
        try:
            if not meta:
                raise OSError("missing")
            folder = UPLOAD_DIR / meta["id"]
            if meta["kind"] == "image":
                b64 = base64.b64encode((folder / meta["file"]).read_bytes()).decode()
                image_parts.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:{meta['mime']};base64,{b64}"},
                })
            else:
                doc = (folder / "text.txt").read_text(encoding="utf-8")
                note = ""
                if len(doc) > MAX_DOC_CHARS:
                    doc, note = doc[:MAX_DOC_CHARS], "\n[...file truncated...]"
                text_parts.append(f"[Attached file: {name}]\n{doc}{note}\n[End of {name}]")
        except OSError:
            text_parts.append(f'[Attached file "{name}" is no longer available]')

    user_text = m["content"] or "Please look at the attached file(s)."
    text = "\n\n".join(text_parts + [user_text])
    return {"role": "user", "content": [{"type": "text", "text": text}] + image_parts}


@app.route("/api/chat", methods=["POST"])
def chat():
    if client is None:
        return jsonify({
            "error": "No GEMINI_API_KEY is set. Add one to your .env file "
                     "(see .env.example) and restart the server."
        }), 500

    body = request.get_json(silent=True) or {}
    message = (body.get("message") or "").strip()
    conversation_id = body.get("conversation_id")
    regenerate = bool(body.get("regenerate"))
    edit_index = body.get("edit_index")
    model = body.get("model") if body.get("model") in AVAILABLE_MODELS else MODEL

    # Attachments the user just uploaded (validated against what's on disk).
    attachments = []
    for att_id in (body.get("attachment_ids") or [])[:MAX_ATTACHMENTS]:
        meta = load_attachment_meta(att_id)
        if meta and all(a["id"] != att_id for a in attachments):
            attachments.append({k: meta[k] for k in ("id", "name", "kind", "mime")})

    with store_lock:
        existing = load_conversations().get(conversation_id) if conversation_id else None

    if regenerate:
        # Re-answer the last user message: drop the trailing assistant reply.
        if not existing:
            return jsonify({"error": "Conversation not found"}), 404
        history = list(existing["messages"])
        while history and history[-1]["role"] == "assistant":
            history.pop()
        if not history or history[-1]["role"] != "user":
            return jsonify({"error": "Nothing to regenerate"}), 400
        title = existing["title"]
    else:
        if edit_index is not None:
            # Edit an earlier user message: keep everything before it, replace
            # it (keeping its attachments) and drop everything after.
            msgs = existing["messages"] if existing else []
            if (not isinstance(edit_index, int) or isinstance(edit_index, bool)
                    or not 0 <= edit_index < len(msgs)
                    or msgs[edit_index]["role"] != "user"):
                return jsonify({"error": "That message can't be edited"}), 400
            attachments = msgs[edit_index].get("attachments") or []
            history = list(msgs[:edit_index])
            title = existing["title"]
        elif existing:
            history = list(existing["messages"])
            title = existing["title"]
        else:
            conversation_id = str(uuid.uuid4())
            history = []
            title = (message or (attachments[0]["name"] if attachments else ""))
            title = title.replace("\n", " ")[:60]

        if not message and not attachments:
            return jsonify({"error": "Message cannot be empty"}), 400
        user_msg = {"role": "user", "content": message}
        if attachments:
            user_msg["attachments"] = attachments
        history.append(user_msg)

    # Send the system prompt + the most recent messages (always starting
    # on a user turn).
    recent = history[-MAX_HISTORY_MESSAGES:]
    while recent and recent[0]["role"] != "user":
        recent.pop(0)
    api_messages = [{"role": "system", "content": SYSTEM_PROMPT}] + [
        message_to_api(m) for m in recent
    ]

    def generate():
        parts = []
        persisted = False
        stream = None

        def persist():
            """Save the conversation, including a partial answer if the
            user pressed Stop."""
            nonlocal persisted
            answer = "".join(parts)
            if persisted or not answer.strip():
                return
            persisted = True
            with store_lock:
                conversations = load_conversations()
                convo = conversations.get(conversation_id)
                if convo is None:
                    convo = {
                        "id": conversation_id,
                        "title": title,
                        "created_at": time.time(),
                    }
                    conversations[conversation_id] = convo
                convo["messages"] = history + [{"role": "assistant", "content": answer}]
                save_conversations(conversations)

        try:
            for attempt in range(len(RETRY_DELAYS) + 1):
                try:
                    stream = client.chat.completions.create(
                        model=model,
                        messages=api_messages,
                        temperature=0.7,
                        stream=True,
                    )
                    for chunk in stream:
                        if not chunk.choices:
                            continue
                        delta = chunk.choices[0].delta.content
                        if not delta:
                            continue
                        if not parts:
                            yield sse({"type": "meta", "conversation_id": conversation_id,
                                       "title": title})
                        parts.append(delta)
                        yield sse({"type": "delta", "text": delta})
                    break  # finished normally
                except Exception as exc:  # noqa: BLE001
                    # Retry temporary overloads, but only if nothing has been
                    # shown yet (otherwise the answer would be duplicated).
                    if parts or attempt >= len(RETRY_DELAYS) or not is_retryable(exc):
                        raise
                    time.sleep(RETRY_DELAYS[attempt])
            persist()
            yield sse({"type": "done"})
        except GeneratorExit:
            raise  # client pressed Stop / closed the tab; finally saves the partial
        except Exception as exc:  # noqa: BLE001 - surface any API error to the UI
            persist()
            yield sse({"type": "error", "error": friendly_error(exc)})
        finally:
            persist()
            if stream is not None:
                try:
                    stream.close()
                except Exception:  # noqa: BLE001
                    pass

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.errorhandler(413)
def too_large(_exc):
    return jsonify({"error": "That upload is too large."}), 413


if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG", "1") == "1", port=5001)
