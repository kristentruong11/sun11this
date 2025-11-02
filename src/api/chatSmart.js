// src/api/chatSmart.js
const FN_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;
const ANON   = import.meta.env.VITE_SUPABASE_ANON_KEY;

export async function chatSmart(payload) {
  const res = await fetch(`${FN_URL}/chat-smart`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON}`,
      'apikey': ANON
    },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${text}`);
  return JSON.parse(text);
}
