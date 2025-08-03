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
  