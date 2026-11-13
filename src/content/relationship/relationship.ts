import { GAME_BALANCE } from "../upgrades/balance.ts";

/**
 * The fan-service relationship ladder: ten stages from a total stranger
 * to her boyfriend.  The stage index is the affection level returned by
 * `affectionProgress` (1-based), driven by the hearts thresholds in
 * `GAME_BALANCE.affection.thresholds`.
 */
export interface RelationshipStage {
  /** Short fan-service stage title, shown in the HUD. */
  name: string;
  /** The line she says the moment this stage unlocks. */
  unlockLine: string;
  /**
   * Lines she can say on a tap while in this stage — each stage reads
   * noticeably warmer than the previous one.
   */
  tapLines: readonly string[];
}

export const RELATIONSHIP_STAGES: readonly RelationshipStage[] = [
  {
    name: "Незнакомец",
    unlockLine: "Ой… ты кто? Я тебя тут раньше не видела.",
    tapLines: [
      "Эй! Мы вообще знакомы?",
      "Не трогай, я вообще-то читаю…",
      "Хм. Странный ты.",
      "Ты всегда так пялишься?",
    ],
  },
  {
    name: "Сосед по парте",
    unlockLine: "А, это снова ты. Ладно, можешь сесть рядом.",
    tapLines: [
      "Опять ты? Ну… привет.",
      "Не мешай, тут самое интересное место!",
      "У тебя ручки лишней не найдётся?",
      "Ты смешной. Совсем чуть-чуть.",
    ],
  },
  {
    name: "Знакомый",
    unlockLine: "Я запомнила, как тебя зовут. Это уже что-то.",
    tapLines: [
      "О, привет! Как дела?",
      "Сегодня я в хорошем настроении. Повезло тебе.",
      "Хочешь, расскажу, про что эта книжка?",
      "Ты сегодня какой-то… милый.",
    ],
  },
  {
    name: "Приятель",
    unlockLine: "С тобой весело. Заходи почаще, ладно?",
    tapLines: [
      "Хи-хи, щекотно же!",
      "Я тебе рада. Правда.",
      "Посидишь со мной ещё немного?",
      "Только никому не говори, что я так улыбаюсь.",
    ],
  },
  {
    name: "Друг",
    unlockLine: "Всё, ты теперь мой человек. Официально.",
    tapLines: [
      "С тобой так спокойно…",
      "Можешь сесть поближе. Я не кусаюсь.",
      "Я по тебе скучала, вообще-то.",
      "Расскажи мне какой-нибудь секрет. Любой.",
    ],
  },
  {
    name: "Лучший друг",
    unlockLine: "Лучший. Друг. Понял? Это очень серьёзный титул.",
    tapLines: [
      "Обнимемся? Ну пожа-а-алуйста.",
      "Мне нравится, когда ты рядом.",
      "Я сегодня нарядилась. Ты ведь заметил?",
      "Если что, это не свидание… наверное.",
    ],
  },
  {
    name: "Её краш",
    unlockLine: "Кажется, я слишком часто о тебе думаю… Это всё твоя вина.",
    tapLines: [
      "Ты меня смущаешь… не останавливайся.",
      "Сердце так громко стучит… слышишь?",
      "Когда ты так близко, я забываю, что читала…",
      "Щёки горят… Это из-за тебя, да?",
    ],
  },
  {
    name: "Флирт",
    unlockLine: "Поиграем? Только чур не влюбляться первым.",
    tapLines: [
      "Ещё один тап — и я тебя поцелую. Шучу… или нет?",
      "Заметил чулок? Он сполз не случайно.",
      "Подойди ближе… ещё ближе…",
      "Обожаю, как ты на меня смотришь.",
    ],
  },
  {
    name: "Почти пара",
    unlockLine: "Все вокруг думают, что мы встречаемся. Может… пусть думают?",
    tapLines: [
      "Твоя рука такая тёплая…",
      "Останься сегодня подольше, м-м?",
      "Эту юбку я выбрала для тебя.",
      "Поцелуй в щёчку. Пока что — только в щёчку.",
    ],
  },
  {
    name: "Её парень",
    unlockLine: "Всё. Ты мой. Теперь я тебя никому не отдам. ❤️",
    tapLines: [
      "Милый, иди ко мне…",
      "Люблю, когда ты меня так касаешься…",
      "Сегодня вечером — только ты и я.",
      "Можешь не стучать. Для тебя всегда открыто.",
      "Этот чулок — только ради тебя…",
    ],
  },
] as const;

