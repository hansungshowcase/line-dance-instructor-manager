function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function datesForWeekdays(
  monthKey: string,
  weekdays: readonly number[],
): readonly string[] {
  const [year, month] = monthKey.split('-').map(Number)
  if (!year || !month || !weekdays.length) return []
  const allowed = new Set(weekdays)
  const dates: string[] = []
  const cursor = new Date(year, month - 1, 1)
  while (cursor.getMonth() === month - 1) {
    if (allowed.has(cursor.getDay())) dates.push(toDateKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number)
  const shifted = new Date(year, month - 1 + delta, 1)
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`
}
