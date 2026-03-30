/** @returns {{ weekday: number, enabled: boolean, open: string, close: string }[]} */
export function getDefaultBusinessSchedule() {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    enabled: weekday >= 1 && weekday <= 6,
    open: "10:00",
    close: "22:00",
  }));
}
