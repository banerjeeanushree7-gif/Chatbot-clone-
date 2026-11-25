const questionInput = document.getElementById("questionInput");
const sendButton = document.getElementById("sendButton");
const sendIcon = document.getElementById("sendIcon");
const stopIcon = document.getElementById("stopIcon");
const welcomeScreen = document.getElementById("welcomeScreen");
const chatScreen = document.getElementById("chatScreen");
const messagesEl = document.getElementById("messages");
const chatList = document.getElementById("chatList");
const newChatBtn = document.getElementById("newChatBtn");
const errorBanner = document.getElementById("errorBanner");
const modelSelect = document.getElementById("modelSelect");
const sidebar = document.getElementById("sidebar");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const menuBtn = document.getElementById("menuBtn");
const searchInput = document.getElementById("searchInput");
const noResults = document.getElementById("noResults");
const attachButton = document.getElementById("attachButton");
const fileInput = document.getElementById("fileInput");
const attachmentBar = document.getElementById("attachmentBar");

const MAX_ATTACHMENTS = 5;

let activeConversationId = null;
let isSending = false;
let abortController = null;
let pendingAttachments = []; // uploaded, waiting to be sent with the next message
let uploadingNames = [];     // files currently uploading

/* ---------- small helpers ---------- */

function showError(text) {
    errorBanner.textContent = text;
    errorBanner.classList.remove("hidden");
}

function clearError() {
    errorBanner.classList.add("hidden");
    errorBanner.textContent = "";
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Only auto-scroll while streaming if the user is already near the bottom.
function isNearBottom() {
    return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 120;
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
    }
}

function flashLabel(el, label) {
    const original = el.dataset.label || el.textContent;
    el.dataset.label = original;
    el.textContent = label;
    setTimeout(() => (el.textContent = original), 1200);
}

/* ---------- model choice (remembered between visits) ---------- */

try {
    const saved = localStorage.getItem("chatbot-model");
    if (saved && [...modelSelect.options].some((o) => o.value === saved)) {
        modelSelect.value = saved;
    }
} catch { /* storage unavailable: ignore */ }

modelSelect.addEventListener("change", () => {
    try { localStorage.setItem("chatbot-model", modelSelect.value); } catch { /* ignore */ }
});

/* ---------- markdown rendering ---------- */

marked.setOptions({ gfm: true, breaks: true });

