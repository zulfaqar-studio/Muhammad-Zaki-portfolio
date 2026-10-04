import { useEffect, useRef, useState } from "react";
import { API_CONFIG, fetchJson } from "../lib/api";

function formatInline(text, keyPrefix) {
  const pattern = /(\*\*[^*]+\*\*)|(`[^`]+`)|(\*[^*]+\*)|(_[^_]+_)/g;
  const nodes = [];
  let lastIndex = 0;
  let match;
  let i = 0;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = keyPrefix + "-" + i++;
    if (token.startsWith("**")) nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    else nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function formatMessage(text) {
  if (!text) return null;
  const blocks = [];
  const lines = String(text).replace(/\r\n/g, "\n").split("\n");

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const heading = line.match(/^#{1,6}\s+(.*)/);
    const unordered = line.match(/^[-*•]\s+(.+)/);
    const ordered = line.match(/^\d+[.)]\s+(.+)/);
    const type = heading ? "h" : unordered ? "ul" : ordered ? "ol" : "p";
    const content = heading?.[1] || unordered?.[1] || ordered?.[1] || line;
    const previous = blocks.at(-1);

    if (previous && previous.type === type && type !== "h") previous.lines.push(content);
    else blocks.push({ type, lines: [content] });
  }

  return blocks.map((block, index) => {
    const key = "b-" + index;
    if (block.type === "h") return <p className="chat-heading" key={key}>{formatInline(block.lines[0], key)}</p>;
    if (block.type === "ul") return <ul key={key}>{block.lines.map((line, i) => <li key={i}>{formatInline(line, key + "-" + i)}</li>)}</ul>;
    if (block.type === "ol") return <ol key={key}>{block.lines.map((line, i) => <li key={i}>{formatInline(line, `\${key}-\${i}`)}</li>)}</ol>;
    return <p key={key}>{formatInline(block.lines.join(" "), key)}</p>;
  });
}

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [showNudge, setShowNudge] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Hi — I'm Borb. Ask about projects, work, skills, certificates or contact details." }
  ]);
  const inputRef = useRef(null);
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    try {
      if (window.localStorage.getItem("zaki-borb-nudge-v3.5-dismissed") === "1") return;
    } catch {
      // Continue without persistence when storage is unavailable.
    }

    const timer = window.setTimeout(() => setShowNudge(true), 2600);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (open) setShowNudge(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  async function askDeepSeek(text) {
    if (!API_CONFIG.enabled) {
      return "Borb's AI API is not configured. In development, make sure the local server is running; in production, the Vercel DeepSeek API must be configured.";
    }

    try {
      const history = messagesRef.current
        .filter((message) => message.role === "user" || message.role === "assistant")
        .slice(-8)
        .map((message) => ({
          role: message.role,
          content: String(message.text || "").slice(0, 1400)
        }));

      const result = await fetchJson("/api/chat", {
        method: "POST",
        body: { message: String(text).trim().slice(0, 1200), history },
        timeoutMs: 45_000,
        retries: 1,
        cache: "no-store"
      });

      return String(result?.answer || "").trim() || "Borb received an empty AI response. Please try again.";
    } catch (error) {
      console.warn("Borb API request failed:", error);
      if (error?.status === 429) return "Borb is temporarily busy. Please try again in a moment.";
      if (error?.name === "AbortError") return "Borb's AI response took too long. Please try again.";
      return "Borb could not reach the AI API. Please try again.";
    }
  }

  async function send() {
    const message = query.trim();
    if (!message || busy) return;

    setQuery("");
    setMessages((current) => [...current, { role: "user", text: message }]);
    setBusy(true);

    const reply = await askDeepSeek(message);
    setMessages((current) => [...current, { role: "assistant", text: reply }]);
    setBusy(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function dismissNudge() {
    setShowNudge(false);
    try {
      window.localStorage.setItem("zaki-borb-nudge-v3.5-dismissed", "1");
    } catch {
      // Dismissal still works for the current visit when storage is unavailable.
    }
  }

  function openFromNudge() {
    dismissNudge();
    setOpen(true);
  }

  return (
    <>
      {showNudge ? (
        <aside className="borb-nudge" aria-label="Borb portfolio assistant introduction">
          <button type="button" className="borb-nudge-close" onClick={dismissNudge} aria-label="Dismiss Borb introduction">×</button>
          <p className="borb-nudge-kicker">v3.5 · portfolio assistant</p>
          <strong>Hiring manager?</strong>
          <p className="borb-nudge-copy">
            Ask Borb to quickly explore Zaki's work, projects, skills, certificates and resume —
            the only server-side layer is Vercel API routing.
          </p>
          <p className="borb-nudge-rules">
            Please keep use respectful: no attacks, hacking, tampering, abuse, harassment or doxxing.
          </p>
          <button type="button" className="borb-nudge-action" onClick={openFromNudge}>Ask Borb →</button>
        </aside>
      ) : null}

      <button
        type="button"
        className="chat-launch borb-launch"
        onClick={() => setOpen(true)}
        aria-label="Open Borb portfolio assistant"
        aria-expanded={open}
      >
        <span className="borb-orb" aria-hidden="true">
          <span className="borb-eye borb-eye-left" />
          <span className="borb-eye borb-eye-right" />
          <span className="borb-mouth" />
        </span>
        <span className="borb-label"><b>Borb</b><small>Portfolio assistant</small></span>
      </button>

      {open && (
        <section className="chat-window" aria-label="Borb portfolio assistant">
          <header className="chat-header">
            <div className="borb-header-brand">
              <span className="borb-orb borb-orb-small" aria-hidden="true">
                <span className="borb-eye borb-eye-left" />
                <span className="borb-eye borb-eye-right" />
                <span className="borb-mouth" />
              </span>
              <div>
                <b>Borb</b>
                <small>
                  <span className="status-dot status-online" aria-hidden="true" />
                  {busy ? "Thinking with DeepSeek…" : "Ready · Secure Vercel API"}
                </small>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="close-chat" aria-label="Close Borb">×</button>
          </header>

          <div className="chat-log" aria-live="polite">
            {messages.map((message, index) => (
              <div className={"chat-msg " + message.role} key={message.role + "-" + index}>
                {message.role === "assistant" ? formatMessage(message.text) : message.text}
              </div>
            ))}
            {busy ? (
              <div className="chat-msg assistant">
                <span className="borb-thinking" aria-label="Borb is thinking"><span /><span /><span /></span>
              </div>
            ) : null}
          </div>

          <div className="chat-compose">
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  send();
                }
              }}
              placeholder="Ask about Zaki…"
              aria-label="Ask Borb"
              maxLength={500}
              disabled={busy}
            />
            <button type="button" onClick={send} disabled={!query.trim() || busy} aria-label="Ask Borb">→</button>
          </div>
        </section>
      )}
    </>
  );
}
