export function differenceInCalendarDays(laterIso: string, earlierIso: string): number {
  const later = new Date(laterIso);
  const earlier = new Date(earlierIso);
  if (Number.isNaN(later.getTime()) || Number.isNaN(earlier.getTime())) {
    throw new Error("Invalid ISO date supplied to refund evaluator");
  }
  const MS_PER_DAY = 86_400_000;
  const laterUtcDay = Date.UTC(later.getUTCFullYear(), later.getUTCMonth(), later.getUTCDate());
  const earlierUtcDay = Date.UTC(earlier.getUTCFullYear(), earlier.getUTCMonth(), earlier.getUTCDate());
  return Math.floor((laterUtcDay - earlierUtcDay) / MS_PER_DAY);
}
