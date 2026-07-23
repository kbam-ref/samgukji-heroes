// 진입점 — 세이브 불러오기 → 복귀 보상 → 화면 구성 → 게임 루프 시작

import { loadOrCreate, persist } from './core/save.js';
import { initState, getState, addCoin, addJade, offlineDoubled, markOfflineDoubled, freePullUsed, setFlag } from './core/state.js';
import { on, emit } from './core/events.js';
import { startLoop } from './core/loop.js';
import * as battle from './systems/battle.js';
import { computeOfflineGain } from './systems/offline.js';
import { canStarUpAny } from './systems/growth.js';
import { canGearUpAny } from './systems/gear.js';
import { hasUnreadTale } from './systems/tales.js';
import { renderResourceBar } from './ui/resource-bar.js';
import { renderTabs } from './ui/tabs.js';
import { showModal } from './ui/modal.js';
import { maybeShowAttendance } from './ui/attendance-modal.js';
import { showTitle } from './ui/title-screen.js';
// 로딩 화면은 메인(타이틀)과 통합(수석 2026-07-22) — showLoading 미사용.
import { hasSavedRun, saveActiveRun, clearSavedRun } from './ui/defense-screen.js';
import { playsLeft, playsInfo, grantPaid } from './systems/rd-meta.js';
import { fmt, formatDuration } from './ui/format.js';
import { countUp, flyCoins } from './ui/effects.js';
import { initSound, play, vibrate } from './ui/sound.js';

// ── 강제 가로 (v117) — 세로로 들면 #viewport를 90° 회전시켜 가로로 채운다(회전 요청 화면 없이 바로 플레이) ──
function applyForceRotate() {
  const vp = document.getElementById('viewport');
  if (!vp) return;
  const portrait = window.innerHeight > window.innerWidth;
  document.body.classList.toggle('force-rotate', portrait);
  if (portrait) { // 회전 후 가로폭=화면높이, 가로높이=화면폭
    vp.style.width = window.innerHeight + 'px';
    vp.style.height = window.innerWidth + 'px';
    vp.style.left = window.innerWidth + 'px';
  } else { vp.style.width = ''; vp.style.height = ''; vp.style.left = ''; }
}
applyForceRotate();
// resize보다 먼저 등록 → 방어화면 onResize가 뒤이어 실행돼 회전 반영된 크기로 재측정
window.addEventListener('resize', applyForceRotate);
window.addEventListener('orientationchange', applyForceRotate);

