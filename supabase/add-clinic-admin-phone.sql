-- clinic_admins 에 전화번호(phone) 컬럼 추가 — 관리자 알림 수신처.
-- 병원 정적 admin '직원 계정' 탭에서 등록 → 코어(sultan-tennis) cron/작업알림이
-- 이 번호로 예약접수·서비스 만료·요청작업·메시지잔여 알림톡을 발송한다.
-- (직원=Supabase Auth 계정 + clinic_admins 매핑. phone 은 매핑 행에 저장.)
ALTER TABLE public.clinic_admins ADD COLUMN IF NOT EXISTS phone text;
