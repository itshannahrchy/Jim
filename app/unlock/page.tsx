"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Doodle, Hoop, LavenderFriend, MintFriend, Morris } from "@/components/Monsters";

const WELCOMED_KEY = "jim_welcomed";

export default function UnlockPage() {
  const [step, setStep] = useState<"loading" | "welcome" | "passcode">("loading");

  useEffect(() => {
    let welcomed = false;
    try {
      welcomed = localStorage.getItem(WELCOMED_KEY) === "1";
    } catch {
      /* storage blocked */
    }
    setStep(welcomed ? "passcode" : "welcome");
  }, []);

  if (step === "loading") return <main className="screen" />;
  if (step === "welcome") {
    return (
      <Welcome
        onGo={() => {
          try {
            localStorage.setItem(WELCOMED_KEY, "1");
          } catch {
            /* ignore */
          }
          setStep("passcode");
        }}
      />
    );
  }
  return <Passcode />;
}

function Welcome({ onGo }: { onGo: () => void }) {
  return (
    <main className="screen welcome">
      <Doodle kind="sparkle" color="#FFC94A" size={40} className="doodle" style={{ left: "10%", top: "10%" }} />
      <Doodle kind="plus" color="#E5533A" size={30} className="doodle" style={{ right: "14%", top: "9%" }} />
      <Doodle kind="squiggle" color="#7DDBC8" size={30} className="doodle" style={{ left: "6%", top: "18%" }} />
      <Doodle kind="ring" color="#8B6CF0" size={32} className="doodle" style={{ right: "6%", top: "25%" }} />
      <Doodle kind="sparkle" color="#8B6CF0" size={26} className="doodle" style={{ left: "6%", top: "40%" }} />
      <Doodle kind="plus" color="#7DDBC8" size={24} className="doodle" style={{ right: "10%", top: "43%" }} />

      <div className="welcome-stage">
        <div className="floor" />
        <Hoop className="hoop" />
        <Morris id="w-morris" className="morris" />
        <MintFriend id="w-mint" className="mint" />
        <LavenderFriend id="w-lav" className="lavender" />
      </div>

      <div className="welcome-copy">
        <h1>Hi, I am Morris!</h1>
        <p>
          Tell me what you did and what you ate, any time of day. I will help you reach your goals, one small win
          at a time.
        </p>
      </div>

      <div className="welcome-actions">
        <button className="pill-button" onClick={onGo}>
          Let&apos;s go
        </button>
      </div>
    </main>
  );
}

function Passcode() {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passcode: value }),
      });
      if (res.ok) {
        window.location.replace("/");
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong. Try again.");
      setValue("");
    } catch {
      setError("Couldn't connect. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen unlock">
      <Doodle kind="sparkle" color="#FFC94A" size={34} className="doodle" style={{ left: "12%", top: "14%" }} />
      <Doodle kind="ring" color="#8B6CF0" size={28} className="doodle" style={{ right: "12%", top: "20%" }} />
      <Doodle kind="plus" color="#E5533A" size={26} className="doodle" style={{ right: "18%", bottom: "18%" }} />

      <Morris id="u-morris" className="unlock-morris" />
      <h1>What&apos;s the secret word?</h1>
      <p>Enter your passphrase once and I&apos;ll remember this device.</p>

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label htmlFor="passcode" className="sr-only">
          Passphrase
        </label>
        <input
          id="passcode"
          className="text-field"
          type="password"
          autoComplete="current-password"
          autoFocus
          placeholder="Passphrase"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <p className="form-error" role="alert">
          {error}
        </p>
        <button className="pill-button" type="submit" disabled={busy || !value.trim()}>
          {busy ? "Checking…" : "Unlock"}
        </button>
      </form>
    </main>
  );
}
