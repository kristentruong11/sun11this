const cors = {
  'Access-Control-Allow-Origin': '*', // later lock to https://lich-su.org
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method === 'GET')     return new Response('chat-smart ok', { headers: cors });

  try {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

    // Safe JSON parse
    let body: any;
    try { body = await req.json(); }
    catch { return new Response('Bad JSON body', { status: 400, headers: cors }); }

    // ... your real logic (OpenAI embed -> kb_search_smart -> chat) ...

    return new Response(JSON.stringify({ completion: '...answer...' }), {
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  } catch (e) {
    console.error('chat-smart fatal error:', e);
    return new Response(`chat-smart error: ${String(e)}`, { status: 500, headers: cors });
  }
});
