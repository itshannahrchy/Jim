"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Minimal typings for the browser's Web Speech API.
type SpeechAlt = { transcript: string; confidence: number };
type SpeechResult = { isFinal: boolean; length: number; [i: number]: SpeechAlt };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type SpeechErrorEvent = { error: string };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Indian English recognises Indian food words and accents far better than en-US.
const SPEECH_LANG = "en-IN";
// Stop on our own after this much silence (in listening sessions with no words).
const MAX_SILENT_SESSIONS = 3;
const FALLBACK_TIP = "Tip: the microphone key on your phone's keyboard works for dictation too.";

const join = (...parts: string[]) => parts.map((p) => p.trim()).filter(Boolean).join(" ");

/**
 * Tap to start, tap to stop. The browser ends a recognition session after a
 * short pause (especially on Android), so we quietly start a new one until
 * she taps stop, keeping everything heard so far. The transcript goes into the
 * text box, never sent automatically, so mishearings can be fixed first.
 */
export function useSpeech(getText: () => string, setText: (t: string) => void) {
  const [listening, setListening] = useState(false);
  const [notice, setNotice] = useState("");

  const active = useRef(false);
  const rec = useRef<Recognition | null>(null);
  const base = useRef(""); // text already in the box when she tapped the mic
  const committed = useRef(""); // words from earlier sessions in this recording
  const sessionFinal = useRef("");
  const silentSessions = useRef(0);
  const discard = useRef(false); // set when the message was sent mid-recording

  useEffect(
    () => () => {
      active.current = false;
      rec.current?.abort();
    },
    [],
  );

  const finish = useCallback((message = "") => {
    active.current = false;
    rec.current = null;
    setListening(false);
    if (message) setNotice(message);
  }, []);

  const runSession = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor || !active.current) return;
    const isAndroid = /android/i.test(navigator.userAgent);
    const r = new Ctor();
    r.lang = SPEECH_LANG;
    // Android's continuous mode repeats words; short sessions + restarts are cleaner there.
    r.continuous = !isAndroid;
    r.interimResults = true;
    r.maxAlternatives = 1;
    sessionFinal.current = "";

    r.onresult = (e) => {
      if (discard.current) return;
      let finals = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        const t = res[0]?.transcript.trim() ?? "";
        if (!t) continue;
        if (res.isFinal) {
          // Some Android versions repeat earlier text inside each new result.
          if (finals && t.toLowerCase().startsWith(finals.toLowerCase())) finals = t;
          else finals = join(finals, t);
        } else {
          interim = join(interim, t);
        }
      }
      sessionFinal.current = finals;
      if (finals || interim) silentSessions.current = 0;
      setText(join(base.current, committed.current, finals, interim));
    };

    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        finish(`I can't use the microphone: permission was blocked. Allow it in your browser's site settings. ${FALLBACK_TIP}`);
      } else if (e.error === "audio-capture") {
        finish(`No microphone was found. ${FALLBACK_TIP}`);
      } else if (e.error === "network") {
        finish(`Voice input needs an internet connection. ${FALLBACK_TIP}`);
      }
      // "no-speech", "aborted" and others: onend decides whether to carry on.
    };

    r.onend = () => {
      if (discard.current) return finish();
      committed.current = join(committed.current, sessionFinal.current);
      setText(join(base.current, committed.current));
      if (!active.current) return finish();
      if (!sessionFinal.current) silentSessions.current += 1;
      if (silentSessions.current >= MAX_SILENT_SESSIONS) {
        return finish(committed.current ? "" : "I didn't hear anything. Tap the microphone and try again.");
      }
      // Keep listening: start the next session.
      window.setTimeout(() => {
        if (!active.current) return finish();
        try {
          runSession();
        } catch {
          finish();
        }
      }, 120);
    };

    rec.current = r;
    r.start();
  }, [finish, setText]);

  const start = useCallback(() => {
    if (!getCtor()) {
      setNotice(`Voice input isn't available in this browser. ${FALLBACK_TIP}`);
      return;
    }
    base.current = getText().trim();
    committed.current = "";
    silentSessions.current = 0;
    discard.current = false;
    active.current = true;
    setNotice("");
    setListening(true);
    try {
      runSession();
    } catch {
      finish(`Voice input couldn't start here. ${FALLBACK_TIP}`);
    }
  }, [finish, getText, runSession]);

  const stop = useCallback(() => {
    active.current = false;
    setListening(false);
    rec.current?.stop();
  }, []);

  /** Stop and throw away anything still arriving (used when the message is sent). */
  const cancel = useCallback(() => {
    discard.current = true;
    active.current = false;
    setListening(false);
    rec.current?.abort();
  }, []);

  const toggle = useCallback(() => (active.current ? stop() : start()), [start, stop]);

  return { listening, notice, toggle, cancel, clearNotice: () => setNotice("") };
}
