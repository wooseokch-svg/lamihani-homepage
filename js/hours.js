/* =====================================================================
   메인 '진료시간' 카드 — DB 운영시간/휴무일 요약 표시
   - clinic_settings를 읽어 요일별 시간·휴게·휴무·공휴일 요약
   - 설정 전/로드 실패 시 기존 기본 문구 유지
   ===================================================================== */
(function () {
  var ul = document.getElementById('hoursSummary');
  if (!ul || !window.lamiDB || !window.LamiBooking) return;

  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  var ORDER = [1, 2, 3, 4, 5, 6, 0]; // 월~토, 일

  function sig(c) {
    if (!c || c.closed) return 'closed';
    return [c.open, c.close, c.lunchStart || '', c.lunchEnd || '', c.acceptLunch || '', c.acceptClose || ''].join('|');
  }

  function render(settings) {
    var hours = settings.hours || {};
    var lines = [];
    var i = 0;
    while (i < ORDER.length) {
      var c = hours[String(ORDER[i])] || { closed: true };
      var s = sig(c);
      var j = i;
      while (j + 1 < ORDER.length && sig(hours[String(ORDER[j + 1])] || { closed: true }) === s) j++;
      var label = (j > i) ? (WD[ORDER[i]] + '-' + WD[ORDER[j]]) : WD[ORDER[i]];

      if (s === 'closed') {
        lines.push(label + ' 정기휴무');
      } else {
        var acc = [];
        if (c.acceptLunch) acc.push(c.acceptLunch);
        if (c.acceptClose) acc.push(c.acceptClose);
        var accTxt = acc.length ? ' (접수마감 ' + acc.join(' · ') + ')' : '';
        lines.push(label + ' ' + c.open + '-' + c.close + accTxt);
        if (c.lunchStart && c.lunchEnd) lines.push(c.lunchStart + '-' + c.lunchEnd + ' 휴게시간');
      }
      i = j + 1;
    }

    // 휴무일(공휴일 + 다가오는 임시휴무)
    var today = window.LamiBooking.todayStr();
    var custom = (settings.holidays || []).filter(function (d) { return d >= today; }).sort();
    var hline = '공휴일 휴진';
    if (custom.length) {
      var ds = custom.slice(0, 4).map(function (d) { return parseInt(d.slice(5, 7), 10) + '/' + parseInt(d.slice(8, 10), 10); });
      hline += ' · 임시휴무 ' + ds.join(', ');
    }
    lines.push(hline);

    ul.innerHTML = lines.map(function (l) { return '<li>' + l + '</li>'; }).join('');
  }

  window.lamiDB.from('clinic_settings').select('*').eq('id', 1).single().then(function (res) {
    if (res && res.data) {
      render({ hours: res.data.hours, holidays: res.data.holidays || [] });
    }
  });
})();
