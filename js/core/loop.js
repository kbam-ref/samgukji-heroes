// 게임 루프.
// 화면 갱신은 requestAnimationFrame, 진행 계산은 실제 경과 시간 기반.
// 탭이 오래 멈췄던 큰 공백은 복귀 보상(offline)이 처리하므로 프레임당 dt를 제한하고,
// 복귀 보상이 지급된 직후에는 resetClock으로 시계를 맞춰 같은 시간이 두 번 계산되지 않게 한다.

const MAX_FRAME_SECONDS = 10;

export function startLoop(onTick) {
  let last = performance.now();

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > MAX_FRAME_SECONDS) dt = MAX_FRAME_SECONDS;
    if (dt > 0) onTick(dt);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  return {
    /** 복귀 보상 지급 직후 호출 — 다음 프레임의 dt를 0부터 다시 잰다. */
    resetClock() {
      last = performance.now();
    },
  };
}
