// deno deploy target (Supabase Edge Functions)
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import OpenAI from "npm:openai"; // use npm: spec via deno.json import map
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type StyleKnobs = { passion: 0|1|2|3; depth: 1|2|3; level: 'primary'|'middle'|'highschool'|'college' };
type Parsed = {
  grade_n: number | null;
  lesson_n: number | null;
  intent: 'make_quiz'|'true_false'|'flashcards'|'explain'|'general';
  topic: string;
};

interface Payload {
  user_text: string;
  style: StyleKnobs;
  parsed: Parsed;
  nQuiz?: number;
}

const SYSTEM_PROMPT = `
You are “Trợ lí môn Lịch Sử”, a warm, expert Vietnamese K-12 history assistant who can also answer general questions accurately.

Goals:
1) Be factually correct, structured, and engaging; write with energy (no fluff), include concrete facts/dates/names.
2) Prefer the supplied KnowledgeBase context if present. If context is thin, say so and proceed with best-known facts.
3) Match the user’s intent: explain, make quizzes, flashcards, or true/false; always add 2–3 smart follow-ups at the end.
4) Cite sources only if asked or when you drew on outside knowledge clearly beyond the provided context.
5) Guardrails: decline 18+/harm/illegal topics politely; keep conversations respectful.
6) Language: default Vietnamese; switch to English if user uses English.

Answer policy:
- High-confidence KB: synthesize succinctly from context; avoid hallucination.
- Low-confidence KB: be transparent; give a crisp, reliable answer using general knowledge; avoid over-claiming.
- Keep paragraphs compact; prefer lists for dense info.
`.trim();

Deno.serve(async (req) => {
  try {
    const { user_text, style, parsed, nQuiz = 5 } = await req.json() as Payload;

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE')!; // service key to query securely

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    // 1) Embed the user query
    const e = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: user_text.slice(0, 8000),
    });
    const qVec = e.data[0].embedding;

    // 2) Retrieve KB with vector + filters
    const { grade_n, lesson_n } = parsed;
    const { data: rows, error } = await supabase.rpc('kb_search_smart', {
      query_vec: qVec,
      in_grade_n: grade_n,
      in_lesson_n: lesson_n,
      limit_k: 10
    });

    if (error) console.error('kb_search_smart error', error);

    const kb = Array.isArray(rows) ? rows : [];
    const context = kb.map((r) => r.content).join('\n---\n');
    const topScores = kb.map((r) => r.score as number);
    const best = topScores[0] ?? 0;
    const confident = best >= 0.78;
    const usedKb = kb.length > 0;

    // 3) Build user prompt
    const userPrompt = `
[USER QUESTION]
${user_text}

[INTENT]
${parsed.intent}

[STYLE]
passion=${style.passion} depth=${style.depth} level=${style.level}

[RETRIEVED CONTEXT]
${context || '(no KB context found)'}

[INSTRUCTIONS]
1) Use the context above as primary truth when available. If missing, state that briefly and proceed carefully.
2) If intent = make_quiz: produce ${nQuiz} multiple-choice questions with 4 options (A–D), mark the correct answer line “Đáp án:”, add 1 hint line per question.
3) If intent = true_false: produce ${nQuiz} statements with answers (Đúng/Sai) and 1-line justification.
4) If intent = flashcards: produce ${nQuiz} Q↔A pairs, each under 40 words, focusing on names, dates, causes, outcomes.
5) Always offer 2–3 follow-up suggestions tailored to the topic and the user’s last step.
`.trim();

    // 4) Chat completion (allow general knowledge if KB weak)
    const chat = await openai.chat.completions.create({
      model: "gpt-4o-mini", // cost-effective, good reasoning; change to your preferred model
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 900,
    });

    const completion = chat.choices[0]?.message?.content ?? "(no output)";

    return new Response(JSON.stringify({
      completion,
      confident,
      usedKb,
      topScores,
    }), { headers: { "Content-Type": "application/json" }});

  } catch (err) {
    console.error(err);
    return new Response(`chat-smart error: ${String(err)}`, { status: 500 });
  }
});
