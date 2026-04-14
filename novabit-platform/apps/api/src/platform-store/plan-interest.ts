import type {
  DashboardAccount,
  PaymentSubmission,
} from './platform-store.types';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const PLAN_INTEREST_LIBRARY = {
  starter: {
    ratePercent30Days: 20,
    cycleDays: 30,
  },
  growth: {
    ratePercent30Days: 30,
    cycleDays: 30,
  },
  premium: {
    ratePercent30Days: 45,
    cycleDays: 30,
  },
} as const;

type PlanInterestKey = keyof typeof PLAN_INTEREST_LIBRARY;

export type PlanInterestSubmission = Pick<
  PaymentSubmission,
  | 'id'
  | 'status'
  | 'planKey'
  | 'planName'
  | 'amount'
  | 'createdAt'
  | 'reviewedAt'
>;

export type PlanInterestMetrics = {
  totalProfit: number;
  activePlans: number;
};

export type PlanInterestCredit = {
  sourceKey: string;
  planKey: string;
  planName: string;
  amount: number;
  accruedDay: number;
  cycleDays: number;
  createdAt: string;
};

export type DashboardPlanInterestSync = {
  changed: boolean;
  totalProfit: number;
  accountBalance: number;
  activePlans: number;
  updatedAt: string;
  credits: PlanInterestCredit[];
};

export function calculatePlanInterestMetrics(
  submissions: readonly PlanInterestSubmission[],
  nowInput: Date = new Date(),
): PlanInterestMetrics {
  const projection = projectPlanInterest(submissions, nowInput);

  return {
    totalProfit: projection.totalProfit,
    activePlans: projection.activePlans,
  };
}

export function syncDashboardAccountPlanInterest(
  account: DashboardAccount,
  submissions: readonly PlanInterestSubmission[],
  nowInput: Date = new Date(),
): DashboardPlanInterestSync {
  const projection = projectPlanInterest(submissions, nowInput);
  const currentProfitCents = toCents(account.totalProfit);
  const expectedProfitCents = toCents(projection.totalProfit);
  const profitDeltaCents = Math.max(0, expectedProfitCents - currentProfitCents);
  const currentBalanceCents = toCents(account.accountBalance);
  const nextProfitCents = currentProfitCents + profitDeltaCents;
  const nextBalanceCents = currentBalanceCents + profitDeltaCents;
  const nextActivePlans = projection.activePlans;
  const changed =
    profitDeltaCents !== 0 || Number(account.activePlans) !== nextActivePlans;
  const projectedCredits = projection.credits
    .slice()
    .sort(
      (left, right) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    );
  let creditedProfitCents = currentProfitCents;
  const nextCredits: PlanInterestCredit[] = [];

  for (const credit of projectedCredits) {
    const creditCents = toCents(credit.amount);
    if (creditedProfitCents >= creditCents) {
      creditedProfitCents -= creditCents;
      continue;
    }

    nextCredits.push(credit);
  }

  return {
    changed,
    totalProfit: fromCents(nextProfitCents),
    accountBalance: fromCents(nextBalanceCents),
    activePlans: nextActivePlans,
    updatedAt: nowInput.toISOString(),
    credits: nextCredits,
  };
}

function projectPlanInterest(
  submissions: readonly PlanInterestSubmission[],
  nowInput: Date,
): PlanInterestMetrics & { credits: PlanInterestCredit[] } {
  const nowMs = nowInput.getTime();
  let totalProfitCents = 0;
  let activePlans = 0;
  const credits: PlanInterestCredit[] = [];

  for (const submission of submissions) {
    if (submission.status !== 'approved') {
      continue;
    }

    const plan = resolvePlanInterestPlan(submission.planKey, submission.planName);
    if (!plan) {
      continue;
    }

    const startedAtMs = Date.parse(submission.reviewedAt ?? submission.createdAt);
    if (!Number.isFinite(startedAtMs)) {
      continue;
    }

    const elapsedDays = Math.max(0, Math.floor((nowMs - startedAtMs) / DAY_IN_MS));
    const accruedDays = Math.min(elapsedDays, plan.cycleDays);

    if (elapsedDays < plan.cycleDays) {
      activePlans += 1;
    }

    if (accruedDays <= 0) {
      continue;
    }

    const principalCents = toCents(submission.amount);
    let previouslyAccruedCents = 0;

    for (let accruedDay = 1; accruedDay <= accruedDays; accruedDay += 1) {
      const cumulativeAccruedCents = Math.round(
        (principalCents * plan.ratePercent30Days * accruedDay) /
          (100 * plan.cycleDays),
      );
      const creditCents = Math.max(
        0,
        cumulativeAccruedCents - previouslyAccruedCents,
      );

      if (creditCents > 0) {
        credits.push({
          sourceKey: `interest-credit:${submission.id}:${accruedDay}`,
          planKey: submission.planKey,
          planName: submission.planName,
          amount: fromCents(creditCents),
          accruedDay,
          cycleDays: plan.cycleDays,
          createdAt: new Date(
            startedAtMs + DAY_IN_MS * accruedDay,
          ).toISOString(),
        });
      }

      previouslyAccruedCents = cumulativeAccruedCents;
    }

    totalProfitCents += previouslyAccruedCents;
  }

  return {
    totalProfit: fromCents(totalProfitCents),
    activePlans,
    credits,
  };
}

function resolvePlanInterestPlan(
  planKey: string,
  planName: string,
): (typeof PLAN_INTEREST_LIBRARY)[PlanInterestKey] | null {
  const normalizedPlanKey = normalizePlanInterestKey(planKey);
  if (normalizedPlanKey) {
    return PLAN_INTEREST_LIBRARY[normalizedPlanKey];
  }

  const normalizedPlanName = planName.trim().toLowerCase();

  if (normalizedPlanName.includes('starter')) {
    return PLAN_INTEREST_LIBRARY.starter;
  }

  if (normalizedPlanName.includes('growth')) {
    return PLAN_INTEREST_LIBRARY.growth;
  }

  if (normalizedPlanName.includes('premium')) {
    return PLAN_INTEREST_LIBRARY.premium;
  }

  return null;
}

function normalizePlanInterestKey(value: string): PlanInterestKey | null {
  const normalized = value.trim().toLowerCase();

  if (
    normalized === 'starter' ||
    normalized === 'growth' ||
    normalized === 'premium'
  ) {
    return normalized;
  }

  return null;
}

function toCents(value: number) {
  return Math.round((Number(value) || 0) * 100);
}

function fromCents(value: number) {
  return value / 100;
}
