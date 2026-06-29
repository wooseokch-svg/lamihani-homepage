// =====================================================================
// NoAD 결제·작업요청 핸드오버 토큰 발급 (Supabase Edge Function)
// ---------------------------------------------------------------------
// 병원 admin(로그인 상태) → 이 함수 호출 → noad.ai.kr 로 갈 서명 URL 을 받음.
//
// 보안 핵심: clinic_id 는 "클라이언트 입력"이 아니라 로그인 사용자의
//   clinic_admins 매핑(RLS)에서 서버가 직접 읽는다. → 남의 병원 토큰 발급 불가.
//
// 토큰 형식(noad src/lib/clinicToken.ts 와 동일):
//   base64url(JSON(payload)) + "." + base64url(HMAC_SHA256(body, CLINIC_HANDOVER_SECRET))
//   payload = { clinicId, clinicName, plan?, interval?, returnUrl?, exp }
//
// 필요한 시크릿 (Supabase > Edge Functions > Secrets):
//   CLINIC_HANDOVER_SECRET   noad EC2 .env 와 "완전히 동일"한 값이어야 함
//   (SUPABASE_URL / SUPABASE_ANON_KEY 는 플랫폼이 자동 주입)
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const NOAD_BASE = 'https://noad.ai.kr';
const TOKEN_TTL_SEC = 10 * 60; // 10분 (핸드오버 직후 결제까지 충분)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const enc = new TextEncoder();

function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function signToken(payload: Record<string, unknown>, secret: string): Promise<string> {
  // body = base64url(UTF-8(JSON)) — noad 의 Buffer.from(json).toString('base64url') 와 동일
  const body = bytesToB64url(enc.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
  return `${body}.${bytesToB64url(mac)}`;
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

const VALID_PLANS = new Set(['BASIC', 'STANDARD', 'PRO']);
const VALID_INTERVALS = new Set(['MONTHLY', 'YEARLY']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST 만 허용됩니다.' }, 405);

  try {
    const SECRET = Deno.env.get('CLINIC_HANDOVER_SECRET');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const ANON = Deno.env.get('SUPABASE_ANON_KEY');
    if (!SECRET) return json({ error: '서버 설정 오류(CLINIC_HANDOVER_SECRET 미설정).' }, 500);
    if (!SUPABASE_URL || !ANON) return json({ error: '서버 설정 오류(Supabase 환경변수).' }, 500);

    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader) return json({ error: '로그인이 필요합니다.' }, 401);

    // 로그인 사용자 권한으로 동작 → RLS(clinic_admins self) 로 본인 병원만 조회됨.
    const supa = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: row, error: qErr } = await supa
      .from('clinic_admins')
      .select('clinic_id')
      .limit(1)
      .maybeSingle();
    if (qErr) return json({ error: '권한 확인 실패: ' + qErr.message }, 403);
    if (!row?.clinic_id) return json({ error: '병원 관리자 매핑이 없습니다.' }, 403);
    const clinicId: string = row.clinic_id;

    const reqBody = await req.json().catch(() => ({} as Record<string, unknown>));
    const target =
      reqBody.target === 'work'
        ? 'work-requests'
        : reqBody.target === 'messaging'
          ? 'clinic-messaging'
          : 'billing';
    const clinicName =
      typeof reqBody.clinicName === 'string' && reqBody.clinicName.trim()
        ? reqBody.clinicName.trim()
        : clinicId;

    const payload: Record<string, unknown> = {
      clinicId,
      clinicName,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC,
    };
    if (typeof reqBody.plan === 'string' && VALID_PLANS.has(reqBody.plan)) payload.plan = reqBody.plan;
    if (typeof reqBody.interval === 'string' && VALID_INTERVALS.has(reqBody.interval)) {
      payload.interval = reqBody.interval;
    }
    if (typeof reqBody.returnUrl === 'string' && /^https?:\/\//.test(reqBody.returnUrl)) {
      payload.returnUrl = reqBody.returnUrl;
    }

    const token = await signToken(payload, SECRET);
    const url = `${NOAD_BASE}/${target}?token=${encodeURIComponent(token)}`;
    return json({ url });
  } catch (e) {
    return json({ error: '토큰 발급 중 오류: ' + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});
