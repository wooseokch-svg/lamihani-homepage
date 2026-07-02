/* 별내S치과 — nav / reveal / 캘린더 예약(2병원) / 약관 (v2) */
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var B = window.LamiBooking;

  /* ===== 두 병원 진료시간 (0=일 … 6=토) ===== */
  var LUNCH = { lunchStart: '13:00', lunchEnd: '14:00' };
  function mkDay(open, close, extra) {
    var o = { closed: false, open: open, close: close };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }
  var HOURS = {
    // 본원(성인) — 화 야간 21:00 + 저녁휴게 18:30-19:00, 목 진료, 일 휴무
    byeolnae_dental: {
      hours: {
        '0': { closed: true },
        '1': mkDay('09:30', '18:30', LUNCH),
        '2': mkDay('09:30', '21:00', { lunchStart: '13:00', lunchEnd: '14:00', breaks: [{ start: '18:30', end: '19:00' }] }),
        '3': mkDay('09:30', '18:30', LUNCH),
        '4': mkDay('09:30', '18:30', LUNCH),
        '5': mkDay('09:30', '18:30', LUNCH),
        '6': mkDay('09:30', '14:00')
      }, slot_minutes: 30, holidays: ['2026-07-17']
    },
    // 주니어(소아) — 목·일 휴무, 화 야간 없음
    byeolnae_junior: {
      hours: {
        '0': { closed: true },
        '1': mkDay('09:30', '18:30', LUNCH),
        '2': mkDay('09:30', '18:30', LUNCH),
        '3': mkDay('09:30', '18:30', LUNCH),
        '4': { closed: true },
        '5': mkDay('09:30', '18:30', LUNCH),
        '6': mkDay('09:30', '14:00')
      }, slot_minutes: 30, holidays: ['2026-07-17']
    }
  };
  var CLINIC_LABEL = { byeolnae_dental: '별내S치과 (성인·본원)', byeolnae_junior: '별내S주니어치과 (소아)' };
  var WDN = ['일', '월', '화', '수', '목', '금', '토'];
  function settingsFor(cid) { return HOURS[cid] || HOURS.byeolnae_dental; }

  // 예약 캘린더용 시간 — clinic_settings(DB) 우선, 없으면 내장값. (admin 운영시간 수정이 예약에 반영)
  var SETTINGS_CACHE = {};
  function loadUnitSettings(cid, cb) {
    if (SETTINGS_CACHE[cid]) { cb(SETTINGS_CACHE[cid]); return; }
    if (window.lamiDB) {
      window.lamiDB.from('clinic_settings').select('*').eq('clinic_id', cid).single().then(function (res) {
        var s = (res && res.data && res.data.hours)
          ? { hours: res.data.hours, slot_minutes: res.data.slot_minutes || 30, holidays: res.data.holidays || [], auto_confirm: !!res.data.auto_confirm }
          : settingsFor(cid);
        SETTINGS_CACHE[cid] = s; cb(s);
      }, function () { cb(settingsFor(cid)); });
    } else cb(settingsFor(cid));
  }

  /* ===== 진료시간 표 (DB clinic_settings 우선, 없으면 내장값 폴백) ===== */
  function renderHoursInto(elId, settings) {
    var el = document.getElementById(elId); if (!el) return;
    var hours = settings.hours || {}, lunch = '';
    var lines = [1, 2, 3, 4, 5, 6, 0].map(function (dow) {
      var c = hours[String(dow)] || { closed: true };
      if (!lunch && c.lunchStart && c.lunchEnd) lunch = c.lunchStart + ' - ' + c.lunchEnd;
      if (c.closed) return '<li><span>' + WDN[dow] + '요일</span><b class="off">휴진</b></li>';
      var night = c.breaks && c.breaks.length;
      return '<li><span>' + WDN[dow] + '요일' + (night ? ' <em>야간</em>' : '') + '</span><b>' + c.open + ' - ' + c.close + '</b></li>';
    });
    if (lunch) lines.push('<li><span>점심시간</span><b>' + lunch + '</b></li>');
    lines.push('<li><span>공휴일</span><b class="off">휴진</b></li>');
    el.innerHTML = lines.join('');
  }
  function loadHours() {
    [['byeolnae_dental', 'hoursDental'], ['byeolnae_junior', 'hoursJunior']].forEach(function (pair) {
      var cid = pair[0], elId = pair[1];
      if (window.lamiDB) {
        window.lamiDB.from('clinic_settings').select('*').eq('clinic_id', cid).single().then(function (res) {
          renderHoursInto(elId, (res && res.data && res.data.hours) ? { hours: res.data.hours } : settingsFor(cid));
        }, function () { renderHoursInto(elId, settingsFor(cid)); });
      } else renderHoursInto(elId, settingsFor(cid));
    });
  }
  loadHours();

  /* ===== 모바일 메뉴 / reveal / to-top ===== */
  var menu = $('#mobileMenu'), ov = $('#overlayBg');
  function closeMenu() { if (menu) menu.classList.remove('open'); if (ov) ov.classList.remove('show'); }
  var nt = $('#navToggle'); if (nt) nt.onclick = function () { menu.classList.add('open'); ov.classList.add('show'); };
  var mc = $('#mobileClose'); if (mc) mc.onclick = closeMenu;
  if (ov) ov.onclick = closeMenu;
  document.querySelectorAll('#mobileMenu a').forEach(function (a) { a.addEventListener('click', closeMenu); });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
  } else { document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('visible'); }); }
  var tt = $('#toTop');
  window.addEventListener('scroll', function () { if (tt) { if (window.scrollY > 400) tt.classList.add('show'); else tt.classList.remove('show'); } });
  if (tt) tt.onclick = function () { window.scrollTo({ top: 0, behavior: 'smooth' }); };

  /* ===== 캘린더 예약 ===== */
  var RS = { clinic: 'byeolnae_dental', settings: null, viewY: 0, viewM: 0, selDate: '', selTime: '' };

  window.openReserve = function (which) {
    if (!B) { alert('예약 모듈을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.'); return; }
    RS.clinic = which === 'junior' ? 'byeolnae_junior' : 'byeolnae_dental';
    RS.settings = settingsFor(RS.clinic);
    RS.selDate = ''; RS.selTime = '';
    var now = new Date(); RS.viewY = now.getFullYear(); RS.viewM = now.getMonth();
    $('#reserveDone').style.display = 'none';
    $('#reserveForm').style.display = 'block';
    document.querySelectorAll('#reserveForm .rf-clinic-card').forEach(function (c) { c.classList.toggle('sel', c.getAttribute('data-cid') === RS.clinic); });
    $('#rName').value = ''; $('#rPhone').value = ''; $('#rMemo').value = '';
    var ag = $('#agreePrivacyR'); if (ag) ag.checked = false;
    $('#rSlots').innerHTML = '<p class="rf-hint">날짜를 먼저 선택해 주세요.</p>';
    $('#rSummary').hidden = true;
    renderCal();
    $('#reserveOverlay').classList.add('open'); document.body.style.overflow = 'hidden';
    loadUnitSettings(RS.clinic, function (s) { if (RS.clinic && s) { RS.settings = s; renderCal(); } });
  };
  window.closeReserve = function () { $('#reserveOverlay').classList.remove('open'); document.body.style.overflow = ''; };

  window.rSelectClinic = function (cid, el) {
    RS.clinic = cid; RS.settings = settingsFor(cid); RS.selDate = ''; RS.selTime = '';
    document.querySelectorAll('#reserveForm .rf-clinic-card').forEach(function (c) { c.classList.toggle('sel', c.getAttribute('data-cid') === cid); });
    $('#rSlots').innerHTML = '<p class="rf-hint">날짜를 먼저 선택해 주세요.</p>';
    $('#rSummary').hidden = true;
    var now = new Date(); RS.viewY = now.getFullYear(); RS.viewM = now.getMonth();
    renderCal();
    loadUnitSettings(cid, function (s) { if (RS.clinic === cid) { RS.settings = s; renderCal(); } });
  };

  window.rMonthShift = function (delta) {
    var m = RS.viewM + delta, y = RS.viewY;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    var now = new Date();
    if (y < now.getFullYear() || (y === now.getFullYear() && m < now.getMonth())) return;
    RS.viewY = y; RS.viewM = m; renderCal();
  };

  function renderCal() {
    var S = RS.settings;
    var first = new Date(RS.viewY, RS.viewM, 1), startDow = first.getDay();
    var daysIn = new Date(RS.viewY, RS.viewM + 1, 0).getDate();
    var now = new Date(), canPrev = !(RS.viewY === now.getFullYear() && RS.viewM === now.getMonth());
    var h = '<div class="rc-head"><button type="button" class="rc-nav"' + (canPrev ? '' : ' disabled') + ' onclick="rMonthShift(-1)">‹</button>';
    h += '<span class="rc-title">' + RS.viewY + '년 ' + (RS.viewM + 1) + '월</span>';
    h += '<button type="button" class="rc-nav" onclick="rMonthShift(1)">›</button></div><div class="rc-grid">';
    WDN.forEach(function (w, i) { h += '<div class="rc-dow' + (i === 0 ? ' sun' : (i === 6 ? ' sat' : '')) + '">' + w + '</div>'; });
    for (var b = 0; b < startDow; b++) h += '<div class="rc-cell empty"></div>';
    for (var d = 1; d <= daysIn; d++) {
      var ds = B.ymd(new Date(RS.viewY, RS.viewM, d));
      var open = B.isOpenDay(ds, S), holiday = B.isHoliday(ds, S), past = ds < B.todayStr();
      var cls = 'rc-cell', attr = '';
      if (past) cls += ' past'; else if (holiday) cls += ' holiday'; else if (!open) cls += ' off';
      else { cls += ' ok'; attr = ' onclick="rPickDate(\'' + ds + '\')"'; }
      if (ds === RS.selDate) cls += ' sel';
      h += '<div class="' + cls + '"' + attr + '>' + d + '</div>';
    }
    h += '</div>';
    $('#rCal').innerHTML = h;
  }

  window.rPickDate = function (ds) {
    RS.selDate = ds; RS.selTime = ''; renderCal(); updateSummary();
    var box = $('#rSlots');
    var all = B.allSlots(ds, RS.settings);
    if (!all.length) { box.innerHTML = '<p class="rf-hint">해당 날짜는 예약이 불가합니다.</p>'; return; }
    box.innerHTML = '<p class="rf-hint">불러오는 중...</p>';
    function render(taken) {
      var now = new Date(), isToday = ds === B.todayStr();
      box.className = 'rf-slots';
      box.innerHTML = all.map(function (hhmm) {
        var dis = !!taken[hhmm];
        if (isToday) { var p = hhmm.split(':'); if (parseInt(p[0], 10) * 60 + parseInt(p[1], 10) <= now.getHours() * 60 + now.getMinutes()) dis = true; }
        return '<button type="button" class="rf-slot' + (dis ? ' taken' : '') + '"' + (dis ? ' disabled' : ' onclick="rPickTime(\'' + hhmm + '\',this)"') + '>' + B.fmtSlot(hhmm) + (dis ? '<span class="x">마감</span>' : '') + '</button>';
      }).join('');
    }
    if (!window.lamiDB) { render({}); return; }
    window.lamiDB.rpc('taken_slots', { d: ds, cid: RS.clinic }).then(function (res) {
      var taken = {}; (res && res.data ? res.data : []).forEach(function (row) { taken[(row && row.t != null) ? row.t : row] = true; });
      render(taken);
    });
  };
  window.rPickTime = function (hhmm, el) {
    RS.selTime = hhmm;
    document.querySelectorAll('#rSlots .rf-slot').forEach(function (b) { b.classList.remove('sel'); });
    if (el) el.classList.add('sel'); updateSummary();
  };
  function updateSummary() {
    var box = $('#rSummary');
    if (RS.selDate && RS.selTime) {
      var d = new Date(RS.selDate + 'T00:00:00');
      box.innerHTML = '선택하신 예약: <b>' + CLINIC_LABEL[RS.clinic] + ' · ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일(' + WDN[d.getDay()] + ') ' + B.fmtSlot(RS.selTime) + '</b>';
      box.hidden = false;
    } else box.hidden = true;
  }

  window.submitReserve = function () {
    var ag = $('#agreePrivacyR');
    if (ag && !ag.checked) { alert('개인정보 수집·이용 동의가 필요합니다.'); return; }
    var name = ($('#rName').value || '').trim(), phone = ($('#rPhone').value || '').trim();
    if (!name) { alert('성함을 입력해 주세요.'); return; }
    if (!phone) { alert('연락처를 입력해 주세요.'); return; }
    if (!RS.selDate) { alert('예약 날짜를 선택해 주세요.'); return; }
    if (!RS.selTime) { alert('예약 시간을 선택해 주세요.'); return; }

    var data = {
      name: name, phone: phone, birth: null, gender: null, visit_type: null,
      desired_date: RS.selDate, desired_time: RS.selTime,
      kind: '예약', source: '홈페이지', clinic_id: RS.clinic,
      concerns: [], details: {}, meds: null, pregnancy: null,
      message: ($('#rMemo').value || '').trim() || null,
      agreed: true,
      status: (RS.settings && RS.settings.auto_confirm) ? '예약확정' : '신규'
    };

    if (!window.lamiDB) { done(); return; }
    var btn = $('#rSubmit'), orig = btn.textContent; btn.disabled = true; btn.textContent = '신청 중...';
    window.lamiDB.rpc('taken_slots', { d: RS.selDate, cid: RS.clinic }).then(function (res) {
      var taken = (res && res.data ? res.data : []).some(function (r) { var t = (r && r.t != null) ? r.t : r; return t === RS.selTime; });
      if (taken) { btn.disabled = false; btn.textContent = orig; alert('방금 다른 분이 예약했습니다. 다른 시간을 선택해 주세요.'); rPickDate(RS.selDate); return; }
      window.lamiDB.from('reservations').insert([data]).then(function (r2) {
        btn.disabled = false; btn.textContent = orig;
        if (r2.error) { alert('예약 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.\n' + r2.error.message); return; }
        done();
      });
    });
  };
  function done() { $('#reserveForm').style.display = 'none'; $('#reserveDone').style.display = 'block'; }

  /* ===== 약관 (치과용) ===== */
  var po = $('#policyOverlay');
  var TERMS_HTML = `
    <h3>제1조 (목적)</h3>
    <p>본 약관은 별내S치과 및 별내S주니어치과(이하 통칭하여 "치과")가 운영하는 홈페이지(이하 "사이트")에서 제공하는 서비스의 이용과 관련하여 치과와 이용자의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.</p>

    <h3>제2조 (약관의 명시와 개정)</h3>
    <p>① 치과는 본 약관의 내용을 이용자가 쉽게 확인할 수 있도록 사이트 화면에 게시합니다.</p>
    <p>② 치과는 관계 법령을 위배하지 않는 범위에서 본 약관을 개정할 수 있으며, 개정 시 적용일자 및 개정사유를 명시하여 사전에 공지합니다.</p>

    <h3>제3조 (용어의 정의)</h3>
    <p>① "사이트"란 치과가 서비스를 제공하기 위하여 운영하는 홈페이지를 말합니다.</p>
    <p>② "이용자"란 사이트에 접속하여 본 약관에 따라 사이트가 제공하는 서비스를 이용하는 자를 말합니다.</p>
    <p>③ "콘텐츠"란 사이트에 게시된 텍스트, 이미지, 영상 등 모든 형태의 정보를 말합니다.</p>

    <h3>제4조 (서비스의 제공)</h3>
    <p>① 치과는 사이트를 통하여 다음의 서비스를 제공합니다.</p>
    <ul>
      <li>진료 과목·치료법 등 의료기관 정보 제공</li>
      <li>온라인 예약·상담 안내 및 예진표 접수</li>
      <li>기타 치과가 정하는 서비스</li>
    </ul>
    <p>② 치과는 서비스의 내용을 변경할 수 있으며, 변경 시 사이트를 통하여 공지합니다.</p>

    <h3>제5조 (서비스 이용시간)</h3>
    <p>① 서비스 이용은 업무상 또는 기술상 특별한 지장이 없는 한 연중무휴 1일 24시간을 원칙으로 합니다.</p>
    <p>② 치과는 시스템 점검·증설·교체, 고장, 천재지변 등 부득이한 사유가 있는 경우 서비스 제공을 일시 중단할 수 있으며, 이 경우 사전 또는 사후에 공지합니다.</p>

    <h3>제6조 (이용자의 의무)</h3>
    <p>이용자는 다음 각 호의 행위를 하여서는 안 됩니다.</p>
    <ul>
      <li>타인의 정보를 도용하거나 허위의 정보를 등록하는 행위</li>
      <li>사이트의 운영을 방해하거나 안정적 운영을 저해하는 행위</li>
      <li>치과 또는 제3자의 지식재산권·명예 기타 권리를 침해하는 행위</li>
      <li>관계 법령에 위배되는 행위</li>
    </ul>

    <h3>제7조 (콘텐츠의 저작권)</h3>
    <p>① 사이트에 게시된 콘텐츠에 대한 저작권 및 기타 지식재산권은 치과에 귀속됩니다.</p>
    <p>② 이용자는 치과의 사전 승낙 없이 콘텐츠를 복제·전송·출판·배포·방송 기타 방법으로 영리 목적으로 이용하거나 제3자에게 이용하게 할 수 없습니다.</p>

    <h3>제8조 (개인정보의 보호)</h3>
    <p>치과는 이용자의 개인정보를 중요하게 생각하며 「개인정보 보호법」 등 관계 법령을 준수합니다. 개인정보의 처리에 관한 구체적인 사항은 별도의 「개인정보처리방침」에 따릅니다.</p>

    <h3>제9조 (의료정보 안내 및 면책)</h3>
    <p>① 사이트에 게시된 의료·건강 관련 정보는 이용자의 이해를 돕기 위한 일반적인 정보로서, 의료진의 진찰·진단·처방을 대체하지 않습니다. 구체적인 증상에 대한 진단 및 치료는 반드시 의료진과의 대면 진료를 통하여 이루어져야 합니다.</p>
    <p>② 치과는 천재지변, 이용자의 귀책사유, 기타 치과의 통제를 벗어난 사유로 인하여 발생한 서비스 장애에 대하여 책임을 지지 않습니다.</p>
    <p>③ 치과는 이용자가 사이트의 정보에 의존하여 행한 행위의 결과에 대하여 책임을 지지 않습니다.</p>

    <h3>제10조 (분쟁의 해결 및 관할)</h3>
    <p>① 본 약관과 관련하여 치과와 이용자 간에 발생한 분쟁은 상호 협의하여 원만히 해결함을 원칙으로 합니다.</p>
    <p>② 협의가 이루어지지 않을 경우 관할 법원은 「민사소송법」에 따른 법원으로 합니다.</p>

    <div class="policy-bujik">
      <h3>부칙</h3>
      <p>이 약관은 2026년 7월 2일부터 시행합니다.</p>
    </div>`;
  var PRIVACY_HTML = `
    <p>별내S치과 및 별내S주니어치과(이하 통칭하여 "치과")는 「개인정보 보호법」 등 관계 법령에 따라 이용자의 개인정보를 보호하고 이와 관련한 고충을 신속하게 처리하기 위하여 다음과 같이 개인정보처리방침을 수립·공개합니다.</p>

    <h3>제1조 (개인정보의 수집 항목 및 방법)</h3>
    <p>① 치과는 진료 예약·상담 및 예진표 접수를 위하여 다음의 개인정보를 수집합니다.</p>
    <ul>
      <li>필수항목: 성명, 생년월일, 성별, 연락처</li>
      <li>민감정보: 구강 상태, 증상, 진료 희망 내용 등 진료에 필요한 정보</li>
    </ul>
    <p>② 개인정보는 홈페이지의 예약·예진표 작성 및 전화 상담 등을 통하여 수집됩니다.</p>
    <p>③ 민감정보(건강정보)는 정보주체의 별도 동의를 받아 수집하며, 진료 목적 외의 용도로 이용하지 않습니다.</p>

    <h3>제2조 (개인정보의 수집 및 이용 목적)</h3>
    <p>치과는 수집한 개인정보를 다음의 목적으로 이용합니다.</p>
    <ul>
      <li>진료 예약 및 일정 안내</li>
      <li>진료 상담 및 예진 정보 확인</li>
      <li>진료 관련 문의 응대 및 공지 전달</li>
    </ul>

    <h3>제3조 (개인정보의 보유 및 이용 기간)</h3>
    <p>① 치과는 개인정보의 수집·이용 목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다.</p>
    <p>② 다만, 관계 법령(「의료법」 등)에 따라 보존할 필요가 있는 경우에는 해당 법령에서 정한 기간 동안 보관합니다.</p>
    <p>③ 예약·상담을 위하여 수집한 정보는 동의 철회 또는 목적 달성 시 파기합니다.</p>

    <h3>제4조 (개인정보의 제3자 제공)</h3>
    <p>치과는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만, 이용자가 사전에 동의한 경우 또는 법령의 규정에 의거하거나 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우는 예외로 합니다.</p>

    <h3>제5조 (개인정보 처리의 위탁)</h3>
    <p>치과는 원활한 서비스 제공을 위하여 필요한 경우 개인정보 처리 업무를 외부에 위탁할 수 있으며, 이 경우 위탁 대상자와 업무 내용을 본 방침을 통하여 공개하고 관계 법령에 따라 안전하게 관리되도록 합니다. (현재 위탁 사항: 없음)</p>

    <h3>제6조 (정보주체의 권리·의무 및 행사방법)</h3>
    <p>① 이용자는 언제든지 자신의 개인정보에 대한 열람·정정·삭제·처리정지를 요구할 수 있습니다.</p>
    <p>② 권리 행사는 치과에 전화 또는 서면 등으로 요청할 수 있으며, 치과는 지체 없이 필요한 조치를 합니다.</p>

    <h3>제7조 (개인정보의 파기절차 및 방법)</h3>
    <p>① 전자적 파일 형태의 정보는 복구할 수 없는 기술적 방법으로 삭제합니다.</p>
    <p>② 종이에 출력된 정보는 분쇄하거나 소각하여 파기합니다.</p>

    <h3>제8조 (개인정보의 안전성 확보조치)</h3>
    <p>치과는 개인정보의 안전한 처리를 위하여 개인정보 접근 권한 관리, 접근통제, 보관 장소의 잠금장치 운영 등 관리적·기술적·물리적 보호조치를 시행합니다.</p>

    <h3>제9조 (개인정보 보호책임자 및 사업자 정보)</h3>
    <p>치과는 개인정보 처리에 관한 업무를 총괄하여 책임지고, 정보주체의 불만 처리 및 피해 구제를 위하여 아래와 같이 개인정보 보호책임자를 지정하고 있습니다. 별내S치과와 별내S주니어치과는 각각 독립한 사업자로서 진료 예약 및 개인정보를 별도로 처리합니다.</p>
    <ul>
      <li><b>별내S치과</b> — 보호책임자: 송재원 (원장) / 사업자등록번호: 132-92-44805 / 전화: 031-571-2275</li>
      <li><b>별내S주니어치과</b> — 보호책임자: 이세라 (원장) / 사업자등록번호: 132-92-44810 / 전화: 031-571-9275</li>
      <li>공통 주소: 남양주시 별내5로5번길 1, 4층</li>
    </ul>

    <h3>제10조 (개인정보처리방침의 변경)</h3>
    <p>이 개인정보처리방침은 법령·정책 또는 보안기술의 변경에 따라 내용의 추가·삭제·수정이 있을 수 있으며, 변경 시 사이트를 통하여 공지합니다.</p>

    <div class="policy-bujik">
      <h3>부칙</h3>
      <p>이 방침은 2026년 7월 2일부터 시행합니다.</p>
    </div>`;
  window.openPolicy = function (type) {
    $('#policyTitle').textContent = type === 'privacy' ? '개인정보처리방침' : '이용약관';
    $('#policyBody').innerHTML = type === 'privacy' ? PRIVACY_HTML : TERMS_HTML;
    $('#policyBody').scrollTop = 0;
    if (po) po.classList.add('open'); document.body.style.overflow = 'hidden';
  };
  window.closePolicy = function () { if (po) po.classList.remove('open'); document.body.style.overflow = ''; };

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeReserve(); closePolicy(); } });
})();

