-- =====================================================================
-- 예약 캘린더용 추가 스키마 (clinic_settings + 슬롯 조회 함수)
-- ---------------------------------------------------------------------
-- 사용법: Supabase > SQL Editor 에 붙여넣고 Run.
-- (기존 schema.sql 을 이미 실행한 프로젝트에 이어서 적용)
-- =====================================================================

-- ---------- 영업시간 / 휴원 / 공휴일 설정 (단일 행) ----------
create table if not exists public.clinic_settings (
  id           int primary key default 1,
  hours        jsonb not null,            -- 요일별(0=일 ~ 6=토) 영업시간
  slot_minutes int  not null default 30,  -- 예약 간격(분)
  holidays     jsonb not null default '[]'::jsonb,  -- 휴원/공휴일 ['YYYY-MM-DD', ...]
  updated_at   timestamptz not null default now(),
  constraint clinic_settings_single check (id = 1)
);

-- 기본값 1행 (실제 운영시간)
--   월~금 10:00-17:30 / 점심 13:00-14:00 / 접수마감 12:20·16:50, 토 10:00-14:00 접수마감 13:20, 일 휴무
insert into public.clinic_settings (id, hours, slot_minutes, holidays)
values (
  1,
  '{
    "0": {"closed": true},
    "1": {"closed": false, "open": "10:00", "close": "17:30", "lunchStart": "13:00", "lunchEnd": "14:00", "acceptLunch": "12:20", "acceptClose": "16:50"},
    "2": {"closed": false, "open": "10:00", "close": "17:30", "lunchStart": "13:00", "lunchEnd": "14:00", "acceptLunch": "12:20", "acceptClose": "16:50"},
    "3": {"closed": false, "open": "10:00", "close": "17:30", "lunchStart": "13:00", "lunchEnd": "14:00", "acceptLunch": "12:20", "acceptClose": "16:50"},
    "4": {"closed": false, "open": "10:00", "close": "17:30", "lunchStart": "13:00", "lunchEnd": "14:00", "acceptLunch": "12:20", "acceptClose": "16:50"},
    "5": {"closed": false, "open": "10:00", "close": "17:30", "lunchStart": "13:00", "lunchEnd": "14:00", "acceptLunch": "12:20", "acceptClose": "16:50"},
    "6": {"closed": false, "open": "10:00", "close": "14:00", "acceptClose": "13:20"}
  }'::jsonb,
  30,
  '[]'::jsonb
)
on conflict (id) do nothing;

alter table public.clinic_settings enable row level security;

-- 설정은 누구나 읽기(환자 화면에서 영업시간 필요) / 관리자만 수정
drop policy if exists "settings read"  on public.clinic_settings;
drop policy if exists "settings write" on public.clinic_settings;
create policy "settings read"  on public.clinic_settings for select using (true);
create policy "settings write" on public.clinic_settings for all
  to authenticated using (true) with check (true);

-- ---------- 특정 날짜의 '예약된 시간'만 반환 (개인정보 제외) ----------
-- 환자 화면에서 예약 가능/마감 시간을 계산하기 위해 사용.
-- 이름/연락처 등은 노출하지 않고 시간 문자열만 돌려줍니다.
create or replace function public.taken_slots(d date)
returns table(t text)
language sql
security definer
set search_path = public
as $$
  select desired_time
  from public.reservations
  where desired_date = d
    and status <> '취소'
    and desired_time is not null;
$$;

grant execute on function public.taken_slots(date) to anon, authenticated;
