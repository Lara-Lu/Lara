// app/api/lara/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    let payload: any = {};
    try {
      payload = await req.json();
    } catch {
      // no body
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { reply: "Server misconfigured: missing OPENAI_API_KEY." },
        { status: 200 }
      );
    }

    // Accept either a single message or an array of messages
    const single = typeof payload?.message === "string" ? payload.message : null;
    const history = Array.isArray(payload?.messages) ? payload.messages : [];

    const messages =
      history.length > 0
        ? history
        : [
            { role: "system", content: "You are Lara, a concise, low-cost productivity companion." },
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
      // Return upstream error as readable text
      return NextResponse.json(
        { reply: `OpenAI error ${r.status}: ${raw || "no body"}` },
        { status: 200 }
      );
    }

    // Be tolerant to upstream non-JSON (rare, but defensive)
    let data: any;
    try {
      data = JSON.parse(raw);
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
