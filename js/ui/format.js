// 숫자·시간 한글 표기

/** 12345 → "1만 2345", 1.2e9 → "12억", 3.4e13 → "34조" — 난이도 20의 거대 수까지 */
export function fmt(n) {
  n = Math.floor(n);
  if (n < 0) return `-${fmt(-n)}`;
  if (n < 10000) return n.toLocaleString('ko-KR');

  // 큰 단위부터: 경(1e16) 조(1e12) 억(1e8) 만(1e4) — 상위 두 단위만 보여준다
  const UNITS = [
    [1e16, '경'],
    [1e12, '조'],
    [1e8, '억'],
    [1e4, '만'],
  ];
  for (let i = 0; i < UNITS.length; i++) {
    const [base, label] = UNITS[i];
    if (n >= base) {
      const head = Math.floor(n / base);
      const next = UNITS[i + 1];
      const sub = next ? Math.floor((n % base) / next[0]) : n % base; // 만 아래는 그대로 붙인다
      if (sub <= 0) return `${head.toLocaleString('ko-KR')}${label}`;
      return next
        ? `${head.toLocaleString('ko-KR')}${label} ${sub}${next[1]}`
        : `${head.toLocaleString('ko-KR')}${label} ${sub.toLocaleString('ko-KR')}`;
    }
  }
  return n.toLocaleString('ko-KR');
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
