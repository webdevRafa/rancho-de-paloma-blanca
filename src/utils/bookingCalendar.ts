// Calendar display only: this does not change selected dates or availability.
export function getBookingCalendarDate(today: string, seasonStart: string, seasonEnd: string) {
  const start = seasonStart.replace(/"/g, "");
  const end = seasonEnd.replace(/"/g, "");
  if (start && today < start) return start;
  if (end && today > end) return end;
  return today;
}
