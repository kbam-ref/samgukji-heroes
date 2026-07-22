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
      'High-energy epic Chinese Three Kingdoms battle music, fast driving tempo, pounding war drums and taiko, ' +
      'adrenaline-pumping propulsive rhythm, soaring heroic bamboo flute and erhu melody with a catchy memorable hook, ' +
      'powerful orchestral brass and strings, thrilling adventurous and hype, exciting action video game loop, seamless loop, no vocals',
  },
  {
    id: 'bgm-boss',
    kind: 'music',
    lengthMs: 32000,
    prompt:
      'Ferocious Three Kingdoms boss battle theme, explosive and menacing, thunderous relentless taiko drums, ' +
      'aggressive staccato low brass and strings, screaming Chinese flute, dramatic choir-like swells and gong hits, ' +
      'high-stakes pulse-pounding intensity, thrilling and epic, seamless loop, cinematic, no vocals',
  },
  {
    id: 'bgm-title',
    kind: 'music',
    lengthMs: 30000,
    prompt:
      'Grand exciting East Asian epic main theme, powerful heroic opening building to a triumphant swell, ' +
      'gayageum zither and bamboo flute over soaring orchestral strings, bold brass fanfare and driving taiko drums, ' +
      'majestic hopeful and adventurous, goosebumps cinematic game title, seamless loop, no vocals',
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
  // 적 사망음 — 스타크래프트 마린 죽을 때처럼: 짧고 또렷하고 펀치감 있는 아케이드 사망 비명(수석 2026-07-22).
  //   공통: single male vocal death cry, very short, punchy, crisp, dry mono, retro arcade video game sound, close mic, no music, no reverb, no ambience
  { id: 'death-gasp',   kind: 'sfx', seconds: 0.6, prompt: 'single male soldier death cry "aargh", very short and punchy, sharp pained yell cut off, crisp dry mono, retro arcade video game death sound, close mic, no music, no reverb' },
  { id: 'death-yelp',   kind: 'sfx', seconds: 0.5, prompt: 'single quick male "ah!" death yelp, startled high yelp instantly cut off as he is shot down, very short punchy, crisp dry mono, retro arcade video game sound, no music, no reverb' },
  { id: 'death-grunt',  kind: 'sfx', seconds: 0.6, prompt: 'single male "ugh" death grunt, short heavy pained groan cut off as he drops, punchy crisp dry mono, retro arcade video game death sound, no music, no reverb' },
  { id: 'death-bellow', kind: 'sfx', seconds: 0.7, prompt: 'single deep male "rraahh" death bellow, short heavy low pained roar cut off as the big warrior falls, punchy crisp dry mono, retro arcade video game sound, no music, no reverb' },
  { id: 'death-cry',    kind: 'sfx', seconds: 0.6, prompt: 'single sharp male "gah!" death cry, short high proud yell instantly cut off when slain, punchy crisp dry mono, retro arcade video game death sound, no music, no reverb' },
  { id: 'death-wild',   kind: 'sfx', seconds: 0.7, prompt: 'single wild male "yaargh" death roar, short fierce guttural savage cry cut off, punchy crisp dry mono, retro arcade video game sound, no music, no reverb' },
  // 보스 등장 멘트(TTS, 한국어). id: boss-voice-<sprite>. bossSpawn 시 재생.
  { id: 'boss-voice-zhangjiao',   kind: 'tts', text: '창천은 이미 죽었다! 황천의 시대가 열리리라!' },
  { id: 'boss-voice-boss-general', kind: 'tts', text: '감히 내 앞을 막아서다니, 무모하구나!' },
  { id: 'boss-voice-boss-warlock', kind: 'tts', text: '크하하하! 너희에게 죽음을 선사하마!' },
  // 신화·초월 영웅 등장 멘트(연의 명대사, TTS). id: hero-voice-<heroId>. 신화(5)·초월(6) 획득 연출 때 재생.
  { id: 'hero-voice-lvbu',        kind: 'tts', text: '인중여포 마중적토라! 하늘 아래 나를 당할 자 없다!' },
  { id: 'hero-voice-zhugeliang',  kind: 'tts', text: '동남풍은 이미 불었으니, 천하의 대세가 이 손 안에 있느니라.' },
  { id: 'hero-voice-guanyu',      kind: 'tts', text: '적장의 목을 베어 오리니, 이 술이 식기도 전이라!' },
  { id: 'hero-voice-caocao',      kind: 'tts', text: '차라리 내가 천하를 저버릴지언정, 천하가 나를 저버리게 두진 않으리!' },
];

/** 모든 항목 (도구·플레이어 공용) */
export const AUDIO_ASSETS = [...BGM, ...SFX];
