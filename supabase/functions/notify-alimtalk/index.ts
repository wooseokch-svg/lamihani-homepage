// =====================================================================
// 예약/예진표 접수 시 관리자에게 카카오 알림톡 발송 (Supabase Edge Function)
// ---------------------------------------------------------------------
// 트리거: Database Webhook (reservations / intakes 테이블 INSERT)
// 발송:   Solapi(https://solapi.com) 카카오 알림톡 API
//
// 필요한 환경변수 (Supabase > Edge Functions > Secrets):
//   SOLAPI_API_KEY        솔라피 API Key
//   SOLAPI_API_SECRET     솔라피 API Secret
//   ALIMTALK_PFID         카카오 비즈니스 채널 발신프로필 ID(pfId)
//   ALIMTALK_TEMPLATE_ID  사전 승인된 알림톡 템플릿 ID
//   ADMIN_PHONE           알림 받을 관리자 휴대폰번호 (예: 01012345678)
//   SENDER_PHONE          솔라피에 등록된 발신번호
//
// 템플릿 변수(예시): #{종류}, #{이름}, #{연락처}, #{희망}
//   예) "[라미한의원] 새 #{종류} 접수\n이름: #{이름}\n연락처: #{연락처}\n희망: #{희망}"
// =====================================================================

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomSalt(len = 32): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, len);
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const table: string = payload.table || "";
    const r = payload.record || {};

    const API_KEY = Deno.env.get("SOLAPI_API_KEY");
    const API_SECRET = Deno.env.get("SOLAPI_API_SECRET");
    const PFID = Deno.env.get("ALIMTALK_PFID");
    const TEMPLATE_ID = Deno.env.get("ALIMTALK_TEMPLATE_ID");
    const ADMIN_PHONE = Deno.env.get("ADMIN_PHONE");
    const SENDER_PHONE = Deno.env.get("SENDER_PHONE");

    if (!API_KEY || !API_SECRET || !PFID || !TEMPLATE_ID || !ADMIN_PHONE || !SENDER_PHONE) {
      // 설정이 아직 안 됐어도 웹훅이 실패로 재시도되지 않도록 200 반환
      return new Response(JSON.stringify({ skipped: "missing env" }), { status: 200 });
    }

    const kind = table === "reservations" ? "예약" : "예진표";
    const hope = [r.desired_date, r.desired_time].filter(Boolean).join(" ") || "-";

    const variables: Record<string, string> = {
      "#{종류}": kind,
      "#{이름}": String(r.name || "-"),
      "#{연락처}": String(r.phone || "-"),
      "#{희망}": hope,
    };

    const date = new Date().toISOString();
    const salt = randomSalt();
    const signature = await hmacSha256Hex(date + salt, API_SECRET);
    const auth = `HMAC-SHA256 apiKey=${API_KEY}, date=${date}, salt=${salt}, signature=${signature}`;

    const body = {
      message: {
        to: ADMIN_PHONE,
        from: SENDER_PHONE,
        kakaoOptions: {
          pfId: PFID,
          templateId: TEMPLATE_ID,
          variables,
          disableSms: false, // 알림톡 실패 시 SMS 대체발송 허용
        },
      },
    };

    const resp = await fetch("https://api.solapi.com/messages/v4/send", {
      method: "POST",
      headers: { "Authorization": auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const result = await resp.json();
    return new Response(JSON.stringify({ ok: resp.ok, result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 200 });
  }
});
