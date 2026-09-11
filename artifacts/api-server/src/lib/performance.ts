export const PERFORMANCE_LEVELS = [
  {
    id: "level-1",
    name: "Level 1",
    days: 10,
    hours: 20,
    dailyMinutes: 60,
    bonusPercent: 5,
  },
];

type Interval = { start: number; end: number };
export type PerformanceDay = { date: string; start: number; end: number };

// Count wall-clock streaming time once, even if sessions overlap or appear in both ledgers.
export function performanceSummary(
  days: PerformanceDay[],
  sessions: Interval[],
  today: string,
) {
  const merged: Interval[] = [];
  for (const session of sessions
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start)) {
    const previous = merged[merged.length - 1];
    if (previous && session.start <= previous.end)
      previous.end = Math.max(previous.end, session.end);
    else merged.push({ ...session });
  }
  const level = PERFORMANCE_LEVELS[0]!;
  const daily = days.map((day) => {
    const seconds = merged.reduce(
      (total, session) =>
        total +
        Math.max(
          0,
          Math.min(day.end, session.end) - Math.max(day.start, session.start),
        ) /
          1000,
      0,
    );
    const longestSeconds = sessions.reduce(
      (longest, session) =>
        Math.max(
          longest,
          Math.max(
            0,
            Math.min(day.end, session.end) - Math.max(day.start, session.start),
          ) / 1000,
        ),
      0,
    );
    return {
      longestSeconds: Math.floor(longestSeconds),
      date: day.date,
      seconds: Math.floor(seconds),
      qualified: longestSeconds >= level.dailyMinutes * 60,
    };
  });
  const seconds = daily.reduce((total, day) => total + day.seconds, 0);
  const qualifyingDays = daily.filter((day) => day.qualified).length;
  return {
    level,
    seconds,
    qualifyingDays,
    todayLongestSeconds:
      daily.find((day) => day.date === today)?.longestSeconds ?? 0,
    todaySeconds: daily.find((day) => day.date === today)?.seconds ?? 0,
    goalMet: qualifyingDays >= level.days && seconds >= level.hours * 3600,
    days: daily,
  };
}
