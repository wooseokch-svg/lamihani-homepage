/* =====================================================================
   홈페이지 간편 예약 모달
   - 설정 전(lamiDB 없음)에는 네이버 예약으로 안내
   ===================================================================== */
(function () {
  // 네이버 링크 동기화
  var nv = document.getElementById('rsvNaverLink');
  if (nv && window.LAMI_CONFIG && window.LAMI_CONFIG.NAVER_RESERVE_URL) {
    nv.href = window.LAMI_CONFIG.NAVER_RESERVE_URL;
  }
})();

function openReserve() {
  // 백엔드 미설정 시: 기존처럼 네이버 예약으로 이동
  if (!window.lamiDB) {
    var url = (window.LAMI_CONFIG && window.LAMI_CONFIG.NAVER_RESERVE_URL) || '#';
    window.open(url, '_blank', 'noopener');
    return;
  }
  document.getElementById('reserveFormView').style.display = 'block';
  document.getElementById('reserveSuccessView').style.display = 'none';
  var err = document.getElementById('rsvErr');
  if (err) err.textContent = '';
  document.getElementById('reserveOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeReserve() {
  document.getElementById('reserveOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function handleReserveOverlayClick(e) {
  if (e.target === document.getElementById('reserveOverlay')) closeReserve();
}

function submitReserve() {
  var err = document.getElementById('rsvErr');
  var name = (document.getElementById('rsvName').value || '').trim();
  var phone = (document.getElementById('rsvPhone').value || '').trim();
  var visitEl = document.querySelector('#reserveOverlay input[name="rsvVisit"]:checked');

  err.textContent = '';
  if (!name)  { err.textContent = '성함을 입력해 주세요.'; return; }
  if (!phone) { err.textContent = '연락처를 입력해 주세요.'; return; }

  var row = {
    name: name,
    phone: phone,
    visit_type: visitEl ? visitEl.value : null,
    desired_date: (document.getElementById('rsvDate').value || '') || null,
    desired_time: (document.getElementById('rsvTime').value || '') || null,
    memo: (document.getElementById('rsvMemo').value || '').trim() || null,
    source: '홈페이지'
  };

  if (!window.lamiDB) { err.textContent = '현재 온라인 예약 준비 중입니다. 네이버 예약을 이용해 주세요.'; return; }

  var btn = document.querySelector('#reserveOverlay .rsv-submit');
  if (btn) { btn.disabled = true; btn.textContent = '신청 중...'; }

  window.lamiDB.from('reservations').insert([row]).then(function (res) {
    if (btn) { btn.disabled = false; btn.textContent = '예약 신청하기'; }
    if (res.error) {
      err.textContent = '신청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
      return;
    }
    document.getElementById('reserveFormView').style.display = 'none';
    document.getElementById('reserveSuccessView').style.display = 'block';
  });
}

// ESC 닫기
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeReserve();
});
