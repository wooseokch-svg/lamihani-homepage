/* =====================================================================
   공지사항 목록 (공개 페이지)
   - Supabase에서 불러와 표시. 설정 전 또는 비어있으면 기본 안내문 유지.
   - 제목 클릭 시 아코디언으로 내용 펼침.
   ===================================================================== */
(function () {
  var listEl = document.getElementById('noticeList');
  if (!listEl || !window.lamiDB) return;

  function esc(s) {
    return (s == null ? '' : String(s))
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function fmtDate(s) {
    if (!s) return '';
    var d = new Date(s);
    if (isNaN(d)) return '';
    return d.getFullYear() + '.' +
      String(d.getMonth() + 1).padStart(2, '0') + '.' +
      String(d.getDate()).padStart(2, '0');
  }

  var CID = (window.LAMI_CONFIG && window.LAMI_CONFIG.CLINIC_ID) || 'lamihani';
  window.lamiDB
    .from('notices')
    .select('id,title,content,pinned,created_at')
    .eq('clinic_id', CID)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(20)
    .then(function (res) {
      if (res.error || !res.data || !res.data.length) return; // 기본 안내문 유지
      var html = res.data.map(function (n) {
        return '' +
          '<div class="notice-item">' +
            '<button class="notice-head" type="button">' +
              (n.pinned ? '<span class="notice-pin">공지</span>' : '') +
              '<span class="notice-title">' + esc(n.title) + '</span>' +
              '<span class="notice-date">' + fmtDate(n.created_at) + '</span>' +
            '</button>' +
            '<div class="notice-body">' + esc(n.content).replace(/\n/g, '<br>') + '</div>' +
          '</div>';
      }).join('');
      listEl.innerHTML = html;

      listEl.querySelectorAll('.notice-head').forEach(function (h) {
        h.addEventListener('click', function () {
          h.parentElement.classList.toggle('open');
        });
      });
    });
})();
