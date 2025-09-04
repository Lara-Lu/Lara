import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: NextRequest) {
  const { messages, summary } = await req.json();
  const system = `You are Lara, a concise, low-cost productivity companion. Use this running summary for context:\n${summary ?? ""}`;

  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: system }, ...(messages ?? [])],
    max_tokens: 400,
  });

  const reply = resp.choices[0]?.message?.content ?? "";
  return NextResponse.json({ reply });
}
