-- 환자 명부 (patients) — 관리자 '환자관리' 탭: EMR 엑셀 업로드로 갱신 + 예약 직접추가 자동완성.
-- 키 = (clinic_id, patient_no). patient_no = EMR 환자번호(엑셀 D열). 업로드는 upsert(있으면 갱신).
-- ⚠️ 민감정보(이름+전화) → RLS: 해당 병원 관리자(is_my_clinic)만 접근. anon 접근 불가.
create table if not exists public.patients (
  clinic_id  text        not null,
  patient_no int         not null,
  name       text        not null,
  phone      text,
  gender     text,
  age        int,
  updated_at timestamptz not null default now(),
  primary key (clinic_id, patient_no)
);

create index if not exists patients_name_idx  on public.patients (clinic_id, name);
create index if not exists patients_phone_idx on public.patients (clinic_id, phone);

alter table public.patients enable row level security;

drop policy if exists patients_admin_all on public.patients;
create policy patients_admin_all on public.patients
  for all to authenticated
  using (public.is_my_clinic(clinic_id))
  with check (public.is_my_clinic(clinic_id));
