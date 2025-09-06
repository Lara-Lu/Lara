// app/api/lara/route.ts
import { NextResponse } from "next/server";

/** Message format we send to OpenAI */
type ChatRole = "system" | "user" | "assistant";
interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** Minimal shape of OpenAI response we care about */
interface OpenAIChatResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
}

/** Narrow an unknown value to ChatMessage[] if possible */
function isChatMessages(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.every(
      (m) =>
        m &&
        typeof m === "object" &&
        "role" in m &&
        "content" in m &&
        (m as Record<string, unknown>).role !== undefined &&
        (m as Record<string, unknown>).content !== undefined
    )
  );
}

export async function POST(req: Request) {
  try {
    // Parse inbound JSON defensively (no 'any')
    let parsed: unknown = null;
    try {
      parsed = await req.json();
    } catch {
      // ignore; we'll handle below
    }

    // Accept either {message: string} or {messages: ChatMessage[]}
    const maybeObj = (parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {}) as Record<string, unknown>;

    const single =
      typeof maybeObj.message === "string" ? maybeObj.message : null;
    const history = isChatMessages(maybeObj.messages) ? maybeObj.messages : [];

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { reply: "Server misconfigured: missing OPENAI_API_KEY." },
        { status: 200 }
      );
    }

    const messages: ChatMessage[] =
      history.length > 0
        ? history
        : [
            {
              role: "system",
              content:
                "You are Lara, a concise, low-cost productivity companion.",
            },
            { role: "user", content: single ?? "Say hi briefly." },
          ];

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.5,
        messages,
      }),
    });

    const raw = await r.text();

    if (!r.ok) {
      return NextResponse.json(
        { reply: `OpenAI error ${r.status}: ${raw || "no body"}` },
        { status: 200 }
      );
    }

    // Parse upstream JSON defensively
    let data: OpenAIChatResponse | null = null;
    try {
      data = JSON.parse(raw) as OpenAIChatResponse;
    } catch {
      return NextResponse.json(
        { reply: `Upstream returned non-JSON: ${raw || "empty body"}` },
        { status: 200 }
      );
    }

    const reply =
      data?.choices?.[0]?.message?.content?.trim() ??
      "No reply was returned from the model.";

    return NextResponse.json({ reply }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ reply: `Server error: ${msg}` }, { status: 200 });
  }
}