function renderMarkdown(el, text) {
    // DOMPurify strips any scripts/handlers the model might emit.
    el.innerHTML = DOMPurify.sanitize(marked.parse(text));
    el.querySelectorAll("a").forEach((a) => {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
    });
    el.querySelectorAll("pre").forEach((pre) => {
        const code = pre.querySelector("code");
        let lang = "";
        if (code) {
            const match = /language-([\w+#-]+)/.exec(code.className);
            lang = match ? match[1] : "";
            try { hljs.highlightElement(code); } catch { /* unknown language */ }
        }
        const wrap = document.createElement("div");
        wrap.className = "code-wrap";
        const head = document.createElement("div");
        head.className = "code-head";
        head.innerHTML = `<span>${escapeHtml(lang || "code")}</span><button type="button" class="copy-code">Copy</button>`;
        pre.replaceWith(wrap);
        wrap.append(head, pre);
    });
}

/* ---------- attachments: display helpers ---------- */

const attachmentUrl = (a) => `/api/uploads/${a.id}`;

function buildAttachmentView(a) {
    if (a.kind === "image") {
        const link = document.createElement("a");
        link.href = attachmentUrl(a);
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        const img = document.createElement("img");
        img.src = attachmentUrl(a);
        img.alt = a.name;
        img.className = "att-img";
        link.appendChild(img);
        return link;
    }
    const chip = document.createElement("a");
    chip.href = attachmentUrl(a);
    chip.className = "att-chip hover:bg-white/20";
    chip.title = a.name;
    chip.innerHTML = `<span>📄</span><span class="name"></span>`;
    chip.querySelector(".name").textContent = a.name;
    return chip;
}

/* ---------- message rows ---------- */

const COPY_ICON = `<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" class="h-3.5 w-3.5"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
const REGEN_ICON = `<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" class="h-3.5 w-3.5"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>`;
const EDIT_ICON = `<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" class="h-3.5 w-3.5"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;

function appendMessage(role, content, { streaming = false, attachments = [] } = {}) {
    const isUser = role === "user";
    const row = document.createElement("div");
    row.className = `msg-row w-full py-6 px-4 md:px-10 ${isUser ? "bg-transparent" : "bg-black/20"}${streaming ? " streaming" : ""}`;
    row.dataset.role = role;
    row._raw = content;
    row._attachments = attachments;

    const actions = isUser
        ? `<div class="msg-actions"><button type="button" class="action-btn edit-btn">${EDIT_ICON}<span>Edit</span></button></div>`
        : `<div class="msg-actions">
                <button type="button" class="action-btn copy-msg">${COPY_ICON}<span>Copy</span></button>
                <button type="button" class="action-btn regen-btn">${REGEN_ICON}<span>Regenerate</span></button>
           </div>`;

    row.innerHTML = `
        <div class="max-w-3xl mx-auto flex space-x-4">
            <div class="shrink-0 w-8 h-8 rounded-sm flex items-center justify-center text-sm font-bold ${isUser ? "bg-emerald-600" : "bg-violet-600"}">
                ${isUser ? "U" : "AI"}
            </div>
            <div class="flex-1 min-w-0">
                <div class="msg-attachments hidden"></div>
                <div class="msg-content ${isUser ? "whitespace-pre-wrap break-words leading-relaxed" : "md"}"></div>
                ${actions}
            </div>
        </div>`;

    if (attachments.length) {
        const box = row.querySelector(".msg-attachments");
        box.classList.remove("hidden");
        attachments.forEach((a) => box.appendChild(buildAttachmentView(a)));
    }

    const contentEl = row.querySelector(".msg-content");
    if (isUser) {
        contentEl.textContent = content;
        if (!content) contentEl.classList.add("hidden");
    } else if (content) {
        renderMarkdown(contentEl, content);
    }
    messagesEl.appendChild(row);
    scrollToBottom();
    return row;
}

/* ---------- editing a sent message ---------- */

function startEdit(row) {
    if (isSending || row.dataset.editing) return;
    row.dataset.editing = "1";
    const contentEl = row.querySelector(".msg-content");
    const actions = row.querySelector(".msg-actions");

    const editor = document.createElement("div");
    editor.className = "edit-box";
    editor.innerHTML = `
        <textarea rows="3" class="w-full p-3 bg-gray-700 rounded-md outline-none focus:ring-2 focus:ring-gray-400 resize-none"></textarea>
        <div class="flex gap-2 mt-2">
            <button type="button" class="save-edit bg-emerald-600 hover:bg-emerald-500 text-sm px-3 py-1.5 rounded-md">Save &amp; submit</button>
            <button type="button" class="cancel-edit bg-gray-700 hover:bg-gray-600 text-sm px-3 py-1.5 rounded-md">Cancel</button>
        </div>`;
    const ta = editor.querySelector("textarea");
    ta.value = row._raw;

    const grow = () => {
        ta.style.height = "auto";
        ta.style.height = Math.min(ta.scrollHeight, 300) + "px";
    };
    const close = () => {
        editor.remove();
        contentEl.classList.toggle("hidden", !row._raw);
        actions.classList.remove("hidden");
        delete row.dataset.editing;
    };
    const save = () => {
        const text = ta.value.trim();
        if (!text && !row._attachments.length) return;
        const index = [...messagesEl.children].indexOf(row);
        streamChat({ message: text, editIndex: index, attachments: row._attachments });
    };

    editor.querySelector(".save-edit").addEventListener("click", save);
    editor.querySelector(".cancel-edit").addEventListener("click", close);
    ta.addEventListener("input", grow);
    ta.addEventListener("keydown", (e) => {
        if (e.key === "Escape") close();
        else if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            save();
        }
    });

    contentEl.classList.add("hidden");
    actions.classList.add("hidden");
    contentEl.after(editor);
    grow();
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
}

/* ---------- screens & sidebar ---------- */

function showChatScreen() {
    welcomeScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");
}

function showWelcomeScreen() {
    chatScreen.classList.add("hidden");
    welcomeScreen.classList.remove("hidden");
    messagesEl.innerHTML = "";
    activeConversationId = null;
    document.querySelectorAll(".chat-item").forEach((el) => el.classList.remove("bg-white/10"));
}

function addSidebarEntry(id, title) {
    if (chatList.querySelector(`[data-id="${id}"]`)) return;
    const item = document.createElement("div");
    item.className = "chat-item group w-full px-3 py-2 rounded-md hover:bg-white/10 cursor-pointer flex justify-between items-center text-sm truncate bg-white/10";
    item.dataset.id = id;
    item.innerHTML = `<span class="chat-title truncate"></span>
        <span class="flex shrink-0 items-center">
            <button class="rename-btn opacity-0 group-hover:opacity-100 text-gray-400 hover:text-white ml-2" title="Rename" aria-label="Rename chat">✎</button>
            <button class="delete-btn opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 ml-2" title="Delete" aria-label="Delete chat" data-id="${id}">✕</button>
        </span>`;
    item.querySelector(".chat-title").textContent = title;
    chatList.prepend(item);
}

function openSidebar() {
    sidebar.classList.remove("-translate-x-full");
    sidebarBackdrop.classList.remove("hidden");
}

function closeSidebar() {
    sidebar.classList.add("-translate-x-full");
    sidebarBackdrop.classList.add("hidden");
}

menuBtn.addEventListener("click", openSidebar);
sidebarBackdrop.addEventListener("click", closeSidebar);

async function loadConversation(id) {
    clearError();
    const res = await fetch(`/api/conversations/${id}`);
    if (!res.ok) {
        showError("Couldn't load that conversation.");
        return;
    }
    const convo = await res.json();
    activeConversationId = id;
    messagesEl.innerHTML = "";
    convo.messages.forEach((m) => appendMessage(m.role, m.content, { attachments: m.attachments || [] }));
    showChatScreen();
    scrollToBottom();
    document.querySelectorAll(".chat-item").forEach((el) => {
        el.classList.toggle("bg-white/10", el.dataset.id === id);
    });
}

/* ---------- rename a chat (pencil in the sidebar) ---------- */

function startRename(item) {
    const titleEl = item.querySelector(".chat-title");
    if (!titleEl) return;
    const oldTitle = titleEl.textContent;

    const input = document.createElement("input");
    input.type = "text";
    input.value = oldTitle;
    input.maxLength = 80;
    input.className = "rename-input bg-gray-700 rounded px-1 py-0.5 w-full outline-none text-sm";
    titleEl.replaceWith(input);
    input.focus();
    input.select();

    let finished = false;
    const finish = async (save) => {
        if (finished) return;
        finished = true;
        const newTitle = input.value.trim();
        const span = document.createElement("span");
        span.className = "chat-title truncate";
        span.textContent = oldTitle;
        input.replaceWith(span);
        if (!save || !newTitle || newTitle === oldTitle) return;
        try {
            const res = await fetch(`/api/conversations/${item.dataset.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: newTitle }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Couldn't rename that chat.");
            span.textContent = data.title;
        } catch (err) {
            showError(err.message || "Couldn't rename that chat.");
        }
    };
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); finish(true); }
        else if (e.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
}

