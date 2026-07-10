// Vanilla JS client. No build step, no framework — see plans/web-interface-extension.md.

const messagesEl = document.getElementById("messages");
const connStatusEl = document.getElementById("conn-status");
const modelBadgeEl = document.getElementById("model-badge");
const bannerEl = document.getElementById("banner");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send-btn");
const abortBtn = document.getElementById("abort-btn");

// --- Token handling -------------------------------------------------------

const params = new URLSearchParams(location.search);
const urlToken = params.get("token");
if (urlToken) localStorage.setItem("pi-web-viewer-token", urlToken);
const token = urlToken || localStorage.getItem("pi-web-viewer-token") || "";

// --- Small render helpers --------------------------------------------------

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function isNearBottom() {
  return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 120;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c) => c && c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

// Agent output is untrusted-ish (it can echo fetched web pages, file contents, etc.), so
// markdown is parsed then run through DOMPurify before ever touching innerHTML.
marked.setOptions({ gfm: true, breaks: true });
const markedRenderer = new marked.Renderer();
markedRenderer.link = (href, title, text) =>
  `<a href="${href}" target="_blank" rel="noopener noreferrer"${title ? ` title="${title}"` : ""}>${text}</a>`;

function renderMarkdown(text) {
  return DOMPurify.sanitize(marked.parse(text, { renderer: markedRenderer }));
}

function appendBubble(role, text) {
  const stick = isNearBottom();
  const bubble = el("div", `msg ${role}`);
  if (role === "assistant") {
    bubble.classList.add("markdown-body");
    bubble.innerHTML = renderMarkdown(text);
  } else bubble.textContent = text;
  messagesEl.appendChild(bubble);
  if (stick) scrollToBottom();
  return bubble;
}

function appendSystem(text) {
  return appendBubble("system", text);
}

function clearMessages() {
  messagesEl.innerHTML = "";
  toolChips.clear();
  streamingBubble = null;
  streamingThinking = null;
}

// --- Tool chip rendering ----------------------------------------------------

const toolChips = new Map(); // toolCallId -> { chip, statusEl, pre }

function formatToolBody(toolName, args, result, details) {
  if (toolName === "edit" && details && typeof details.patch === "string") return details.patch;
  if (result) {
    const text = textOf(result.content);
    if (text) return text;
  }
  return JSON.stringify(args ?? {}, null, 2);
}

function createToolChip(toolCallId, toolName, args) {
  const stick = isNearBottom();
  const chip = el("details", "tool-chip");
  const summary = el("summary");
  summary.appendChild(el("span", null, toolName));
  const status = el("span", "tool-status", "running");
  summary.appendChild(status);
  chip.appendChild(summary);
  const pre = el("pre", null, JSON.stringify(args ?? {}, null, 2));
  chip.appendChild(pre);
  messagesEl.appendChild(chip);
  toolChips.set(toolCallId, { chip, statusEl: status, pre, toolName, args });
  if (stick) scrollToBottom();
  return { chip, statusEl: status, pre, toolName, args };
}

function getOrCreateToolChip(toolCallId, toolName, args) {
  return toolChips.get(toolCallId) ?? createToolChip(toolCallId, toolName, args);
}

function updateToolChip(toolCallId, toolName, args, partialResult) {
  const entry = getOrCreateToolChip(toolCallId, toolName, args);
  entry.pre.textContent = formatToolBody(toolName, args, partialResult, partialResult?.details);
}

function finalizeToolChip(toolCallId, toolName, args, result, isError) {
  const entry = getOrCreateToolChip(toolCallId, toolName, args);
  entry.statusEl.textContent = isError ? "error" : "done";
  entry.statusEl.classList.toggle("error", !!isError);
  entry.pre.textContent = formatToolBody(toolName, args, result, result?.details);
}

// --- Thinking chip rendering -------------------------------------------------

function thinkingOf(content) {
  if (!Array.isArray(content)) return "";
  return content
    .filter((c) => c && c.type === "thinking")
    .map((c) => c.thinking)
    .join("\n");
}

function createThinkingChip() {
  const stick = isNearBottom();
  const chip = el("details", "tool-chip thinking-chip");
  const summary = el("summary");
  summary.appendChild(el("span", null, "Thinking"));
  chip.appendChild(summary);
  const body = el("div", "thinking-body markdown-body");
  chip.appendChild(body);
  messagesEl.appendChild(chip);
  if (stick) scrollToBottom();
  return { chip, body };
}

// --- Streaming assistant bubble --------------------------------------------

let streamingBubble = null;
let streamingThinking = null;

function setStreamingThinking(message) {
  const text = thinkingOf(message.content);
  if (!text) return;
  if (!streamingThinking) streamingThinking = createThinkingChip();
  streamingThinking.body.innerHTML = renderMarkdown(text);
  if (isNearBottom()) scrollToBottom();
}

function setStreamingText(message) {
  const text = textOf((message.content || []).filter((c) => c.type === "text"));
  if (!streamingBubble) streamingBubble = appendBubble("assistant", text);
  else streamingBubble.innerHTML = renderMarkdown(text);
  if (isNearBottom()) scrollToBottom();
}

// --- Hydration ---------------------------------------------------------

