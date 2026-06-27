/* =====================================================================
   라미한의원 사이트 설정
   ---------------------------------------------------------------------
   Supabase 프로젝트를 만든 뒤 아래 두 값을 채워주세요.
   (Supabase 대시보드 > Project Settings > API 에서 복사)
     - Project URL        -> SUPABASE_URL
     - anon public key     -> SUPABASE_ANON_KEY   (공개돼도 안전한 키입니다)

   두 값이 비어 있으면 사이트는 "설정 전" 모드로 동작합니다.
   (예약/예진표는 네이버 예약으로 안내, 공지사항은 기본 안내문 표시)
   ===================================================================== */
window.LAMI_CONFIG = {
  SUPABASE_URL: 'https://gjopkfbwrduvxamznkhc.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdqb3BrZmJ3cmR1dnhhbXpua2hjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0NjE2MTEsImV4cCI6MjA5ODAzNzYxMX0.jMfZAX1wjfgOzEuU-gQM7K9lga9OkIuRoSCnQbWK8Zo',

  // 병원 식별자 (멀티테넌트) — 병원마다 고유값. 새 병원은 이 값만 바꾸면 됩니다.
  CLINIC_ID: 'lamihani',

  // 네이버 예약 링크 (관리자 페이지 바로가기 및 폴백에 사용)
  NAVER_RESERVE_URL: 'https://map.naver.com/p/entry/place/1137949987'
};

window.LAMI_READY = !!(window.LAMI_CONFIG.SUPABASE_URL && window.LAMI_CONFIG.SUPABASE_ANON_KEY);
