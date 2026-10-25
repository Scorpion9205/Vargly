export interface ScoredResult {
  readonly studentId: string;
  readonly marksObtained: number;
  readonly isAbsent: boolean;
}

export interface ClassStanding {
  /** 1 is the highest marks; students on the same marks share a rank */
  readonly rank: number;
  /** How many students sat the test (absentees are not ranked) */
  readonly outOf: number;
  /** The class average as a percentage of the total marks */
  readonly averagePercentage: number;
}

/**
 * Where each student stands among those who sat the test. Absentees get no standing, and the
 * average counts only the ones who sat it. A rank among fewer than three students is not worth
 * telling a parent, so nothing is returned for them.
 */
export function classStandings(
  results: readonly ScoredResult[],
  totalMarks: number,
  minimumClass = 3,
): Map<string, ClassStanding> {
  const present = results.filter((r) => !r.isAbsent);
  const standings = new Map<string, ClassStanding>();
  if (present.length < minimumClass || totalMarks <= 0) return standings;

  const marks = present.map((r) => Number(r.marksObtained));
  const average = marks.reduce((sum, m) => sum + m, 0) / marks.length;
  const averagePercentage = Math.round((average / totalMarks) * 1000) / 10;

  for (const result of present) {
    const rank = 1 + marks.filter((m) => m > Number(result.marksObtained)).length;
    standings.set(result.studentId, { rank, outOf: present.length, averagePercentage });
  }
  return standings;
}

/** What the parent reads after the marks, e.g. "Rank 3 of 25, class average 61%" */
export function standingText(standing: ClassStanding | undefined): string {
  if (!standing) return '';
  return `Rank ${standing.rank} of ${standing.outOf}, class average ${standing.averagePercentage}%`;
}
