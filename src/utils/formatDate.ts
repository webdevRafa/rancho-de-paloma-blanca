// utils/formatDate.ts
export const toLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  

  export const formatLongDate = (
    iso: string,
    opts?: { weekday?: boolean }
  ): string => {
    // iso -> Date
    const [yyyy, mm, dd] = iso.split("-");
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  
    const day = d.getDate();
    const j = day % 10;
    const k = day % 100;
    const suffix =
      j === 1 && k !== 11 ? "st" :
      j === 2 && k !== 12 ? "nd" :
      j === 3 && k !== 13 ? "rd" : "th";
  
    const month = d.toLocaleString("en-US", { month: "long" });
    const base = `${month} ${day}${suffix}, ${d.getFullYear()}`;
  
    if (opts?.weekday) {
      const weekday = d.toLocaleString("en-US", { weekday: "long" });
      return `${weekday}, ${base}`;
    }
    return base;
  };