/* =====================================================================
   라미한의원 관리자 페이지 로직
   - Supabase Auth 로그인 → 예약 / 예진표 / 공지 관리
   ===================================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var db = window.lamiDB;

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
  }
  function showLogin() {
    $('adminView').hidden = true;
    $('loginView').hidden = false;
  }

  db.auth.getSession().then(function (res) {
    if (res.data && res.data.session) showAdmin(res.data.session);
    else showLogin();
  });

  // 아이디만 입력하면 내부적으로 이메일로 변환 (예: lamiadmin -> lamiadmin@gmail.co.kr)
  // ※ Supabase Auth에 등록한 관리자 이메일의 도메인과 일치해야 합니다.
  var ADMIN_DOMAIN = '@gmail.co.kr';

  $('loginBtn').addEventListener('click', function () {
    var idInput = $('email').value.trim();
    var email = idInput.indexOf('@') === -1 ? idInput + ADMIN_DOMAIN : idInput;
    var password = $('password').value;
    $('loginMsg').textContent = '';
    if (!idInput || !password) { $('loginMsg').textContent = '아이디와 비밀번호를 입력하세요.'; return; }
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
      ['intakes', 'notices', 'settings'].forEach(function (t) {
        $('tab-' + t).hidden = (t !== b.dataset.tab);
      });
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
      '<div class="kv"><b>방문유형:</b> ' + esc(r.visit_type || '-') + '</div>';
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
    db.from('reservations').select('*').order('created_at', { ascending: false }).then(function (res) {
      var box = $('bookingList');
      if (res.error) { box.innerHTML = '<div class="empty">불러오기 오류: ' + esc(res.error.message) + '</div>'; return; }
      bookings = res.data || [];
      $('cntInt').textContent = bookings.filter(function (r) { return r.status === '신규'; }).length;

      var now = new Date(); advY = now.getFullYear(); advM = now.getMonth();
      renderAdminCal();

      if (!bookings.length) { box.innerHTML = '<div class="empty">접수된 예약이 없습니다.</div>'; return; }
      box.innerHTML = bookings.map(function (r) {
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
            (concerns ? ' · 🩺 ' + esc(concerns) : '') + '</div>' +
          (isYj ? '<button class="detail-toggle" data-detail="' + r.id + '">상세 보기</button>' +
            '<div class="rec-detail" id="det-' + r.id + '" hidden style="margin-top:8px">' + bookingFullHtml(r) + '</div>' : '') +
          '<div class="rec-actions">' + statusBtns(r) + '</div>' +
        '</div>';
      }).join('');

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
    for (var d = 1; d <= daysIn; d++) {
      var ds = B.ymd(new Date(advY, advM, d));
      var chips = (byDate[ds] || []).map(function (r) {
        return '<button type="button" class="adm-chip s-' + esc(r.status) + '" data-id="' + r.id + '">' +
          esc(r.desired_time ? r.desired_time.slice(0, 5) + ' ' : '') + esc(r.name || '예약') + '</button>';
      }).join('');
      html += '<div class="adm-cell"><span class="adm-day">' + d + '</span><div class="adm-chips">' + chips + '</div></div>';
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
    var q = id ? db.from('notices').update(row).eq('id', id) : db.from('notices').insert([row]);
    q.then(function (res) {
      if (res.error) { alert('저장 오류: ' + res.error.message); return; }
      resetNoticeForm();
      loadNotices();
    });
  });
  $('noticeCancelBtn').addEventListener('click', resetNoticeForm);

  function loadNotices() {
    db.from('notices').select('*').order('pinned', { ascending: false })
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
    db.from('clinic_settings').select('*').eq('id', 1).single().then(function (res) {
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
      id: 1, hours: hours,
      slot_minutes: parseInt($('slotMinutes').value, 10),
      holidays: curSettings.holidays || [],
      updated_at: new Date().toISOString()
    };
    var msg = $('settingsMsg'); msg.textContent = '저장 중...';
    db.from('clinic_settings').upsert(payload).then(function (res) {
      if (res.error) { msg.textContent = '오류: ' + res.error.message; msg.style.color = '#d33'; return; }
      curSettings.hours = hours; curSettings.slot_minutes = payload.slot_minutes;
      msg.textContent = '저장되었습니다 ✓'; msg.style.color = '#2e7d32';
      setTimeout(function () { msg.textContent = ''; }, 2500);
    });
  });

  function saveHolidays() {
    return db.from('clinic_settings').upsert({
      id: 1, hours: curSettings.hours, slot_minutes: curSettings.slot_minutes,
      holidays: curSettings.holidays, updated_at: new Date().toISOString()
    });
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
})();
