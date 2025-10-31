// /api/chat.js  (Vercel Serverless Function, ESM)
// Requires: OPENAI_API_KEY in your Vercel Project → Settings → Environment Variables

const MODEL = "gpt-4o-mini";

// --- Simple CORS helper (lets you test from anywhere/local) ---
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY on server." });
    }

    // Expect: { messages: [{role, content}, ...], kbContext?: string }
    const body = req.body || {};
    const clientMsgs = Array.isArray(body.messages) ? body.messages : [];
    const kbContext = typeof body.kbContext === "string" ? body.kbContext.trim() : "";

    // Build final messages for OpenAI
    const messages = [
      {
        role: "system",
        content:
          "You are a helpful Vietnamese history tutor for K-12 students. " +
          "Answer clearly, step-by-step when useful. If the user asks for flashcards/quiz, produce them. " +
          "Keep answers safe and age-appropriate.",
      },
      ...(kbContext ? [{ role: "system", content: `Context:\n${kbContext}` }] : []),
      ...clientMsgs,
    ];

    // Call OpenAI Chat Completions
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.7,
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      return res
        .status(500)
        .json({ error: `OpenAI error: ${r.status}`, details: errText.slice(0, 2000) });
    }

    const data = await r.json();
    const content =
      data?.choices?.[0]?.message?.content?.toString() || "(no content from model)";

    return res.status(200).json({ content });
  } catch (e) {
    console.error("API /api/chat error:", e);
    return res.status(500).json({ error: "Server error", details: String(e).slice(0, 2000) });
  }
}
