"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";

type Msg = { id: number; role: "user" | "assistant"; content: string };

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: 1, role: "assistant", content: "Hey! I’m Lara. What should we tackle first?" },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Register service worker once
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  // auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // autoscroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  async function send(e?: FormEvent) {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const nextId = msgs.length ? Math.max(...msgs.map((m) => m.id)) + 1 : 1;
    const outgoing: Msg = { id: nextId, role: "user", content: text };
    setMsgs((prev) => [...prev, outgoing]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/lara", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Keep server payload minimal; no summary to avoid extra hooks
        body: JSON.stringify({
          messages: [
            { role: "system", content: "You are Lara, a concise, low-cost productivity companion." },
            ...msgs.map(({ role, content }) => ({ role, content })),
            { role: "user", content: text },
          ],
        }),
      });

      const data: { reply?: string } = await res.json();
      const reply = data.reply ?? "Hmm, I didn’t get a reply. Try again?";
      const incoming: Msg = { id: nextId + 1, role: "assistant", content: reply };
      setMsgs((prev) => [...prev, incoming]);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? `Error: ${err.message}` : "Unknown error occurred.";
      const incoming: Msg = { id: nextId + 1, role: "assistant", content: msg };
      setMsgs((prev) => [...prev, incoming]);
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
    <main className="flex min-h-screen flex-col bg-neutral-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between">
          <div className="space-y-0.5">
            <h1 className="text-xl font-semibold">Lara</h1>
            <p className="text-xs text-neutral-400">
              Peace of mind for less than your morning coffee.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-emerald-400">Install-ready PWA ✅</span>
            <button
              onClick={() => signOut(auth)}
              className="text-xs border border-white/40 rounded px-2 py-1 hover:bg-white/10"
              title="Sign out"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Chat area */}
      <section className="mx-auto max-w-3xl px-4 py-6 w-full">
        <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 shadow-xl">
          <div className="h-[60vh] overflow-y-auto p-4 space-y-3 bg-white rounded-t-2xl">
            {msgs.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    m.role === "user" ? "bg-blue-200 text-black" : "bg-neutral-300 text-black"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl px-3 py-2 text-sm bg-neutral-300 text-black">
                  <span className="animate-pulse">Lara is typing…</span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Composer */}
          <form onSubmit={send} className="p-3 border-t border-white/20 bg-neutral-900 rounded-b-2xl">
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-xl bg-white text-black placeholder-neutral-500 px-3 py-2 outline-none"
                placeholder="Tell Lara what to do…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending}
                className="rounded-xl px-4 py-2 bg-white text-black font-medium hover:bg-neutral-100 active:scale-[0.99] disabled:opacity-60"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