/* ---------- search chats (titles and message text) ---------- */

let searchTimer = null;

async function runSearch() {
    const q = searchInput.value.trim();
    const items = chatList.querySelectorAll(".chat-item");
    if (!q) {
        items.forEach((i) => i.classList.remove("hidden"));
        noResults.classList.add("hidden");
        return;
    }
    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (!res.ok || q !== searchInput.value.trim()) return; // stale response
        const { ids } = await res.json();
        const wanted = new Set(ids);
        let shown = 0;
        items.forEach((i) => {
            const show = wanted.has(i.dataset.id);
            i.classList.toggle("hidden", !show);
            if (show) shown++;
        });
        noResults.classList.toggle("hidden", shown > 0);
    } catch { /* ignore network hiccups while typing */ }
}

searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 250);
});

/* ---------- attaching files ---------- */

function renderAttachmentBar() {
    attachmentBar.innerHTML = "";
    pendingAttachments.forEach((a) => {
        const chip = document.createElement("div");
        chip.className = "compose-chip";
        if (a.kind === "image") {
            const img = document.createElement("img");
            img.src = attachmentUrl(a);
            img.alt = "";
            chip.appendChild(img);
        } else {
            chip.appendChild(Object.assign(document.createElement("span"), { textContent: "📄" }));
        }
        const name = document.createElement("span");
        name.className = "name";
        name.textContent = a.name;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "remove-att";
        remove.dataset.id = a.id;
        remove.setAttribute("aria-label", `Remove ${a.name}`);
        remove.textContent = "✕";
        chip.append(name, remove);
        attachmentBar.appendChild(chip);
    });
    uploadingNames.forEach((n) => {
        const chip = document.createElement("div");
        chip.className = "compose-chip animate-pulse";
        chip.innerHTML = `<span>⏳</span><span class="name"></span>`;
        chip.querySelector(".name").textContent = n;
        attachmentBar.appendChild(chip);
    });
    attachmentBar.classList.toggle("hidden", !pendingAttachments.length && !uploadingNames.length);
}

