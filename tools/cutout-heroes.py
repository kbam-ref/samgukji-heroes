# 초상 배경 제거(누끼) — assets/heroes/*.png → assets/heroes-cut/*.png
# 개발 도구이며 앱에 포함되지 않는다. 결과 투명 PNG만 게임이 쓴다.
#
# 사용법:
#   python tools/cutout-heroes.py           ← 아직 없는 것 전부
#   python tools/cutout-heroes.py --force   ← 전부 다시
#
# 요구: pip install rembg onnxruntime  (첫 실행 시 모델 자동 다운로드)

import sys
from pathlib import Path

from rembg import new_session, remove

root = Path(__file__).resolve().parent.parent
src_dir = root / "assets" / "heroes"
out_dir = root / "assets" / "heroes-cut"
out_dir.mkdir(parents=True, exist_ok=True)

force = "--force" in sys.argv

# isnet-general-use — 일러스트 경계가 u2net보다 깔끔하다
session = new_session("isnet-general-use")

for p in sorted(src_dir.glob("*.png")):
    out = out_dir / p.name
    if out.exists() and not force:
        print(f"{p.name}: 이미 있음 — 건너뜀")
        continue
    data = remove(p.read_bytes(), session=session, post_process_mask=True)
    out.write_bytes(data)
    print(f"{p.name}: 저장 ({len(data) // 1024}KB)")

print("끝. assets/heroes-cut/ 확인 후 전장 통합.")
