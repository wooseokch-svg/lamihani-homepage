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
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }
})();
