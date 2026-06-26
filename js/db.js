/* =====================================================================
   Supabase 클라이언트 초기화
   - config.js 설정이 채워져 있고 supabase-js 가 로드된 경우에만 생성
   - 설정 전에는 window.lamiDB = null (호출부에서 폴백 처리)
   ===================================================================== */
(function () {
  window.lamiDB = null;
  try {
    if (window.LAMI_READY && window.supabase && typeof window.supabase.createClient === 'function') {
      window.lamiDB = window.supabase.createClient(
        window.LAMI_CONFIG.SUPABASE_URL,
        window.LAMI_CONFIG.SUPABASE_ANON_KEY
      );
    }
  } catch (e) {
    console.warn('Supabase 초기화 실패:', e);
    window.lamiDB = null;
  }
})();
