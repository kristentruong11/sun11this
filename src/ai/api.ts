import type { StyleKnobs, ChatSmartResponse } from './types';
import { defaultStyle } from './style';
import { parseIntent } from './parseIntent';

const ENDPOINT = '/functions/v1/chat-smart'; // Supabase Edge Function path when proxied

export async function askSmart(userText: string, knobs?: Partial<StyleKnobs>): Promise<ChatSmartResponse> {
  const style = { ...defaultStyle, ...(knobs || {}) };
  const parsed = parseIntent(userText);

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_text: userText,
      style,
      parsed,
      nQuiz: 7, // you can control default counts here
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`chat-smart failed: ${res.status} ${t}`);
  }

  return res.json();
}
