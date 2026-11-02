-- 직원별·유닛별 예약 알림 수신 여부 (2026-11-02). 기본 true = 기존 동작 그대로.
-- 코어 메시지 탭 '알림 받을 직원'에서 직원마다 성인·소아(별내) 선택. 예약 접수·취소 알림은 그 유닛을 고른 직원에게만.
ALTER TABLE public.clinic_admins ADD COLUMN IF NOT EXISTS notify boolean NOT NULL DEFAULT true;
