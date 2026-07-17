// 영웅 초상 — assets/heroes/{id}.png 정적 에셋을 표시하는 공용 헬퍼.
// 미보유 실루엣은 CSS(.silhouette 필터)로 처리해 이미지 파일은 한 벌만 쓴다.

export function portraitSrc(id) {
  return `./assets/heroes/${id}.png`;
}

export function portraitHtml(id, cls = '') {
  return `<img class="portrait${cls ? ' ' + cls : ''}" src="${portraitSrc(id)}" alt="" loading="lazy" draggable="false">`;
}
