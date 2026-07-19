# 오디오 (BGM·효과음)

게임은 이 폴더의 `{id}.mp3` 파일을 재생합니다. 파일이 **없으면** `js/ui/sound.js`의
Web Audio 합성음(가야금·북·징·대금)으로 자동 폴백하므로, 파일이 없어도 게임은 정상 작동합니다.

## ElevenLabs로 생성하는 법

1. `.env`에 `ELEVENLABS_API_KEY`를 채웁니다 (elevenlabs.io → API Keys).
2. 생성:
   ```
   node tools/generate-audio.mjs            # 아직 없는 것만
   node tools/generate-audio.mjs --bgm      # BGM만
   node tools/generate-audio.mjs --sfx      # 효과음만
   node tools/generate-audio.mjs --only bgm-field,hit-armor
   node tools/generate-audio.mjs --force    # 있어도 다시
   ```
3. 마음에 들면 `sw.js`의 `CACHE` 버전을 올리고 커밋·push → 폰에서 오프라인 재생.

## 무엇을 만드나

목록과 프롬프트는 `js/data/audio-manifest.js`에 있습니다. 프롬프트를 고쳐 톤을 바꿀 수 있어요.

- **BGM**(music, 루프): `bgm-field`(전장), `bgm-boss`(우두머리), `bgm-title`(타이틀)
- **효과음**(sfx): `hit-armor/cloth/hide/heavy/blade`(적 갑주별 타격), `foe-strike`(막기),
  `clear`·`legend`·`epic`·`claim`·`chapter`·`rival`·`wipe`(사건 연출)

## 규약

런타임에 ElevenLabs를 호출하지 않습니다(외부 의존성 금지·오프라인 보장). 생성은 개발 PC에서만,
결과 파일만 앱에 포함됩니다. `.env`의 키는 절대 커밋되지 않습니다(.gitignore).
