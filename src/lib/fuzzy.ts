/**
 * Minimal fuzzy scorer for the quick switcher. Returns a score in [0, 1]
 * where 1 is a perfect match. Case-insensitive, rewards consecutive and
 * prefix matches. Returns 0 when the query chars don't appear in order.
 */
export function fuzzyScore(query: string, target: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return 0.9 + 0.1 * (q.length / t.length);

  let qi = 0;
  let score = 0;
  let consecutive = 0;
  let prevMatchIdx = -2;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 1;
      if (ti === prevMatchIdx + 1) {
        consecutive++;
        score += consecutive * 0.5;
      } else {
        consecutive = 0;
      }
      if (ti === 0 || t[ti - 1] === "/" || t[ti - 1] === " ") {
        score += 2;
      }
      prevMatchIdx = ti;
      qi++;
    }
  }

  if (qi < q.length) return 0;
  return Math.min(score / (q.length * 3), 1);
}

export interface FuzzyResult<T> {
  item: T;
  score: number;
}

export function fuzzyFilter<T>(
  items: T[],
  query: string,
  getText: (item: T) => string,
  limit = 50,
): FuzzyResult<T>[] {
  if (!query.trim()) return items.slice(0, limit).map((item) => ({ item, score: 1 }));
  const scored: FuzzyResult<T>[] = [];
  for (const item of items) {
    const score = fuzzyScore(query, getText(item));
    if (score > 0) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
