/* 1:1 비대면 예진표 모달 동작 */

function openModal() {
  document.getElementById('modalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
  // 폼/완료 화면 초기화
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

function selectVisit(el) {
  document.querySelectorAll('#modalOverlay .radio-card').forEach(function (c) {
    c.classList.remove('selected');
  });
  el.classList.add('selected');
}

function toggleCard(el) {
  el.classList.toggle('selected');
  updateSubSections();
}

function updateSubSections() {
  var checked = [].slice.call(
    document.querySelectorAll('#modalOverlay input[name="concern"]:checked')
  ).map(function (i) { return i.value; });

  var map = {
    student:  'sub-student',
    beauty:   'sub-beauty',
    diet:     'sub-diet',
    herb:     'sub-herb',
    accident: 'sub-accident'
  };
  Object.keys(map).forEach(function (key) {
    document.getElementById(map[key]).classList.toggle('visible', checked.indexOf(key) !== -1);
  });

  // 진행 바 업데이트
  var total = 4;
  var filled = Math.min(checked.length + 1, total);
  for (var i = 1; i <= total; i++) {
    var seg = document.getElementById('seg' + i);
    if (i < filled)        seg.className = 'step-seg done';
    else if (i === filled) seg.className = 'step-seg active';
    else                   seg.className = 'step-seg';
  }
}

function val(id) {
  var el = document.getElementById(id);
  return el ? (el.value || '').trim() : '';
}

// 예진표 입력값 수집
function collectIntake() {
  var visitEl = document.querySelector('#modalOverlay input[name="visit"]:checked');
  var visitMap = { first: '초진', re: '재진' };
  var concerns = [].slice.call(
    document.querySelectorAll('#modalOverlay input[name="concern"]:checked')
  ).map(function (i) { return i.value; });

  // 고민별 상세: 펼쳐진 서브섹션의 체크 항목 + 인라인 입력값 수집
  var details = {};
  document.querySelectorAll('#modalOverlay .sub-section.visible').forEach(function (sec) {
    var titleEl = sec.querySelector('.sub-title');
    var key = titleEl ? titleEl.textContent.replace(/[①-⑨]/g, '').trim() : sec.id;
    var checked = [].slice.call(sec.querySelectorAll('input:checked')).map(function (i) {
      return (i.parentElement.textContent || '').trim();
    });
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
    desired_date: val('inDate') || null,
    desired_time: val('inTime') || null,
    concerns: concerns,
    details: details,
    meds: val('inMeds') || null,
    pregnancy: pregEl ? (pregEl.parentElement.textContent || '').trim() : null,
    message: val('inMessage') || null,
    agreed: !!(document.getElementById('agreePrivacy') && document.getElementById('agreePrivacy').checked)
  };
}

function showIntakeSuccess() {
  document.getElementById('formView').style.display = 'none';
  document.getElementById('successView').style.display = 'block';
  var modal = document.querySelector('#modalOverlay .modal');
  if (modal) modal.scrollTop = 0;
}

function submitForm() {
  var data = collectIntake();

  // 필수값 검증
  if (!data.agreed) { alert('개인정보 수집 및 활용 동의가 필요합니다.'); return; }
  if (!data.name)  { alert('성함을 입력해 주세요.'); return; }
  if (!data.phone) { alert('연락처를 입력해 주세요.'); return; }

  var btn = document.querySelector('#modalOverlay .submit-btn');

  // 설정 전(백엔드 미연결)에는 저장 없이 안내만
  if (!window.lamiDB) { showIntakeSuccess(); return; }

  if (btn) { btn.disabled = true; btn.textContent = '제출 중...'; }
  window.lamiDB.from('intakes').insert([data]).then(function (res) {
    if (btn) { btn.disabled = false; btn.textContent = '상담 예진표 제출하기'; }
    if (res.error) {
      alert('제출 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.\n' + res.error.message);
      return;
    }
    showIntakeSuccess();
  });
}

/* ===== 이용약관 / 개인정보처리방침 정책 모달 ===== */
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

// ESC 키로 닫기
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    closeModal();
    closePolicy();
  }
});
