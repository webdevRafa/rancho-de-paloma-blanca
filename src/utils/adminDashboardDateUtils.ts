// src/utils/adminDashboardDateUtils.ts
import type { SeasonConfig } from "../types/Types";

export type AdminRangeKey = "season" | "week" | "month" | "custom";

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

export const toLocalIsoDate = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const parseLocalIsoDate = (iso?: string | null): Date | null => {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
};

export const startOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const endOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

export const startOfMonth = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);

export const endOfMonth = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

export const addDays = (date: Date, days: number): Date => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

export const maxDate = (a: Date, b: Date): Date =>
  a.getTime() > b.getTime() ? a : b;

export const minDate = (a: Date, b: Date): Date =>
  a.getTime() < b.getTime() ? a : b;

export const getAdminDateRange = (startIso: string, endIso: string): string[] => {
  const start = parseLocalIsoDate(startIso);
  const end = parseLocalIsoDate(endIso);

  if (!start || !end || start > end) return [];

  const result: string[] = [];
  let current = startOfDay(start);
  const last = startOfDay(end);

  while (current <= last) {
    result.push(toLocalIsoDate(current));
    current = addDays(current, 1);
  }

  return result;
};

export const getAdminDashboardRange = (
  key: AdminRangeKey,
  seasonConfig: SeasonConfig | null,
  customFrom?: string,
  customTo?: string
) => {
  const now = new Date();

  const seasonStart =
    parseLocalIsoDate(seasonConfig?.seasonStart) ?? startOfDay(now);

  const seasonEnd =
    endOfDay(parseLocalIsoDate(seasonConfig?.seasonEnd) ?? now);

  let from = seasonStart;
  let to = seasonEnd;

  if (key === "week") {
    // Week ahead: today + next 6 days
    const weekFrom = startOfDay(now);
    const weekTo = endOfDay(addDays(now, 6));

    from = maxDate(weekFrom, seasonStart);
    to = minDate(weekTo, seasonEnd);

    if (from > to) {
      from = seasonStart;
      to = seasonEnd;
    }
  } else if (key === "month") {
    const monthFrom = startOfMonth(now);
    const monthTo = endOfMonth(now);

    from = maxDate(monthFrom, seasonStart);
    to = minDate(monthTo, seasonEnd);

    if (from > to) {
      from = seasonStart;
      to = seasonEnd;
    }
  } else if (key === "custom") {
    const parsedFrom = parseLocalIsoDate(customFrom) ?? seasonStart;
    const parsedTo =
      endOfDay(parseLocalIsoDate(customTo) ?? parseLocalIsoDate(customFrom) ?? seasonEnd);

    from = maxDate(parsedFrom, seasonStart);
    to = minDate(parsedTo, seasonEnd);

    if (from > to) {
      from = seasonStart;
      to = seasonEnd;
    }
  }

  return {
    from,
    to,
    fromIso: toLocalIsoDate(from),
    toIso: toLocalIsoDate(to),
  };
};