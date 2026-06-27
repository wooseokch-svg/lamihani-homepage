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
    loadReservations();
    loadIntakes();
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
      ['reservations', 'intakes', 'notices', 'settings'].forEach(function (t) {
        $('tab-' + t).hidden = (t !== b.dataset.tab);
      });
    });
  });

  // =================== 예약 ===================
  var RES_STATUS = ['신규', '확정', '취소', '완료'];

  function loadReservations() {
    db.from('reservations').select('*').order('created_at', { ascending: false }).then(function (res) {
      var box = $('resList');
      if (res.error) { box.innerHTML = '<div class="empty">불러오기 오류: ' + esc(res.error.message) + '</div>'; return; }
      var rows = res.data || [];
      var nw = rows.filter(function (r) { return r.status === '신규'; }).length;
      $('cntRes').textContent = nw;
      if (!rows.length) { box.innerHTML = '<div class="empty">접수된 예약이 없습니다.</div>'; return; }
      box.innerHTML = rows.map(function (r) {
        return '<div class="rec">' +
          '<div class="rec-top">' +
            '<span class="rec-name">' + esc(r.name) + '</span>' +
            '<span class="tag s-' + esc(r.status) + '">' + esc(r.status) + '</span>' +
            '<span class="rec-meta">' + esc(r.source || '') + '</span>' +
            '<span class="rec-spacer"></span>' +
            '<span class="rec-meta">' + fmt(r.created_at) + '</span>' +
          '</div>' +
          '<div class="rec-body">' +
            '☎ ' + esc(r.phone) + ' · ' + esc(r.visit_type || '-') +
            ' · 희망: ' + esc(r.desired_date || '-') + ' ' + esc(r.desired_time || '') +
            (r.memo ? '\n📝 ' + esc(r.memo) : '') +
          '</div>' +
          '<div class="rec-actions">' +
            '<select class="status-sel" data-id="' + r.id + '">' +
              RES_STATUS.map(function (s) { return '<option' + (s === r.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
            '</select>' +
            '<button class="btn-danger" data-del="' + r.id + '">삭제</button>' +
          '</div>' +
        '</div>';
      }).join('');

      box.querySelectorAll('.status-sel').forEach(function (sel) {
        sel.addEventListener('change', function () {
          db.from('reservations').update({ status: sel.value }).eq('id', sel.dataset.id).then(loadReservations);
        });
      });
      box.querySelectorAll('[data-del]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (!confirm('이 예약을 삭제할까요?')) return;
          db.from('reservations').delete().eq('id', b.dataset.del).then(loadReservations);
        });
      });
    });
  }

  // =================== 예진표 ===================
  var INT_STATUS = ['신규', '확인', '완료'];

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

  function loadIntakes() {
    db.from('intakes').select('*').order('created_at', { ascending: false }).then(function (res) {
      var box = $('intList');
      if (res.error) { box.innerHTML = '<div class="empty">불러오기 오류: ' + esc(res.error.message) + '</div>'; return; }
      var rows = res.data || [];
      $('cntInt').textContent = rows.filter(function (r) { return r.status === '신규'; }).length;
      if (!rows.length) { box.innerHTML = '<div class="empty">접수된 예진표가 없습니다.</div>'; return; }
      box.innerHTML = rows.map(function (r) {
        var concerns = Array.isArray(r.concerns) ? r.concerns.join(', ') : '';
        return '<div class="rec">' +
          '<div class="rec-top">' +
            '<span class="rec-name">' + esc(r.name || '(이름 없음)') + '</span>' +
            '<span class="tag s-' + esc(r.status) + '">' + esc(r.status) + '</span>' +
            '<span class="rec-spacer"></span>' +
            '<span class="rec-meta">' + fmt(r.created_at) + '</span>' +
          '</div>' +
          '<div class="rec-body">' +
            '☎ ' + esc(r.phone || '-') + ' · ' + esc(r.gender || '-') + ' · ' + esc(r.birth || '-') +
            ' · ' + esc(r.visit_type || '-') +
            ' · 희망: ' + esc(r.desired_date || '-') + ' ' + esc(r.desired_time || '') +
            (concerns ? '\n🩺 고민: ' + esc(concerns) : '') +
          '</div>' +
          '<div class="rec-actions">' +
            '<button class="detail-toggle" data-detail="' + r.id + '">상세 보기</button>' +
            '<span class="rec-spacer"></span>' +
            '<select class="status-sel" data-id="' + r.id + '">' +
              INT_STATUS.map(function (s) { return '<option' + (s === r.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
            '</select>' +
            '<button class="btn-danger" data-del="' + r.id + '">삭제</button>' +
          '</div>' +
          '<div class="rec-detail" id="det-' + r.id + '" hidden style="margin-top:10px">' +
            detailsHtml(r.details) +
            (r.meds ? '<div class="kv"><b>복용 약물:</b> ' + esc(r.meds) + '</div>' : '') +
            (r.pregnancy ? '<div class="kv"><b>임신 여부:</b> ' + esc(r.pregnancy) + '</div>' : '') +
            (r.message ? '<div class="kv"><b>남긴 말:</b> ' + esc(r.message) + '</div>' : '') +
          '</div>' +
        '</div>';
      }).join('');

      box.querySelectorAll('[data-detail]').forEach(function (b) {
        b.addEventListener('click', function () {
          var el = $('det-' + b.dataset.detail);
          el.hidden = !el.hidden;
          b.textContent = el.hidden ? '상세 보기' : '접기';
        });
      });
      box.querySelectorAll('.status-sel').forEach(function (sel) {
        sel.addEventListener('change', function () {
          db.from('intakes').update({ status: sel.value }).eq('id', sel.dataset.id).then(loadIntakes);
        });
      });
      box.querySelectorAll('[data-del]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (!confirm('이 예진표를 삭제할까요?')) return;
          db.from('intakes').delete().eq('id', b.dataset.del).then(loadIntakes);
        });
      });
    });
  }

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
