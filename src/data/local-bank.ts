/**
 * 本地题库：给用户放"自己有的题"（通常是真题）留的位置。
 *
 * 为什么走运行时拉取而不是 import：
 * 卡片数据是打进 bundle 的，一旦 import 进来，本地真题就会跟着 `expo export -p web`
 * 一起被部署出去。这里改成运行时请求 `/local-deck.json`：生成物放在 public/ 且被
 * .gitignore 排除，本地开发服务器能取到，公开站点上则是 404，于是那份内容既不在仓库里，
 * 也不在部署产物里。拉取失败按"没有本地题库"处理，不影响任何既有功能。
 *
 * 难度是**可选**的：content/local/*.md 的行尾标了 `[难度 N]` 时，生成器会把 difficulty 写进 JSON，
 * 这里原样带进卡片对象，练习页的难度标签、难度筛选与难度排序就都认得它；没标的卡连字段都没有，
 * 于是照旧"没有分级"，既不会变成 0 档、也不会被某一档的筛选命中（见 normalizeDifficulty）。
 */
import type { Flashcard } from './flashcards';

export interface LocalDeck {
  label: string;
  cards: Flashcard[];
}

/** 本地题的难度只认 1-4：与内置题库的 rubric 同一口径（content/subject-banks/difficulty.json）。 */
const DIFFICULTY_MIN = 1;
const DIFFICULTY_MAX = 4;

const isCard = (c: unknown): c is Flashcard => {
  const card = c as Partial<Flashcard> | null;
  return (
    !!card &&
    typeof card.id === 'string' &&
    typeof card.deck === 'string' &&
    typeof card.front === 'string' &&
    typeof card.back === 'string'
  );
};

/**
 * 难度归一化：只有 1-4 的整数才算一档，别的（缺字段、0、负数、小数、字符串、超范围的数）一律 undefined。
 *
 * 判据只有一个：**界面上能不能被筛到**。卡片上的难度标签读的是 `difficulty > 0`，
 * 而难度筛选行只列 availableDifficulties() 认出来的正整数——要是把 5、2.5 或 "3" 原样带进去，
 * 卡片会显示一个筛选行里根本没有的档位，学生按那个档去筛反而找不到它。
 * 所以认不出来的值当"没有难度"处理：卡片照旧能练，只是不参与难度筛选与难度排序。
 * 生成器（scripts/build-local-bank.mjs）写 JSON 时已经用同样的 1-4 口径挡了一遍，
 * 这里再挡一次是因为 local-deck.json 是本地文件、可能被人手改。
 */
function normalizeDifficulty(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined;
  return value >= DIFFICULTY_MIN && value <= DIFFICULTY_MAX ? value : undefined;
}

/**
 * 把 /local-deck.json 的内容解析成卡池；没有任何能用的卡时返回 null（等同"没有本地题库"）。
 *
 * 抽成纯函数是为了能在单测里直接喂 JSON：scripts/test-session-logic.mjs 的往返测试把生成器
 * 写出来的文件原样交给它，再拿结果去跑 availableDifficulties / filterCards——那条链路
 * （markdown → JSON → 卡池 → 筛选）以前只能靠起 dev server 手动看。
 */
export function parseLocalDeck(data: unknown): LocalDeck | null {
  const raw = (data as { cards?: unknown } | null)?.cards;
  const cards: Flashcard[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    if (!isCard(entry)) continue;
    // source / verified 由这里决定，不接受 JSON 里的值：本地题一律"本地题库 + 未核验"。
    const card: Flashcard = { ...entry, source: 'local-exam', verified: false };
    const difficulty = normalizeDifficulty(entry.difficulty);
    // 认不出来就**删掉字段**而不是留 undefined：缺字段才是"没有分级"的诚实写法（0 是内置打包格式的占位）。
    if (difficulty === undefined) delete card.difficulty;
    else card.difficulty = difficulty;
    cards.push(card);
  }
  if (!cards.length) return null;
  const label = (data as { label?: unknown } | null)?.label;
  return { label: typeof label === 'string' && label ? label : '本地题库', cards };
}

/** 本地题库的 URL：站点根目录下的静态文件；不存在时返回 null。 */
export const LOCAL_DECK_URL = '/local-deck.json';

/**
 * 本地题库默认关闭：只有显式打开时才去请求。
 * 原因是"文件不存在"本身会在浏览器控制台留下一条 404，而冒烟测试断言零控制台错误——
 * 让每次加载都去试一个多半不存在的文件，等于给所有环境加了一条噪声。开关写在 .env.local
 * （已被 .gitignore 排除），本机打开、部署环境不打开，正好符合"只在本地练"的意图。
 */
export const LOCAL_DECK_ENABLED = process.env.EXPO_PUBLIC_LOCAL_DECK === '1';

export async function loadLocalDeck(): Promise<LocalDeck | null> {
  if (!LOCAL_DECK_ENABLED) return null;
  try {
    const res = await fetch(LOCAL_DECK_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    return parseLocalDeck(await res.json());
  } catch {
    return null;
  }
}
