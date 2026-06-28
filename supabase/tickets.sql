-- =====================================================================
--  작업티켓 + 작업요청 (멀티테넌트)
--  · ticket_ledger : 티켓 충전(+)/사용(-) 원장. 잔액 = sum(delta)
--  · work_requests : 병원의 작업 요청(배너/팝업/기능수정/디자인수정)
--  · submit_work_request() : 티켓 1장 차감하며 작업요청 생성(원자적)
--  전제: multitenant.sql 의 auth_clinic() 가 이미 있음.
--  실행: Supabase SQL Editor 에 통째로 붙여넣고 Run.
-- =====================================================================

-- ---- 티켓 원장 ----
create table if not exists public.ticket_ledger (
  id         bigint generated always as identity primary key,
  clinic_id  text not null,
  delta      int  not null,                 -- +충전 / -사용
  reason     text,                          -- '요금제 지급'/'티켓 구매'/'작업요청 사용'
  ref_id     uuid,                          -- 관련 work_request id 등
  created_at timestamptz not null default now()
);
create index if not exists ticket_ledger_clinic_idx on public.ticket_ledger(clinic_id);

-- ---- 작업요청 ----
create table if not exists public.work_requests (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  text not null,
  type       text not null,                 -- 배너/팝업/기능수정/디자인수정/기타
  title      text not null,
  content    text,
  status     text not null default '요청',   -- 요청/진행중/완료/취소
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists work_requests_clinic_idx on public.work_requests(clinic_id);

-- ---- RLS: 병원 관리자는 자기 병원 것만 조회 ----
alter table public.ticket_ledger enable row level security;
alter table public.work_requests enable row level security;

drop policy if exists ticket_ledger_select_own on public.ticket_ledger;
create policy ticket_ledger_select_own on public.ticket_ledger
  for select using (clinic_id = public.auth_clinic());

drop policy if exists work_requests_select_own on public.work_requests;
create policy work_requests_select_own on public.work_requests
  for select using (clinic_id = public.auth_clinic());
-- (슈퍼관리자 전체 조회 정책은 noad 통합 admin 구축 시 추가)

-- ---- 내 병원 티켓 잔액 ----
create or replace function public.my_ticket_balance()
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(delta), 0)::int
  from public.ticket_ledger
  where clinic_id = public.auth_clinic();
$$;

-- ---- 작업요청 생성(티켓 1장 차감, 원자적) ----
create or replace function public.submit_work_request(p_type text, p_title text, p_content text)
returns public.work_requests language plpgsql security definer set search_path = public as $$
declare
  v_cid text := public.auth_clinic();
  v_bal int;
  v_req public.work_requests;
begin
  if v_cid is null then raise exception '권한이 없습니다.'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception '제목을 입력하세요.'; end if;
  select coalesce(sum(delta), 0) into v_bal from public.ticket_ledger where clinic_id = v_cid;
  if v_bal < 1 then raise exception '보유한 작업티켓이 없습니다.'; end if;

  insert into public.work_requests(clinic_id, type, title, content)
    values (v_cid, p_type, p_title, p_content)
    returning * into v_req;
  insert into public.ticket_ledger(clinic_id, delta, reason, ref_id)
    values (v_cid, -1, '작업요청 사용', v_req.id);
  return v_req;
end; $$;

grant execute on function public.my_ticket_balance() to authenticated;
grant execute on function public.submit_work_request(text, text, text) to authenticated;

-- ---- (테스트용) 라미한의원에 티켓 3장 지급 ----
-- 필요 시 주석 해제하고 실행하세요. clinic_id는 상황에 맞게 변경.
-- insert into public.ticket_ledger(clinic_id, delta, reason) values ('lamihani', 3, '테스트 지급');
