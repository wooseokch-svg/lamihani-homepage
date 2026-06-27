/* =====================================================================
   통합 예약·예진표 모달
   - mode 'full'   : 예진표 작성(문진 포함) + 예약
   - mode 'reserve': 간편 예약(문진 숨김, 기본 정보만)
   - reservations 테이블 1곳에 저장 (kind: '예진표' / '예약')
   ===================================================================== */
var YJ = { mode: 'full', settings: null, viewY: 0, viewM: 0, selDate: '', selTime: '' };
var LAMI_CID = (window.LAMI_CONFIG && window.LAMI_CONFIG.CLINIC_ID) || 'lamihani';

function openModal(mode) {
  YJ.mode = (mode === 'reserve') ? 'reserve' : 'full';

  // 미설정 + 예약 모드 → 네이버 예약으로 폴백
  if (!window.lamiDB && YJ.mode === 'reserve') {
    var url = (window.LAMI_CONFIG && window.LAMI_CONFIG.NAVER_RESERVE_URL) || '#';
    window.open(url, '_blank', 'noopener');
    return;
  }

  var full = (YJ.mode === 'full');
  document.querySelectorAll('#modalOverlay .yj-full-only').forEach(function (el) {
    el.style.display = full ? '' : 'none';
  });
  document.getElementById('mTitle').textContent = full ? '방문 전 예진표 작성' : '간편 예약';
  document.getElementById('mDesc').textContent = full
    ? '작성하신 내용을 바탕으로 더 빠르고 정확한 진료를 안내드립니다'
    : '날짜·시간을 선택하고 예약 정보를 남겨주세요';
  document.getElementById('submitBtn').textContent = full ? '예진표 제출하고 예약하기' : '예약 신청하기';

  // 초기화
  document.getElementById('formView').style.display = 'block';
  document.getElementById('successView').style.display = 'none';
  YJ.selDate = ''; YJ.selTime = '';
  document.getElementById('yjSummary').hidden = true;
  document.getElementById('yjSlots').innerHTML = '<p class="bk-hint">날짜를 먼저 선택해 주세요.</p>';

  document.getElementById('modalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';

  var now = new Date();
  YJ.viewY = now.getFullYear();
  YJ.viewM = now.getMonth();

  if (YJ.settings) { renderYjCal(); return; }
  if (window.lamiDB) {
    window.lamiDB.from('clinic_settings').select('*').eq('clinic_id', LAMI_CID).single().then(function (res) {
      YJ.settings = (res && res.data)
        ? { hours: res.data.hours, slot_minutes: res.data.slot_minutes, holidays: res.data.holidays || [] }
        : window.LamiBooking.DEFAULT_SETTINGS;
      renderYjCal();
    });
  } else {
    YJ.settings = window.LamiBooking.DEFAULT_SETTINGS;
    renderYjCal();
  }
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
  setTimeout(function () {
    var fv = document.getElementById('formView');
    var sv = document.getElementById('successView');
    if (fv) fv.style.display = 'block';
    if (sv) sv.style.display = 'none';
  }, 300);
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
}

/* ===== 예약 달력 ===== */
function yjMonthShift(delta) {
  var m = YJ.viewM + delta, y = YJ.viewY;
  if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
  var now = new Date();
  if (y < now.getFullYear() || (y === now.getFullYear() && m < now.getMonth())) return;
  YJ.viewY = y; YJ.viewM = m;
  renderYjCal();
}

function renderYjCal() {
  var B = window.LamiBooking, S = YJ.settings;
  var first = new Date(YJ.viewY, YJ.viewM, 1);
  var startDow = first.getDay();
  var daysIn = new Date(YJ.viewY, YJ.viewM + 1, 0).getDate();
  var now = new Date();
  var canPrev = !(YJ.viewY === now.getFullYear() && YJ.viewM === now.getMonth());

  var html = '<div class="bk-cal-head">';
  html += '<button type="button" class="bk-cal-nav"' + (canPrev ? '' : ' disabled') + ' onclick="yjMonthShift(-1)">‹</button>';
  html += '<span class="bk-cal-title">' + YJ.viewY + '년 ' + (YJ.viewM + 1) + '월</span>';
  html += '<button type="button" class="bk-cal-nav" onclick="yjMonthShift(1)">›</button></div>';
  html += '<div class="bk-cal-grid">';
  ['일', '월', '화', '수', '목', '금', '토'].forEach(function (w, i) {
    html += '<div class="bk-dow' + (i === 0 ? ' sun' : (i === 6 ? ' sat' : '')) + '">' + w + '</div>';
  });
  for (var b = 0; b < startDow; b++) html += '<div class="bk-cell empty"></div>';
  for (var d = 1; d <= daysIn; d++) {
    var ds = B.ymd(new Date(YJ.viewY, YJ.viewM, d));
    var open = B.isOpenDay(ds, S), holiday = B.isHoliday(ds, S), past = ds < B.todayStr();
    var cls = 'bk-cell', attr = '';
    if (past) cls += ' past';
    else if (holiday) cls += ' holiday';
    else if (!open) cls += ' off';
    else { cls += ' ok'; attr = ' onclick="yjPickDate(\'' + ds + '\')"'; }
    if (ds === YJ.selDate) cls += ' sel';
    html += '<div class="' + cls + '"' + attr + '>' + d + '</div>';
  }
  html += '</div>';
  document.getElementById('yjCal').innerHTML = html;
}

function yjPickDate(ds) {
  YJ.selDate = ds; YJ.selTime = '';
  renderYjCal();
  yjUpdateSummary();
  var slotBox = document.getElementById('yjSlots');
  var B = window.LamiBooking;
  var all = B.allSlots(ds, YJ.settings);
  if (!all.length) { slotBox.innerHTML = '<p class="bk-hint">해당 날짜는 예약이 불가합니다.</p>'; return; }
  slotBox.innerHTML = '<p class="bk-hint">불러오는 중...</p>';

  function render(taken) {
    var now = new Date(), isToday = ds === B.todayStr();
    slotBox.innerHTML = all.map(function (hhmm) {
      var disabled = !!taken[hhmm];
      if (isToday) {
        var p = hhmm.split(':');
        if (parseInt(p[0], 10) * 60 + parseInt(p[1], 10) <= now.getHours() * 60 + now.getMinutes()) disabled = true;
      }
      return '<button type="button" class="bk-slot' + (disabled ? ' taken' : '') + '"' +
        (disabled ? ' disabled' : ' onclick="yjPickTime(\'' + hhmm + '\',this)"') + '>' +
        B.fmtSlot(hhmm) + (disabled ? '<span class="x">마감</span>' : '') + '</button>';
    }).join('');
  }

  if (!window.lamiDB) { render({}); return; }
  window.lamiDB.rpc('taken_slots', { d: ds, cid: LAMI_CID }).then(function (res) {
    var taken = {};
    (res && res.data ? res.data : []).forEach(function (row) { taken[(row && row.t != null) ? row.t : row] = true; });
    render(taken);
  });
}

function yjPickTime(hhmm, el) {
  YJ.selTime = hhmm;
  document.querySelectorAll('#yjSlots .bk-slot').forEach(function (b) { b.classList.remove('sel'); });
  if (el) el.classList.add('sel');
  yjUpdateSummary();
}

function yjUpdateSummary() {
  var box = document.getElementById('yjSummary');
  if (YJ.selDate && YJ.selTime) {
    var B = window.LamiBooking, d = new Date(YJ.selDate + 'T00:00:00');
    var wd = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    box.innerHTML = '선택하신 예약: <b>' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일(' + wd + ') ' + B.fmtSlot(YJ.selTime) + '</b>';
    box.hidden = false;
  } else { box.hidden = true; }
}

/* ===== 문진 ===== */
function selectVisit(el) {
  document.querySelectorAll('#modalOverlay .radio-card').forEach(function (c) { c.classList.remove('selected'); });
  el.classList.add('selected');
}
function toggleCard(el) { el.classList.toggle('selected'); updateSubSections(); }
function updateSubSections() {
  var checked = [].slice.call(document.querySelectorAll('#modalOverlay input[name="concern"]:checked')).map(function (i) { return i.value; });
  var map = { student: 'sub-student', beauty: 'sub-beauty', diet: 'sub-diet', herb: 'sub-herb', accident: 'sub-accident' };
  Object.keys(map).forEach(function (key) {
    document.getElementById(map[key]).classList.toggle('visible', checked.indexOf(key) !== -1);
  });
  var total = 4, filled = Math.min(checked.length + 1, total);
  for (var i = 1; i <= total; i++) {
    var seg = document.getElementById('seg' + i);
    if (i < filled) seg.className = 'step-seg done';
    else if (i === filled) seg.className = 'step-seg active';
    else seg.className = 'step-seg';
  }
}

function val(id) { var el = document.getElementById(id); return el ? (el.value || '').trim() : ''; }

function collectIntake() {
  var visitEl = document.querySelector('#modalOverlay input[name="visit"]:checked');
  var visitMap = { first: '초진', re: '재진' };
  var concerns = [].slice.call(document.querySelectorAll('#modalOverlay input[name="concern"]:checked')).map(function (i) { return i.value; });

  var details = {};
  document.querySelectorAll('#modalOverlay .sub-section.visible').forEach(function (sec) {
    var titleEl = sec.querySelector('.sub-title');
    var key = titleEl ? titleEl.textContent.replace(/[①-⑨]/g, '').trim() : sec.id;
    var checked = [].slice.call(sec.querySelectorAll('input:checked')).map(function (i) { return (i.parentElement.textContent || '').trim(); });
    var inputs = [];
    sec.querySelectorAll('input[type="number"], input[type="text"], select').forEach(function (i) {
      if (i.value && i.value.trim()) {
        var lab = i.closest('.inline-row') || i.closest('.form-group');
        var labTxt = lab && lab.querySelector('label') ? lab.querySelector('label').textContent.trim() : '';
        inputs.push((labTxt ? labTxt + ': ' : '') + i.value.trim());
      }
    });
    details[key] = { checked: checked, inputs: inputs };
  });
  var pregEl = document.querySelector('#modalOverlay input[name="pregnant"]:checked');

  return {
    name: val('inName'),
    birth: val('inBirth') || null,
    gender: val('inGender') || null,
    phone: val('inPhone'),
    visit_type: visitEl ? (visitMap[visitEl.value] || visitEl.value) : null,
    concerns: concerns,
    details: details,
    meds: val('inMeds') || null,
    pregnancy: pregEl ? (pregEl.parentElement.textContent || '').trim() : null,
    message: val('inMessage') || null,
    agreed: !!(document.getElementById('agreePrivacy') && document.getElementById('agreePrivacy').checked)
  };
}

function resetForm() {
  var ov = document.getElementById('modalOverlay');
  ov.querySelectorAll('input[type="text"], input[type="tel"], input[type="date"], input[type="number"], textarea').forEach(function (i) { i.value = ''; });
  ov.querySelectorAll('select').forEach(function (s) { s.selectedIndex = 0; });
  ov.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(function (c) { c.checked = false; });
  ov.querySelectorAll('.radio-card.selected, .check-card.selected').forEach(function (el) { el.classList.remove('selected'); });
  ov.querySelectorAll('.sub-section.visible').forEach(function (el) { el.classList.remove('visible'); });
  for (var i = 1; i <= 4; i++) {
    var seg = document.getElementById('seg' + i);
    if (seg) seg.className = 'step-seg' + (i === 1 ? ' done' : '');
  }
  YJ.selDate = ''; YJ.selTime = '';
  var sm = document.getElementById('yjSummary'); if (sm) sm.hidden = true;
  var sl = document.getElementById('yjSlots'); if (sl) sl.innerHTML = '<p class="bk-hint">날짜를 먼저 선택해 주세요.</p>';
  if (YJ.settings) renderYjCal();
}

function showSuccess() {
  document.getElementById('successTitle').textContent = (YJ.mode === 'full') ? '예진표 제출 완료!' : '예약 신청 완료!';
  document.getElementById('formView').style.display = 'none';
  document.getElementById('successView').style.display = 'block';
  var modal = document.querySelector('#modalOverlay .modal');
  if (modal) modal.scrollTop = 0;
  resetForm();  // 완료 후 입력값 초기화 (다시 열면 빈 폼)
}

function submitForm() {
  if (!document.getElementById('agreePrivacy').checked) { alert('개인정보 수집 및 활용 동의가 필요합니다.'); return; }
  var name = val('inName'), phone = val('inPhone');
  if (!name) { alert('성함을 입력해 주세요.'); return; }
  if (!phone) { alert('연락처를 입력해 주세요.'); return; }
  if (!YJ.selDate) { alert('예약 날짜를 선택해 주세요.'); return; }
  if (!YJ.selTime) { alert('예약 시간을 선택해 주세요.'); return; }

  var data = collectIntake();
  data.desired_date = YJ.selDate;
  data.desired_time = YJ.selTime;
  data.kind = (YJ.mode === 'full') ? '예진표' : '예약';
  data.source = '홈페이지';
  data.clinic_id = LAMI_CID;
  if (YJ.mode !== 'full') { data.concerns = []; data.details = {}; data.meds = null; data.pregnancy = null; data.message = null; }

  if (!window.lamiDB) { showSuccess(); return; }

  var btn = document.getElementById('submitBtn');
  var orig = btn.textContent;
  btn.disabled = true; btn.textContent = '신청 중...';

  window.lamiDB.rpc('taken_slots', { d: YJ.selDate, cid: LAMI_CID }).then(function (res) {
    var taken = (res && res.data ? res.data : []).some(function (r) { var t = (r && r.t != null) ? r.t : r; return t === YJ.selTime; });
    if (taken) {
      btn.disabled = false; btn.textContent = orig;
      alert('방금 다른 분이 예약했습니다. 다른 시간을 선택해 주세요.');
      yjPickDate(YJ.selDate);
      return;
    }
    window.lamiDB.from('reservations').insert([data]).then(function (r2) {
      btn.disabled = false; btn.textContent = orig;
      if (r2.error) { alert('제출 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.\n' + r2.error.message); return; }
      showSuccess();
    });
  });
}

/* ===== 이용약관 / 개인정보처리방침 모달 ===== */
function showPolicy(which) {
  var isPrivacy = (which === 'privacy');
  document.getElementById('policyTitle').textContent = isPrivacy ? '개인정보처리방침' : '이용약관';
  document.getElementById('policyTerms').hidden = isPrivacy;
  document.getElementById('policyPrivacy').hidden = !isPrivacy;
  document.getElementById('policyOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  var body = document.querySelector('#policyOverlay .policy-body');
  if (body) body.scrollTop = 0;
}
function openTerms() { showPolicy('terms'); }
function openPrivacy() { showPolicy('privacy'); }
function closePolicy() {
  document.getElementById('policyOverlay').classList.remove('open');
  document.body.style.overflow = '';
}
function handlePolicyOverlayClick(e) {
  if (e.target === document.getElementById('policyOverlay')) closePolicy();
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') { closeModal(); closePolicy(); }
});
