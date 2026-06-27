-- =====================================================================
-- 예진표 + 예약을 reservations 테이블 1곳으로 통합
-- ---------------------------------------------------------------------
-- Supabase > SQL Editor 에 붙여넣고 Run (한 번만 실행).
-- =====================================================================

-- reservations 에 예진표용 컬럼 추가
alter table public.reservations add column if not exists birth      date;
alter table public.reservations add column if not exists gender     text;
alter table public.reservations add column if not exists concerns   jsonb;
alter table public.reservations add column if not exists details    jsonb;
alter table public.reservations add column if not exists meds       text;
alter table public.reservations add column if not exists pregnancy  text;
alter table public.reservations add column if not exists message    text;
alter table public.reservations add column if not exists agreed     boolean default false;
alter table public.reservations add column if not exists kind       text default '예약';  -- 예약 / 예진표

-- 기존 예진표(intakes) 데이터를 reservations 로 이전
insert into public.reservations
  (name, phone, visit_type, desired_date, desired_time,
   birth, gender, concerns, details, meds, pregnancy, message, agreed,
   kind, source, status, created_at)
select
  name, phone, visit_type, desired_date, desired_time,
  birth, gender, concerns, details, meds, pregnancy, message, agreed,
  '예진표', '홈페이지',
  case when status = '신규' then '신규' else '예약확정' end,
  created_at
from public.intakes;

-- 상태값 정규화 (신규 / 예약확정 / 취소)
update public.reservations set status = '예약확정' where status in ('확정', '완료', '확인');

-- 통합 완료 → intakes 테이블 제거
drop table if exists public.intakes;
