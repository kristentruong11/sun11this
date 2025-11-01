// supabase/functions/chat/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// CORS (during dev you can leave "*"; later lock to https://lich-su.org and http://localhost:5173)
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Helpers
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function bad(msg: string, status = 400) {
  return json({ error: msg }, status);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) return bad("OPENAI_API_KEY is not set on the server", 500);

    const { messages, prompt, kbContext, grade, lesson, query } = await req.json();

    const userText =
      prompt ??
      (Array.isArray(messages) && messages.length
        ? messages[messages.length - 1]?.content ?? ""
        : "");

    const finalPrompt = [
      "Bạn là trợ giảng Lịch sử Việt Nam: giải thích rõ ràng, ngắn gọn, đúng trọng tâm cho học sinh.",
      "Nếu có ngữ cảnh bài học (KB) thì ưu tiên dùng; nếu không có, trả lời chung và gợi ý chọn bài/lớp.",
      kbContext ? `--- KB CONTEXT START ---\n${kbContext}\n--- KB CONTEXT END ---` : "",
      grade ? `Lớp: ${grade}` : "",
      lesson ? `Bài: ${lesson}` : "",
      query ? `Yêu cầu cụ thể: ${query}` : "",
      `Câu hỏi của học sinh: ${userText}`,
    ]
      .filter(Boolean)
      .join("\n");

    // Call OpenAI Chat Completions via fetch (no SDK import needed)
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [{ role: "user", content: finalPrompt }],
      }),
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      return bad(`OpenAI error ${resp.status}: ${t}`, 502);
    }

    const data = await resp.json();
    const content =
      data?.choices?.[0]?.message?.content?.trim() ||
      "Xin lỗi, mình chưa có đủ dữ liệu để trả lời.";

    return json({ content });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("chat fn error:", msg);
    return bad(msg, 500);
  }
});
