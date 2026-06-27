-- =====================================================================
-- 멀티테넌트 전환: 하나의 Supabase로 여러 병원(clinic_id) 운영
-- ---------------------------------------------------------------------
-- Supabase > SQL Editor 에 붙여넣고 Run (한 번만).
-- 기존 데이터는 모두 'lamihani' 소속으로 이전됩니다.
-- =====================================================================

-- 1) clinic_id 컬럼 추가
alter table public.notices         add column if not exists clinic_id text;
alter table public.reservations    add column if not exists clinic_id text;
alter table public.clinic_settings add column if not exists clinic_id text;

update public.notices         set clinic_id = 'lamihani' where clinic_id is null;
update public.reservations    set clinic_id = 'lamihani' where clinic_id is null;
update public.clinic_settings set clinic_id = 'lamihani' where clinic_id is null;

-- 2) clinic_settings: 병원당 1행 (clinic_id 기준)
alter table public.clinic_settings drop constraint if exists clinic_settings_single;
alter table public.clinic_settings alter column clinic_id set not null;
create unique index if not exists clinic_settings_clinic_uniq on public.clinic_settings(clinic_id);

create index if not exists idx_notices_clinic      on public.notices(clinic_id);
create index if not exists idx_reservations_clinic on public.reservations(clinic_id, desired_date);

-- 3) 관리자 ↔ 병원 매핑
create table if not exists public.clinic_admins (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  clinic_id text not null
);
alter table public.clinic_admins enable row level security;
drop policy if exists "clinic_admins self" on public.clinic_admins;
create policy "clinic_admins self" on public.clinic_admins
  for select to authenticated using (user_id = auth.uid());

-- 현재 로그인한 관리자의 병원 id 반환
create or replace function public.auth_clinic()
returns text language sql stable security definer set search_path = public as $$
  select clinic_id from public.clinic_admins where user_id = auth.uid();
$$;

-- 기존 관리자(lamiadmin)를 lamihani 병원에 매핑
insert into public.clinic_admins(user_id, clinic_id)
select id, 'lamihani' from auth.users where email = 'lamiadmin@gmail.co.kr'
on conflict (user_id) do update set clinic_id = excluded.clinic_id;

-- 4) RLS 재설정 (관리자는 자기 병원만)
-- 공지
drop policy if exists "notices read"  on public.notices;
drop policy if exists "notices write" on public.notices;
create policy "notices read"  on public.notices for select using (true);
create policy "notices write" on public.notices for all to authenticated
  using (clinic_id = public.auth_clinic()) with check (clinic_id = public.auth_clinic());

-- 운영시간 설정
drop policy if exists "settings read"  on public.clinic_settings;
drop policy if exists "settings write" on public.clinic_settings;
create policy "settings read"  on public.clinic_settings for select using (true);
create policy "settings write" on public.clinic_settings for all to authenticated
  using (clinic_id = public.auth_clinic()) with check (clinic_id = public.auth_clinic());

-- 예약/예진표
drop policy if exists "reservations insert" on public.reservations;
drop policy if exists "reservations manage" on public.reservations;
drop policy if exists "reservations select" on public.reservations;
drop policy if exists "reservations modify" on public.reservations;
drop policy if exists "reservations delete" on public.reservations;
create policy "reservations insert" on public.reservations for insert
  to anon, authenticated with check (clinic_id is not null);
create policy "reservations select" on public.reservations for select
  to authenticated using (clinic_id = public.auth_clinic());
create policy "reservations modify" on public.reservations for update
  to authenticated using (clinic_id = public.auth_clinic()) with check (clinic_id = public.auth_clinic());
create policy "reservations delete" on public.reservations for delete
  to authenticated using (clinic_id = public.auth_clinic());

-- 5) 슬롯 조회 함수: clinic_id 인자 추가
drop function if exists public.taken_slots(date);
create or replace function public.taken_slots(d date, cid text)
returns table(t text) language sql security definer set search_path = public as $$
  select desired_time from public.reservations
  where desired_date = d and clinic_id = cid and status <> '취소' and desired_time is not null;
$$;
grant execute on function public.taken_slots(date, text) to anon, authenticated;
