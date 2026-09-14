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
  'amc10-0028': { front: 'What is gcd(a,b)?', back: 'The largest positive integer that divides both a and b.' },
  'amc10-0029': { front: 'What is lcm(a,b)?', back: 'The smallest positive integer divisible by both a and b.' },
  'amc10-0030': { front: 'How are gcd and lcm related by multiplication?', back: 'For positive integers, gcd(a,b)·lcm(a,b)=ab.' },
  'amc10-0031': { front: 'What is the Euclidean algorithm?', back: 'gcd(a,b)=gcd(b, a mod b), repeated until the remainder is 0.' },
  'amc10-0032': { front: 'If n=p₁^a₁…p_k^a_k, how many positive divisors does n have?', back: '(a₁+1)…(a_k+1).' },
  'amc10-0033': { front: 'If n=p₁^a₁…p_k^a_k, what is the sum of its positive divisors?', back: '∏(1+p_i+…+p_i^{a_i}).' },
  'amc10-0034': { front: 'What is the product of all positive divisors?', back: 'n^{d(n)/2}; for a perfect square the middle √n still pairs with itself.' },
  'amc10-0035': { front: 'What prime-factor condition makes an integer a perfect square?', back: 'Every prime exponent is even.' },
  'amc10-0036': { front: 'What prime-factor condition makes an integer a perfect cube?', back: 'Every prime exponent is a multiple of 3.' },
  'amc10-0037': { front: 'How do you find the smallest positive multiplier that turns n into a square?', back: 'Raise every odd exponent in its prime factorization by one.' },
  'amc10-0038': { front: 'What is the test for divisibility by 2?', back: 'The units digit is even.' },
  'amc10-0039': { front: 'What is the test for divisibility by 3?', back: 'The sum of the digits is divisible by 3.' },
  'amc10-0040': { front: 'What is the test for divisibility by 4?', back: 'The number formed by the last two digits is divisible by 4.' },
  'amc10-0041': { front: 'What is the test for divisibility by 5?', back: 'The units digit is 0 or 5.' },
  'amc10-0042': { front: 'What is the test for divisibility by 8?', back: 'The number formed by the last three digits is divisible by 8.' },
  'amc10-0043': { front: 'What is the test for divisibility by 9?', back: 'The sum of the digits is divisible by 9.' },
  'amc10-0044': { front: 'What is the test for divisibility by 10?', back: 'The units digit is 0.' },
  'amc10-0045': { front: 'What is the test for divisibility by 11?', back: 'The difference between the alternating sums of the digits is divisible by 11.' },
  'amc10-0046': { front: 'If a prime p divides ab, what follows?', back: 'p divides a or p divides b; this does not carry over directly to composite numbers.' },
  'amc10-0047': { front: 'What does it mean for two integers to be coprime?', back: 'Their gcd is 1; neither number has to be prime.' },
  'amc10-0048': { front: 'What is true of the gcd of consecutive integers?', back: 'Two consecutive integers are always coprime.' },
  'amc10-0049': { front: 'How do you find the exponent of a prime p in n!?', back: '⌊n/p⌋+⌊n/p²⌋+…' },
  'amc10-0050': { front: 'How do you count the trailing zeros of n!?', back: 'Count the exponent of 5, since factors of 2 are more plentiful.' },
  'amc10-0051': { front: 'Where is the sum of a factor pair smallest?', back: 'Near √n; with integers, check the neighbouring factor pairs directly.' },
  'amc10-0052': { front: 'What factor structure does the difference of squares a²-b² have?', back: '(a-b)(a+b), where the two factors share the same parity.' },
  'amc10-0053': { front: 'What does a≡b (mod m) mean?', back: 'm divides (a-b), that is, a and b leave the same remainder on division by m.' },
  'amc10-0054': { front: 'Which operations are allowed on congruences?', back: 'You may add, subtract, multiply and take integer powers modulo the same m.' },
  'amc10-0055': { front: 'Can you cancel freely inside a congruence?', back: 'No; it is only safe when the cancelled number is coprime to the modulus, or when you shrink the modulus correctly at the same time.' },
  'amc10-0056': { front: 'What is the usual method for the last digit of a large power?', back: 'Look at the cycle of the powers modulo 10.' },
  'amc10-0057': { front: 'Which modulus do you use for the last two digits?', back: 'Modulo 100.' },
};

/** 按当前语言本地化一张卡：en 走覆盖层，其它语言（或缺失条目）回退中文基底。 */
export function localizeFlashcard(card: Flashcard, locale: Locale): Flashcard {
  if (locale !== 'en') return card;
  const overlay = FLASHCARD_EN[card.id];
  return overlay ? { ...card, front: overlay.front, back: overlay.back } : card;
}
