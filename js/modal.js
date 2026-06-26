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

function submitForm() {
  document.getElementById('formView').style.display = 'none';
  document.getElementById('successView').style.display = 'block';
  var modal = document.querySelector('#modalOverlay .modal');
  if (modal) modal.scrollTop = 0;
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
