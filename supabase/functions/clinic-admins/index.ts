// 병원 관리자(직원) 계정 관리 — list / create / delete.
// 보안: 호출자의 JWT로 본인 확인 → clinic_admins 에서 본인 병원 확인(RLS) →
//       모든 작업을 "호출자의 병원"으로만 한정. service_role 은 Edge 에 자동 주입(클라 노출 0).
// 호출: 정적 admin 에서 db.functions.invoke('clinic-admins', { body: { action, ... } })
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({ error: '인증이 필요합니다' }, 401);

    // 1) 호출자 확인 (그 사람의 토큰으로)
    const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: ures } = await asUser.auth.getUser();
    const caller = ures?.user;
    if (!caller) return json({ error: '인증이 필요합니다' }, 401);

    // 2) 호출자의 병원 (RLS: 본인 매핑만 보임)
    const { data: myMap } = await asUser.from('clinic_admins').select('clinic_id').eq('user_id', caller.id).maybeSingle();
    const clinicId = myMap?.clinic_id;
    if (!clinicId) return json({ error: '병원 관리자가 아닙니다' }, 403);

    // 3) service_role 클라이언트 (god mode — Edge 에만 존재)
    const svc = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? 'list';

    if (action === 'list') {
      const { data: rows, error } = await svc.from('clinic_admins').select('user_id').eq('clinic_id', clinicId);
      if (error) return json({ error: error.message }, 400);
      const admins: Array<{ id: string; email?: string; last_sign_in_at?: string; created_at?: string }> = [];
      for (const r of rows ?? []) {
        const { data: u } = await svc.auth.admin.getUserById(r.user_id);
        if (u?.user) admins.push({ id: u.user.id, email: u.user.email, last_sign_in_at: u.user.last_sign_in_at, created_at: u.user.created_at });
      }
      admins.sort((a, b) => ((a.created_at ?? '') < (b.created_at ?? '') ? -1 : 1));
      return json({ ok: true, admins });
    }

    if (action === 'create') {
      const email = String(body.email ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      if (!email || password.length < 8) return json({ error: '이메일과 8자 이상 비밀번호가 필요합니다' }, 400);
      const { data: created, error: cErr } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
      if (cErr || !created?.user) return json({ error: cErr?.message ?? '계정 생성 실패 (이미 있는 이메일일 수 있습니다)' }, 400);
      const { error: mErr } = await svc.from('clinic_admins').upsert({ user_id: created.user.id, clinic_id: clinicId });
      if (mErr) {
        await svc.auth.admin.deleteUser(created.user.id).catch(() => {}); // 매핑 실패 시 롤백
        return json({ error: mErr.message }, 400);
      }
      return json({ ok: true, id: created.user.id, email });
    }

    if (action === 'delete') {
      const targetId = String(body.user_id ?? '');
      if (!targetId) return json({ error: 'user_id 가 필요합니다' }, 400);
      if (targetId === caller.id) return json({ error: '본인 계정은 삭제할 수 없습니다' }, 400);
      const { data: tgt } = await svc.from('clinic_admins').select('clinic_id').eq('user_id', targetId).maybeSingle();
      if (!tgt || tgt.clinic_id !== clinicId) return json({ error: '권한이 없습니다 (다른 병원 계정)' }, 403);
      await svc.from('clinic_admins').delete().eq('user_id', targetId);
      await svc.auth.admin.deleteUser(targetId).catch(() => {});
      return json({ ok: true });
    }

    return json({ error: '알 수 없는 action' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
