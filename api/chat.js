// api/chat.js  (SERVERLESS BACKEND on Vercel)
import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages, kbContext } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages[] required" });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system =
      (process.env.SYSTEM_PROMPT ||
        "You are a helpful assistant for a Vietnamese history app.") +
      (kbContext ? `\n---\nKB:\n${kbContext}\n---` : "");

    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [{ role: "system", content: system }, ...messages],
    });

    const text = resp.choices?.[0]?.message?.content ?? "";
    return res.status(200).json({ content: text });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error", detail: String(err) });
  }
}
