export type DashboardMetrics = {
  streak: number;
  activeWeekdays: boolean[];
  activeDaysThisWeek: number;
  weeklyTarget: number;
  weeklyPercent: number;
  activitiesThisMonth: number;
  completedToday: number;
};

const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

const dayKey = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
};

const shiftDayKey = (key: string, days: number) => {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
};

const weekdayFromMonday = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
};

export function calculateDashboardMetrics(
  timestamps: string[],
  studyDaysPerWeek: number,
  now = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
): DashboardMetrics {
  const validDates = timestamps
    .map((timestamp) => new Date(timestamp))
    .filter((date) => !Number.isNaN(date.getTime()));
  const activeDates = new Set(validDates.map((date) => dayKey(date, timeZone)));
  const today = dayKey(now, timeZone);
  const monday = shiftDayKey(today, -weekdayFromMonday(today));

  const activeWeekdays = Array.from({ length: 7 }, (_, index) => {
    return activeDates.has(shiftDayKey(monday, index));
  });
  const activeDaysThisWeek = activeWeekdays.filter(Boolean).length;
  const weeklyTarget = Math.max(1, Math.min(7, studyDaysPerWeek));

  let cursor = today;
  if (!activeDates.has(cursor)) cursor = shiftDayKey(cursor, -1);
  let streak = 0;
  while (activeDates.has(cursor)) {
    streak += 1;
    cursor = shiftDayKey(cursor, -1);
  }

  const activitiesThisMonth = validDates.filter((date) =>
    dayKey(date, timeZone).startsWith(today.slice(0, 7)),
  ).length;

  return {
    streak,
    activeWeekdays,
    activeDaysThisWeek,
    weeklyTarget,
    weeklyPercent: Math.min(100, Math.round((activeDaysThisWeek / weeklyTarget) * 100)),
    activitiesThisMonth,
    completedToday: validDates.filter((date) => dayKey(date, timeZone) === today).length,
  };
}
