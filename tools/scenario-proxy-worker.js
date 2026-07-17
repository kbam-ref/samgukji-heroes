// Cloudflare Worker — Scenario API 중간 서버 (출시 후 런타임 생성이 필요해질 때 사용)
//
// 왜 필요한가: 클라이언트(웹/앱)에 API 키를 넣으면 누구나 추출할 수 있다.
// 이 워커가 키를 서버 쪽 비밀로 보관하고, 게임은 이 워커에게만 요청한다.
//
// 배포 방법:
//   1) npm i -g wrangler && wrangler login
//   2) wrangler deploy tools/scenario-proxy-worker.js --name samgukji-art
//   3) 키를 비밀로 등록 (코드/저장소에 남지 않음):
//        wrangler secret put SCENARIO_API_KEY
//        wrangler secret put SCENARIO_API_SECRET
//   4) 게임에서 https://samgukji-art.<계정>.workers.dev/generate 로 POST
//
// 지금 파이프라인(개발 시 생성 → 정적 에셋 포함)에서는 이 워커가 필요 없다.

const ALLOWED_ORIGINS = [
  'https://localhost',
  // 배포 후 실제 게임 주소를 여기에 추가:
  // 'https://<계정>.github.io',
];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/generate') {
      return new Response('사용법: POST /generate { heroId, prompt }', { status: 404, headers: cors });
    }

    // 간단한 남용 방지 — 요청 크기 제한
    const body = await request.json().catch(() => null);
    if (!body || typeof body.prompt !== 'string' || body.prompt.length > 600) {
      return new Response(JSON.stringify({ error: '잘못된 요청' }), { status: 400, headers: cors });
    }

    const auth = 'Basic ' + btoa(`${env.SCENARIO_API_KEY}:${env.SCENARIO_API_SECRET}`);
    const upstream = await fetch(`https://api.cloud.scenario.com/v1/models/${env.SCENARIO_MODEL_ID}/inferences`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parameters: {
          type: 'txt2img',
          prompt: body.prompt,
          numSamples: 1,
          width: 512,
          height: 768,
        },
      }),
    });

    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  },
};
