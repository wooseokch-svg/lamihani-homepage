-- =====================================================================
-- 실제 운영시간으로 영업시간 설정 갱신
-- ---------------------------------------------------------------------
-- 이미 만들어진 clinic_settings(id=1) 행의 영업시간을 실제 값으로 덮어씁니다.
-- Supabase > SQL Editor 에 붙여넣고 Run.
--
--   월~금 10:00-17:30 / 점심 13:00-14:00 / 접수마감 12:20(점심)·16:50(종료)
--   토   10:00-14:00 / 접수마감 13:20
--   일   휴무
-- =====================================================================
update public.clinic_settings
set hours = '{
  "0": {"closed": true},
  "1": {"closed": false, "open": "10:00", "close": "17:30", "lunchStart": "13:00", "lunchEnd": "14:00", "acceptLunch": "12:20", "acceptClose": "16:50"},
  "2": {"closed": false, "open": "10:00", "close": "17:30", "lunchStart": "13:00", "lunchEnd": "14:00", "acceptLunch": "12:20", "acceptClose": "16:50"},
  "3": {"closed": false, "open": "10:00", "close": "17:30", "lunchStart": "13:00", "lunchEnd": "14:00", "acceptLunch": "12:20", "acceptClose": "16:50"},
  "4": {"closed": false, "open": "10:00", "close": "17:30", "lunchStart": "13:00", "lunchEnd": "14:00", "acceptLunch": "12:20", "acceptClose": "16:50"},
  "5": {"closed": false, "open": "10:00", "close": "17:30", "lunchStart": "13:00", "lunchEnd": "14:00", "acceptLunch": "12:20", "acceptClose": "16:50"},
  "6": {"closed": false, "open": "10:00", "close": "14:00", "acceptClose": "13:20"}
}'::jsonb,
    slot_minutes = 30,
    updated_at = now()
where id = 1;
