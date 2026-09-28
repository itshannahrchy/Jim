"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Minimal typings for the browser's Web Speech API.
type SpeechAlt = { transcript: string };
type SpeechResult = { isFinal: boolean; 0: SpeechAlt };
type SpeechEvent = { results: ArrayLike<SpeechResult> };
type SpeechErrorEvent = { error: string };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
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

const FALLBACK_TIP = "Tip: the microphone key on your phone's keyboard works for dictation too.";

/**
 * Tap to start, tap to stop. The transcript is written into the text box
 * (never sent automatically) so mishearings can be fixed first.
 */
export function useSpeech(getText: () => string, setText: (t: string) => void) {
  const [listening, setListening] = useState(false);
  const [notice, setNotice] = useState("");
  const recRef = useRef<Recognition | null>(null);

  useEffect(() => () => recRef.current?.abort(), []);

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      setNotice(`Voice input isn't available in this browser. ${FALLBACK_TIP}`);
      return;
    }
    const base = getText().trim();
    const rec = new Ctor();
    rec.lang = navigator.language || "en-IN";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e) => {
      let finals = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0].transcript.trim();
        if (!t) continue;
        if (r.isFinal) {
          // Some Android versions repeat earlier text inside each new result.
          if (finals && t.toLowerCase().startsWith(finals.toLowerCase())) finals = t;
          else finals = finals ? `${finals} ${t}` : t;
        } else {
          interim = interim ? `${interim} ${t}` : t;
        }
      }
      const spoken = [finals, interim].filter(Boolean).join(" ");
      setText([base, spoken].filter(Boolean).join(" "));
    };

    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setNotice(`I can't use the microphone: permission was blocked. ${FALLBACK_TIP}`);
      } else if (e.error === "no-speech") {
        setNotice("I didn't hear anything. Tap the microphone and try again.");
      } else if (e.error !== "aborted") {
        setNotice(`Voice input stopped working (${e.error}). ${FALLBACK_TIP}`);
      }
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
    };

    try {
      rec.start();
      recRef.current = rec;
      setNotice("");
      setListening(true);
    } catch {
      setNotice(`Voice input couldn't start here. ${FALLBACK_TIP}`);
    }
  }, [getText, setText]);

  const toggle = useCallback(() => (recRef.current ? stop() : start()), [start, stop]);

  return { listening, notice, toggle, clearNotice: () => setNotice("") };
}
