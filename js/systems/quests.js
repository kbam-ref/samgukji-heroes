// 목표 — 일일 목표·업적의 진행 계산과 보상 수령, 오늘의 현상수배. DOM 접근 없음.

import { DAILY_QUESTS, ACHIEVEMENTS } from '../data/quests.js';
import { HEROES } from '../data/heroes.js';
import { CHAPTERS } from '../data/stages.js';
import * as state from '../core/state.js';

const BOSS_NAMES = new Set(CHAPTERS.flatMap((c) => c.stages.map((st) => st.boss)));

/** 오늘의 현상수배 대상 — 보유 장수 중 우두머리로 나오는 인물을 날짜로 정한다. 없으면 null */
export function bountyTarget(s = state.getState()) {
  const daily = state.ensureDaily();
  const candidates = HEROES.filter((h) => s.heroes[h.id] && BOSS_NAMES.has(h.name));
  if (candidates.length === 0) return null;
  let hash = 0;
  for (const ch of daily.date) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return candidates[hash % candidates.length];
}

/** 현상수배 대상이 우두머리로 나오는 곳 — "3장 ‧ 삼첨도의 맹장" */
export function bountyLocation(hero) {
  for (const chapter of CHAPTERS) {
    for (const stage of chapter.stages) {
      if (stage.boss === hero.name) return `${chapter.id}장 ‧ ${stage.name}`;
    }
  }
  return '';
}

function dailyProgress(quest, s) {
  const daily = s.daily ?? {};
  if (quest.type === 'kill') return daily.kills ?? 0;
  if (quest.type === 'pull') return daily.pulls ?? 0;
  if (quest.type === 'clear') return daily.clears ?? 0;
  return 0;
}

function achievementProgress(quest, s) {
  if (quest.type === 'totalKills') return s.stats?.totalKills ?? 0;
  if (quest.type === 'totalClears') return s.stats?.totalClears ?? 0;
  if (quest.type === 'totalPulls') return s.gacha?.total ?? 0;
  if (quest.type === 'owned') return Object.keys(s.heroes ?? {}).length;
  return 0;
}

/** 화면용 목록 — [{ quest, progress, done, claimed }] */
export function dailyList(s = state.getState()) {
  state.ensureDaily();
  return DAILY_QUESTS.map((quest) => {
    const progress = Math.min(quest.goal, dailyProgress(quest, s));
    const claimed = s.daily.claimed.includes(quest.id);
    return { quest, progress, done: progress >= quest.goal, claimed };
  });
}

export function achievementList(s = state.getState()) {
  return ACHIEVEMENTS.map((quest) => {
    const progress = Math.min(quest.goal, achievementProgress(quest, s));
    const claimed = s.achievements.claimed.includes(quest.id);
    return { quest, progress, done: progress >= quest.goal, claimed };
  });
}

/** 받을 수 있는 보상이 하나라도 있는가 (배지용) */
export function hasClaimable(s = state.getState()) {
  return (
    dailyList(s).some((e) => e.done && !e.claimed) ||
    achievementList(s).some((e) => e.done && !e.claimed)
  );
}

/** 보상 수령 — 달성 검증 후 state에 위임. 성공 시 보상 옥구슬 수, 실패 시 0 */
export function claim(id) {
  const s = state.getState();

  const daily = dailyList(s).find((e) => e.quest.id === id);
  if (daily) {
    if (!daily.done || daily.claimed) return 0;
    return state.claimDailyQuest(id, daily.quest.reward.jade) ? daily.quest.reward.jade : 0;
  }

  const ach = achievementList(s).find((e) => e.quest.id === id);
  if (ach) {
    if (!ach.done || ach.claimed) return 0;
    return state.claimAchievement(id, ach.quest.reward.jade) ? ach.quest.reward.jade : 0;
  }
  return 0;
}
