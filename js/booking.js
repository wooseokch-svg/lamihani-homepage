/* =====================================================================
   예약 캘린더 공통 로직 (순수 함수, DOM 없음)
   - 영업시간/휴무/공휴일 → 예약 가능 날짜·시간 계산
   ===================================================================== */
(function () {
  // 설정이 없을 때 사용할 기본 영업시간 (실제 운영시간)
  //   acceptLunch = 점심 전 접수마감, acceptClose = 종료 전 접수마감
  var WD_WEEK = { closed: false, open: '10:00', close: '18:00', lunchStart: '', lunchEnd: '', acceptLunch: '', acceptClose: '17:20' };
  var DEFAULT_SETTINGS = {
    hours: {
      '0': { closed: true },
      '1': WD_WEEK, '2': WD_WEEK, '3': WD_WEEK, '4': WD_WEEK, '5': WD_WEEK,
      '6': { closed: false, open: '10:00', close: '14:00', acceptClose: '13:20' }
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

  // 해당 날짜의 전체 슬롯('HH:MM' 배열)
  //  - 휴게(점심 lunchStart/End + 추가 breaks[] 예: 저녁휴게) 제외
  //  - 접수마감(acceptLunch: 점심 전 / acceptClose: 종료 전) 반영
  function allSlots(dateStr, settings) {
    var d = new Date(dateStr + 'T00:00:00');
    var cfg = settings.hours[String(d.getDay())];
    if (!cfg || cfg.closed || !cfg.open || !cfg.close) return [];
    var step = settings.slot_minutes || 30;
    var open = toMin(cfg.open), close = toMin(cfg.close);
    var lastSlot = cfg.acceptClose ? Math.min(toMin(cfg.acceptClose), close - step) : (close - step);

    // 휴게 구간 목록 = 점심 + 추가 breaks[] (저녁휴게 등 다중 휴게 지원)
    var breaks = [];
    if (cfg.lunchStart && cfg.lunchEnd) breaks.push([toMin(cfg.lunchStart), toMin(cfg.lunchEnd)]);
    if (cfg.breaks && cfg.breaks.length) {
      cfg.breaks.forEach(function (b) { if (b && b.start && b.end) breaks.push([toMin(b.start), toMin(b.end)]); });
    }
    // 점심 전 접수마감(acceptLunch): 점심 시작 전 슬롯을 acceptLunch 까지만 허용
    var lunchStart = cfg.lunchStart ? toMin(cfg.lunchStart) : null;
    var amCap = (cfg.acceptLunch && lunchStart != null) ? toMin(cfg.acceptLunch) : null;

    var out = [];
    for (var t = open; t <= lastSlot; t += step) {
      var end = t + step;
      var inBreak = breaks.some(function (br) { return t < br[1] && end > br[0]; });  // 슬롯[t,end)가 휴게와 겹침
      if (inBreak) continue;
      if (amCap != null && t < lunchStart && t > amCap) continue;                     // 오전 접수마감 초과
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
