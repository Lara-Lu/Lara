"use client";

import React, { useEffect, useRef, useState } from "react";
import { auth, db } from "@/lib/firebase";
import {
  onAuthStateChanged,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

type ChatRole = "user" | "assistant" | "system";
type ChatMessage = {
  role: ChatRole;
  content: string;
  ts?: number;
};

const THREAD_ID = "default";

export default function Page() {
  // Auth & profile
  const [user, setUser] = useState<User | null>(null);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Google Calendar access token (client-side)
  const [gToken, setGToken] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  // ---------------------------
  // Auth wiring
  // ---------------------------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        await loadUserHistory(u.uid);
      } else {
        setMessages([]);
      }
    });
    return () => unsub();
  }, []);

  // ---------------------------
  // Load & save chat history
  // ---------------------------
  async function loadUserHistory(uid: string) {
    setLoadingHistory(true);
    try {
      const ref = doc(db, "users", uid, "threads", THREAD_ID);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        const msgs = (data.messages ?? []) as ChatMessage[];
        setMessages(msgs);
      } else {
        // Create a starter doc
        await setDoc(ref, {
          messages: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setMessages([]);
      }
    } catch (e) {
      console.error("loadUserHistory error:", e);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function saveUserHistory(uid: string, msgs: ChatMessage[]) {
    try {
      const ref = doc(db, "users", uid, "threads", THREAD_ID);
      await updateDoc(ref, {
        messages: msgs,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      // If updateDoc fails because doc doesn't exist, setDoc instead
      const ref = doc(db, "users", uid, "threads", THREAD_ID);
      await setDoc(
        ref,
        {
          messages: msgs,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  }

  // ---------------------------
  // Chat sending
  // ---------------------------
  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;
    const newUserMsg: ChatMessage = {
      role: "user",
      content: text,
      ts: Date.now(),
    };

    const newMsgs = [...messages, newUserMsg];
    setMessages(newMsgs);
    setInput("");
    scrollToBottom();

    if (user) {
      // Save user draft immediately
      saveUserHistory(user.uid, newMsgs).catch(console.error);
    }

    setSending(true);
    try {
      const res = await fetch("/api/lara", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only send what we need
        body: JSON.stringify({
          messages: newMsgs.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("API error:", errText);
        const failMsg: ChatMessage = {
          role: "assistant",
          content: "Sorry—something went wrong reaching my brain.",
          ts: Date.now(),
        };
        const withFail = [...newMsgs, failMsg];
        setMessages(withFail);
        if (user) saveUserHistory(user.uid, withFail).catch(console.error);
        return;
      }

      const data = await res.json();
      const assistantText: string =
        data?.assistant ?? data?.text ?? "Okay! (No content returned.)";
      const botMsg: ChatMessage = {
        role: "assistant",
        content: assistantText,
        ts: Date.now(),
      };
      const next = [...newMsgs, botMsg];
      setMessages(next);
      if (user) saveUserHistory(user.uid, next).catch(console.error);
    } catch (e) {
      console.error(e);
      const failMsg: ChatMessage = {
        role: "assistant",
        content: "Network hiccup—try again?",
        ts: Date.now(),
      };
      const withFail = [...newMsgs, failMsg];
      setMessages(withFail);
      if (user) saveUserHistory(user.uid, withFail).catch(console.error);
    } finally {
      setSending(false);
      scrollToBottom();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }

  // ---------------------------
  // Google Calendar connect
  // ---------------------------
  async function connectGoogle() {
    if (!user) return;
    try {
      const provider = new GoogleAuthProvider();
      // Ask specifically for Calendar scope
      provider.addScope("https://www.googleapis.com/auth/calendar");
      const result = await signInWithPopup(auth, provider);
      const cred = GoogleAuthProvider.credentialFromResult(result);
      // cred?.accessToken is Google's token (not Firebase custom token)
      // It may be null in some flows; in that case you'd exchange server-side.
      const tok = (cred as any)?.accessToken ?? null;
      setGToken(tok);
      console.log("Google Calendar connected. accessToken:", tok);
    } catch (e) {
      console.error("connectGoogle error:", e);
      alert("Google authorization failed. Check console for details.");
    }
  }

  async function doSignOut() {
    try {
      await signOut(auth);
      setGToken(null);
      setMessages([]);
    } catch (e) {
      console.error(e);
    }
  }

  // ---------------------------
  // Render
  // ---------------------------
  return (
    <div className="min-h-dvh w-full bg-black text-white flex items-start justify-center p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-zinc-900 border border-white/10 shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="text-sm text-zinc-400">
              {loadingHistory
                ? "Loading your history…"
                : "Hey! I’m Lara. What should we tackle first?"}
            </div>

            <div className="flex items-center gap-2">
              {/* Build tag to verify latest deploy */}
              <span className="text-[10px] text-zinc-500 border border-zinc-700 px-2 py-0.5 rounded-md">
                build: {process.env.NEXT_PUBLIC_BUILD ?? "dev"}
              </span>

              {/* Auth controls */}
              {!user ? (
                <a
                  href="/login"
                  className="rounded-lg border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10"
                >
                  Sign in
                </a>
              ) : (
                <button
                  onClick={doSignOut}
                  className="rounded-lg border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10"
                >
                  Sign out
                </button>
              )}

              {/* Calendar connect (always visible; disabled until signed-in) */}
              <button
                onClick={connectGoogle}
                disabled={!user}
                className="rounded-lg border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-50"
                title={
                  !user
                    ? "Sign in first to connect Google"
                    : "Connect your Google Calendar"
                }
              >
                {!user
                  ? "Log in to connect"
                  : gToken
                  ? "Google Connected ✅"
                  : "Connect Google Calendar"}
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="h-[60vh] overflow-y-auto px-4 py-3 space-y-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                m.role === "user"
                  ? "ml-auto bg-blue-900/50 border border-blue-600/30"
                  : "mr-auto bg-zinc-800/60 border border-white/10"
              }`}
            >
              {m.content}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div className="border-t border-white/10 p-3">
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-xl bg-zinc-800 border border-white/10 px-3 py-2 text-sm outline-none focus:border-white/20"
              placeholder="Tell Lara what to do…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={sending}
            />
            <button
              onClick={sendMessage}
              disabled={sending || !input.trim()}
              className="rounded-xl bg-white/10 border border-white/20 px-4 text-sm hover:bg-white/20 disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
