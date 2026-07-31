export type DashboardMetrics = {
  streak: number;
  activeWeekdays: boolean[];
  activeDaysThisWeek: number;
  weeklyTarget: number;
  weeklyPercent: number;
  activitiesThisMonth: number;
  completedToday: number;
};

const dayKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export function calculateDashboardMetrics(
  timestamps: string[],
  studyDaysPerWeek: number,
  now = new Date(),
): DashboardMetrics {
  const validDates = timestamps
    .map((timestamp) => new Date(timestamp))
    .filter((date) => !Number.isNaN(date.getTime()));
  const activeDates = new Set(validDates.map(dayKey));
  const today = startOfDay(now);
  const monday = new Date(today);
  const dayFromMonday = (today.getDay() + 6) % 7;
  monday.setDate(today.getDate() - dayFromMonday);

  const activeWeekdays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return activeDates.has(dayKey(date));
  });
  const activeDaysThisWeek = activeWeekdays.filter(Boolean).length;
  const weeklyTarget = Math.max(1, Math.min(7, studyDaysPerWeek));

  let cursor = new Date(today);
  if (!activeDates.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (activeDates.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const activitiesThisMonth = validDates.filter(
    (date) => date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth(),
  ).length;

  return {
    streak,
    activeWeekdays,
    activeDaysThisWeek,
    weeklyTarget,
    weeklyPercent: Math.min(100, Math.round((activeDaysThisWeek / weeklyTarget) * 100)),
    activitiesThisMonth,
    completedToday: validDates.filter((date) => dayKey(date) === dayKey(today)).length,
  };
}
