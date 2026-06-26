-- =====================================================================
-- 라미한의원 홈페이지 백엔드 스키마 (Supabase / PostgreSQL)
-- ---------------------------------------------------------------------
-- 사용법: Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.
-- 테이블 3개(공지/예약/예진표) + 행 수준 보안(RLS) 정책을 생성합니다.
--
-- 보안 모델
--   - 익명(anon) 방문자: 예약/예진표 "등록(INSERT)"만 가능, 공지 "읽기"만 가능
--   - 로그인한 관리자(authenticated): 모든 조회/수정/삭제 가능
--   => anon key 는 공개돼도 안전합니다. 관리자 계정은 Supabase Auth에서 생성.
-- =====================================================================

-- ---------- 공지사항 ----------
create table if not exists public.notices (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  content     text not null,
  pinned      boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------- 예약 (홈페이지 예약) ----------
create table if not exists public.reservations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  phone         text not null,
  visit_type    text,                       -- 초진 / 재진
  desired_date  date,
  desired_time  text,
  memo          text,
  source        text not null default '홈페이지',  -- 홈페이지 / 네이버(수기) 등
  status        text not null default '신규',      -- 신규 / 확정 / 취소 / 완료
  created_at    timestamptz not null default now()
);

-- ---------- 1:1 비대면 예진표 ----------
create table if not exists public.intakes (
  id            uuid primary key default gen_random_uuid(),
  name          text,
  birth         date,
  gender        text,
  phone         text,
  visit_type    text,
  desired_date  date,
  desired_time  text,
  concerns      jsonb,        -- 선택한 고민 유형 배열
  details       jsonb,        -- 고민별 상세 응답
  meds          text,         -- 복용 중인 약물
  pregnancy     text,         -- 임신 가능성 여부
  message       text,         -- 의료진에게 하고 싶은 말
  agreed        boolean default false,
  status        text not null default '신규',  -- 신규 / 확인 / 완료
  created_at    timestamptz not null default now()
);

create index if not exists idx_notices_created       on public.notices (created_at desc);
create index if not exists idx_reservations_created  on public.reservations (created_at desc);
create index if not exists idx_intakes_created       on public.intakes (created_at desc);

-- =====================================================================
-- 행 수준 보안 (RLS)
-- =====================================================================
alter table public.notices       enable row level security;
alter table public.reservations  enable row level security;
alter table public.intakes       enable row level security;

-- 공지: 누구나 읽기 / 관리자만 쓰기
drop policy if exists "notices read"  on public.notices;
drop policy if exists "notices write" on public.notices;
create policy "notices read"  on public.notices for select using (true);
create policy "notices write" on public.notices for all
  to authenticated using (true) with check (true);

-- 예약: 누구나 등록 / 관리자만 조회·수정·삭제
drop policy if exists "reservations insert" on public.reservations;
drop policy if exists "reservations manage" on public.reservations;
create policy "reservations insert" on public.reservations for insert
  to anon, authenticated with check (true);
create policy "reservations manage" on public.reservations for all
  to authenticated using (true) with check (true);

-- 예진표: 누구나 등록 / 관리자만 조회·수정·삭제
drop policy if exists "intakes insert" on public.intakes;
drop policy if exists "intakes manage" on public.intakes;
create policy "intakes insert" on public.intakes for insert
  to anon, authenticated with check (true);
create policy "intakes manage" on public.intakes for all
  to authenticated using (true) with check (true);
