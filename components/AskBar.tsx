"use client";

import { useState, type FormEvent } from "react";
import type { useTimber } from "./useTimber";

export default function AskBar({ timber, placeholder }: { timber: ReturnType<typeof useTimber>; placeholder: string }) {
  const [text, setText] = useState("");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    timber.ask(text);
    setText("");
  }

  return (
    <div className="askbar">
      <form className="ask" onSubmit={onSubmit}>
        <button
          type="button"
          className="mic"
          aria-label={timber.listening ? "Stop listening" : "Talk to Timber"}
          aria-pressed={timber.listening}
          onClick={timber.listen}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </button>
        <input
          aria-label="Ask Timber"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={timber.listening ? "Listening…" : placeholder}
          maxLength={300}
        />
        <button type="submit" className="send" aria-label="Send" disabled={!text.trim()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </form>
      {(timber.thinking || timber.heard) && (
        <p className="heard" role="status">
          {timber.thinking ? "Timber is thinking…" : `“${timber.heard}”`}
        </p>
      )}
    </div>
  );
}
