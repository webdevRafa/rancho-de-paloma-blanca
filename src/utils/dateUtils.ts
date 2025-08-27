// src/utils/dateUtils.ts
export const getDateRange = (start: string, end: string): string[] => {
    const result: string[] = [];
    let current = new Date(start);
    const last = new Date(end);
  
    while (current <= last) {
      const iso = current.toISOString().slice(0, 10);
      result.push(iso);
      current.setDate(current.getDate() + 1);
    }
  
    return result;
  };
  

  // Group an array of ISO dates into consecutive ranges: [{start, end}, ...]
export const groupIsoDatesIntoRanges = (
  dates: string[]
): Array<{ start: string; end: string }> => {
  if (!Array.isArray(dates) || dates.length === 0) return [];
  const sorted = [...dates].sort(); // ISO yyyy-mm-dd sorts correctly
  const out: Array<{ start: string; end: string }> = [];
  for (let i = 0; i < sorted.length; i++) {
    let start = sorted[i];
    let end = start;
    while (i + 1 < sorted.length) {
      const a = new Date(`${sorted[i]}T00:00:00`);
      const b = new Date(`${sorted[i + 1]}T00:00:00`);
      const isNextDay = (b.getTime() - a.getTime()) / 86400000 === 1;
      if (!isNextDay) break;
      end = sorted[++i];
    }
    out.push({ start, end });
  }
  return out;
};
