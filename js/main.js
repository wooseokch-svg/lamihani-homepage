(function () {
  'use strict';

  var navToggle = document.getElementById('navToggle');
  var mobileMenu = document.getElementById('mobileMenu');
  var mobileClose = document.getElementById('mobileClose');
  var overlayBg = document.getElementById('overlayBg');
  var toTop = document.getElementById('toTop');

  function openMenu() {
    mobileMenu.classList.add('open');
    overlayBg.classList.add('show');
  }
  function closeMenu() {
    mobileMenu.classList.remove('open');
    overlayBg.classList.remove('show');
  }

  if (navToggle) navToggle.addEventListener('click', openMenu);
  if (mobileClose) mobileClose.addEventListener('click', closeMenu);
  if (overlayBg) overlayBg.addEventListener('click', closeMenu);

  // close mobile menu when a link is clicked
  document.querySelectorAll('#mobileMenu a').forEach(function (a) {
    a.addEventListener('click', closeMenu);
  });

  // scroll: header shadow + to-top button
  window.addEventListener('scroll', function () {
    if (window.scrollY > 400) {
      toTop.classList.add('show');
    } else {
      toTop.classList.remove('show');
    }
  });

  if (toTop) {
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // reveal on scroll
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        // 볼 때마다 반복: 뷰포트에 들어오면 실행, 벗어나면 리셋
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
        } else {
          entry.target.classList.remove('in');
        }
      });
    }, { threshold: 0.12 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  // 연성차단 Tier 2 — 30일+ 미납 시 홈페이지(환자용) 차단.
  // noad 코어가 BILLING_READY=true + 30일+ 연체일 때만 blockHomepage=true 반환.
  // 환자에겐 미납을 노출하지 않음 → 중립적 '점검 중' 안내.
  (function () {
    var cid = (window.LAMI_CONFIG && window.LAMI_CONFIG.CLINIC_ID) || 'lamihani';
    fetch('https://noad.ai.kr/api/clinic/status?clinicId=' + encodeURIComponent(cid))
      .then(function (r) { return r.json(); })
      .then(function (s) {
        if (!s || !s.blockHomepage || document.getElementById('homeBlock')) return;
        var ov = document.createElement('div');
        ov.id = 'homeBlock';
        ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#f4f1ec;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;';
        ov.innerHTML = '<div style="max-width:400px;">' +
          '<div style="font-size:22px;font-weight:800;color:#3e3e3e;">서비스 점검 중입니다</div>' +
          '<p style="font-size:15px;color:#888;margin-top:14px;line-height:1.7;">현재 일시적으로 서비스를 이용하실 수 없습니다.<br>예약은 전화로 문의해 주세요.</p>' +
          '</div>';
        document.body.appendChild(ov);
      })
      .catch(function () { /* 조회 실패 → 차단 안 함 */ });
  })();
})();