function renderHydrate(entries) {
  clearMessages();

  const resultsByCallId = new Map();
  for (const entry of entries) {
    if (entry.type === "message" && entry.message.role === "toolResult") {
      resultsByCallId.set(entry.message.toolCallId, entry.message);
    }
  }

  for (const entry of entries) {
    if (entry.type === "message") {
      const msg = entry.message;
      if (msg.role === "user") {
        const text = textOf(msg.content);
        if (text) appendBubble("user", text);
      } else if (msg.role === "assistant") {
        let textBuf = [];
        const flush = () => {
          if (textBuf.length) appendBubble("assistant", textBuf.join(""));
          textBuf = [];
        };
        for (const item of msg.content || []) {
          if (item.type === "text") {
            textBuf.push(item.text);
          } else if (item.type === "thinking") {
            flush();
            createThinkingChip().body.innerHTML = renderMarkdown(item.thinking);
          } else if (item.type === "toolCall") {
            flush();
            const result = resultsByCallId.get(item.id);
            createToolChip(item.id, item.name, item.arguments);
            if (result) {
              finalizeToolChip(item.id, item.name, item.arguments, result, result.isError);
            }
          }
        }
        flush();
      } else if (msg.role === "bashExecution") {
        createToolChip(entry.id, "bash", { command: msg.command });
        finalizeToolChip(entry.id, "bash", { command: msg.command }, { content: [{ type: "text", text: msg.output }] }, msg.exitCode !== 0);
      } else if (msg.role === "custom" && msg.display) {
        const text = textOf(msg.content);
        if (text) appendSystem(text);
      }
    } else if (entry.type === "branch_summary") {
      appendSystem(`— branch summary — ${entry.summary}`);
    } else if (entry.type === "compaction") {
      appendSystem("— context compacted —");
    }
  }

  scrollToBottom();
}

// --- State / connection UI --------------------------------------------------

let lastState = null;

function renderState(state) {
  lastState = state;
  if (state.model) {
    modelBadgeEl.hidden = false;
    modelBadgeEl.textContent = state.thinkingLevel && state.thinkingLevel !== "off" ? `${state.model.name} · ${state.thinkingLevel}` : state.model.name;
  }
  updateComposerHint();
}

function updateComposerHint() {
  if (!lastState) return;
  abortBtn.hidden = !lastState.isStreaming;
  if (lastState.isStreaming) {
    sendBtn.textContent = "Steer";
  } else if (lastState.hasPendingMessages) {
    sendBtn.textContent = "Queue";
  } else {
    sendBtn.textContent = "Send";
  }
}

function setConnStatus(text, cls) {
  connStatusEl.textContent = text;
  connStatusEl.className = `pill ${cls || ""}`.trim();
}

function showBanner(text) {
  if (!text) {
    bannerEl.hidden = true;
    return;
  }
  bannerEl.hidden = false;
  bannerEl.textContent = text;
}

// --- WebSocket ---------------------------------------------------------

let ws = null;
let reconnectDelay = 1000;
let sawOpen = false;

function connect() {
  setConnStatus("connecting…");
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}/ws?token=${encodeURIComponent(token)}`);

  ws.addEventListener("open", () => {
    sawOpen = true;
    reconnectDelay = 1000;
    setConnStatus("connected");
    showBanner("");
  });

  ws.addEventListener("message", (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    handleServerEvent(msg);
  });

  ws.addEventListener("close", () => {
    setConnStatus("disconnected", "disconnected");
    if (!sawOpen) {
      showBanner("Couldn't connect. Check the token in the URL (see /web-viewer-url in the TUI).");
    } else {
      showBanner("Reconnecting…");
    }
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 10000);
  });

  ws.addEventListener("error", () => {
    ws.close();
  });
}

function handleServerEvent(evt) {
  switch (evt.type) {
    case "hydrate":
      renderHydrate(evt.entries);
      renderState(evt.state);
      break;
    case "state":
      renderState(evt);
      break;
    case "message_start":
      if (evt.message.role === "assistant") {
        streamingBubble = null;
        streamingThinking = null;
      }
      break;
    case "message_update":
      if (evt.message.role === "assistant") {
        setStreamingThinking(evt.message);
        setStreamingText(evt.message);
      }
      break;
    case "message_end":
      // message_start/message_end only fire for user, assistant, and toolResult roles.
      // toolResult is skipped here since tool_execution_end already renders it (with pairing).
      if (evt.message.role === "assistant") {
        setStreamingThinking(evt.message);
        setStreamingText(evt.message);
        streamingBubble = null;
        streamingThinking = null;
      } else if (evt.message.role === "user") {
        const text = textOf(evt.message.content);
        if (text) appendBubble("user", text);
      }
      break;
    case "tool_execution_start":
      createToolChip(evt.toolCallId, evt.toolName, evt.args);
      break;
    case "tool_execution_update":
      updateToolChip(evt.toolCallId, evt.toolName, evt.args, evt.partialResult);
      break;
    case "tool_execution_end":
      finalizeToolChip(evt.toolCallId, evt.toolName, undefined, evt.result, evt.isError);
      break;
    case "session_compact":
      appendSystem("— context compacted —");
      break;
    default:
      break;
  }
}

// --- Composer ------------------------------------------------------------

function autoGrow() {
  inputEl.style.height = "auto";
  inputEl.style.height = `${Math.min(inputEl.scrollHeight, 140)}px`;
}

function send() {
  const text = inputEl.value.trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "prompt", message: text }));
  inputEl.value = "";
  autoGrow();
}

sendBtn.addEventListener("click", send);
inputEl.addEventListener("input", autoGrow);
inputEl.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && !ev.shiftKey) {
    ev.preventDefault();
    send();
  }
});
abortBtn.addEventListener("click", () => {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "abort" }));
});

connect();
