/**
 * Cloudflare Worker — прокси для GitHub repository_dispatch.
 * PAT хранится в секрете Worker'а (не виден в клиентском коде).
 *
 * Клиент POST-ит на этот воркер, воркер переправляет в GitHub API.
 * CORS ограничен ALLOWED_ORIGIN (bladsvytro.github.io).
 */

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    // Разрешённые источники: Pages + localhost для разработки
    const allowed = [
      env.ALLOWED_ORIGIN,
      'http://localhost:5520',
      'http://127.0.0.1:5520',
    ];

    const corsOrigin = allowed.includes(origin) ? origin : env.ALLOWED_ORIGIN;

    const corsHeaders = {
      'Access-Control-Allow-Origin':  corsOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    // Парсим payload от клиента
    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Минимальная валидация (защита от мусора)
    const mode = payload?.mode;
    if (!mode || !['classic', 'reverse'].includes(mode)) {
      return new Response(JSON.stringify({ error: 'Invalid mode' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!env.GH_TOKEN) {
      return new Response(JSON.stringify({ error: 'Worker secret GH_TOKEN not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Вызываем GitHub repository_dispatch
    const ghRes = await fetch(
      `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Accept':               'application/vnd.github+json',
          'Authorization':        `Bearer ${env.GH_TOKEN}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type':         'application/json',
          'User-Agent':           'ttt-game-proxy/1.0',
        },
        body: JSON.stringify({
          event_type:     'game-result',
          client_payload: payload,
        }),
      }
    );

    // 204 = успех у GitHub
    if (ghRes.status === 204 || ghRes.ok) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const errText = await ghRes.text();
    return new Response(JSON.stringify({ error: errText }), {
      status: ghRes.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  },
};
