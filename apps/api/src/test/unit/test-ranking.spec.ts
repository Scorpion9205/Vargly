import { describe, expect, it } from 'vitest';
import { classStandings, standingText } from '../../modules/tests/test-ranking.js';

const r = (studentId: string, marksObtained: number, isAbsent = false) => ({ studentId, marksObtained, isAbsent });

describe('classStandings', () => {
  it('ranks by marks, gives tied students the same rank, and averages those who sat the test', () => {
    const standings = classStandings([r('a', 90), r('b', 70), r('c', 70), r('d', 40), r('x', 0, true)], 100);
    expect(standings.get('a')).toEqual({ rank: 1, outOf: 4, averagePercentage: 67.5 });
    expect(standings.get('b')?.rank).toBe(2);
    expect(standings.get('c')?.rank).toBe(2);
    expect(standings.get('d')?.rank).toBe(4);
    expect(standings.has('x')).toBe(false);
  });

  it('says nothing for a class too small to rank', () => {
    expect(classStandings([r('a', 90), r('b', 70)], 100).size).toBe(0);
  });

  it('writes the standing for a parent', () => {
    expect(standingText({ rank: 3, outOf: 25, averagePercentage: 61 })).toBe('Rank 3 of 25, class average 61%');
    expect(standingText(undefined)).toBe('');
  });
});
