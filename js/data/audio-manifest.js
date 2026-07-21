// 오디오 에셋 목록 — 순수 데이터 (로직 없음).
// tools/generate-audio.mjs 가 이 목록으로 ElevenLabs에 생성을 요청해 assets/audio/{id}.mp3 로 저장하고,
// js/ui/audio.js 가 같은 목록으로 파일을 불러와 재생한다. 파일이 없으면 sound.js의 합성음으로 폴백.
//
// kind:
//   'music' → ElevenLabs Music (긴 곡, 루프). lengthMs = 곡 길이(밀리초)
//   'sfx'   → ElevenLabs Sound Effects (짧은 효과음). seconds = 길이(0.5~22)
//
// 삼국지 사극 무드 — 국악(가야금·대금·북·징) + 웅장한 오케스트라. 세련되고 흥미진진하게.

export const BGM = [
  {
    id: 'bgm-field',
    kind: 'music',
    lengthMs: 45000,
    prompt:
      'Epic Chinese Three Kingdoms battle theme, refined and exciting, driving war drums, ' +
      'soaring bamboo flute (daegeum) and gayageum zither melody, sweeping orchestral strings, ' +
      'heroic and adventurous, seamless loop, cinematic game background music, no vocals',
  },
  {
    id: 'bgm-boss',
    kind: 'music',
    lengthMs: 32000,
    prompt:
      'Intense Three Kingdoms boss battle theme, tense and dramatic, thunderous taiko drums, ' +
      'aggressive low strings and brass, ominous gong hits, fast heroic Chinese flute, ' +
      'rising tension, seamless loop, cinematic, no vocals',
  },
  {
    id: 'bgm-title',
    kind: 'music',
    lengthMs: 30000,
    prompt:
      'Majestic ancient East Asian epic main theme, grand and emotional opening, slow build, ' +
      'gayageum zither and bamboo flute over warm orchestral strings and soft taiko drums, ' +
      'noble, hopeful and cinematic, seamless loop, no vocals',
  },
];

export const SFX = [
  // 아군 타격 — 적 갑주별 (battle-screen enemyHitProfile과 id가 일치: hit-<profile>)
  { id: 'hit-armor', kind: 'sfx', seconds: 0.7, prompt: 'sword blade striking metal armor, sharp bright metallic clang, single hit, dry' },
  { id: 'hit-cloth', kind: 'sfx', seconds: 0.7, prompt: 'wooden club hitting cloth and flesh, dull heavy thud, no metal, single hit' },
  { id: 'hit-hide',  kind: 'sfx', seconds: 0.7, prompt: 'weapon striking leather armor and bone, primal muffled impact with a sharp crack, single hit' },
  { id: 'hit-heavy', kind: 'sfx', seconds: 0.9, prompt: 'massive heavy weapon crushing blow on armored boss, deep powerful metallic impact with weight, single hit' },
  { id: 'hit-blade', kind: 'sfx', seconds: 0.8, prompt: 'two steel swords clashing, ringing metallic sword parry, single sharp clang' },
  { id: 'foe-strike', kind: 'sfx', seconds: 0.7, prompt: 'enemy weapon blocked by shield, dull metallic guard impact, single thud' },
  // 사건 효과음 (sound.js play(kind)와 id 일치)
  { id: 'clear',   kind: 'sfx', seconds: 1.4, prompt: 'victorious short fanfare, Chinese gong and drum with a rising flute flourish, triumphant stage clear' },
  { id: 'legend',  kind: 'sfx', seconds: 2.0, prompt: 'legendary hero reveal, huge shimmering gong, golden magical rise, epic Chinese orchestral swell' },
  { id: 'epic',    kind: 'sfx', seconds: 1.2, prompt: 'rare hero reveal, bright gong and sparkling chime, short heroic accent' },
  { id: 'claim',   kind: 'sfx', seconds: 0.6, prompt: 'reward collected, pleasant short zither pluck chime, coin-like sparkle' },
  { id: 'chapter', kind: 'sfx', seconds: 1.6, prompt: 'new chapter opening, deep gong strike followed by a solemn bamboo flute phrase, epic ink-brush reveal' },
  { id: 'rival',   kind: 'sfx', seconds: 1.2, prompt: 'rival warlord appears, tense double war drum and a low ominous flute, dramatic encounter sting' },
  { id: 'wipe',    kind: 'sfx', seconds: 1.2, prompt: 'army defeated, descending dark whoosh and a low mournful gong, retreat sting' },
  // 적 사망음 — 라운드 적 종류별 프로파일(defense-screen ENEMY_DEATH 매핑, id: death-<profile>)
  { id: 'death-gasp',   kind: 'sfx', seconds: 0.7, prompt: 'short raspy male peasant death gasp, weak pained cry cut short as he collapses, dry, single' },
  { id: 'death-yelp',   kind: 'sfx', seconds: 0.6, prompt: 'short quick male soldier death yelp, startled sharp pained gasp as he is struck down, dry, single' },
  { id: 'death-grunt',  kind: 'sfx', seconds: 0.7, prompt: 'short male soldier death grunt, pained low groan as he falls, dry, single' },
  { id: 'death-bellow', kind: 'sfx', seconds: 0.8, prompt: 'short deep heavy warrior death bellow, low pained roar as the big man collapses, dry, single' },
  { id: 'death-cry',    kind: 'sfx', seconds: 0.7, prompt: 'short sharp male warrior death cry, high proud yell cut short as he is slain, dry, single' },
  { id: 'death-wild',   kind: 'sfx', seconds: 0.8, prompt: 'short wild savage tribal warrior death roar cut short, fierce guttural cry, dry, single' },
  // 보스 등장 멘트(TTS, 한국어). id: boss-voice-<sprite>. bossSpawn 시 재생.
  { id: 'boss-voice-zhangjiao',   kind: 'tts', text: '창천은 이미 죽었다! 황천의 시대가 열리리라!' },
  { id: 'boss-voice-boss-general', kind: 'tts', text: '감히 내 앞을 막아서다니, 무모하구나!' },
  { id: 'boss-voice-boss-warlock', kind: 'tts', text: '크하하하! 너희에게 죽음을 선사하마!' },
];

/** 모든 항목 (도구·플레이어 공용) */
export const AUDIO_ASSETS = [...BGM, ...SFX];
