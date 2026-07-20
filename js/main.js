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
import { showLoading } from './ui/loading-screen.js';
import { fmt, formatDuration } from './ui/format.js';
import { countUp, flyCoins } from './ui/effects.js';
import { initSound, play, vibrate } from './ui/sound.js';

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

  // 부팅: 로딩 화면(~2초) → 타이틀 → '시작하기'를 누르면 game:begin으로 전장이 깨어난다(준비 카운트다운 시작).
  // 순수 아케이드라 복귀보상·출석·온보딩 모달은 없다.
  showLoading(() => showTitle(() => emit('game:begin')));

  // 전투 배속 — 설정의 speed 배율 (x1/x2). 방치 계산(killRate)은 실측 기준 유지
  const loop = startLoop((dt) => battle.tick(dt * (getState().settings?.speed || 1)));

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

  // 소리와 떨림 — 설정에서 끌 수 있다
  initSound();
  on('battle:death', () => play('kill'));
  on('battle:wipe', () => play('wipe'));
  on('stage:clear', () => {
    play('clear');
    vibrate(30);
  });

  // 순수 아케이드 — 복귀 보상(옥구슬) 제거. 백그라운드 복귀 시엔 저장·클럭 리셋만.
  // (방어 화면은 자체적으로 런을 저장/이어하기 처리한다)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      persist(getState()); // 숨기는 순간까지는 '본 시간'
    } else {
      loop.resetClock(); // 같은 시간이 루프에서 한 번 더 계산되지 않게
    }
  });
  window.addEventListener('pagehide', () => persist(getState(), { seen: !document.hidden }));

  if ('serviceWorker' in navigator) {
    let swReg = null;
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => { swReg = reg; })
      .catch(() => {
        /* 로컬 file:// 등에서는 조용히 넘어간다 */
      });
    // 새 버전이 도착해도 게임 도중엔 절대 자동 새로고침하지 않는다 — 플레이 중 타이틀로
    // 튕기는 건 버그다. 대신 (1) 눈에 보이는 배너로 '지금 적용'을 한 번에 열어 주고,
    // (2) 앱을 '충분히 오래' 벗어났을 때만 조용히 적용한다(1-1).
    const SW_RELOAD_DELAY_MS = 30000; // 이보다 짧게 비웠다 오면 자동 리로드 취소
    let hadController = Boolean(navigator.serviceWorker.controller);
    let updateReady = false;
    let reloadTimer = 0;

    const applyUpdate = () => {
      persist(getState());
      location.reload();
    };
    const showUpdateBanner = () => {
      if (document.getElementById('sw-update')) return;
      const bar = document.createElement('button');
      bar.id = 'sw-update';
      bar.type = 'button';
      bar.className = 'sw-update-banner';
      bar.innerHTML = '<b>새 버전이 준비됐어요</b><span>탭하여 지금 적용</span>';
      bar.addEventListener('click', applyUpdate, { once: true });
      document.body.appendChild(bar);
    };

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) {
        hadController = true; // 첫 설치(주도권 최초 획득)로는 아무것도 하지 않는다
        return;
      }
      updateReady = true;
      persist(getState());
      showUpdateBanner(); // 새 버전 도착 — 사용자가 원할 때 한 번에 적용
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (updateReady && !reloadTimer) {
          reloadTimer = setTimeout(() => {
            if (document.hidden) applyUpdate();
          }, SW_RELOAD_DELAY_MS);
        }
      } else {
        if (reloadTimer) {
          clearTimeout(reloadTimer); // 금방 돌아왔다 — 튕기지 않는다
          reloadTimer = 0;
        }
        // 돌아올 때마다 새 배포가 있는지 즉시 확인한다 — 캐시가 여러 버전 뒤처지지 않게
        swReg?.update?.().catch(() => {});
      }
    });
  }
}

boot();
