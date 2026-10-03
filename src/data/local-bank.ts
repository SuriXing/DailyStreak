/**
 * 本地题库：给用户放"自己有的题"（通常是真题）留的位置。
 *
 * 为什么走运行时拉取而不是 import：
 * 卡片数据是打进 bundle 的，一旦 import 进来，本地真题就会跟着 `expo export -p web`
 * 一起被部署出去。这里改成运行时请求 `/local-deck.json`：生成物放在 public/ 且被
 * .gitignore 排除，本地开发服务器能取到，公开站点上则是 404，于是那份内容既不在仓库里，
 * 也不在部署产物里。拉取失败按"没有本地题库"处理，不影响任何既有功能。
 */
import type { Flashcard } from './flashcards';

export interface LocalDeck {
  label: string;
  cards: Flashcard[];
}

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

/** 本地题库的 URL：部署在站点根目录下的静态文件；不存在时返回 null。 */
export const LOCAL_DECK_URL = '/local-deck.json';

export async function loadLocalDeck(): Promise<LocalDeck | null> {
  try {
    const res = await fetch(LOCAL_DECK_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const raw = (data as { cards?: unknown }).cards;
    const cards = (Array.isArray(raw) ? raw : []).filter(isCard).map((c) => ({
      ...c,
      source: 'local-exam' as const,
      verified: false,
    }));
    if (!cards.length) return null;
    const label = (data as { label?: unknown }).label;
    return { label: typeof label === 'string' && label ? label : '本地题库', cards };
  } catch {
    return null;
  }
}
