"use client";
import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

type Msg = { role: "user" | "assistant"; content: string };

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [summary, setSummary] = useState("");
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  // Register service worker once
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  // auth state
  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), []);

  // autoscroll on new messages
  useEffect(() => {
    scroller.current?.scrollTo({
      top: scroller.current.scrollHeight,
      behavior: "smooth",
    });
  }, [msgs]);

  // ensure profile + load summary
  async function ensureProfile() {
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { createdAt: serverTimestamp(), summary: "" });
    } else {
      setSummary(snap.data()?.summary ?? "");
    }
  }
  useEffect(() => {
    if (user) ensureProfile();
  }, [user]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    const newMsgs = [...msgs, { role: "user", content: text } as Msg];
    setMsgs(newMsgs);
    setInput("");

    try {
      const res = await fetch("/api/lara", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMsgs, summary }),
      });
      const { reply } = await res.json();
      const next = [...newMsgs, { role: "assistant", content: reply } as Msg];
      setMsgs(next);

      // persist last exchange
      await addDoc(collection(db, "users", user.uid, "messages"), {
        msgs: next.slice(-2),
        ts: serverTimestamp(),
      });

      // cheap running summary every 6 turns
      if (next.length % 6 === 0) {
        const sres = await fetch("/api/lara", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              {
                role: "system",
                content:
                  "Summarize the conversation so far in <=10 bullets focused on user preferences and tasks.",
              },
              {
                role: "user",
                content: next.map((m) => `${m.role}: ${m.content}`).join("\n"),
              },
            ],
          }),
        });
        const { reply: sum } = await sres.json();
        setSummary(sum);
        await setDoc(doc(db, "users", user.uid), { summary: sum }, { merge: true });
      }
    } finally {
      setSending(false);
    }
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Lara</h1>
          <p className="text-neutral-400">
            Please <a className="underline" href="/login">log in</a> to continue.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between">
          <div className="space-y-0.5">
            <h1 className="text-xl font-semibold">Lara</h1>
            <p className="text-xs text-neutral-400">
              Peace of mind for less than your morning coffee.
            </p>
          </div>
          <div className="text-xs text-emerald-400">Summary tokens saved ✅</div>
        </div>
      </header>

      {/* Chat card */}
      <section className="mx-auto max-w-3xl px-4 py-6">
        <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 shadow-xl">
          {/* Messages */}
          <div
            ref={scroller}
            className="h-[60vh] overflow-y-auto p-4 space-y-3 bg-white rounded-t-2xl"
          >
            {msgs.length === 0 && (
              <div className="text-neutral-500 text-sm">Say hello to start.</div>
            )}

            {msgs.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-blue-200 text-black"
                      : "bg-neutral-300 text-black"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {/* FIXED: no broken className */}
            {sending && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl px-3 py-2 text-sm bg-neutral-300 text-black">
                  <span className="animate-pulse">Lara is typing…</span>
                </div>
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="p-3 border-t border-white/20 bg-neutral-900 rounded-b-2xl">
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-xl bg-white text-black placeholder-neutral-500 px-3 py-2 outline-none"
                placeholder="Tell Lara what to do…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                disabled={sending}
              />
              <button
                onClick={send}
                disabled={sending}
                className="rounded-xl px-4 py-2 bg-white text-black font-medium hover:bg-neutral-100 active:scale-[0.99] disabled:opacity-60"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
