/**
 * 解开 src/data/deck-pack.ts 里的卡片数据：base64 → gunzip → JSON。
 *
 * 这一层只为两件事存在：bundle 里不再是可直接 grep 的明文卡片，以及体积更小
 * （325 KB 明文 → 约 98 KB base64）。它**不是加密**：app 能解开，别人也能解开，
 * 真正的保护只能靠"内容不发给未登录的人"。
 *
 * 解压用 fflate 的 gunzipSync（纯 JS，RN 与 web 都能跑）；base64 与 UTF-8 解码自己实现，
 * 以免依赖 atob / TextDecoder 在不同运行时的可用性。
 */
import { gunzipSync } from 'fflate';

import { DECK_PACK_AMC10_CARDS, DECK_PACK_BASE64, DECK_PACK_SUBJECT_CARDS } from './deck-pack';

export type FlashcardLevel = 'core' | 'advance' | 'boundary';
export type AMC10Deck = 'arithmetic' | 'algebra' | 'geometry' | 'counting' | 'strategy';
export type SubjectDeckKey = 'csa' | 'csp' | 'precalc' | 'calcbc' | 'stats';
export type CardSource = 'amc10-concept' | 'ai-mcq';

export interface AMC10Flashcard {
  id: string;
  level: FlashcardLevel;
  deck: AMC10Deck;
  category: string;
  front: string;
  back: string;
  source: CardSource;
  verified: boolean;
}

export interface SubjectFlashcard {
  id: string;
  deck: SubjectDeckKey;
  category: string;
  front: string;
  back: string;
  source: CardSource;
  verified: boolean;
}

/** 打包时每张卡压成的一个数组：[id, level, deck, category, front, back, source, verified] */
type PackedCard = [string, string, string, string, string, string, string, number];

interface PackedPayload {
  amc10Decks: [string, string][];
  subjectDecks: [string, string][];
  amc10Cards: PackedCard[];
  subjectCards: PackedCard[];
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToBytes(input: string): Uint8Array {
  const out = new Uint8Array(((input.length * 3) >> 2) + 3);
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < input.length; i += 1) {
    const v = B64.indexOf(input[i]);
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o] = (acc >> bits) & 0xff;
      o += 1;
    }
  }
  return out.subarray(0, o);
}

function utf8ToString(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    let cp: number;
    if (b < 0x80) {
      cp = b;
      i += 1;
    } else if (b < 0xe0) {
      cp = ((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
      i += 2;
    } else if (b < 0xf0) {
      cp = ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
      i += 3;
    } else {
      cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
      i += 4;
    }
    if (cp > 0xffff) {
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else {
      out += String.fromCharCode(cp);
    }
  }
  return out;
}

const payload = JSON.parse(utf8ToString(gunzipSync(base64ToBytes(DECK_PACK_BASE64)))) as PackedPayload;

if (payload.amc10Cards.length !== DECK_PACK_AMC10_CARDS || payload.subjectCards.length !== DECK_PACK_SUBJECT_CARDS) {
  throw new Error('deck pack 与声明的张数不一致，请重新运行 node scripts/pack-decks.mjs');
}

const unpack = (c: PackedCard) => ({
  id: c[0],
  level: c[1],
  deck: c[2],
  category: c[3],
  front: c[4],
  back: c[5],
  source: c[6] as CardSource,
  verified: c[7] === 1,
});

export const AMC10_DECKS: { key: AMC10Deck; label: string }[] = payload.amc10Decks.map(([key, label]) => ({
  key: key as AMC10Deck,
  label,
}));

export const SUBJECT_DECKS: { key: SubjectDeckKey; label: string }[] = payload.subjectDecks.map(([key, label]) => ({
  key: key as SubjectDeckKey,
  label,
}));

export const AMC10_FLASHCARDS: AMC10Flashcard[] = payload.amc10Cards.map((c) => {
  const card = unpack(c);
  return {
    id: card.id,
    level: card.level as FlashcardLevel,
    deck: card.deck as AMC10Deck,
    category: card.category,
    front: card.front,
    back: card.back,
    source: card.source,
    verified: card.verified,
  };
});

export const SUBJECT_FLASHCARDS: SubjectFlashcard[] = payload.subjectCards.map((c) => {
  const card = unpack(c);
  return {
    id: card.id,
    deck: card.deck as SubjectDeckKey,
    category: card.category,
    front: card.front,
    back: card.back,
    source: card.source,
    verified: card.verified,
  };
});
