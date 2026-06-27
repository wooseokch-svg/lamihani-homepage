/* =====================================================================
   예약 캘린더 공통 로직 (순수 함수, DOM 없음)
   - 영업시간/휴무/공휴일 → 예약 가능 날짜·시간 계산
   ===================================================================== */
(function () {
  // 설정이 없을 때 사용할 기본 영업시간 (DB 기본값과 동일)
  var DEFAULT_SETTINGS = {
    hours: {
      '0': { closed: true },
      '1': { closed: false, open: '10:00', close: '18:00', lunchStart: '13:00', lunchEnd: '14:00' },
      '2': { closed: false, open: '10:00', close: '18:00', lunchStart: '13:00', lunchEnd: '14:00' },
      '3': { closed: false, open: '10:00', close: '18:00', lunchStart: '13:00', lunchEnd: '14:00' },
      '4': { closed: false, open: '10:00', close: '18:00', lunchStart: '13:00', lunchEnd: '14:00' },
      '5': { closed: false, open: '10:00', close: '18:00', lunchStart: '13:00', lunchEnd: '14:00' },
      '6': { closed: false, open: '10:00', close: '14:00' }
    },
    slot_minutes: 30,
    holidays: []
  };

  // 매년 같은 날짜인 고정 공휴일 (음력 명절·부처님오신날은 관리자가 추가)
  function fixedHolidays(year) {
    return {
      0101: '신정', 0301: '삼일절', 0505: '어린이날', 0606: '현충일',
      0815: '광복절', 1003: '개천절', 1009: '한글날', 1225: '성탄절'
    };
  }
  function isFixedHoliday(dateStr) {
    var mmdd = parseInt(dateStr.slice(5, 7) + dateStr.slice(8, 10), 10);
    return !!fixedHolidays()[mmdd];
  }
  function fixedHolidayName(dateStr) {
    var mmdd = parseInt(dateStr.slice(5, 7) + dateStr.slice(8, 10), 10);
    return fixedHolidays()[mmdd] || '';
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function toMin(hhmm) { var p = hhmm.split(':'); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); }
  function toHHMM(min) { return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }

  // 'HH:MM' -> '오전/오후 h:MM'
  function fmtSlot(hhmm) {
    var m = toMin(hhmm), h = Math.floor(m / 60), mm = m % 60;
    var ap = h < 12 ? '오전' : '오후';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return ap + ' ' + h12 + ':' + pad(mm);
  }

  function todayStr() {
    var n = new Date();
    return ymd(new Date(n.getFullYear(), n.getMonth(), n.getDate()));
  }

  function isHoliday(dateStr, settings) {
    if (isFixedHoliday(dateStr)) return true;
    var list = (settings && settings.holidays) || [];
    return list.indexOf(dateStr) !== -1;
  }
  function holidayLabel(dateStr, settings) {
    var n = fixedHolidayName(dateStr);
    if (n) return n;
    var list = (settings && settings.holidays) || [];
    return list.indexOf(dateStr) !== -1 ? '휴무' : '';
  }

  // 해당 날짜가 예약 가능한 날인지 (영업일 + 미래 + 비휴무)
  function isOpenDay(dateStr, settings) {
    if (dateStr < todayStr()) return false;
    if (isHoliday(dateStr, settings)) return false;
    var d = new Date(dateStr + 'T00:00:00');
    var cfg = settings.hours[String(d.getDay())];
    return !!(cfg && !cfg.closed && cfg.open && cfg.close);
  }

  // 해당 날짜의 전체 슬롯('HH:MM' 배열) — 점심시간 제외
  function allSlots(dateStr, settings) {
    var d = new Date(dateStr + 'T00:00:00');
    var cfg = settings.hours[String(d.getDay())];
    if (!cfg || cfg.closed || !cfg.open || !cfg.close) return [];
    var step = settings.slot_minutes || 30;
    var open = toMin(cfg.open), close = toMin(cfg.close);
    var ls = cfg.lunchStart ? toMin(cfg.lunchStart) : null;
    var le = cfg.lunchEnd ? toMin(cfg.lunchEnd) : null;
    var out = [];
    for (var t = open; t < close; t += step) {
      if (ls !== null && t >= ls && t < le) continue;
      out.push(toHHMM(t));
    }
    return out;
  }

  window.LamiBooking = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    ymd: ymd,
    todayStr: todayStr,
    fmtSlot: fmtSlot,
    isHoliday: isHoliday,
    holidayLabel: holidayLabel,
    isOpenDay: isOpenDay,
    allSlots: allSlots
  };
})();