async function uploadFiles(fileList) {
    for (const file of [...fileList]) {
        if (pendingAttachments.length + uploadingNames.length >= MAX_ATTACHMENTS) {
            showError(`You can attach up to ${MAX_ATTACHMENTS} files per message.`);
            break;
        }
        clearError();
        uploadingNames.push(file.name);
        renderAttachmentBar();
        try {
            const fd = new FormData();
            fd.append("file", file, file.name || "pasted-image.png");
            const res = await fetch("/api/upload", { method: "POST", body: fd });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Upload failed.");
            pendingAttachments.push(data);
        } catch (err) {
            showError(err.message || "Upload failed.");
        } finally {
            uploadingNames.splice(uploadingNames.indexOf(file.name), 1);
            renderAttachmentBar();
        }
    }
}

attachButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
    uploadFiles(fileInput.files);
    fileInput.value = "";
});

attachmentBar.addEventListener("click", (e) => {
    const btn = e.target.closest(".remove-att");
    if (!btn) return;
    pendingAttachments = pendingAttachments.filter((a) => a.id !== btn.dataset.id);
    renderAttachmentBar();
});

// Paste an image/file straight into the box
questionInput.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) {
        e.preventDefault();
        uploadFiles(files);
    }
});

// Drag & drop anywhere on the page
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
window.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    dragDepth++;
    document.body.classList.add("drop-active");
});
window.addEventListener("dragleave", (e) => {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) document.body.classList.remove("drop-active");
});
window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove("drop-active");
    uploadFiles(e.dataTransfer.files);
});

/* ---------- sending / streaming ---------- */

function setSending(sending) {
    isSending = sending;
    sendIcon.classList.toggle("hidden", sending);
    stopIcon.classList.toggle("hidden", !sending);
    sendButton.setAttribute("aria-label", sending ? "Stop generating" : "Send");
}

function autoGrow() {
    questionInput.style.height = "auto";
    questionInput.style.height = Math.min(questionInput.scrollHeight, 200) + "px";
}

async function streamChat({ message = "", regenerate = false, editIndex = null, attachments = [] } = {}) {
    if (isSending) return;
    clearError();
    setSending(true);
    abortController = new AbortController();

    const isNewMessage = !regenerate && editIndex === null;

    if (regenerate) {
        // Remove the old assistant answer from view; the server replaces it.
        const last = messagesEl.lastElementChild;
        if (last && last.dataset.role === "assistant") last.remove();
    } else {
        if (editIndex !== null) {
            // Drop the edited message and everything after it from view.
            [...messagesEl.children].slice(editIndex).forEach((r) => r.remove());
        }
        showChatScreen();
        appendMessage("user", message, { attachments });
        if (isNewMessage) {
            questionInput.value = "";
            autoGrow();
            pendingAttachments = [];
            renderAttachmentBar();
        }
    }

    const aiRow = appendMessage("assistant", "", { streaming: true });
    const contentEl = aiRow.querySelector(".msg-content");
    contentEl.innerHTML = `<span class="opacity-60 animate-pulse">Thinking…</span>`;

    let raw = "";
    let errorMsg = "";
    let aborted = false;
    let renderQueued = false;

    const flushRender = () => {
        renderQueued = false;
        const stick = isNearBottom();
        renderMarkdown(contentEl, raw);
        if (stick) scrollToBottom();
    };
    const queueRender = () => {
        if (!renderQueued) {
            renderQueued = true;
            requestAnimationFrame(flushRender);
        }
    };

    try {
        const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: abortController.signal,
            body: JSON.stringify({
                message,
                regenerate,
                edit_index: editIndex,
                attachment_ids: isNewMessage ? attachments.map((a) => a.id) : [],
                conversation_id: activeConversationId,
                model: modelSelect.value,
            }),
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Something went wrong talking to the model.");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let sep;
            while ((sep = buffer.indexOf("\n\n")) !== -1) {
                const frame = buffer.slice(0, sep);
                buffer = buffer.slice(sep + 2);
                if (!frame.startsWith("data:")) continue;
                const evt = JSON.parse(frame.slice(5).trim());

                if (evt.type === "meta") {
                    if (!activeConversationId) {
                        activeConversationId = evt.conversation_id;
                        addSidebarEntry(evt.conversation_id, evt.title);
                    }
                } else if (evt.type === "delta") {
                    raw += evt.text;
                    queueRender();
                } else if (evt.type === "error") {
                    errorMsg = evt.error;
                }
            }
        }
    } catch (err) {
        if (err.name === "AbortError") aborted = true;
        else errorMsg = err.message || "Network error — is the Flask server running?";
    } finally {
        abortController = null;
        setSending(false);
    }

    if (raw) {
        // Got (at least part of) an answer: show the final version.
        renderMarkdown(contentEl, raw);
        aiRow._raw = raw;
        aiRow.classList.remove("streaming");
        scrollToBottom();
        if (errorMsg) showError(errorMsg);
    } else {
        // Nothing arrived: restore the screen to what the server actually saved.
        aiRow.remove();
        if (activeConversationId) await loadConversation(activeConversationId);
        else showWelcomeScreen();
        if (isNewMessage) {
            questionInput.value = message;
            pendingAttachments = attachments;
            renderAttachmentBar();
            autoGrow();
        }
        if (errorMsg) showError(errorMsg);
        else if (aborted) clearError();
    }
}

