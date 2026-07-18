// 저장/불러오기/마이그레이션.
// 스키마가 바뀌면 VERSION을 올리고 MIGRATIONS에 이전 버전 → 다음 버전 함수를 추가한다.
// 기존 유저의 세이브가 깨지는 일은 절대 없어야 한다.

import { BALANCE } from '../data/balance.js';

export const SAVE_VERSION = 7;

export function createNewSave(now = Date.now()) {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastSeenAt: now,
    resources: {
      coin: BALANCE.start.coin,
      jade: BALANCE.start.jade,
      shard: 0, // 명성 조각 — 남는 겹침을 방출해 얻고, 원하는 장수와 교환
    },
    heroes: Object.fromEntries(
      BALANCE.start.heroes.map((id) => [id, { level: 1, stars: 1, dupes: 0 }])
    ),
    party: [...BALANCE.start.heroes],
    stage: { difficulty: 1, chapter: 1, index: 1, kills: 0 },
    gacha: { pity: 0, total: 0 },
    upgrades: { atk: 0 },                       // 공격 연마 횟수
    stats: { totalKills: 0, totalClears: 0 },   // 누적 처치·돌파
    daily: { date: '', kills: 0, pulls: 0, clears: 0, raids: 0, claimed: [] }, // 일일 목표 진행
    achievements: { claimed: [] },              // 수령한 업적
    settings: { sound: true, vibrate: true },
    rivalKills: {},                             // 숙적 격파 기록 { 영웅id: 횟수 }
    tales: { read: [] },                        // 읽은 열전
    bondsMastery: {},                           // 인연 숙련 { 인연id: 우두머리 격파 수 }
    orders: { active: null },                   // 발동 중인 세력 군령
    attendance: { lastClaim: '', cycleDay: 0, totalDays: 0 }, // 출석 (v6 — UI는 추후)
    records: {},                                // 개인 최고 기록
    flags: {},                                  // 온보딩 등 1회성 플래그
  };
}

const MIGRATIONS = {
  // v1 → v2: 공격 연마·누적 처치 필드 추가 (2026-07-16)
  2: (save) => {
    save.upgrades = save.upgrades ?? { atk: 0 };
    save.stats = save.stats ?? { totalKills: 0 };
    save.version = 2;
    return save;
  },
  // v2 → v3: 일일 목표·업적·설정·누적 돌파 추가 (2026-07-16)
  3: (save) => {
    save.stats = save.stats ?? { totalKills: 0 };
    save.stats.totalClears = save.stats.totalClears ?? 0;
    save.daily = save.daily ?? { date: '', kills: 0, pulls: 0, clears: 0, claimed: [] };
    save.achievements = save.achievements ?? { claimed: [] };
    save.settings = save.settings ?? { sound: true, vibrate: true };
    save.version = 3;
    return save;
  },
  // v3 → v4: 숙적 격파 기록 추가 (2026-07-16)
  4: (save) => {
    save.rivalKills = save.rivalKills ?? {};
    save.version = 4;
    return save;
  },
  // v4 → v5: 열전·인연 숙련도·세력 군령 추가 (2026-07-16)
  5: (save) => {
    save.tales = save.tales ?? { read: [] };
    save.bondsMastery = save.bondsMastery ?? {};
    save.orders = save.orders ?? { active: null };
    save.version = 5;
    return save;
  },
  // v5 → v6: 천하통일 개편 — 난이도 필드, 출석·기록·플래그 뼈대 (2026-07-18)
  // 기존 진행(장·전장·처치 수)은 그대로 이어진다. 새 4장 이후 콘텐츠가 뒤에 붙었을 뿐.
  6: (save) => {
    save.stage.difficulty = save.stage.difficulty ?? 1;
    save.attendance = save.attendance ?? { lastClaim: '', cycleDay: 0, totalDays: 0 };
    save.records = save.records ?? {};
    save.flags = save.flags ?? {};
    save.version = 6;
    return save;
  },
  // v6 → v7: 명성 조각 — 남는 겹침 방출·지정 교환 (2026-07-19)
  7: (save) => {
    save.resources.shard = save.resources.shard ?? 0;
    save.version = 7;
    return save;
  },
};

export function migrate(save) {
  let current = save;
  while (current.version < SAVE_VERSION) {
    const step = MIGRATIONS[current.version + 1];
    if (!step) {
      console.warn('마이그레이션 경로가 없어 새 세이브로 시작합니다.', current.version);
      return createNewSave();
    }
    current = step(current);
  }
  return current;
}

/** 마이그레이션 후에도 지켜져야 하는 최소 구조 — 깨졌으면 새 세이브로 */
export function isUsableSave(s) {
  return (
    s &&
    typeof s.version === 'number' &&
    typeof s.lastSeenAt === 'number' &&
    s.resources && typeof s.resources.coin === 'number' && typeof s.resources.jade === 'number' &&
    s.heroes && typeof s.heroes === 'object' &&
    Array.isArray(s.party) &&
    s.stage && typeof s.stage.chapter === 'number' && typeof s.stage.index === 'number' &&
    s.gacha && typeof s.gacha.pity === 'number'
  );
}

export function loadOrCreate() {
  try {
    const raw = localStorage.getItem(BALANCE.saveKey);
    if (!raw) return createNewSave();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.version !== 'number') return createNewSave();
    const migrated = migrate(parsed);
    if (!isUsableSave(migrated)) {
      console.warn('세이브 구조가 깨져 새로 시작합니다.');
      return createNewSave();
    }
    return migrated;
  } catch (err) {
    console.warn('세이브를 읽지 못해 새로 시작합니다.', err);
    return createNewSave();
  }
}

/**
 * 저장. seen=false면 lastSeenAt을 건드리지 않는다 —
 * 탭이 숨겨진 동안의 주기 저장이 방치 시간을 지워 먹지 않게 하기 위함.
 */
export function persist(state, { seen = true } = {}) {
  if (!state) return;
  if (seen) state.lastSeenAt = Date.now();
  try {
    localStorage.setItem(BALANCE.saveKey, JSON.stringify(state));
  } catch (err) {
    console.warn('세이브 저장 실패', err);
  }
}

export function wipe() {
  localStorage.removeItem(BALANCE.saveKey);
}
