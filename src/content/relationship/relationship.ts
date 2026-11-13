import { GAME_BALANCE, type UpgradeKind } from "../upgrades/balance.ts";

/**
 * DIALOGUE LOGIC (the writing bible of the ladder)
 * ------------------------------------------------
 * Context: you are classmates.  Somehow you ended up in HER room, and
 * at the start she barely knows you.  The arc is a classic tsundere
 * melt: stages 1-4 she is indignant that you are even here (but never
 * actually kicks you out), stages 5-6 the mask slips into warmth,
 * stages 7-8 she flirts first and blames you for it, stages 9-10 she
 * is openly, possessively in love.
 *
 * FAN-SERVICE LOGIC: early stages tease by ACCIDENT (she denies and
 * deflects — "не смотри!"), middle stages tease on PURPOSE while
 * keeping plausible deniability, late stages are open invitations.
 * Props must match the pose: stocking lines live ONLY in poses where a
 * stocking is actually slipping (the carpet scene, and the shelf
 * stretch where tiptoes pull it down).  No pose prop — no prop line.
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
    unlockLine:
      "Т-ты кто?! Кто разрешил заходить в мою комнату?! …Ладно. Только дверь закрой.",
    tapLines: [
      "Н-не трогай! Мы даже толком не знакомы!",
      "Ты из моего класса, да? Это не повод тут расхаживать!",
      "Я тебя не выгоняю только потому, что… лень. Ясно?!",
      "Чего уставился? Комнаты не видел?",
    ],
  },
  {
    name: "Сосед по парте",
    unlockLine:
      "Раз уж мы сидим рядом на уроках… можешь иногда заходить. Иногда!",
    tapLines: [
      "Это не значит, что ты мне нравишься! Просто удобно списывать.",
      "Опять пришёл? …Я не говорила, что против. Б-балбес.",
      "Не придвигайся! Парта — общая, комната — моя!",
      "Я видела, как ты смотришь на меня на уроках. Прекрати… ну, не сразу.",
    ],
  },
  {
    name: "Знакомый",
    unlockLine: "Так и быть, запомнила твоё имя. Не воображай себе лишнего!",
    tapLines: [
      "Я не ждала тебя! Просто… случайно посмотрела в окно. Два раза.",
      "Хочешь чаю? Это мама велела предложить. Наверное.",
      "Завтра контрольная… позанимаемся? Только без глупостей!",
      "Ты смешной. Это не комплимент! …Ну, почти.",
    ],
  },
  {
    name: "Приятель",
    unlockLine: "Ладно, признаю: с тобой не скучно. Доволен?",
    tapLines: [
      "Хи-хи… я не над тобой смеюсь! …Ладно, над тобой.",
      "Садись, где обычно. У тебя уже есть «своё место», представляешь?",
      "Я сегодня убралась. НЕ ради тебя! Просто совпало.",
      "Только никому не говори, что я тут так улыбаюсь.",
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
      "Когда ты так близко, я всё забываю…",
      "Щёки горят… Это из-за тебя, да?",
    ],
  },
  {
    name: "Флирт",
    unlockLine: "Поиграем? Только чур не влюбляться первым.",
    tapLines: [
      "Ещё один тап — и я тебя поцелую. Шучу… или нет?",
      "Жарко здесь… или это только рядом с тобой?",
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
      "Запри дверь… сегодня без уроков.",
    ],
  },
] as const;

/** The pose she is currently in — each pose has its own line bank. */
export type HeroinePose = "classic" | "shelf" | "carpet" | "bed";

/**
 * Pose-specific lines in three heat bands: band 0 for stages 1-4,
 * band 1 for stages 5-7, band 2 for stages 8-10.  They comment on what
 * she is actually doing in that pose.  Stocking lines appear only
 * where a stocking really slips: the carpet pose, and the shelf pose
 * where stretching on tiptoes pulls it down.
 */
export const POSE_TAP_LINES: Record<
  HeroinePose,
  readonly (readonly string[])[]
> = {
  classic: [
    [
      "Это МОЯ комната! Веди себя прилично!",
      "Форма помялась? Г-где?! Не смотри так пристально!",
      "Я не наряжалась! Это обычная форма. Обычная!",
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
      "Не подглядывай! Я просто тянусь за книгой!",
      "Ай… высоко. Н-не смотри снизу!",
      "Когда я так тянусь, чулок сползает… ОТВЕРНИСЬ!",
    ],
    [
      "Подержишь меня за талию? Чтобы не упала…",
      "Эта книга для нас двоих. Поймал?",
      "Тянусь-тянусь… а чулочек сполза-а-ет. Не смотри! Ну… чуть-чуть можно.",
    ],
    [
      "Юбка задралась? Упс… и пусть.",
      "Лови меня, если соскользну… только крепко.",
      "Пока я тянулась, чулок сполз совсем… поправишь его сам?",
    ],
  ],
  carpet: [
    [
      "Я читаю, между прочим!",
      "Чулок сполз… не смотри!",
      "Тут интересная глава, не отвлекай!",
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
      "Эй! Это моя кровать! Кто разрешил подходить?!",
      "Я просто отдыхаю! В-выйди… ну, или стой там.",
      "Это место не для одноклассников, вообще-то!",
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

/**
 * Romantic upgrade titles that warm up with the relationship: the same
 * mechanic reads shy early on and intimate near the end of the ladder.
 */
export const UPGRADE_ROMANTIC_NAMES: Record<
  UpgradeKind,
  readonly [string, string, string]
> = {
  tap: ["Робкие касания", "Нежные руки", "Ласковые пальчики"],
  income: ["Мысли о тебе", "Скучает по тебе", "Считает минуты до встречи"],
  charm: ["Комплименты", "Милые слова", "Горячий шёпот"],
} as const;

/** Romantic flavor description of each upgrade for the shop screen. */
export const UPGRADE_ROMANTIC_FLAVOR: Record<UpgradeKind, string> = {
  tap: "Каждое касание ей всё приятнее — больше монет за тап.",
  income: "Она думает о тебе, даже когда тебя нет — монеты сами капают.",
  charm: "От твоих слов её сердце бьётся чаще — больше сердечек за тап.",
} as const;

/** Stage-aware display name of an upgrade. */
export function upgradeRomanticName(kind: UpgradeKind, level: number): string {
  return UPGRADE_ROMANTIC_NAMES[kind][
    poseHeatBand(level) as 0 | 1 | 2
  ] as string;
}

/**
 * HER title on the dialogue nameplate — who she is to you right now.
 * Warms up with the ladder like everything else.
 */
export function heroineTitle(level: number): string {
  if (level <= 4) return "Одноклассница";
  if (level <= 7) return "Подруга";
  if (level <= 9) return "Почти твоя";
  return "Твоя девушка";
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
  const lines = poseBank.length > 0 && random() < 0.5 ? poseBank : stageBank;
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
    GAME_BALANCE.affection.thresholds.length === RELATIONSHIP_STAGES.length - 1
  );
}