// 몰입 풀스크린(시스템 바 숨김) — 브라우저에선 '첫 터치'에 딱 한 번만 요청(전투 시작마다 재요청하던 '자꾸 뜸' 폐지).
// (브라우저 풀스크린 알림은 정책상 최초 1회 불가피. 알림 없이 완전 몰입은 설치형 PWA=manifest display:fullscreen.)
let fsAsked = false;
const goFullscreenOnce = () => {
  if (fsAsked) return; fsAsked = true;
  try {
    const de = document.documentElement;
    if (document.fullscreenElement || window.matchMedia('(display-mode: fullscreen)').matches) return; // 이미 몰입(설치형 PWA)이면 요청 안 함
    const rfs = de.requestFullscreen || de.webkitRequestFullscreen || de.mozRequestFullScreen || de.msRequestFullscreen;
    const r = rfs && rfs.call(de, { navigationUI: 'hide' });
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch { /* 지원/권한 없으면 무시 */ }
};
document.addEventListener('pointerdown', goFullscreenOnce, { once: true });

const AUTOSAVE_MS = 10000;

// 아직 거두지 않은 복귀 보상 — 새 보상이 오면 합산해 다시 보여준다.
// (모달이 새 모달로 덮여도 보상이 증발하지 않게)
let pendingGain = null;

function claimPending(mult) {
  if (!pendingGain) return;
  // 엽전이 손에서 자원바로 날아든다 — '받았다'가 손에 잡히는 순간
  const counter = document.getElementById('offline-count');
  if (counter) {
    const r = counter.getBoundingClientRect();
    flyCoins(r.left + r.width / 2, r.top + r.height / 2, mult > 1 ? 8 : 5);
  }
  addCoin(pendingGain.coins * mult);
  if (pendingGain.jade > 0) addJade(pendingGain.jade * mult);
  if (mult > 1) markOfflineDoubled();
  pendingGain = null;
  play(mult > 1 ? 'epic' : 'claim');
  vibrate(mult > 1 ? 30 : 15);
  setTimeout(maybeShowAttendance, 350); // 복귀 보상을 거둔 뒤 출석이 이어진다
}

function showOfflineReward(gain) {
  pendingGain = pendingGain
    ? {
        coins: pendingGain.coins + gain.coins,
        jade: (pendingGain.jade ?? 0) + (gain.jade ?? 0),
        seconds: pendingGain.seconds + gain.seconds,
      }
    : { coins: gain.coins, jade: gain.jade ?? 0, seconds: gain.seconds };

  const estKills = Math.floor(battle.killRatePerSecond(getState()) * pendingGain.seconds * 0.6);
  const body = document.createElement('div');
  body.className = 'offline-body';
  body.innerHTML = `
    <p>자리를 비운 <b>${formatDuration(pendingGain.seconds)}</b> 동안<br>병사들이 약 <b>${fmt(estKills)}</b>명을 무찔렀어요.</p>
    <div class="offline-coins"><b id="offline-count">0</b><span>엽전</span></div>
    ${pendingGain.jade > 0 ? `<p class="offline-sub">옥구슬 <b>+${fmt(pendingGain.jade)}</b>도 함께 굴러들어왔어요</p>` : ''}
    <p class="offline-sub">영웅 탭에서 단련에 쓰면 좋아요</p>`;

  const actions = [];
  // 하루 1회 — 2배로 거두기 (급습과 별개의 복귀 전용 축포)
  if (!offlineDoubled()) {
    actions.push({
      label: '2배로 받기 (오늘 1회)',
      primary: true,
      onClick: () => claimPending(2),
    });
    actions.push({ label: '그냥 받기', onClick: () => claimPending(1) });
  } else {
    actions.push({ label: '받기', primary: true, onClick: () => claimPending(1) });
  }

  showModal({ title: '다녀오셨군요, 주군', body, dismissible: false, actions });

  countUp(document.getElementById('offline-count'), 0, pendingGain.coins, {
    duration: 1200,
    format: fmt,
  });
}

/** 안드로이드 전체화면 PWA에서 안전영역(env)이 0으로 잡히는 기기 보정 —
 *  하단 탭이 시스템 버튼 밑에 깔려 못 누르게 되는 문제를 막는다 */
function fixSafeArea() {
  if (!window.matchMedia?.('(display-mode: standalone)').matches) return;
  if (!/Android/i.test(navigator.userAgent)) return;
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;left:0;bottom:0;width:1px;height:0;visibility:hidden;' +
    'padding-bottom:env(safe-area-inset-bottom);padding-top:env(safe-area-inset-top);';
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const bottom = parseFloat(style.paddingBottom) || 0;
  const top = parseFloat(style.paddingTop) || 0;
  probe.remove();
  // 전체화면인데 env가 비어 있으면 기기 값 대신 안전한 보정치를 쓴다
  if (bottom < 8) document.documentElement.style.setProperty('--safe-b', '42px');
  if (top < 8) document.documentElement.style.setProperty('--safe-t', '28px');
}

function boot() {
  fixSafeArea();
  const save = loadOrCreate();
  const awaySeconds = (Date.now() - save.lastSeenAt) / 1000;
  initState(save);

  renderResourceBar(document.getElementById('resource-bar'));
  renderTabs(document.getElementById('tab-bar'), document.getElementById('screen-root'));

  // 첫 접속 온보딩 — 시작 옥구슬로 첫 10연을 돌리게 이끈다 (이탈의 절반은 첫 60초에 난다)
  function maybeShowFtue() {
    const s = getState();
    if (s.flags?.ftue || s.gacha.total > 0) return;
    showModal({
      title: '주군, 천하가 부릅니다',
      body: '지금 가진 옥구슬이면 장수 10명을 한 번에 모을 수 있습니다.\n모집에서 첫 부대를 꾸리고, 전투는 알아서 벌어집니다.',
      actions: [
        {
          label: '10회 모집하러 가기',
          primary: true,
          onClick: () => {
            // '나중에'로 닫으면 플래그를 안 남겨 다음 접속에 다시 안내한다 (1-7)
            setFlag('ftue');
            persist(getState());
            document.querySelector('.tab[data-tab="gacha"]')?.click();
            // 도착하면 10연 버튼이 빛나며 "여기"라고 알려준다
            setTimeout(() => {
              const btn = document.querySelector('.pull-btn[data-count="10"]');
              if (btn) {
                btn.classList.add('ftue-glow');
                setTimeout(() => btn.classList.remove('ftue-glow'), 6000);
              }
            }, 420);
          },
        },
        { label: '나중에' },
      ],
    });
  }
  on('attendance:claim', () => setTimeout(maybeShowFtue, 400));

  // 부팅(2026-07-20 수석): 재실행은 '항상 처음부터'. 남은 세이브를 지우고 시작화면으로 —
  //   강제종료로 죽음을 회피하는 이어하기가 생기지 않는다(세션 중 백그라운드 복귀는 그대로 이어감).
  on('plays:empty', showNoPlays); // 도전 소진 시 결제 화면
  // 예외(감사 2026-07-23): SW 자동 업데이트로 인한 재시작은 '우리가 일으킨' 새로고침 —
  //   applyUpdate가 저장해 둔 판을 지우면 배포 때마다 유저 런·유료 도전이 증발한다. 그 판은 즉시 이어간다.
  const swResume = sessionStorage.getItem('rd-sw-resume') === '1';
  try { sessionStorage.removeItem('rd-sw-resume'); } catch { /* noop */ }
  if (!swResume) clearSavedRun();
  // 2026-07-22 수석: 로딩 화면과 메인(타이틀)을 하나로 — 별도 로딩 없이 타이틀을 바로 띄운다(에셋은 SW 캐시라 즉시).
  if (swResume && hasSavedRun()) emit('game:load'); // 업데이트 직전 판으로 곧장 복귀(도전 무소모)
  else openTitle();

  // 랜덤 디펜스(아케이드)로 전환한 뒤 구 방치 전투엔진(battle.tick)은 쓰지 않는다.
  // 계속 돌리면 마이그레이션 세이브(파티 보유)에서 유령 처치음·진동이 나고 배터리만 축낸다.
  // 루프 골격만 남겨 resetClock(탭 복귀 시 시간 튐 방지)을 유지한다. 실제 게임 루프는 defense-screen이 돈다.
  const loop = startLoop(() => {});

  const dotOf = (tab) => document.querySelector(`.tab[data-tab="${tab}"] .tab-dot`);

  // 모집 탭 금점 — 오늘의 무료 모집이 남아 있으면 표시
  const refreshGachaDot = () => {
    const dot = dotOf('gacha');
    if (dot) dot.hidden = freePullUsed();
  };
  refreshGachaDot();
  on('gacha:free', refreshGachaDot);
  setInterval(refreshGachaDot, 60000); // 자정 넘김 대비

  // 도감 탭 금점 — 읽을 수 있는 새 열전이 있으면 점등. 재평가 방식이라 탭 진입 시 자동 소등 (3-4)
  const refreshCodexDot = () => {
    const dot = dotOf('codex');
    if (dot) dot.hidden = !hasUnreadTale(getState());
  };
  refreshCodexDot();
  on('hero:add', refreshCodexDot);
  on('hero:refund', refreshCodexDot);
  on('tale:read', refreshCodexDot);

  // 영웅 탭 금점 — 승급 가능(중복 참) 또는 보물 강화 가능(강화석)일 때. 엽전 단련은 상시
  // 충족되니 제외해 점의 가치를 지킨다 (2-10, G3)
  const refreshHeroesDot = () => {
    const dot = dotOf('heroes');
    if (dot) dot.hidden = !(canStarUpAny(getState()) || canGearUpAny(getState()));
  };
  refreshHeroesDot();
  on('hero:dupe', refreshHeroesDot);
  on('hero:add', refreshHeroesDot);
  on('hero:refund', refreshHeroesDot);
  on('stone', refreshHeroesDot);

  // 주기 저장 — 탭이 숨겨져 있는 동안엔 lastSeenAt을 전진시키지 않는다
  // (전진시키면 백그라운드에서 죽었을 때 방치 보상이 통째로 사라진다)
  setInterval(() => persist(getState(), { seen: !document.hidden }), AUTOSAVE_MS);

  // 굵직한 사건 직후엔 즉시 저장 (주기 저장과 별개)
  on('upgrade:atk', () => persist(getState()));
  on('stage:clear', () => persist(getState()));
  on('quest:claim', () => persist(getState()));

  // 소리와 떨림 — 설정에서 끌 수 있다. (RD 전투음은 defense-screen의 consumeFx가 직접 재생)
  initSound();

  // 앱을 백그라운드에서 충분히(>1.5초) 비웠다 돌아오면 → 시작화면을 다시 띄운다(매번 새 판/이어하기 선택).
  // 그 사이 게임은 game:suspend로 멈춰 둔다. 잠깐 전환한 정도(<1.5초)면 그대로 이어서.
  let bgAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      bgAt = performance.now();
      try { saveActiveRun(); } catch { /* noop */ } // 강제종료 직전 현재 상태 스냅샷 — 되감기 스컴 방지
      persist(getState());
    } else {
      // 이미 시작화면·결제화면·모달·리빌이 떠 있으면 건드리지 않는다(런 교체·상태 오염 방지)
      const busy = document.getElementById('title-screen') || document.getElementById('no-plays')
        || document.getElementById('rd-reveal') || document.getElementById('modal-root')?.hasChildNodes();
      if (bgAt && performance.now() - bgAt > 1500 && !busy) {
        if (hasSavedRun()) {
          emit('game:load');   // 저장돼 있으면 자동으로 그 판 이어서(도전 안 씀)
        } else {
          emit('game:suspend'); // 저장 안 했으면 시작화면 다시(다음 시작은 도전 1 소모)
          openTitle();
        }
      }
      bgAt = 0;
      loop.resetClock(); // 같은 시간이 루프에서 한 번 더 계산되지 않게
    }
  });
  window.addEventListener('pagehide', () => {
    try { saveActiveRun(); } catch { /* noop */ }
    persist(getState(), { seen: !document.hidden });
  });

  if ('serviceWorker' in navigator) {
    // 공격적 자동 업데이트(2026-07-20 수석 지시): 새 배포를 감지하면 즉시 세이브하고 바로 반영한다.
    // sw.js가 skipWaiting+clients.claim이라 새 워커가 곧장 주도권을 잡고 controllerchange가 뜬다.
    let swReg = null;
    const hadController = Boolean(navigator.serviceWorker.controller);
    let applied = false;

    const applyUpdate = () => {
      if (applied) return;
      applied = true;
      try { saveActiveRun(); } catch { /* noop */ }       // 진행 중이던 판을 저장 — 새 버전에서 도전 소모 없이 자동 이어가기
      try { sessionStorage.setItem('rd-sw-resume', '1'); } catch { /* noop */ } // 부팅 루틴의 세이브 삭제를 이번 1회 건너뛰게
      try { persist(getState()); } catch { /* noop */ }   // 메타(최고기록 등) 저장
      showApplyingToast();                                // '새 버전 적용 중…' 잠깐 안내
      setTimeout(() => location.reload(), 500);           // 세이브가 끝날 여유를 준 뒤 새로고침
    };

    navigator.serviceWorker
      // updateViaCache:'none' — sw.js를 HTTP 캐시 없이 매번 새로 받아 새 배포를 확실히 감지
      .register('./sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        swReg = reg;
        // 앱을 계속 켜둬도 ~60초 내 새 배포를 감지하도록 주기적으로 확인
        setInterval(() => reg.update().catch(() => {}), 60000);
      })
      .catch(() => { /* 로컬 file:// 등에서는 조용히 넘어간다 */ });

    // 새 워커가 주도권을 잡는 순간 즉시 적용. 최초 설치(주도권 첫 획득)는 무시.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return;
      applyUpdate();
    });

    // 포그라운드로 돌아올 때마다 새 배포 확인 (감지를 앞당긴다)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) swReg?.update?.().catch(() => {});
    });
  }
}

