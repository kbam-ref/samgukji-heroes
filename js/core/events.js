// 이벤트 버스 — 상태 변경을 UI에 전달하는 유일한 통로

const listeners = new Map();

export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  return () => listeners.get(type).delete(fn);
}

export function emit(type, payload) {
  const set = listeners.get(type);
  if (!set) return;
  for (const fn of [...set]) {
    try {
      fn(payload);
    } catch (err) {
      console.error(`이벤트 처리 실패: ${type}`, err);
    }
  }
}
