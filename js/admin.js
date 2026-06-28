/* =====================================================================
   라미한의원 관리자 페이지 로직
   - Supabase Auth 로그인 → 예약 / 예진표 / 공지 관리
   ===================================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var db = window.lamiDB;
  var CID = (window.LAMI_CONFIG && window.LAMI_CONFIG.CLINIC_ID) || 'lamihani';

  // ---- 설정 전 안내 ----
  if (!db) {
    $('loginNote').innerHTML =
      'Supabase 설정이 필요합니다.<br>js/config.js에 프로젝트 URL과 anon key를 입력해 주세요.';
    $('loginBtn').disabled = true;
    return;
  }

  // 네이버 링크
  if (window.LAMI_CONFIG && window.LAMI_CONFIG.NAVER_RESERVE_URL) {
    $('naverLink').href = window.LAMI_CONFIG.NAVER_RESERVE_URL;
  }

  function esc(s) {
    return (s == null ? '' : String(s))
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function fmt(s) {
    if (!s) return '';
    var d = new Date(s);
    if (isNaN(d)) return '';
    return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' +
      String(d.getDate()).padStart(2, '0') + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  // =================== 인증 ===================
  function showAdmin(session) {
    $('loginView').hidden = true;
    $('adminView').hidden = false;
    $('who').textContent = session.user.email;
    loadBookings();
    loadNotices();
    loadSettings();
    initBilling();
  }
  function showLogin() {
    $('adminView').hidden = true;
    $('loginView').hidden = false;
  }

  db.auth.getSession().then(function (res) {
    if (res.data && res.data.session) showAdmin(res.data.session);
    else showLogin();
  });

  $('loginBtn').addEventListener('click', function () {
    var email = $('email').value.trim();
    var password = $('password').value;
    $('loginMsg').textContent = '';
    if (!email || !password) { $('loginMsg').textContent = '이메일과 비밀번호를 입력하세요.'; return; }
    $('loginBtn').disabled = true; $('loginBtn').textContent = '로그인 중...';
    db.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
      $('loginBtn').disabled = false; $('loginBtn').textContent = '로그인';
      if (res.error) { $('loginMsg').textContent = '로그인 실패: ' + res.error.message; return; }
      showAdmin(res.data.session);
    });
  });
  $('password').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('loginBtn').click(); });

  $('logoutBtn').addEventListener('click', function () {
    db.auth.signOut().then(showLogin);
  });

  // =================== 탭 ===================
  document.querySelectorAll('.adm-tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.adm-tabs button').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      ['intakes', 'notices', 'settings', 'billing', 'work'].forEach(function (t) {
        $('tab-' + t).hidden = (t !== b.dataset.tab);
      });
    });
  });

  // 목록 서브탭 (예약 / 지난예약)
  document.querySelectorAll('.sub-tab').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.sub-tab').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      $('listUpcoming').hidden = (b.dataset.sub !== 'upcoming');
      $('listPast').hidden = (b.dataset.sub !== 'past');
    });
  });

  // =================== 예진표 예약 (통합) ===================
  var STATUSES = ['신규', '예약확정', '취소'];
  var bookings = [];
  var advY = 0, advM = 0;

  function detailsHtml(d) {
    if (!d || typeof d !== 'object') return '';
    var parts = [];
    Object.keys(d).forEach(function (k) {
      var v = d[k] || {};
      var items = (v.checked || []).concat(v.inputs || []).filter(Boolean);
      if (items.length) parts.push('<div class="kv"><b>' + esc(k) + ':</b> ' + esc(items.join(', ')) + '</div>');
    });
    return parts.join('');
  }

  function bookingFullHtml(r) {
    var concerns = Array.isArray(r.concerns) && r.concerns.length ? r.concerns.join(', ') : '';
    var h = '<div class="kv"><b>이름:</b> ' + esc(r.name || '-') + ' (' + esc(r.kind || '예약') + ')</div>' +
      '<div class="kv"><b>연락처:</b> ' + esc(r.phone || '-') + '</div>' +
      '<div class="kv"><b>예약일시:</b> ' + esc(r.desired_date || '-') + ' ' + esc(r.desired_time ? window.LamiBooking.fmtSlot(r.desired_time) : '') + '</div>' +
      '<div class="kv"><b>방문유형:</b> ' + esc(r.visit_type || '-') + '</div>' +
      '<div class="kv"><b>출처:</b> ' + esc(r.source || '홈페이지') + '</div>';
    if (r.gender || r.birth) h += '<div class="kv"><b>성별/생년:</b> ' + esc(r.gender || '-') + ' / ' + esc(r.birth || '-') + '</div>';
    if (concerns) h += '<div class="kv"><b>고민:</b> ' + esc(concerns) + '</div>';
    h += detailsHtml(r.details);
    if (r.meds) h += '<div class="kv"><b>복용 약물:</b> ' + esc(r.meds) + '</div>';
    if (r.pregnancy) h += '<div class="kv"><b>임신 여부:</b> ' + esc(r.pregnancy) + '</div>';
    if (r.message) h += '<div class="kv"><b>남긴 말:</b> ' + esc(r.message) + '</div>';
    if (r.memo) h += '<div class="kv"><b>메모:</b> ' + esc(r.memo) + '</div>';
    h += '<div class="kv" style="color:#aaa;margin-top:6px">접수: ' + fmt(r.created_at) + '</div>';
    return h;
  }

  function statusBtns(r) {
    return STATUSES.map(function (s) {
      return '<button class="st-btn' + (s === r.status ? ' active s-' + s : '') + '" data-st="' + s + '" data-id="' + r.id + '">' + s + '</button>';
    }).join('') + '<button class="btn-danger" data-del="' + r.id + '">삭제</button>';
  }

  function setStatus(id, st) { db.from('reservations').update({ status: st }).eq('id', id).then(loadBookings); }
  function delBooking(id) { if (confirm('이 예약을 삭제할까요?')) db.from('reservations').delete().eq('id', id).then(loadBookings); }

  function loadBookings() {
    db.from('reservations').select('*').eq('clinic_id', CID).order('created_at', { ascending: false }).then(function (res) {
      if (res.error) { $('listUpcoming').innerHTML = '<div class="empty">불러오기 오류: ' + esc(res.error.message) + '</div>'; return; }
      bookings = res.data || [];
      $('cntInt').textContent = bookings.filter(function (r) { return r.status === '신규'; }).length;

      var now = new Date(); advY = now.getFullYear(); advM = now.getMonth();
      renderAdminCal();

      var today = window.LamiBooking.todayStr();
      var up = bookings.filter(function (r) { return !r.desired_date || r.desired_date >= today; });
      var past = bookings.filter(function (r) { return r.desired_date && r.desired_date < today; });
      up.sort(function (a, b) { return ((a.desired_date || '9999') + (a.desired_time || '')).localeCompare((b.desired_date || '9999') + (b.desired_time || '')); });
      past.sort(function (a, b) { return ((b.desired_date || '') + (b.desired_time || '')).localeCompare((a.desired_date || '') + (a.desired_time || '')); });

      $('cntUp').textContent = up.length;
      $('cntPast').textContent = past.length;

      renderList('listUpcoming', up, '다가오는 예약이 없습니다.', '');
      var CAP = 100;
      var note = past.length > CAP ? ('최근 ' + CAP + '건만 표시 (총 ' + past.length + '건). 더 과거는 위 캘린더에서 확인하세요.') : '';
      renderList('listPast', past.slice(0, CAP), '지난 예약이 없습니다.', note);
    });
  }

  function cardHtml(r) {
    var concerns = Array.isArray(r.concerns) && r.concerns.length ? r.concerns.join(', ') : '';
    var isYj = (r.kind === '예진표');
    return '<div class="rec">' +
      '<div class="rec-top">' +
        '<span class="rec-name">' + esc(r.name || '(이름 없음)') + '</span>' +
        '<span class="kind-tag' + (isYj ? ' yj' : '') + '">' + esc(r.kind || '예약') + '</span>' +
        '<span class="tag s-' + esc(r.status) + '">' + esc(r.status) + '</span>' +
        '<span class="rec-spacer"></span>' +
        '<span class="rec-meta">' + esc(r.desired_date || '') + ' ' + esc(r.desired_time ? window.LamiBooking.fmtSlot(r.desired_time) : '') + '</span>' +
      '</div>' +
      '<div class="rec-body">☎ ' + esc(r.phone || '-') + ' · ' + esc(r.visit_type || '-') +
        ' · <span class="src-tag">' + esc(r.source || '홈페이지') + '</span>' +
        (concerns ? ' · 🩺 ' + esc(concerns) : '') + '</div>' +
      (isYj ? '<button class="detail-toggle" data-detail="' + r.id + '">상세 보기</button>' +
        '<div class="rec-detail" id="det-' + r.id + '" hidden style="margin-top:8px">' + bookingFullHtml(r) + '</div>' : '') +
      '<div class="rec-actions">' + statusBtns(r) + '</div>' +
    '</div>';
  }

  function renderList(boxId, rows, emptyMsg, note) {
    var box = $(boxId);
    if (!rows.length) { box.innerHTML = '<div class="empty">' + emptyMsg + '</div>'; return; }
    box.innerHTML = (note ? '<div class="list-note">' + esc(note) + '</div>' : '') + rows.map(cardHtml).join('');
    box.querySelectorAll('[data-detail]').forEach(function (b) {
      b.addEventListener('click', function () {
        var el = $('det-' + b.dataset.detail);
        el.hidden = !el.hidden;
        b.textContent = el.hidden ? '상세 보기' : '접기';
      });
    });
    box.querySelectorAll('.st-btn').forEach(function (b) {
      b.addEventListener('click', function () { setStatus(b.dataset.id, b.dataset.st); });
    });
    box.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () { delBooking(b.dataset.del); });
    });
  }

  // ----- 예약 캘린더 -----
  window.admMonthShift = function (delta) {
    var m = advM + delta, y = advY;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    advY = y; advM = m; renderAdminCal();
  };

  function renderAdminCal() {
    var B = window.LamiBooking;
    var byDate = {};
    bookings.forEach(function (r) {
      if (!r.desired_date || (r.status !== '신규' && r.status !== '예약확정')) return;
      (byDate[r.desired_date] = byDate[r.desired_date] || []).push(r);
    });
    Object.keys(byDate).forEach(function (k) {
      byDate[k].sort(function (a, b) { return (a.desired_time || '').localeCompare(b.desired_time || ''); });
    });

    var first = new Date(advY, advM, 1), startDow = first.getDay();
    var daysIn = new Date(advY, advM + 1, 0).getDate();

    var html = '<div class="adm-cal-head">' +
      '<button type="button" class="adm-cal-nav" onclick="admMonthShift(-1)">‹</button>' +
      '<span class="adm-cal-title">' + advY + '년 ' + (advM + 1) + '월</span>' +
      '<button type="button" class="adm-cal-nav" onclick="admMonthShift(1)">›</button></div>';
    html += '<div class="adm-cal-grid">';
    ['일', '월', '화', '수', '목', '금', '토'].forEach(function (w, i) {
      html += '<div class="adm-dow' + (i === 0 ? ' sun' : (i === 6 ? ' sat' : '')) + '">' + w + '</div>';
    });
    for (var b = 0; b < startDow; b++) html += '<div class="adm-cell empty"></div>';
    var todayS = B.todayStr();
    for (var d = 1; d <= daysIn; d++) {
      var ds = B.ymd(new Date(advY, advM, d));
      var isPast = ds < todayS;
      var chips = (byDate[ds] || []).map(function (r) {
        return '<button type="button" class="adm-chip s-' + esc(r.status) + (isPast ? ' past' : '') + '" data-id="' + r.id + '">' +
          esc(r.desired_time ? r.desired_time.slice(0, 5) + ' ' : '') + esc(r.name || '예약') + '</button>';
      }).join('');
      html += '<div class="adm-cell' + (isPast ? ' past' : '') + '"><span class="adm-day">' + d + '</span><div class="adm-chips">' + chips + '</div></div>';
    }
    html += '</div>';
    $('admCal').innerHTML = html;

    $('admCal').querySelectorAll('.adm-chip').forEach(function (c) {
      c.addEventListener('click', function () { openDetail(c.dataset.id); });
    });
  }

  // ----- 상세 모달 -----
  window.openDetail = function (id) {
    var r = bookings.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!r) return;
    $('admDetailBody').innerHTML =
      '<h3 class="adm-detail-title">' + esc(r.name || '예약') + ' <span class="tag s-' + esc(r.status) + '">' + esc(r.status) + '</span></h3>' +
      '<div class="adm-detail-kv">' + bookingFullHtml(r) + '</div>' +
      '<div class="adm-detail-actions">' + statusBtns(r) + '</div>';
    $('admDetailBody').querySelectorAll('.st-btn').forEach(function (b) {
      b.addEventListener('click', function () { setStatus(b.dataset.id, b.dataset.st); closeDetail(); });
    });
    $('admDetailBody').querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () { delBooking(b.dataset.del); closeDetail(); });
    });
    $('admDetailOverlay').classList.add('open');
  };
  window.closeDetail = function () { $('admDetailOverlay').classList.remove('open'); };
  $('admDetailOverlay').addEventListener('click', function (e) {
    if (e.target === $('admDetailOverlay')) closeDetail();
  });

  // ----- 예약 직접 추가 (네이버/전화/방문) -----
  var ADD = { viewY: 0, viewM: 0, selDate: '', selTime: '' };

  function addSettings() {
    return curSettings || JSON.parse(JSON.stringify(window.LamiBooking.DEFAULT_SETTINGS));
  }

  window.addMonthShift = function (delta) {
    var m = ADD.viewM + delta, y = ADD.viewY;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    var now = new Date();
    if (y < now.getFullYear() || (y === now.getFullYear() && m < now.getMonth())) return;
    ADD.viewY = y; ADD.viewM = m; renderAddCal();
  };

  function renderAddCal() {
    var B = window.LamiBooking, S = addSettings();
    var first = new Date(ADD.viewY, ADD.viewM, 1), startDow = first.getDay();
    var daysIn = new Date(ADD.viewY, ADD.viewM + 1, 0).getDate();
    var now = new Date();
    var canPrev = !(ADD.viewY === now.getFullYear() && ADD.viewM === now.getMonth());

    var html = '<div class="addpk-head">' +
      '<button type="button" class="addpk-nav"' + (canPrev ? '' : ' disabled') + ' onclick="addMonthShift(-1)">‹</button>' +
      '<span class="addpk-title">' + ADD.viewY + '년 ' + (ADD.viewM + 1) + '월</span>' +
      '<button type="button" class="addpk-nav" onclick="addMonthShift(1)">›</button></div>';
    html += '<div class="addpk-grid">';
    ['일', '월', '화', '수', '목', '금', '토'].forEach(function (w, i) {
      html += '<div class="addpk-dow' + (i === 0 ? ' sun' : (i === 6 ? ' sat' : '')) + '">' + w + '</div>';
    });
    for (var b = 0; b < startDow; b++) html += '<div class="addpk-cell empty"></div>';
    for (var d = 1; d <= daysIn; d++) {
      var ds = B.ymd(new Date(ADD.viewY, ADD.viewM, d));
      var open = B.isOpenDay(ds, S), holiday = B.isHoliday(ds, S), past = ds < B.todayStr();
      var cls = 'addpk-cell', data = '';
      if (past) cls += ' past';
      else if (holiday) cls += ' holiday';
      else if (!open) cls += ' off';
      else { cls += ' ok'; data = ' data-d="' + ds + '"'; }
      if (ds === ADD.selDate) cls += ' sel';
      html += '<div class="' + cls + '"' + data + '>' + d + '</div>';
    }
    html += '</div>';
    var box = $('addCal'); box.innerHTML = html;
    box.querySelectorAll('[data-d]').forEach(function (c) {
      c.addEventListener('click', function () { addPickDate(c.dataset.d); });
    });
  }

  function addPickDate(ds) {
    ADD.selDate = ds; ADD.selTime = '';
    renderAddCal();
    addUpdateSummary();
    var slotBox = $('addSlots');
    var B = window.LamiBooking, S = addSettings();
    var all = B.allSlots(ds, S);
    if (!all.length) { slotBox.innerHTML = '<p class="addpk-hint">해당 날짜는 예약이 불가합니다.</p>'; return; }
    slotBox.innerHTML = '<p class="addpk-hint">불러오는 중...</p>';

    function render(taken) {
      var now = new Date(), isToday = ds === B.todayStr();
      slotBox.innerHTML = all.map(function (hhmm) {
        var disabled = !!taken[hhmm];
        if (isToday) {
          var p = hhmm.split(':');
          if (parseInt(p[0], 10) * 60 + parseInt(p[1], 10) <= now.getHours() * 60 + now.getMinutes()) disabled = true;
        }
        return '<button type="button" class="addpk-slot' + (disabled ? ' taken' : '') + '"' +
          (disabled ? ' disabled' : ' data-t="' + hhmm + '"') + '>' +
          B.fmtSlot(hhmm) + (disabled ? '<span class="x">마감</span>' : '') + '</button>';
      }).join('');
      slotBox.querySelectorAll('[data-t]').forEach(function (b) {
        b.addEventListener('click', function () { addPickTime(b.dataset.t, b); });
      });
    }

    db.rpc('taken_slots', { d: ds, cid: CID }).then(function (res) {
      var taken = {};
      (res && res.data ? res.data : []).forEach(function (row) { taken[(row && row.t != null) ? row.t : row] = true; });
      render(taken);
    });
  }

  function addPickTime(hhmm, el) {
    ADD.selTime = hhmm;
    $('addSlots').querySelectorAll('.addpk-slot').forEach(function (b) { b.classList.remove('sel'); });
    if (el) el.classList.add('sel');
    addUpdateSummary();
  }

  function addUpdateSummary() {
    var box = $('addSummary');
    if (ADD.selDate && ADD.selTime) {
      var B = window.LamiBooking, d = new Date(ADD.selDate + 'T00:00:00');
      var wd = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
      box.innerHTML = '선택: <b>' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일(' + wd + ') ' + B.fmtSlot(ADD.selTime) + '</b>';
      box.hidden = false;
    } else { box.hidden = true; }
  }

  window.openAdd = function () {
    ['addName', 'addPhone', 'addMemo'].forEach(function (id) { $(id).value = ''; });
    $('addVisit').selectedIndex = 0;
    $('addSource').selectedIndex = 0;
    $('addStatus').selectedIndex = 0;
    $('addErr').textContent = '';
    ADD.selDate = ''; ADD.selTime = '';
    var now = new Date(); ADD.viewY = now.getFullYear(); ADD.viewM = now.getMonth();
    renderAddCal();
    addUpdateSummary();
    $('addSlots').innerHTML = '<p class="addpk-hint">날짜를 먼저 선택해 주세요.</p>';
    $('admAddOverlay').classList.add('open');
  };
  window.closeAdd = function () { $('admAddOverlay').classList.remove('open'); };
  $('admAddOverlay').addEventListener('click', function (e) {
    if (e.target === $('admAddOverlay')) closeAdd();
  });

  $('addSaveBtn').addEventListener('click', function () {
    var err = $('addErr'); err.textContent = '';
    var name = $('addName').value.trim();
    var date = ADD.selDate;
    var time = ADD.selTime;
    if (!name) { err.textContent = '성함을 입력하세요.'; return; }
    if (!date) { err.textContent = '날짜를 선택하세요.'; return; }
    if (!time) { err.textContent = '시간을 선택하세요.'; return; }
    var row = {
      clinic_id: CID,
      name: name,
      phone: $('addPhone').value.trim() || null,
      visit_type: $('addVisit').value,
      desired_date: date,
      desired_time: time,
      memo: $('addMemo').value.trim() || null,
      source: $('addSource').value,
      kind: '예약',
      status: $('addStatus').value
    };
    var btn = $('addSaveBtn'); btn.disabled = true; btn.textContent = '추가 중...';
    db.from('reservations').insert([row]).then(function (res) {
      btn.disabled = false; btn.textContent = '예약 추가';
      if (res.error) { err.textContent = '오류: ' + res.error.message; return; }
      closeAdd();
      loadBookings();
    });
  });

  // =================== 공지 ===================
  function resetNoticeForm() {
    $('noticeId').value = '';
    $('noticeTitle').value = '';
    $('noticeContent').value = '';
    $('noticePinned').checked = false;
    $('noticeFormTitle').textContent = '공지 작성';
    $('noticeSaveBtn').textContent = '등록';
    $('noticeCancelBtn').hidden = true;
  }

  $('noticeSaveBtn').addEventListener('click', function () {
    var id = $('noticeId').value;
    var row = {
      title: $('noticeTitle').value.trim(),
      content: $('noticeContent').value.trim(),
      pinned: $('noticePinned').checked
    };
    if (!row.title || !row.content) { alert('제목과 내용을 입력하세요.'); return; }
    if (!id) row.clinic_id = CID;
    var q = id ? db.from('notices').update(row).eq('id', id) : db.from('notices').insert([row]);
    q.then(function (res) {
      if (res.error) { alert('저장 오류: ' + res.error.message); return; }
      resetNoticeForm();
      loadNotices();
    });
  });
  $('noticeCancelBtn').addEventListener('click', resetNoticeForm);

  function loadNotices() {
    db.from('notices').select('*').eq('clinic_id', CID).order('pinned', { ascending: false })
      .order('created_at', { ascending: false }).then(function (res) {
      var box = $('noticeList');
      if (res.error) { box.innerHTML = '<div class="empty">불러오기 오류: ' + esc(res.error.message) + '</div>'; return; }
      var rows = res.data || [];
      if (!rows.length) { box.innerHTML = '<div class="empty">등록된 공지가 없습니다.</div>'; return; }
      box.innerHTML = rows.map(function (n) {
        return '<div class="rec">' +
          '<div class="rec-top">' +
            (n.pinned ? '<span class="rec-pin">고정</span>' : '') +
            '<span class="rec-name">' + esc(n.title) + '</span>' +
            '<span class="rec-spacer"></span>' +
            '<span class="rec-meta">' + fmt(n.created_at) + '</span>' +
          '</div>' +
          '<div class="rec-body">' + esc(n.content) + '</div>' +
          '<div class="rec-actions">' +
            '<button class="btn-ghost" data-edit="' + n.id + '">수정</button>' +
            '<button class="btn-danger" data-del="' + n.id + '">삭제</button>' +
          '</div>' +
        '</div>';
      }).join('');

      box.querySelectorAll('[data-edit]').forEach(function (b) {
        b.addEventListener('click', function () {
          var n = rows.filter(function (x) { return x.id === b.dataset.edit; })[0];
          if (!n) return;
          $('noticeId').value = n.id;
          $('noticeTitle').value = n.title;
          $('noticeContent').value = n.content;
          $('noticePinned').checked = n.pinned;
          $('noticeFormTitle').textContent = '공지 수정';
          $('noticeSaveBtn').textContent = '수정 저장';
          $('noticeCancelBtn').hidden = false;
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      });
      box.querySelectorAll('[data-del]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (!confirm('이 공지를 삭제할까요?')) return;
          db.from('notices').delete().eq('id', b.dataset.del).then(loadNotices);
        });
      });
    });
  }

  // =================== 예약설정 (영업시간/공휴일) ===================
  var WD = [
    { k: '1', n: '월요일' }, { k: '2', n: '화요일' }, { k: '3', n: '수요일' },
    { k: '4', n: '목요일' }, { k: '5', n: '금요일' }, { k: '6', n: '토요일' }, { k: '0', n: '일요일' }
  ];
  var curSettings = null;

  function loadSettings() {
    db.from('clinic_settings').select('*').eq('clinic_id', CID).single().then(function (res) {
      curSettings = (res && res.data) ? {
        hours: res.data.hours || {}, slot_minutes: res.data.slot_minutes || 30, holidays: res.data.holidays || []
      } : JSON.parse(JSON.stringify(window.LamiBooking.DEFAULT_SETTINGS));
      renderHours();
      renderHolidays();
      $('slotMinutes').value = String(curSettings.slot_minutes);
    });
  }

  function renderHours() {
    var box = $('hoursEditor');
    box.innerHTML = WD.map(function (w) {
      var c = curSettings.hours[w.k] || { closed: true };
      var dis = c.closed ? 'disabled' : '';
      return '<div class="day-card' + (c.closed ? ' off' : '') + '" data-wd="' + w.k + '">' +
        '<div class="day-top">' +
          '<span class="day-name">' + w.n + '</span>' +
          '<label class="day-off"><input type="checkbox" class="hr-off"' + (c.closed ? ' checked' : '') + '> 휴무</label>' +
        '</div>' +
        '<div class="day-fields">' +
          '<div class="ff"><label>진료시간</label>' +
            '<input type="time" class="hr-open" value="' + (c.open || '10:00') + '" ' + dis + '> ~ ' +
            '<input type="time" class="hr-close" value="' + (c.close || '17:30') + '" ' + dis + '></div>' +
          '<div class="ff"><label>휴게시간</label>' +
            '<input type="time" class="hr-ls" value="' + (c.lunchStart || '') + '" ' + dis + '> ~ ' +
            '<input type="time" class="hr-le" value="' + (c.lunchEnd || '') + '" ' + dis + '>' +
            '<span class="ff-hint">(없으면 비워두기)</span></div>' +
          '<div class="ff"><label>접수마감</label>' +
            '점심 <input type="time" class="hr-al" value="' + (c.acceptLunch || '') + '" ' + dis + '> ' +
            '종료 <input type="time" class="hr-ac" value="' + (c.acceptClose || '') + '" ' + dis + '></div>' +
        '</div>' +
      '</div>';
    }).join('');

    box.querySelectorAll('.hr-off').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var card = cb.closest('.day-card');
        card.classList.toggle('off', cb.checked);
        card.querySelectorAll('input[type="time"]').forEach(function (i) { i.disabled = cb.checked; });
      });
    });
  }

  $('settingsSaveBtn').addEventListener('click', function () {
    var hours = {};
    $('hoursEditor').querySelectorAll('.day-card').forEach(function (row) {
      var wd = row.dataset.wd;
      var closed = row.querySelector('.hr-off').checked;
      if (closed) { hours[wd] = { closed: true }; return; }
      var o = { closed: false, open: row.querySelector('.hr-open').value, close: row.querySelector('.hr-close').value };
      var ls = row.querySelector('.hr-ls').value, le = row.querySelector('.hr-le').value;
      if (ls && le) { o.lunchStart = ls; o.lunchEnd = le; }
      var al = row.querySelector('.hr-al').value, ac = row.querySelector('.hr-ac').value;
      if (al) o.acceptLunch = al;
      if (ac) o.acceptClose = ac;
      hours[wd] = o;
    });
    var payload = {
      clinic_id: CID, hours: hours,
      slot_minutes: parseInt($('slotMinutes').value, 10),
      holidays: curSettings.holidays || [],
      updated_at: new Date().toISOString()
    };
    var msg = $('settingsMsg'); msg.textContent = '저장 중...';
    db.from('clinic_settings').upsert(payload, { onConflict: 'clinic_id' }).then(function (res) {
      if (res.error) { msg.textContent = '오류: ' + res.error.message; msg.style.color = '#d33'; return; }
      curSettings.hours = hours; curSettings.slot_minutes = payload.slot_minutes;
      msg.textContent = '저장되었습니다 ✓'; msg.style.color = '#2e7d32';
      setTimeout(function () { msg.textContent = ''; }, 2500);
    });
  });

  function saveHolidays() {
    return db.from('clinic_settings').upsert({
      clinic_id: CID, hours: curSettings.hours, slot_minutes: curSettings.slot_minutes,
      holidays: curSettings.holidays, updated_at: new Date().toISOString()
    }, { onConflict: 'clinic_id' });
  }

  function renderHolidays() {
    var box = $('holidayList');
    var list = (curSettings.holidays || []).slice().sort();
    if (!list.length) { box.innerHTML = '<div class="empty" style="padding:18px 0">추가된 휴무일이 없습니다.</div>'; return; }
    box.innerHTML = list.map(function (d) {
      return '<div class="holiday-chip">' + d + '<button type="button" data-h="' + d + '">✕</button></div>';
    }).join('');
    box.querySelectorAll('[data-h]').forEach(function (b) {
      b.addEventListener('click', function () {
        curSettings.holidays = curSettings.holidays.filter(function (x) { return x !== b.dataset.h; });
        saveHolidays().then(renderHolidays);
      });
    });
  }

  $('holidayAddBtn').addEventListener('click', function () {
    var v = $('holidayInput').value;
    if (!v) return;
    if (curSettings.holidays.indexOf(v) === -1) {
      curSettings.holidays.push(v);
      saveHolidays().then(function () { $('holidayInput').value = ''; renderHolidays(); });
    }
  });

  // =================== 결제 (요금제 / 작업티켓) ===================
  // ※ 토스 구독결제 가맹점 승인 후 checkout()만 실제 연동으로 교체하면 됨.
  var PLANS = [
    { id: 'light', name: 'Light', price: 33000, desc: '호스팅', features: ['홈페이지 호스팅', '예약·예진표·공지 관리'] },
    { id: 'standard', name: 'Standard', price: 66000, desc: '호스팅 + 작업티켓 1장', features: ['Light 전체 기능', '매월 작업티켓 1장'], popular: true },
    { id: 'pro', name: 'Pro', price: 99000, desc: '호스팅 + 작업티켓 2장', features: ['Light 전체 기능', '매월 작업티켓 2장'] }
  ];
  var TICKET_PRICE = 55000;
  var billCycle = 'monthly';

  // 병원 플랜 id → noad 코어 Plan enum (가격·기능 동일)
  var PLAN_MAP = { light: 'BASIC', standard: 'STANDARD', pro: 'PRO' };

  function won(n) { return n.toLocaleString('ko-KR') + '원'; }

  // noad 핸드오버: Edge Function 'noad-handover' 가 로그인 사용자 → 서명 토큰 → URL 발급.
  // opts = { target:'billing'|'work', plan?, interval?, btn? }
  function openNoad(opts) {
    var btn = opts.btn;
    if (btn) { btn.disabled = true; if (!btn.dataset.t) btn.dataset.t = btn.textContent; btn.textContent = '여는 중…'; }
    function restore() { if (btn) { btn.disabled = false; btn.textContent = btn.dataset.t || '열기'; } }
    var body = {
      target: opts.target,
      clinicName: (window.LAMI_CONFIG && window.LAMI_CONFIG.CLINIC_NAME) || CID,
      returnUrl: location.href
    };
    if (opts.plan) body.plan = opts.plan;
    if (opts.interval) body.interval = opts.interval;
    db.functions.invoke('noad-handover', { body: body }).then(function (res) {
      if (res.error || !res.data || !res.data.url) {
        restore();
        var m = (res.error && (res.error.message || res.error)) || (res.data && res.data.error) || '';
        alert('결제 페이지 연결에 실패했습니다.\n잠시 후 다시 시도해 주세요.' + (m ? '\n(' + m + ')' : ''));
        return;
      }
      window.location.href = res.data.url;
    }, function () {
      restore();
      alert('네트워크 오류로 결제 페이지를 열지 못했습니다.');
    });
  }

  function renderPlans() {
    var box = $('planCards'); if (!box) return;
    var yearly = (billCycle === 'yearly');
    box.innerHTML = PLANS.map(function (p) {
      var yr = Math.round(p.price * 12 * 0.9);
      var priceMain = yearly ? (won(yr) + ' <span class="per">/년</span>') : (won(p.price) + ' <span class="per">/월</span>');
      var priceSub = yearly ? ('월 ' + won(Math.round(yr / 12)) + ' 상당 · 10% 할인') : 'VAT 포함';
      return '<div class="plan' + (p.popular ? ' popular' : '') + '">' +
        (p.popular ? '<div class="plan-badge">인기</div>' : '') +
        '<div class="plan-name">' + p.name + '</div>' +
        '<div class="plan-desc">' + esc(p.desc) + '</div>' +
        '<div class="plan-price">' + priceMain + '</div>' +
        '<div class="plan-price-sub">' + priceSub + '</div>' +
        '<ul class="plan-feats">' + p.features.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>' +
        '<button class="btn-primary plan-btn" data-plan="' + p.id + '">결제하기</button>' +
      '</div>';
    }).join('');
    box.querySelectorAll('[data-plan]').forEach(function (b) {
      b.addEventListener('click', function () { checkout('plan', b.dataset.plan, b); });
    });
  }

  function renderTicket() {
    var box = $('ticketCard'); if (!box) return;
    box.innerHTML =
      '<div class="ticket-info">' +
        '<div class="ticket-name">작업티켓 1장</div>' +
        '<div class="ticket-desc">최대 2시간 작업 분량의 요청권입니다. 배너, 팝업, 기능수정, 디자인수정 등에 사용할 수 있습니다.<br><span class="ticket-sub">(작업시간이 2시간을 초과할 경우 관리자가 별도로 연락을 드립니다.)</span></div>' +
      '</div>' +
      '<div class="ticket-buy-right">' +
        '<div class="plan-price">' + won(TICKET_PRICE) + '</div>' +
        '<button class="btn-primary" data-buy="ticket">티켓 구매</button>' +
      '</div>';
    box.querySelector('[data-buy]').addEventListener('click', function () { checkout('ticket', 'ticket', this); });
  }

  function checkout(kind, id, btn) {
    if (kind === 'ticket') {
      // 티켓 구매 → noad 결제 페이지(티켓 섹션 포함)
      openNoad({ target: 'billing', btn: btn });
    } else {
      // 요금제 결제 → noad 결제 페이지(해당 플랜 선택 상태)
      openNoad({
        target: 'billing',
        plan: PLAN_MAP[id],
        interval: (billCycle === 'yearly' ? 'YEARLY' : 'MONTHLY'),
        btn: btn
      });
    }
  }

  function initBilling() {
    renderPlans();
    renderTicket();
    var bm = $('billMonthly'), by = $('billYearly');
    if (bm && by && !bm.dataset.bound) {
      bm.dataset.bound = '1';
      bm.addEventListener('click', function () { billCycle = 'monthly'; bm.classList.add('active'); by.classList.remove('active'); renderPlans(); });
      by.addEventListener('click', function () { billCycle = 'yearly'; by.classList.add('active'); bm.classList.remove('active'); renderPlans(); });
    }
    var manage = $('billManageBtn');
    if (manage && !manage.dataset.bound) {
      manage.dataset.bound = '1';
      manage.addEventListener('click', function () { openNoad({ target: 'billing', btn: manage }); });
    }
    var workOpen = $('workOpenBtn');
    if (workOpen && !workOpen.dataset.bound) {
      workOpen.dataset.bound = '1';
      workOpen.addEventListener('click', function () { openNoad({ target: 'work', btn: workOpen }); });
    }
  }

  // =================== 작업요청 ===================
  // 작업요청·티켓 잔액은 이제 noad 코어가 소유한다.
  // '작업요청 페이지 열기'(workOpenBtn) → openNoad({target:'work'}) → noad.ai.kr/work-requests
  //  (initBilling 에서 바인딩). 병원 Supabase 의 work_requests/ticket_ledger 는 더 이상 쓰지 않음
  //  (옛 RPC 로 제출하면 콘솔에 안 보이는 고아 요청이 되므로 제거).
})();
