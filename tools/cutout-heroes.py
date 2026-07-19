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
force = "--force" in sys.argv

# 영웅·적을 함께 누끼 — (원본 폴더, 결과 폴더)
PAIRS = [("heroes", "heroes-cut"), ("enemies", "enemies-cut")]

# isnet-general-use — 일러스트 경계가 u2net보다 깔끔하다
session = new_session("isnet-general-use")

for src_name, out_name in PAIRS:
    src_dir = root / "assets" / src_name
    out_dir = root / "assets" / out_name
    if not src_dir.exists():
        continue
    out_dir.mkdir(parents=True, exist_ok=True)
    for p in sorted(src_dir.glob("*.png")):
        out = out_dir / p.name
        if out.exists() and not force:
            print(f"{src_name}/{p.name}: 이미 있음 — 건너뜀")
            continue
        data = remove(p.read_bytes(), session=session, post_process_mask=True)
        out.write_bytes(data)
        print(f"{src_name}/{p.name}: 저장 ({len(data) // 1024}KB)")

print("끝. assets/heroes-cut/ · enemies-cut/ 확인 후 전장 통합.")
