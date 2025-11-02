import type { IntentParse } from './types';

export function parseIntent(userText: string): IntentParse {
  const lower = (userText || '').toLowerCase();

  const m = lower.match(/bài\s*(\d+)\s*lớp\s*(\d+)/i);
  const lesson_n = m ? Number(m[1]) : null;
  const grade_n  = m ? Number(m[2]) : null;

  const intent =
    /trắc nghiệm|quiz|câu hỏi/.test(lower) ? 'make_quiz' :
    /đúng[-\s]?sai|true[-\s]?false/.test(lower) ? 'true_false' :
    /flashcard|thẻ nhớ/.test(lower) ? 'flashcards' :
    /giải thích|tóm tắt|phân tích|trình bày|soạn bài/.test(lower) ? 'explain' :
    'general';

  const topic = lower
    .replace(/bài\s*\d+/gi, '')
    .replace(/lớp\s*\d+/gi, '')
    .replace(/quiz|trắc nghiệm|đúng sai|flashcards|thẻ nhớ|giải thích|tóm tắt|phân tích|trình bày/gi, '')
    .trim();

  return { grade_n, lesson_n, intent, topic };
}
