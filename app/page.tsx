"use client";

import { useEffect, useRef, useState, FormEvent } from "react";

// Firebase
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";

// ---- Types ----
type ChatRole = "system" | "user" | "assistant";

type ChatMsg = {
  role: ChatRole;
  content: string;
  createdAt?: unknown; // Firestore timestamp (we don't need to manipulate it client-side)
  uid?: string;
};

// ---- UI Component ----
export default function Page() {
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    {
      role: "system",
      content:
        "You are Lara, a concise, low-cost productivity companion.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [uid, setUid] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Scroll to last message when msgs change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  // Track auth state → know which user's history to load/save
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  // Load chat history for this user (if any)
  useEffect(() => {
    async function loadHistory() {
      if (!uid) {
        // no user → keep default system prompt only
        setLoadingHistory(false);
        return;
      }
      setLoadingHistory(true);
      try {
        const col = collection(db, "users", uid, "messages");
        const q = query(col, orderBy("createdAt", "asc"));
        const snap = await getDocs(q);
        const items: ChatMsg[] = [];
        snap.forEach((d) => {
          const data = d.data() as ChatMsg;
          if (data?.role && data?.content) {
            items.push({ role: data.role, content: data.content, createdAt: data.createdAt });
          }
        });

        if (items.length) {
          setMsgs(items);
        } else {
          // seed with system prompt if brand new
          setMsgs([
            {
              role: "system",
              content:
                "You are Lara, a concise, low-cost productivity companion.",
            },
          ]);
        }
      } finally {
        setLoadingHistory(false);
      }
    }

    void loadHistory();
  }, [uid]);

  // Persist a single message
  async function saveMessage(m: ChatMsg) {
    if (!uid) return; // only persist for signed-in users
    const col = collection(db, "users", uid, "messages");
    await addDoc(col, { ...m, createdAt: serverTimestamp(), uid });
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    // optimistic user message
    setInput("");
    const userMsg: ChatMsg = { role: "user", content: text };
    setMsgs((prev) => [...prev, userMsg]);
    void saveMessage(userMsg);

    setSending(true);
    try {
      // Keep context lightweight (system + last ~20 turns)
      const context = trimContext([...msgs, userMsg], 20);

      const res = await fetch("/api/lara", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: context }),
      });

      const raw = await res.text();
      let data: { reply?: string } = {};
      try {
        data = JSON.parse(raw);
      } catch {
        data = { reply: raw || "Server returned empty response." };
      }

      const reply =
        (data.reply ?? "").trim() ||
        "Hmm, I didn’t get a reply. Try again in a moment.";

      const botMsg: ChatMsg = { role: "assistant", content: reply };
      setMsgs((prev) => [...prev, botMsg]);
      void saveMessage(botMsg);
    } catch (err) {
      const botMsg: ChatMsg = {
        role: "assistant",
        content:
          err instanceof Error
            ? `Error: ${err.message}`
            : "Error: Something went wrong.",
      };
      setMsgs((prev) => [...prev, botMsg]);
      void saveMessage(botMsg);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-[100dvh] w-full flex flex-col items-center py-6">
      <div className="w-full max-w-4xl rounded-2xl bg-zinc-900/40 border border-zinc-800 shadow-xl p-4 sm:p-6 flex flex-col gap-4">
        <div className="text-sm text-zinc-400">
          {loadingHistory
            ? "Loading your history…"
            : "Hey! I’m Lara. What should we tackle first?"}
        </div>

        {/* Messages */}
        <div className="flex-1 min-h-[50vh] max-h-[65vh] overflow-y-auto rounded-xl bg-zinc-950/60 p-4 space-y-3">
          {msgs
            // never show raw system prompt bubble
            .filter((m) => m.role !== "system")
            .map((m, i) => {
              const me = m.role === "user";
              return (
                <div
                  key={i}
                  className={`w-full flex ${me ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm leading-6 ${
                      me
                        ? "bg-blue-500/25 border border-blue-400/30 text-blue-50"
                        : "bg-zinc-800/70 border border-zinc-700 text-zinc-100"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              );
            })}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <form
          onSubmit={send}
          className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-2"
        >
          <input
            className="flex-1 bg-transparent outline-none px-3 py-2 text-zinc-100 placeholder:text-zinc-500"
            placeholder="Tell Lara what to do…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={sending}
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="rounded-xl bg-white/95 text-black px-4 py-2 text-sm font-medium hover:bg-white disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </form>
      </div>
    </main>
  );
}

// Keep system prompt + last N exchanges to control token use
function trimContext(all: ChatMsg[], maxTurns: number): ChatMsg[] {
  const sys = all.find((m) => m.role === "system");
  const rest = all.filter((m) => m.role !== "system");
  // each "turn" is user+assistant pair; simple slice on last 2*maxTurns messages
  const kept = rest.slice(-2 * maxTurns);
  return sys ? [sys, ...kept] : kept;
}