// 시작화면 — '시작하기'가 도전 1을 소모(game:begin→defense-screen). 남은 도전 수를 함께 보여준다.
function openTitle() {
  showTitle(() => emit('game:begin'), { plays: playsLeft() });
}

// 도전 횟수 소진 → 충전 안내. 실 인앱결제는 스토어 출시 후 연동, 지금은 테스트 충전(+5).
function showNoPlays() {
  if (document.getElementById('no-plays')) return;
  const info = playsInfo();
  const el = document.createElement('div');
  el.id = 'no-plays';
  el.className = 'no-plays';
  el.innerHTML = `
    <div class="np-card">
      <b>오늘의 도전을 다 썼습니다</b>
      <p>내일 무료 ${info.dailyFree}회가 다시 채워집니다.<br>지금 바로 이어가려면 충전하세요.</p>
      <button class="btn primary np-buy">도전 5회 충전</button>
      <button class="btn np-close">내일 다시</button>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('.np-buy').addEventListener('click', () => {
    grantPaid(5); // TODO: 실제 인앱결제(스토어 결제) 연동. 지금은 테스트 충전.
    el.remove();
    openTitle();
  });
  el.querySelector('.np-close').addEventListener('click', () => { el.remove(); openTitle(); });
}

// 업데이트 반영 직전 잠깐 뜨는 안내 — 갑작스러운 새로고침이 멈춤처럼 느껴지지 않게
function showApplyingToast() {
  if (document.getElementById('sw-applying')) return;
  const t = document.createElement('div');
  t.id = 'sw-applying';
  t.className = 'sw-applying';
  t.textContent = '새 버전 적용 중…';
  document.body.appendChild(t);
}

boot();
