// 숫자·시간 한글 표기

/** 12345 → "1만 2345", 123456789 → "1억 2345만" */
export function fmt(n) {
  n = Math.floor(n);
  if (n < 0) return `-${fmt(-n)}`;
  if (n < 10000) return n.toLocaleString('ko-KR');

  const eok = Math.floor(n / 1e8);
  const man = Math.floor((n % 1e8) / 1e4);
  const rest = n % 1e4;

  if (eok > 0) {
    return man > 0 ? `${eok.toLocaleString('ko-KR')}억 ${man}만` : `${eok.toLocaleString('ko-KR')}억`;
  }
  return rest > 0 ? `${man}만 ${rest.toLocaleString('ko-KR')}` : `${man}만`;
}

/** 초 → "4시간 12분" / "12분" / "45초" */
export function formatDuration(seconds) {
  seconds = Math.floor(seconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  if (m > 0) return `${m}분`;
  return `${seconds}초`;
}