/** The pose she is currently in — each pose has its own line bank. */
export type HeroinePose = "classic" | "shelf" | "carpet" | "bed";

/**
 * Pose-specific lines in three heat bands: band 0 for stages 1-4,
 * band 1 for stages 5-7, band 2 for stages 8-10.  They comment on what
 * she is actually doing in that pose, and warm up with the ladder.
 */
export const POSE_TAP_LINES: Record<
  HeroinePose,
  readonly (readonly string[])[]
> = {
  classic: [
    [
      "Что? У меня форма помялась?",
      "Я просто стою. Не надо так смотреть.",
      "Школьная форма — не повод пялиться!",
    ],
    [
      "Как тебе моя форма? Только честно.",
      "Я ждала тебя тут, вообще-то.",
      "Может, прогуляемся после уроков?",
    ],
    [
      "Эта юбка короче, чем положено… для тебя.",
      "Подойди. Поправь мне воротничок… медленно.",
      "Форму я сегодня выбирала, думая о тебе.",
    ],
  ],
  shelf: [
    [
      "Не подглядывай! Я просто тянусь за книгой.",
      "Ай… высоко. Не смотри снизу!",
      "Лучше бы помог достать, чем смотреть.",
    ],
    [
      "Подержишь меня за талию? Чтобы не упала…",
      "Эта книга для нас двоих. Поймал?",
      "Каблучки приподнялись… заметил, да?",
    ],
    [
      "Юбка задралась? Упс… и пусть.",
      "Лови меня, если соскользну… только крепко.",
      "Могу тянуться так весь день, раз тебе нравится.",
    ],
  ],
  carpet: [
    [
      "Я читаю, между прочим!",
      "Чулок сполз… не смотри!",
      "Тут интересная глава, не отвлекай.",
    ],
    [
      "Ложись рядом, почитаем вместе?",
      "Я оставила место на ковре. Для тебя.",
      "Эта история про любовь… как у нас? Ой…",
    ],
    [
      "Чулок сполз не случайно. Поправишь?",
      "Книжка подождёт… иди сюда.",
      "Почитай мне вслух… на ушко.",
    ],
  ],
  bed: [
    [
      "Эй! Это моя кровать!",
      "Я просто отдыхаю. Выйди, а?",
      "Это место не для гостей, вообще-то…",
    ],
    [
      "Посидишь со мной, пока я засыпаю?",
      "Тут мягко… и немного одиноко.",
      "Расскажешь сказку? Только интересную.",
    ],
    [
      "Подушка пахнет тобой… и мне это нравится.",
      "Иди под одеяло, тут тепло…",
      "Сегодня можешь не уходить. Совсем.",
    ],
  ],
} as const;

/** Heat band of a stage: 1-4 cool, 5-7 warm, 8-10 hot. */
export function poseHeatBand(level: number): number {
  if (level <= 4) return 0;
  if (level <= 7) return 1;
  return 2;
}

/** Stage record of a 1-based affection level, clamped to the ladder. */
export function relationshipStage(level: number): RelationshipStage {
  const index = Math.min(
    RELATIONSHIP_STAGES.length - 1,
    Math.max(0, Math.floor(level) - 1),
  );
  return RELATIONSHIP_STAGES[index] as RelationshipStage;
}

/**
 * One random tap line: a 50/50 mix of the pose-specific bank (what she
 * is doing right now) and the stage bank (how she feels about you).
 * `random` is injectable for tests.
 */
export function pickTapLine(
  level: number,
  pose: HeroinePose,
  random: () => number,
): string {
  const poseBank = POSE_TAP_LINES[pose][poseHeatBand(level)] ?? [];
  const stageBank = relationshipStage(level).tapLines;
  const lines =
    poseBank.length > 0 && random() < 0.5 ? poseBank : stageBank;
  const index = Math.min(
    lines.length - 1,
    Math.max(0, Math.floor(random() * lines.length)),
  );
  return lines[index] as string;
}

/**
 * The ladder must stay exactly one stage per affection level: the
 * thresholds list has one entry fewer than the stages list.
 */
export function relationshipLadderIsConsistent(): boolean {
  return (
    GAME_BALANCE.affection.thresholds.length ===
    RELATIONSHIP_STAGES.length - 1
  );
}
