/* =====================================================================
   사이트 설정 (멀티테넌트)
   ---------------------------------------------------------------------
   · Supabase 프로젝트는 모든 병원이 "공유" (URL/anon key 1쌍).
   · 병원 구분은 접속한 "도메인"으로 자동 판별 → CLINIC_ID 결정.
   · 새 병원 추가 = 아래 CLINICS 에 한 줄 추가하고 배포 (1분).
       '병원도메인.com': { id: 'clinic_id', naver: '네이버예약URL' }
   · 등록 안 된 도메인/로컬개발은 DEFAULT_CLINIC 으로 폴백 → 절대 안 깨짐.
   ===================================================================== */
(function () {
  // ── 모든 병원 공유 (Supabase 프로젝트 1개) ──
  var SUPABASE_URL = 'https://gjopkfbwrduvxamznkhc.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdqb3BrZmJ3cmR1dnhhbXpua2hjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0NjE2MTEsImV4cCI6MjA5ODAzNzYxMX0.jMfZAX1wjfgOzEuU-gQM7K9lga9OkIuRoSCnQbWK8Zo';

  // ── 도메인 → 병원 매핑 (새 병원은 여기 한 줄 추가) ──
  // name = noad 결제/작업요청 페이지에 표시될 병원명 (핸드오버 토큰에 담겨 넘어감).
  var CLINICS = {
    'lamihani21.co.kr':     { id: 'lamihani', name: '라미한의원', naver: 'https://map.naver.com/p/entry/place/1137949987' },
    'www.lamihani21.co.kr': { id: 'lamihani', name: '라미한의원', naver: 'https://map.naver.com/p/entry/place/1137949987' }
    // '병원B.com':      { id: 'clinicB', name: '○○한의원', naver: 'https://map.naver.com/...' },
  };

  // 미등록 도메인·로컬개발(localhost)·GitHub Pages 기본주소 → 이 병원으로 폴백
  var DEFAULT_CLINIC = { id: 'lamihani', name: '라미한의원', naver: 'https://map.naver.com/p/entry/place/1137949987' };

  // ── 현재 도메인으로 병원 판별 ──
  var host = (location.hostname || '').toLowerCase();
  var bare = host.replace(/^www\./, '');
  var clinic = CLINICS[host] || CLINICS[bare] || DEFAULT_CLINIC;

  window.LAMI_CONFIG = {
    SUPABASE_URL: SUPABASE_URL,
    SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
    CLINIC_ID: clinic.id,
    CLINIC_NAME: clinic.name || clinic.id,
    NAVER_RESERVE_URL: clinic.naver
    // noad 결제/작업요청은 Supabase Edge Function 'noad-handover' 가 서명 토큰을 발급해
    // noad.ai.kr/billing · /work-requests 로 리다이렉트한다 (admin.js 의 openNoad).
  };

  window.LAMI_READY = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
})();
