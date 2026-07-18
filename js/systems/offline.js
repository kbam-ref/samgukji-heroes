// 복귀 보상 — 자리를 비운 시간만큼 엽전을 한 번에 지급한다. DOM 접근 없음.

import { BALANCE } from '../data/balance.js';
import { currentStage, killRatePerSecond } from './battle.js';

/**
 * 경과 시간(초)에 대한 복귀 보상을 계산한다.
 * 너무 짧으면 null. 시간은 balance의 maxHours로 상한.
 */
export function computeOfflineGain(state, elapsedSeconds) {
  const O = BALANCE.offline;
  if (!state || elapsedSeconds < O.minSeconds) return null;

  const seconds = Math.min(elapsedSeconds, O.maxHours * 3600);
  const stage = currentStage(state);
  const coins = Math.floor(killRatePerSecond(state) * stage.coinPerKill * seconds * O.rate);
  if (coins <= 0) return null;

  // 방치 옥구슬 — "끄고 있어도 모집이 다가온다"
  const jade = Math.floor((seconds / 3600) * O.jadePerHour);
  return { coins, jade, seconds };
}

/** 급습 명령 한 번의 보상 — 30분치를 감산 없이(온라인 요율로) 즉시 지급 */
export function raidGain(state) {
  const stage = currentStage(state);
  return Math.max(1, Math.floor(killRatePerSecond(state) * stage.coinPerKill * BALANCE.raids.minutes * 60));
}
