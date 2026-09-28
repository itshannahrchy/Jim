"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Doodle, MintFriend, Morris } from "./Monsters";
import { useSpeech } from "./useSpeech";
import TodayCard, { type Today } from "./TodayCard";
import DaySheet from "./DaySheet";

type Message = { id: number | string; role: "user" | "assistant" | "error"; content: string };

const COLLAPSE_KEY = "jim_today_collapsed";

export async function api(path: string, init: RequestInit = {}) {
  let tz = "";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    /* ignore */
  }
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", "x-jim-tz": tz, ...(init.headers ?? {}) },
  });
  if (res.status === 401) {
    window.location.replace("/unlock");
    throw new Error("locked");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? "Request failed"), { data });
  return data;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [today, setToday] = useState<Today | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [sheet, setSheet] = useState<"workout" | "food" | null>(null);
  const [weekday, setWeekday] = useState("");

  const textRef = useRef(text);
  textRef.current = text;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const speech = useSpeech(
    useCallback(() => textRef.current, []),
    useCallback((t: string) => setText(t), []),
  );

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const data = await api("/api/messages");
      setMessages(data.messages);
      setToday(data.today);
    } catch (e) {
      if ((e as Error).message !== "locked") setLoadError("I couldn't load our chat. Check your connection and tap to retry.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    setWeekday(new Date().toLocaleDateString("en-GB", { weekday: "long" }));
    try {
      setCollapsed(sessionStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* ignore */
    }
    load();
    // Refresh "today" when the app comes back to the foreground (e.g. next morning).
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setWeekday(new Date().toLocaleDateString("en-GB", { weekday: "long" }));
        api("/api/today").then(setToday).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, sending]);

  // Grow the text box with its content.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, 140)}px`;
  }, [text]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        sessionStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  }

  async function send() {
    const message = text.trim();
    if (!message || sending) return;
    if (speech.listening) speech.toggle();
    speech.clearNotice();
    const tempId = `tmp-${Date.now()}`;
    setMessages((m) => [...m.filter((x) => x.role !== "error"), { id: tempId, role: "user", content: message }]);
    setText("");
    setSending(true);
    try {
      const data = await api("/api/chat", { method: "POST", body: JSON.stringify({ message }) });
      setMessages((m) => [...m.map((x) => (x.id === tempId ? data.userMessage : x)), data.reply]);
      if (data.today) setToday(data.today);
    } catch (e) {
      const err = e as Error;
      if (err.message === "locked") return;
      setMessages((m) => [
        ...m,
        { id: `err-${Date.now()}`, role: "error", content: `Oops! ${err.message}` },
      ]);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  async function deleteEntry(type: "workout" | "food", id: number) {
    const data = await api("/api/today", { method: "DELETE", body: JSON.stringify({ type, id }) });
    setToday(data);
  }

  return (
    <main className="screen home">
      <div className="home-top">
        <Doodle kind="sparkle" color="#FFC94A" size={30} className="doodle" style={{ right: 58, top: -8 }} />
        <Doodle kind="plus" color="#E5533A" size={26} className="doodle" style={{ right: 26, top: 76 }} />

        <header className="header">
          <Morris id="h-morris" className="header-avatar" title="Morris" />
          <h1>Jim</h1>
          <span className="day-pill">{weekday}</span>
        </header>

        {today && (
          <TodayCard
            today={today}
            collapsed={collapsed}
            onToggle={toggleCollapsed}
            onOpen={setSheet}
            peek={<MintFriend id="peek-mint" className="today-peek" />}
          />
        )}
      </div>

      <section className="chat" aria-live="polite" aria-label="Chat with Morris">
        <Doodle kind="ring" color="#8B6CF0" size={30} className="doodle" style={{ left: 4, top: 120 }} />
        {!loaded && (
          <div className="loading-center">
            <Morris id="load-morris" />
          </div>
        )}
        {loadError && (
          <button className="msg assistant" onClick={load} style={{ background: "none", border: "none", padding: 0, textAlign: "left" }}>
            <Morris id="m-av" className="msg-avatar" />
            <div className="bubble">{loadError}</div>
          </button>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="msg user">
              <div className="bubble">{m.content}</div>
            </div>
          ) : (
            <div key={m.id} className={`msg assistant${m.role === "error" ? " error" : ""}`}>
              <Morris id="m-av" className="msg-avatar" />
              <div className="bubble">{m.content}</div>
            </div>
          ),
        )}
        {sending && (
          <div className="msg assistant">
            <Morris id="m-av" className="msg-avatar" />
            <div className="bubble" aria-label="Morris is typing">
              <span className="typing">
                <i />
                <i />
                <i />
              </span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </section>

      <div className="composer">
        {(speech.listening || speech.notice) && (
          <p className={`voice-note${speech.listening ? " listening" : ""}`} role="status">
            {speech.listening ? "Listening… tap the microphone to stop." : speech.notice}
          </p>
        )}
        <div className="composer-row">
          <div className="input-wrap">
            <label htmlFor="message" className="sr-only">
              Message Morris
            </label>
            <textarea
              id="message"
              ref={inputRef}
              rows={1}
              placeholder="Message Morris"
              value={text}
              enterKeyHint="send"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
            />
            {text.trim() && (
              <button className="send" onClick={send} disabled={sending} aria-label="Send">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
          <button
            className={`mic${speech.listening ? " listening" : ""}`}
            onClick={speech.toggle}
            aria-label={speech.listening ? "Stop listening" : "Speak to Morris"}
            aria-pressed={speech.listening}
          >
            {speech.listening ? (
              <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
                <rect x="6" y="6" width="12" height="12" rx="3" fill="currentColor" />
              </svg>
            ) : (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="8.5" y="2.5" width="7" height="12" rx="3.5" stroke="currentColor" strokeWidth="2.2" />
                <path d="M5 11.5a7 7 0 0 0 14 0M12 18.5V22" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {sheet && today && (
        <DaySheet type={sheet} today={today} onClose={() => setSheet(null)} onDelete={deleteEntry} />
      )}
    </main>
  );
}
