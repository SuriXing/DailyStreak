import type { Locale } from '@/i18n/types';
import type { Flashcard } from './flashcards';

/**
 * 闪卡英文覆盖层：中文是基底，这里按卡片 id 提供英文的 front/back；
 * 缺失的条目自动回退中文基底（与 i18n/content/{en,es} 同一思路）。
 */
export const FLASHCARD_EN: Record<string, { front: string; back: string }> = {
  'amc10-0001': { front: 'What is the order of operations?', back: 'Parentheses, then exponents and roots, then multiply and divide, then add and subtract; within one level work left to right.' },
  'amc10-0002': { front: 'What is the distributive law?', back: 'a(b+c)=ab+ac; read backwards it pulls out a common factor.' },
  'amc10-0003': { front: 'What is the difference of squares?', back: 'a²-b²=(a-b)(a+b).' },
  'amc10-0004': { front: 'What is the perfect square identity?', back: '(a±b)²=a²±2ab+b².' },
  'amc10-0005': { front: 'What does the absolute value |x| mean?', back: 'The distance from x to 0, so it is never negative.' },
  'amc10-0006': { front: 'What is the standard form of scientific notation?', back: 'a×10^n where 1≤|a|<10 and n is an integer.' },
  'amc10-0007': { front: 'How do you cross-multiply the proportion a/b=c/d?', back: 'When the denominators are nonzero you get ad=bc.' },
  'amc10-0008': { front: 'What are the direct and inverse variation models?', back: 'Direct: y=kx. Inverse: y=k/x, or xy=k.' },
  'amc10-0009': { front: 'Can two successive percentage changes be added directly?', back: 'Usually not; the overall factor is the product of the individual factors.' },
  'amc10-0010': { front: 'What are the multipliers for an r% increase and an r% decrease?', back: '1+r/100 and 1-r/100 respectively.' },
  'amc10-0011': { front: 'If a value rises r% and then falls r%, does it return to where it started?', back: 'No; the overall factor is 1-(r/100)².' },
  'amc10-0012': { front: 'What is the weighted average formula?', back: 'Weighted sum divided by the total weight.' },
  'amc10-0013': { front: 'How do you recover a total from an average?', back: 'Total = average × number of data points.' },
  'amc10-0014': { front: 'How do you combine the averages of two data sets?', back: '(n₁a₁+n₂a₂)/(n₁+n₂).' },
  'amc10-0015': { front: 'A round trip at speeds u and v: what is the average speed?', back: '2uv/(u+v), which is not the arithmetic mean.' },
  'amc10-0016': { front: 'What relates distance, speed and time?', back: 'd=rt; convert everything to consistent units before writing the equation.' },
  'amc10-0017': { front: 'What is the relative speed when two objects move toward each other?', back: 'The sum of the two speeds.' },
  'amc10-0018': { front: 'What is the relative speed in a same-direction chase?', back: 'The faster speed minus the slower speed.' },
  'amc10-0019': { front: 'What is the work-rate model?', back: 'Work = rate × time; when two workers work together their rates add.' },
  'amc10-0020': { front: 'What is conserved in a mixture problem?', back: 'The amount of solute; concentration = solute / total mixture.' },
  'amc10-0021': { front: 'If a figure is scaled by k, how do length, area and volume change?', back: 'They multiply by k, k² and k³ respectively.' },
  'amc10-0022': { front: 'What is a dimensional check good for?', back: 'Checking that quantities being added share units and that the answer carries a sensible unit.' },
  'amc10-0023': { front: 'What is the basic principle of bounding an estimate?', back: 'For positive quantities choose bounds in the direction of the operation, then check the direction of the error at the end.' },
  'amc10-0024': { front: 'What is the harmonic mean formula?', back: 'For positive x₁,…,x_n the harmonic mean is n/(Σ1/x_i).' },
  'amc10-0025': { front: 'What does a|b mean?', back: 'There is an integer k such that b=ak.' },
  'amc10-0026': { front: 'What is the definition of a prime number?', back: 'An integer greater than 1 whose only positive divisors are 1 and itself; 1 is not prime.' },
  'amc10-0027': { front: 'What does the fundamental theorem of arithmetic say?', back: 'Every integer greater than 1 factors uniquely into a product of prime powers, ignoring order.' },
};

/** 按当前语言本地化一张卡：en 走覆盖层，其它语言（或缺失条目）回退中文基底。 */
export function localizeFlashcard(card: Flashcard, locale: Locale): Flashcard {
  if (locale !== 'en') return card;
  const overlay = FLASHCARD_EN[card.id];
  return overlay ? { ...card, front: overlay.front, back: overlay.back } : card;
}
