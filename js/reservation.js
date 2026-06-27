/* =====================================================================
   홈페이지 간편 예약 (달력 기반)
   - 영업시간/공휴일에 따라 예약 가능 날짜·시간 표시
   - 설정 전(lamiDB 없음)에는 네이버 예약으로 안내
   ===================================================================== */
(function () {
  var nv = document.getElementById('rsvNaverLink');
  if (nv && window.LAMI_CONFIG && window.LAMI_CONFIG.NAVER_RESERVE_URL) {
    nv.href = window.LAMI_CONFIG.NAVER_RESERVE_URL;
  }
})();

var RSV = {
  settings: null,
  viewY: 0, viewM: 0,   // 보고 있는 연/월(0-11)
  selDate: '',          // 'YYYY-MM-DD'
  selTime: ''           // 'HH:MM'
};

function openReserve() {
  if (!window.lamiDB) {
    var url = (window.LAMI_CONFIG && window.LAMI_CONFIG.NAVER_RESERVE_URL) || '#';
    window.open(url, '_blank', 'noopener');
    return;
  }
  document.getElementById('reserveFormView').style.display = 'block';
  document.getElementById('reserveSuccessView').style.display = 'none';
  document.getElementById('rsvErr').textContent = '';
  RSV.selDate = ''; RSV.selTime = '';
  document.getElementById('rsvSummary').hidden = true;
  document.getElementById('rsvSlots').innerHTML = '<p class="rsv-hint">날짜를 먼저 선택해 주세요.</p>';

  document.getElementById('reserveOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';

  var now = new Date();
  RSV.viewY = now.getFullYear();
  RSV.viewM = now.getMonth();

  // 설정 로드 후 달력 렌더 (한 번 로드하면 캐시)
  if (RSV.settings) { renderCal(); return; }
  window.lamiDB.from('clinic_settings').select('*').eq('id', 1).single().then(function (res) {
    RSV.settings = (res && res.data) ? {
      hours: res.data.hours, slot_minutes: res.data.slot_minutes, holidays: res.data.holidays || []
    } : window.LamiBooking.DEFAULT_SETTINGS;
    renderCal();
  });
}

function closeReserve() {
  document.getElementById('reserveOverlay').classList.remove('open');
  document.body.style.overflow = '';
}
function handleReserveOverlayClick(e) {
  if (e.target === document.getElementById('reserveOverlay')) closeReserve();
}

function rsvMonthShift(delta) {
  var m = RSV.viewM + delta, y = RSV.viewY;
  if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
  // 과거 달로는 이동 금지
  var now = new Date();
  if (y < now.getFullYear() || (y === now.getFullYear() && m < now.getMonth())) return;
  RSV.viewY = y; RSV.viewM = m;
  renderCal();
}

function renderCal() {
  var B = window.LamiBooking, S = RSV.settings;
  var first = new Date(RSV.viewY, RSV.viewM, 1);
  var startDow = first.getDay();
  var daysIn = new Date(RSV.viewY, RSV.viewM + 1, 0).getDate();
  var now = new Date();
  var canPrev = !(RSV.viewY === now.getFullYear() && RSV.viewM === now.getMonth());

  var html = '';
  html += '<div class="rsv-cal-head">';
  html += '<button type="button" class="rsv-cal-nav"' + (canPrev ? '' : ' disabled') + ' onclick="rsvMonthShift(-1)">‹</button>';
  html += '<span class="rsv-cal-title">' + RSV.viewY + '년 ' + (RSV.viewM + 1) + '월</span>';
  html += '<button type="button" class="rsv-cal-nav" onclick="rsvMonthShift(1)">›</button>';
  html += '</div>';

  html += '<div class="rsv-cal-grid">';
  ['일', '월', '화', '수', '목', '금', '토'].forEach(function (w, i) {
    html += '<div class="rsv-dow' + (i === 0 ? ' sun' : (i === 6 ? ' sat' : '')) + '">' + w + '</div>';
  });
  for (var b = 0; b < startDow; b++) html += '<div class="rsv-cell empty"></div>';

  for (var d = 1; d <= daysIn; d++) {
    var ds = B.ymd(new Date(RSV.viewY, RSV.viewM, d));
    var dow = new Date(RSV.viewY, RSV.viewM, d).getDay();
    var open = B.isOpenDay(ds, S);
    var holiday = B.isHoliday(ds, S);
    var past = ds < B.todayStr();
    var cls = 'rsv-cell';
    var attr = '';
    if (past) cls += ' past';
    else if (holiday) cls += ' holiday';
    else if (!open) cls += ' off';
    else { cls += ' ok'; attr = ' onclick="rsvPickDate(\'' + ds + '\')"'; }
    if (dow === 0) cls += ' sun';
    if (dow === 6) cls += ' sat';
    if (ds === RSV.selDate) cls += ' sel';
    html += '<div class="' + cls + '"' + attr + ' data-date="' + ds + '">' + d + '</div>';
  }
  html += '</div>';
  document.getElementById('rsvCal').innerHTML = html;
}

function rsvPickDate(ds) {
  RSV.selDate = ds; RSV.selTime = '';
  renderCal();
  updateSummary();
  var slotBox = document.getElementById('rsvSlots');
  slotBox.innerHTML = '<p class="rsv-hint">불러오는 중...</p>';

  var B = window.LamiBooking;
  var all = B.allSlots(ds, RSV.settings);
  if (!all.length) { slotBox.innerHTML = '<p class="rsv-hint">해당 날짜는 예약이 불가합니다.</p>'; return; }

  // 이미 예약된 시간 조회(개인정보 제외)
  window.lamiDB.rpc('taken_slots', { d: ds }).then(function (res) {
    var taken = {};
    (res && res.data ? res.data : []).forEach(function (row) {
      var t = (row && row.t != null) ? row.t : row;   // {t:'HH:MM'} 또는 문자열
      taken[t] = true;
    });
    var now = new Date();
    var isToday = ds === B.todayStr();
    var html = all.map(function (hhmm) {
      var disabled = !!taken[hhmm];
      if (isToday) {
        var p = hhmm.split(':');
        var slotMin = parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
        if (slotMin <= now.getHours() * 60 + now.getMinutes()) disabled = true; // 지난 시간
      }
      return '<button type="button" class="rsv-slot' + (disabled ? ' taken' : '') + '"' +
        (disabled ? ' disabled' : ' onclick="rsvPickTime(\'' + hhmm + '\',this)"') + '>' +
        B.fmtSlot(hhmm) + (disabled ? '<span class="x">마감</span>' : '') + '</button>';
    }).join('');
    slotBox.innerHTML = html;
  });
}

function rsvPickTime(hhmm, el) {
  RSV.selTime = hhmm;
  document.querySelectorAll('#rsvSlots .rsv-slot').forEach(function (b) { b.classList.remove('sel'); });
  if (el) el.classList.add('sel');
  updateSummary();
}

function updateSummary() {
  var box = document.getElementById('rsvSummary');
  if (RSV.selDate && RSV.selTime) {
    var B = window.LamiBooking;
    var d = new Date(RSV.selDate + 'T00:00:00');
    var wd = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    box.innerHTML = '선택하신 예약: <b>' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일(' + wd + ') ' + B.fmtSlot(RSV.selTime) + '</b>';
    box.hidden = false;
  } else {
    box.hidden = true;
  }
}

function submitReserve() {
  var err = document.getElementById('rsvErr');
  err.textContent = '';
  if (!RSV.selDate) { err.textContent = '예약 날짜를 선택해 주세요.'; return; }
  if (!RSV.selTime) { err.textContent = '예약 시간을 선택해 주세요.'; return; }
  var name = (document.getElementById('rsvName').value || '').trim();
  var phone = (document.getElementById('rsvPhone').value || '').trim();
  if (!name) { err.textContent = '성함을 입력해 주세요.'; return; }
  if (!phone) { err.textContent = '연락처를 입력해 주세요.'; return; }
  var visitEl = document.querySelector('#reserveOverlay input[name="rsvVisit"]:checked');

  var row = {
    name: name, phone: phone,
    visit_type: visitEl ? visitEl.value : null,
    desired_date: RSV.selDate,
    desired_time: RSV.selTime,
    memo: (document.getElementById('rsvMemo').value || '').trim() || null,
    source: '홈페이지'
  };

  var btn = document.querySelector('#reserveOverlay .rsv-submit');
  if (btn) { btn.disabled = true; btn.textContent = '신청 중...'; }

  // 동시 예약 방지: 제출 직전 한 번 더 확인
  window.lamiDB.rpc('taken_slots', { d: RSV.selDate }).then(function (res) {
    var taken = (res && res.data ? res.data : []).some(function (r) {
      var t = (r && r.t != null) ? r.t : r; return t === RSV.selTime;
    });
    if (taken) {
      if (btn) { btn.disabled = false; btn.textContent = '예약 신청하기'; }
      err.textContent = '방금 다른 분이 예약했습니다. 다른 시간을 선택해 주세요.';
      rsvPickDate(RSV.selDate);
      return;
    }
    window.lamiDB.from('reservations').insert([row]).then(function (r2) {
      if (btn) { btn.disabled = false; btn.textContent = '예약 신청하기'; }
      if (r2.error) { err.textContent = '신청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'; return; }
      document.getElementById('reserveFormView').style.display = 'none';
      document.getElementById('reserveSuccessView').style.display = 'block';
    });
  });
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeReserve();
});