function submit() {
    if (isSending) return;
    if (uploadingNames.length) {
        showError("Please wait for your files to finish uploading.");
        return;
    }
    const text = questionInput.value.trim();
    if (text || pendingAttachments.length) {
        streamChat({ message: text, attachments: [...pendingAttachments] });
    }
}

sendButton.addEventListener("click", () => {
    if (isSending) abortController?.abort();
    else submit();
});

questionInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        submit();
    }
});
questionInput.addEventListener("input", autoGrow);

document.querySelectorAll(".suggestion").forEach((btn) => {
    btn.addEventListener("click", () => streamChat({ message: btn.textContent.trim() }));
});

newChatBtn.addEventListener("click", () => {
    if (isSending) abortController?.abort();
    showWelcomeScreen();
    closeSidebar();
    questionInput.focus();
});

/* ---------- message actions (copy / regenerate / edit), via delegation ---------- */

messagesEl.addEventListener("click", async (e) => {
    const copyCode = e.target.closest(".copy-code");
    if (copyCode) {
        const code = copyCode.closest(".code-wrap").querySelector("pre");
        await copyText(code.innerText);
        flashLabel(copyCode, "Copied!");
        return;
    }
    const copyMsg = e.target.closest(".copy-msg");
    if (copyMsg) {
        await copyText(copyMsg.closest(".msg-row")._raw || "");
        flashLabel(copyMsg.querySelector("span"), "Copied!");
        return;
    }
    const editBtn = e.target.closest(".edit-btn");
    if (editBtn) {
        startEdit(editBtn.closest(".msg-row"));
        return;
    }
    if (e.target.closest(".regen-btn") && activeConversationId) {
        streamChat({ regenerate: true });
    }
});

/* ---------- About panel ---------- */

const infoBtn = document.getElementById("infoBtn");
const infoPanel = document.getElementById("infoPanel");

infoBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    infoPanel.classList.toggle("hidden");
});

document.addEventListener("click", (e) => {
    if (!infoPanel.classList.contains("hidden") && !infoPanel.contains(e.target) && !infoBtn.contains(e.target)) {
        infoPanel.classList.add("hidden");
    }
});

/* ---------- sidebar clicks ---------- */

chatList.addEventListener("click", (e) => {
    if (e.target.closest(".rename-input")) return;

    const renameBtn = e.target.closest(".rename-btn");
    if (renameBtn) {
        e.stopPropagation();
        startRename(renameBtn.closest(".chat-item"));
        return;
    }
    const deleteBtn = e.target.closest(".delete-btn");
    if (deleteBtn) {
        e.stopPropagation();
        const id = deleteBtn.dataset.id;
        fetch(`/api/conversations/${id}`, { method: "DELETE" }).then(() => {
            deleteBtn.closest(".chat-item").remove();
            if (activeConversationId === id) showWelcomeScreen();
        });
        return;
    }
    const item = e.target.closest(".chat-item");
    if (item) {
        if (isSending) abortController?.abort();
        loadConversation(item.dataset.id);
        closeSidebar();
    }
});

questionInput.focus();
