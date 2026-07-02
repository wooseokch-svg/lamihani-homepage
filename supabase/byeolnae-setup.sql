-- =====================================================================
-- 별내S치과 등록 + 슈퍼 관리자(마스터 계정) 전환
-- ---------------------------------------------------------------------
-- ⚠️ 실행 전: Supabase > Authentication > Users > "Add user" 로
--    wooseok.ch@gmail.com 계정을 먼저 만들어 두세요 (이메일+비밀번호).
-- 그 다음 이 파일 전체를 Supabase > SQL Editor 에 붙여넣고 Run (한 번만).
-- 기존 라미한의원(lamiadmin) 은 그대로 유지되며 깨지지 않습니다.
-- =====================================================================

-- ── 1) 별내 두 진료 진료시간(clinic_settings) 등록 ──
--    본원: 화 야간 21:00 + 저녁휴게 18:30-19:00, 목 진료 / 주니어: 목 휴무
insert into public.clinic_settings (id, clinic_id, hours, slot_minutes) values
((select coalesce(max(id),0)+1 from public.clinic_settings), 'byeolnae_dental',
 '{"0":{"closed":true},
   "1":{"closed":false,"open":"09:30","close":"18:30","lunchStart":"13:00","lunchEnd":"14:00"},
   "2":{"closed":false,"open":"09:30","close":"21:00","lunchStart":"13:00","lunchEnd":"14:00","breaks":[{"start":"18:30","end":"19:00"}]},
   "3":{"closed":false,"open":"09:30","close":"18:30","lunchStart":"13:00","lunchEnd":"14:00"},
   "4":{"closed":false,"open":"09:30","close":"18:30","lunchStart":"13:00","lunchEnd":"14:00"},
   "5":{"closed":false,"open":"09:30","close":"18:30","lunchStart":"13:00","lunchEnd":"14:00"},
   "6":{"closed":false,"open":"09:30","close":"14:00"}}'::jsonb, 30),
((select coalesce(max(id),0)+2 from public.clinic_settings), 'byeolnae_junior',
 '{"0":{"closed":true},
   "1":{"closed":false,"open":"09:30","close":"18:30","lunchStart":"13:00","lunchEnd":"14:00"},
   "2":{"closed":false,"open":"09:30","close":"18:30","lunchStart":"13:00","lunchEnd":"14:00"},
   "3":{"closed":false,"open":"09:30","close":"18:30","lunchStart":"13:00","lunchEnd":"14:00"},
   "4":{"closed":true},
   "5":{"closed":false,"open":"09:30","close":"18:30","lunchStart":"13:00","lunchEnd":"14:00"},
   "6":{"closed":false,"open":"09:30","close":"14:00"}}'::jsonb, 30)
on conflict (clinic_id) do update set hours = excluded.hours, slot_minutes = excluded.slot_minutes;

-- id 시퀀스 동기화 (serial 인 경우 — 이후 삽입 충돌 방지)
do $$
declare s text := pg_get_serial_sequence('public.clinic_settings','id');
begin
  if s is not null then perform setval(s, (select max(id) from public.clinic_settings)); end if;
end $$;

-- ── 2) clinic_admins: "1계정 = 여러 병원" (다대다) 로 변경 ──
alter table public.clinic_admins drop constraint if exists clinic_admins_pkey;
alter table public.clinic_admins add constraint clinic_admins_pkey primary key (user_id, clinic_id);

-- ── 3) 권한 함수 (여러 병원 지원) ──
-- 내가 관리하는 병원인가?  (RLS 에서 사용)
create or replace function public.is_my_clinic(cid text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clinic_admins where user_id = auth.uid() and clinic_id = cid);
$$;
grant execute on function public.is_my_clinic(text) to authenticated;

-- 내가 관리하는 병원 목록  (admin 병원 선택 드롭다운용)
create or replace function public.auth_clinics()
returns setof text language sql stable security definer set search_path = public as $$
  select clinic_id from public.clinic_admins where user_id = auth.uid() order by clinic_id;
$$;
grant execute on function public.auth_clinics() to authenticated;

-- ── 4) RLS 재설정: 단일 병원(auth_clinic) → 여러 병원(is_my_clinic) ──
drop policy if exists "notices write" on public.notices;
create policy "notices write" on public.notices for all to authenticated
  using (public.is_my_clinic(clinic_id)) with check (public.is_my_clinic(clinic_id));

drop policy if exists "settings write" on public.clinic_settings;
create policy "settings write" on public.clinic_settings for all to authenticated
  using (public.is_my_clinic(clinic_id)) with check (public.is_my_clinic(clinic_id));

drop policy if exists "reservations select" on public.reservations;
drop policy if exists "reservations modify" on public.reservations;
drop policy if exists "reservations delete" on public.reservations;
create policy "reservations select" on public.reservations for select
  to authenticated using (public.is_my_clinic(clinic_id));
create policy "reservations modify" on public.reservations for update
  to authenticated using (public.is_my_clinic(clinic_id)) with check (public.is_my_clinic(clinic_id));
create policy "reservations delete" on public.reservations for delete
  to authenticated using (public.is_my_clinic(clinic_id));

-- ── 5) 마스터 계정 wooseok.ch@gmail.com → 전 병원 매핑 ──
--    (라미한의원 기존 관리자 lamiadmin 매핑은 그대로 유지)
insert into public.clinic_admins(user_id, clinic_id)
select u.id, c.cid
from auth.users u
cross join (values ('lamihani'), ('byeolnae_dental'), ('byeolnae_junior')) as c(cid)
where u.email = 'wooseok.ch@gmail.com'
on conflict (user_id, clinic_id) do nothing;

-- 확인:  select * from public.clinic_admins order by user_id;
