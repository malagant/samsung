/**
 * The SmartThings Developer Plan allows a fixed number of API calls per month
 * (100,000 at launch). This helper paces polling so the month's budget lasts,
 * leaving headroom for commands and webhook-triggered refreshes.
 */
export interface BudgetInput {
  monthlyBudget: number;
  usedThisMonth: number;
  now: Date;
  /** API calls one poll costs (e.g. 1 for /devices/{id}/status). */
  callsPerPoll: number;
  /** Share of the budget reserved for commands and ad-hoc reads. */
  reserveRatio?: number;
  /** Never poll faster than this. */
  minIntervalSeconds?: number;
}

export function secondsLeftInMonth(now: Date): number {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return Math.max(1, (next.getTime() - now.getTime()) / 1000);
}

/** Minimum seconds between polls so the remaining budget lasts until month end. */
export function pollIntervalSeconds(input: BudgetInput): number {
  const reserve = input.reserveRatio ?? 0.2;
  const minInterval = input.minIntervalSeconds ?? 60;
  const pollBudget = input.monthlyBudget * (1 - reserve) - input.usedThisMonth;
  if (pollBudget <= 0) return Number.POSITIVE_INFINITY;
  const polls = pollBudget / input.callsPerPoll;
  return Math.max(minInterval, Math.ceil(secondsLeftInMonth(input.now) / polls));
}