/* ===== 공지사항 (별내 공개 페이지, byeolnae_dental 기준, URL 자동 링크) ===== */
(function () {
  var box = document.getElementById('noticeList');
  if (!box || !window.lamiDB) return;
  function e(s){ return (s==null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function lk(h){ return h.replace(/(https?:\/\/[^\s<]+)/g, function(u){ return '<a href="'+u+'" target="_blank" rel="noopener noreferrer">'+u+'</a>'; }); }
  function fd(s){ var d=new Date(s); return isNaN(d)?'':d.getFullYear()+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+String(d.getDate()).padStart(2,'0'); }
  window.lamiDB.from('notices').select('id,title,content,pinned,created_at').eq('clinic_id','byeolnae_dental')
    .order('pinned',{ascending:false}).order('created_at',{ascending:false}).limit(20).then(function(res){
      if (res.error || !res.data || !res.data.length) return;
      box.innerHTML = res.data.map(function(n){
        return '<div class="notice-item">' +
          '<button class="notice-head" type="button">' +
            (n.pinned ? '<span class="notice-pin">공지</span>' : '') +
            '<span class="notice-title">' + e(n.title) + '</span>' +
            '<span class="notice-date">' + fd(n.created_at) + '</span>' +
          '</button>' +
          '<div class="notice-body">' + lk(e(n.content)).replace(/\n/g,'<br>') + '</div>' +
        '</div>';
      }).join('');
      box.querySelectorAll('.notice-head').forEach(function(h){ h.addEventListener('click', function(){ h.parentElement.classList.toggle('open'); }); });
    });
})();
