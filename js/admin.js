/* =====================================================================
   라미한의원 관리자 페이지 로직
   - Supabase Auth 로그인 → 예약 / 예진표 / 공지 관리
   ===================================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var db = window.lamiDB;
  var defaultCID = (window.LAMI_CONFIG && window.LAMI_CONFIG.CLINIC_ID) || 'lamihani';
  var CID = defaultCID;  // 현재 병원의 primary(공지·결제·로그인 기준). loadClinics()가 설정
  function clinicLabel(id) { return (window.CLINIC_NAMES && window.CLINIC_NAMES[id]) || id; }

  // 병원 그룹/유닛 — 별내는 예약·운영시간만 2유닛(성인/소아), 나머지는 공통(primary 하나)
  var curGroup = null;
  var unitIds = [defaultCID];  // 예약/시간 유닛 clinic_id 들 (별내=2, 그 외=1)
  var hoursUnit = defaultCID;  // 운영시간 편집 중인 유닛
  var bookingFilter = 'all';   // 예진표예약 탭 유닛 필터 (all / 성인 / 소아)
  function unitLabel(cid) {
    var grp = curGroup && window.CLINIC_GROUPS && window.CLINIC_GROUPS[curGroup];
    if (grp) { for (var i = 0; i < grp.units.length; i++) if (grp.units[i].id === cid) return grp.units[i].label; }
    return clinicLabel(cid);
  }
  function setGroup(g) {
    curGroup = g;
    var grp = window.CLINIC_GROUPS && window.CLINIC_GROUPS[g];
    if (grp) { CID = grp.primary; unitIds = grp.units.map(function (u) { return u.id; }); }
    else { CID = g; unitIds = [g]; }
    hoursUnit = unitIds[0];
    bookingFilter = unitIds[0];
  }

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
  // esc 처리된 문자열의 URL을 새 창 링크로 변환
  function linkify(html) {
    return html.replace(/(https?:\/\/[^\s<]+)/g, function (url) {
      return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>';
    });
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
    loadClinics();
  }

  // 선택된 병원(CID)으로 화면 전체 갱신
  function loadAllForClinic() {
    var name = (curGroup && window.CLINIC_GROUPS && window.CLINIC_GROUPS[curGroup] && window.CLINIC_GROUPS[curGroup].name) || clinicLabel(CID);
    document.title = name + ' 관리자';
    var brand = document.querySelector('.adm-header .brand'); if (brand) brand.textContent = name + ' 관리자';
    var grp0 = window.CLINIC_GROUPS && window.CLINIC_GROUPS[curGroup];
    var nl = $('naverLink'); if (nl) { var nv = grp0 ? grp0.naver : (window.LAMI_CONFIG && window.LAMI_CONFIG.NAVER_RESERVE_URL); if (nv) { nl.href = nv; nl.hidden = false; } else { nl.hidden = true; } }
    hoursUnit = unitIds[0];
    renderHoursUnitTabs();
    renderBookingUnitFilter();
    loadBookings();
    loadNotices();
    loadSettings();
    checkClinicBlock(); // 미납 시 admin 전체 차단 + 결제 유도
  }

  // 마스터(여러 병원) → 병원 선택 드롭다운. 단일 병원/미설정 → 드롭다운 숨김(도메인 병원).
  function loadClinics() {
    db.rpc('auth_clinics').then(function (res) {
      var units = (res && !res.error && Array.isArray(res.data))
        ? res.data.map(function (r) { return (r && typeof r === 'object') ? (r.auth_clinics || r.clinic_id) : r; }).filter(Boolean)
        : [];
      var groups = [];
      units.forEach(function (u) { var g = (window.clinicGroupOf && window.clinicGroupOf(u)) || u; if (groups.indexOf(g) === -1) groups.push(g); });
      var defGroup = (window.clinicGroupOf && window.clinicGroupOf(defaultCID)) || defaultCID;
      var sel = $('clinicSelect');
      if (groups.length > 1 && sel) {
        sel.innerHTML = groups.map(function (g) {
          var nm = (window.CLINIC_GROUPS && window.CLINIC_GROUPS[g] && window.CLINIC_GROUPS[g].name) || clinicLabel(g);
          return '<option value="' + g + '">' + nm + '</option>';
        }).join('');
        var pick = (groups.indexOf(defGroup) !== -1) ? defGroup : groups[0];
        sel.value = pick; sel.hidden = false;
        setGroup(pick);
        sel.onchange = function () {
          setGroup(sel.value);
          ['billFrame', 'workFrame', 'msgFrame'].forEach(function (id) { var f = $(id); if (f) { f.dataset.loaded = ''; } });
          loadAllForClinic();
        };
      } else {
        setGroup(groups.length ? groups[0] : defGroup);
        if (sel) sel.hidden = true;
      }
      loadAllForClinic();
    }, function () {
      if ($('clinicSelect')) $('clinicSelect').hidden = true;
      setGroup((window.clinicGroupOf && window.clinicGroupOf(defaultCID)) || defaultCID);
      loadAllForClinic();
    });
  }

  // =================== 연성차단 (미납) ===================
  // noad 코어 구독상태 조회 → blockAdmin 이면 admin 전체 오버레이 + 결제 유도.
  // (토스 승인 전엔 코어가 항상 blockAdmin=false 반환하므로 무동작 — 잠금 방지)
  function checkClinicBlock() {
    var cid = CID;
    fetch('https://noad.ai.kr/api/clinic/status?clinicId=' + encodeURIComponent(cid))
      .then(function (r) { return r.json(); })
      .then(function (s) { if (s && s.blockAdmin) showBlockOverlay(s.daysOverdue || 0); })
      .catch(function () { /* 조회 실패 → 차단 안 함(안전) */ });
  }
  function showBlockOverlay(days) {
    if (document.getElementById('clinicBlock')) return;
    var ov = document.createElement('div');
    ov.id = 'clinicBlock';
    ov.className = 'clinic-block';
    ov.innerHTML =
      '<div class="clinic-block-card">' +
        '<div class="clinic-block-title">구독이 만료되었습니다</div>' +
        '<p class="clinic-block-desc">서비스를 계속 이용하시려면 결제가 필요합니다.' +
        (days ? '<br>(' + days + '일 미납)' : '') + '</p>' +
        '<button class="btn-primary" id="clinicBlockPay" type="button">결제하기</button>' +
      '</div>';
    document.body.appendChild(ov);
    document.getElementById('clinicBlockPay').addEventListener('click', function () {
      var btn = this; btn.disabled = true; btn.textContent = '여는 중…';
      db.functions.invoke('noad-handover', {
        body: { target: 'billing', clinicName: clinicLabel(CID), returnUrl: location.href }
      }).then(function (res) {
        if (res.data && res.data.url) { window.location.href = res.data.url; }
        else { btn.disabled = false; btn.textContent = '결제하기'; alert('결제 페이지 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.'); }
      }, function () { btn.disabled = false; btn.textContent = '결제하기'; alert('네트워크 오류로 결제 페이지를 열지 못했습니다.'); });
    });
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
      ['intakes', 'notices', 'settings', 'billing', 'work', 'msg', 'staff'].forEach(function (t) {
        $('tab-' + t).hidden = (t !== b.dataset.tab);
      });
      // 결제·작업요청·메시지 탭은 처음 열 때 noad 페이지를 iframe 으로 로드
      if (b.dataset.tab === 'billing') loadNoadFrame('billing', 'billFrame', 'billLoading');
      if (b.dataset.tab === 'work') loadNoadFrame('work', 'workFrame', 'workLoading');
      if (b.dataset.tab === 'msg') loadNoadFrame('messaging', 'msgFrame', 'msgLoading');
      if (b.dataset.tab === 'staff') loadStaff();
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

  // =================== 직원 계정 (clinic-admin Edge Function) ===================
  function staffApi(action, payload) {
    return db.functions.invoke('clinic-admin', { body: Object.assign({ action: action, clinicIds: unitIds }, payload || {}) })
      .then(function (res) {
        if (res.error) throw new Error((res.error && res.error.message) || '요청 실패');
        var d = res.data || {};
        if (d.error) throw new Error(d.error);
        return d;
      });
  }
  function loadStaff() {
    if (!$('staffList')) return;
    $('staffList').innerHTML = '<div class="empty">불러오는 중...</div>';
    // 엣지함수 list 는 호출자(본인)를 제외하므로, 세션의 본인 계정을 맨 앞에 '나'로 표시.
    db.auth.getUser().then(function (u) {
      var me = (u && u.data && u.data.user) ? u.data.user : null;
      return staffApi('list').then(function (d) {
        var admins = (d.admins || []).filter(function (a) { return !me || a.id !== me.id; });
        if (me) admins.unshift({ id: me.id, email: me.email, last_sign_in_at: me.last_sign_in_at, _self: true });
        if (!admins.length) { $('staffList').innerHTML = '<div class="empty">등록된 관리자가 없습니다.</div>'; return; }
        $('staffList').innerHTML = admins.map(function (a) {
          var last = a.last_sign_in_at ? new Date(a.last_sign_in_at).toLocaleString('ko-KR') : '로그인 기록 없음';
          var meBadge = a._self ? ' <span style="font-size:11px;color:#157076;font-weight:700;background:#e2f3f1;padding:2px 7px;border-radius:10px;margin-left:4px">나</span>' : '';
          return '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 2px;border-bottom:1px solid #eee">' +
            '<div><b>' + esc(a.email || '') + '</b>' + meBadge + '<div style="font-size:12px;color:#888;margin-top:2px">최근 로그인: ' + esc(last) + '</div></div>' +
            (a._self ? '' : '<button class="btn-ghost staff-del" data-id="' + esc(a.id) + '" data-email="' + esc(a.email || '') + '">삭제</button>') +
            '</div>';
        }).join('');
      });
    }).catch(function (e) {
      $('staffList').innerHTML = '<div class="empty">불러오기 실패: ' + esc(e.message) + '</div>';
    });
  }
  if ($('staffAddBtn')) {
    $('staffAddBtn').addEventListener('click', function () {
      var email = $('staffEmail').value.trim();
      var pw = $('staffPw').value;
      var msg = $('staffMsg');
      msg.style.color = ''; msg.textContent = '';
      if (!email || pw.length < 8) { msg.style.color = '#c0392b'; msg.textContent = '이메일과 8자 이상 비밀번호를 입력하세요.'; return; }
      $('staffAddBtn').disabled = true; $('staffAddBtn').textContent = '추가 중...';
      staffApi('create', { email: email, password: pw }).then(function () {
        msg.style.color = '#2e7d32'; msg.textContent = '추가됐습니다 ✓';
        $('staffEmail').value = ''; $('staffPw').value = '';
        loadStaff();
      }).catch(function (e) {
        msg.style.color = '#c0392b'; msg.textContent = '실패: ' + e.message;
      }).then(function () {
        $('staffAddBtn').disabled = false; $('staffAddBtn').textContent = '계정 추가';
      });
    });
    $('staffList').addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.staff-del') : null;
      if (!btn) return;
      var id = btn.getAttribute('data-id'), email = btn.getAttribute('data-email');
      if (!confirm(email + ' 계정을 삭제할까요? 되돌릴 수 없습니다.')) return;
      btn.disabled = true;
      staffApi('delete', { user_id: id }).then(function () { loadStaff(); })
        .catch(function (err) { alert('삭제 실패: ' + err.message); btn.disabled = false; });
    });
  }

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

  // 예진표예약 탭 유닛 필터 바 (별내=전체/성인/소아). 단일 병원은 표시 안 함.
  function renderBookingUnitFilter() {
    var tab = $('tab-intakes'); if (!tab) return;
    var bar = $('bookingUnitBar');
    if (unitIds.length <= 1) { if (bar && bar.parentNode) bar.parentNode.removeChild(bar); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'bookingUnitBar';
      bar.style.cssText = 'display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap';
      tab.insertBefore(bar, tab.firstChild);
    }
    var opts = unitIds.map(function (u) { return { id: u, label: unitLabel(u) }; });
    bar.innerHTML = opts.map(function (o) {
      var on = (bookingFilter === o.id);
      return '<button type="button" data-bu="' + o.id + '" style="padding:8px 16px;border-radius:8px;border:1px solid ' + (on ? '#0e8a58' : '#d5d5d5') + ';background:' + (on ? '#e8f6ee' : '#fff') + ';color:' + (on ? '#0e8a58' : '#666') + ';font-weight:700;font-size:14px;cursor:pointer">' + esc(o.label) + '</button>';
    }).join('');
    bar.querySelectorAll('[data-bu]').forEach(function (b) {
      b.addEventListener('click', function () { bookingFilter = b.dataset.bu; renderBookingUnitFilter(); loadBookings(); });
    });
  }

  function loadBookings() {
    var qUnits = (unitIds.indexOf(bookingFilter) !== -1) ? [bookingFilter] : unitIds;
    db.from('reservations').select('*').in('clinic_id', qUnits).order('created_at', { ascending: false }).then(function (res) {
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
        (unitIds.length > 1 ? '<span style="font-size:11px;font-weight:700;color:#0e8a58;background:#e8f6ee;border-radius:5px;padding:2px 7px;margin-left:2px">' + esc(unitLabel(r.clinic_id)) + '</span>' : '') +
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
  var addUnit = defaultCID;      // 직접추가 대상 유닛 (예약 필터 따라감)
  var addSettingsCache = null;

  function addSettings() {
    return addSettingsCache || curSettings || JSON.parse(JSON.stringify(window.LamiBooking.DEFAULT_SETTINGS));
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

    db.rpc('taken_slots', { d: ds, cid: addUnit }).then(function (res) {
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

  // 직접추가 캘린더 — 선택 유닛(addUnit)의 clinic_settings 로드 후 렌더
  function loadAddCalSettings() {
    addSettingsCache = null;
    ADD.selDate = ''; ADD.selTime = '';
    $('addSlots').innerHTML = '<p class="addpk-hint">날짜를 먼저 선택해 주세요.</p>';
    if (window.lamiDB) {
      db.from('clinic_settings').select('*').eq('clinic_id', addUnit).single().then(function (res) {
        if (res && res.data && res.data.hours) addSettingsCache = { hours: res.data.hours, slot_minutes: res.data.slot_minutes || 30, holidays: res.data.holidays || [] };
        renderAddCal(); addUpdateSummary();
      }, function () { renderAddCal(); });
    } else { renderAddCal(); }
  }
  // 직접추가 성인/소아 선택 버튼 (별내만). 단일 병원은 숨김.
  function renderAddUnitSel() {
    var box = $('addUnitSel'), row = $('addUnitRow'); if (!box || !row) return;
    if (unitIds.length <= 1) { row.hidden = true; return; }
    row.hidden = false;
    box.innerHTML = unitIds.map(function (u) {
      var on = (u === addUnit);
      return '<button type="button" data-au="' + u + '" style="padding:7px 15px;border-radius:8px;border:1px solid ' + (on ? '#0e8a58' : '#d5d5d5') + ';background:' + (on ? '#e8f6ee' : '#fff') + ';color:' + (on ? '#0e8a58' : '#666') + ';font-weight:700;font-size:13px;cursor:pointer">' + esc(unitLabel(u)) + '</button>';
    }).join('');
    box.querySelectorAll('[data-au]').forEach(function (b) {
      b.addEventListener('click', function () { addUnit = b.dataset.au; renderAddUnitSel(); loadAddCalSettings(); });
    });
  }
  window.openAdd = function () {
    addUnit = (unitIds.indexOf(bookingFilter) !== -1) ? bookingFilter : unitIds[0];
    var grp = window.CLINIC_GROUPS && window.CLINIC_GROUPS[curGroup];
    $('addSource').innerHTML = (grp && grp.naver ? ['네이버'] : []).concat(['전화', '방문', '기타']).map(function (s) { return '<option>' + s + '</option>'; }).join('');
    renderAddUnitSel();
    ['addName', 'addPhone', 'addMemo'].forEach(function (id) { $(id).value = ''; });
    $('addVisit').selectedIndex = 0;
    $('addSource').selectedIndex = 0;
    $('addStatus').selectedIndex = 0;
    $('addErr').textContent = '';
    var now = new Date(); ADD.viewY = now.getFullYear(); ADD.viewM = now.getMonth();
    $('admAddOverlay').classList.add('open');
    loadAddCalSettings();
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
      clinic_id: addUnit,
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
          '<div class="rec-body">' + linkify(esc(n.content)).replace(/\n/g, '<br>') + '</div>' +
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

  // 운영시간 유닛 선택 탭 (별내=성인/소아 2개). 단일 병원은 표시 안 함.
  function renderHoursUnitTabs() {
    var he = $('hoursEditor'); if (!he) return;
    var bar = $('hoursUnitBar');
    if (unitIds.length <= 1) { if (bar && bar.parentNode) bar.parentNode.removeChild(bar); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'hoursUnitBar';
      bar.style.cssText = 'display:flex;gap:8px;margin-bottom:16px';
      he.parentNode.insertBefore(bar, he);
    }
    bar.innerHTML = unitIds.map(function (u) {
      var on = (u === hoursUnit);
      return '<button type="button" data-u="' + u + '" style="padding:8px 16px;border-radius:8px;border:1px solid ' + (on ? '#0e8a58' : '#d5d5d5') + ';background:' + (on ? '#e8f6ee' : '#fff') + ';color:' + (on ? '#0e8a58' : '#666') + ';font-weight:700;font-size:14px;cursor:pointer">' + esc(unitLabel(u)) + '</button>';
    }).join('');
    bar.querySelectorAll('[data-u]').forEach(function (b) {
      b.addEventListener('click', function () { hoursUnit = b.dataset.u; renderHoursUnitTabs(); loadSettings(); });
    });
  }

  function loadSettings() {
    db.from('clinic_settings').select('*').eq('clinic_id', hoursUnit).single().then(function (res) {
      curSettings = (res && res.data) ? {
        hours: res.data.hours || {}, slot_minutes: res.data.slot_minutes || 30, holidays: res.data.holidays || [],
        auto_confirm: !!(res.data && res.data.auto_confirm)
      } : JSON.parse(JSON.stringify(window.LamiBooking.DEFAULT_SETTINGS));
      renderHours();
      renderHolidays();
      $('slotMinutes').value = String(curSettings.slot_minutes);
      if ($('autoConfirm')) $('autoConfirm').checked = !!curSettings.auto_confirm;
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
      clinic_id: hoursUnit, hours: hours,
      holidays: curSettings.holidays || [],
      updated_at: new Date().toISOString()
    };
    var msg = $('settingsMsg'); msg.textContent = '저장 중...';
    db.from('clinic_settings').upsert(payload, { onConflict: 'clinic_id' }).then(function (res) {
      if (res.error) { msg.textContent = '오류: ' + res.error.message; msg.style.color = '#d33'; return; }
      curSettings.hours = hours;
      msg.textContent = '저장되었습니다 ✓'; msg.style.color = '#2e7d32';
      setTimeout(function () { msg.textContent = ''; }, 2500);
    });
  });

  // 예약 설정(예진표 예약 탭) — 예약 간격 + 자동 확정 저장. (upsert 미포함 컬럼 hours/holidays 는 보존됨)
  if ($('intakeSettingsSaveBtn')) $('intakeSettingsSaveBtn').addEventListener('click', function () {
    if (!curSettings) curSettings = {};
    var payload = {
      clinic_id: hoursUnit,
      slot_minutes: parseInt($('slotMinutes').value, 10),
      auto_confirm: $('autoConfirm').checked,
      updated_at: new Date().toISOString()
    };
    var msg = $('intakeSettingsMsg'); msg.textContent = '저장 중...';
    db.from('clinic_settings').upsert(payload, { onConflict: 'clinic_id' }).then(function (res) {
      if (res.error) { msg.textContent = '오류: ' + res.error.message; msg.style.color = '#d33'; return; }
      curSettings.slot_minutes = payload.slot_minutes; curSettings.auto_confirm = payload.auto_confirm;
      msg.textContent = '저장되었습니다 ✓'; msg.style.color = '#2e7d32';
      setTimeout(function () { msg.textContent = ''; }, 2500);
    });
  });

  function saveHolidays() {
    return db.from('clinic_settings').upsert({
      clinic_id: hoursUnit, hours: curSettings.hours, slot_minutes: curSettings.slot_minutes,
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

  // =================== noad 임베드 (결제 / 작업요청) ===================
  // 결제·작업요청은 noad 코어 페이지를 이 관리자 페이지 '안에' iframe 으로 띄운다.
  // (전체 이동 X → 상단 탭 유지, 탭 전환으로 복귀). 핸드오버 토큰은 탭을 처음 열 때 발급.
  // 요금제·작업티켓·구독상태·카드관리·작업요청·티켓잔액은 모두 코어가 소유 — 병원 Supabase
  // work_requests/ticket_ledger 는 미사용(옛 RPC 제출 시 콘솔에 안 보이는 고아 요청 됨).
  // 코어가 X-Frame-Options 대신 frame-ancestors 로 이 도메인을 허용해야 임베드됨(nginx).
  function loadNoadFrame(target, frameId, loadingId, force) {
    var frame = $(frameId), loading = $(loadingId);
    if (!frame) return;
    // 이미 로드됐고 토큰이 신선하면(8분 내) 유지. 오래됐으면 탭 재진입 시 자동 재발급(만료 회피).
    var fresh = frame.dataset.loadedAt && (Date.now() - Number(frame.dataset.loadedAt) < 8 * 60 * 1000);
    if (frame.dataset.loaded === '1' && fresh && !force) return;
    frame.dataset.loaded = '1';
    if (loading) { loading.style.display = 'flex'; loading.textContent = '불러오는 중…'; }
    db.functions.invoke('noad-handover', {
      body: {
        target: target,
        clinicName: clinicLabel(CID),
        returnUrl: location.href
      }
    }).then(function (res) {
      if (res.error || !res.data || !res.data.url) {
        frame.dataset.loaded = '';
        var m = (res.error && (res.error.message || res.error)) || (res.data && res.data.error) || '잠시 후 다시 시도해 주세요.';
        if (loading) loading.textContent = '불러오기 실패: ' + m;
        return;
      }
      if (loading) frame.addEventListener('load', function () { loading.style.display = 'none'; }, { once: true });
      frame.dataset.loadedAt = String(Date.now());
      // 구버전 엣지함수가 messaging 을 billing 으로 보내는 경우 경로 보정(토큰은 경로 무관). 신버전이면 no-op.
      var u = res.data.url;
      if (target === 'messaging') u = u.replace(/(:\/\/[^/]+\/)[^?]*\?/, '$1clinic-messaging?');
      // embed=1 → noad 페이지가 병원 네이티브 탭과 동일 배경(#f4f1ec)·폭(920)·여백으로 렌더
      frame.src = u + '&embed=1';
    }, function () {
      frame.dataset.loaded = '';
      if (loading) loading.textContent = '네트워크 오류로 불러오지 못했습니다.';
    });
  }

  // 임베드 iframe 자동 높이 — noad 페이지(EmbedAutoResize)가 보낸 콘텐츠 높이로 맞춤.
  // → iframe 내부 스크롤/잘림 없이 병원 페이지가 네이티브 탭처럼 자연 스크롤.
  window.addEventListener('message', function (e) {
    if (e.origin !== 'https://noad.ai.kr') return;
    var d = e.data;
    if (!d || d.type !== 'noad-embed-height' || !d.height) return;
    ['billFrame', 'workFrame', 'msgFrame'].forEach(function (id) {
      var f = $(id);
      if (f && f.contentWindow === e.source) f.style.height = Math.max(400, Math.ceil(d.height)) + 'px';
    });
  });

})();
