/**
 * finance.js
 * Loan Calculator + Percentage Calculator engine.
 * Zero dependencies. Works in browser (window.FinanceTools) or Node (module.exports).
 */

/**
 * Standard amortized loan payment formula:
 *   M = P * r(1+r)^n / ((1+r)^n - 1)
 * where P = principal, r = periodic interest rate, n = number of payments.
 * Falls back to simple division when r = 0 (interest-free loan) since the
 * formula above is undefined (0/0) at r = 0.
 */
function calculateLoan(input) {
  const { principal, annualRatePercent, termMonths } = input;

  if (!(principal > 0)) throw new Error('Loan amount must be greater than zero.');
  if (!(termMonths > 0) || !Number.isFinite(termMonths)) throw new Error('Loan term must be greater than zero.');
  if (annualRatePercent < 0) throw new Error('Interest rate cannot be negative.');
  if (!Number.isFinite(annualRatePercent)) throw new Error('Enter a valid interest rate.');

  const n = Math.round(termMonths);
  const r = annualRatePercent / 100 / 12; // monthly periodic rate

  let monthlyPayment;
  if (r === 0) {
    monthlyPayment = principal / n;
  } else {
    const factor = Math.pow(1 + r, n);
    monthlyPayment = (principal * r * factor) / (factor - 1);
  }

  const totalPayment = monthlyPayment * n;
  const totalInterest = totalPayment - principal;

  return {
    monthlyPayment: round2(monthlyPayment),
    totalPayment: round2(totalPayment),
    totalInterest: round2(totalInterest),
    numberOfPayments: n,
  };
}

/**
 * Full amortization schedule, aggregated by year (not by month — a 30-year
 * loan is 360 rows, which is not useful to render directly in a UI).
 * Each row uses the *rounded* monthly payment, which is what a real loan
 * statement does — this is why the very last year's numbers can differ by
 * a few cents from a pure-formula calculation, and that's correct, not a bug.
 */
function amortizationScheduleByYear(input) {
  const { principal, annualRatePercent, termMonths } = input;
  const { monthlyPayment, numberOfPayments } = calculateLoan(input);
  const r = annualRatePercent / 100 / 12;

  let balance = principal;
  const years = [];
  let yearPrincipal = 0;
  let yearInterest = 0;

  for (let month = 1; month <= numberOfPayments; month++) {
    const interestPortion = round2(balance * r);
    let principalPortion = round2(monthlyPayment - interestPortion);

    // Final payment: clear whatever balance remains exactly, to avoid a
    // trailing fraction-of-a-cent balance from accumulated rounding.
    if (month === numberOfPayments) {
      principalPortion = round2(balance);
    }

    balance = round2(balance - principalPortion);
    yearPrincipal = round2(yearPrincipal + principalPortion);
    yearInterest = round2(yearInterest + interestPortion);

    if (month % 12 === 0 || month === numberOfPayments) {
      years.push({
        year: Math.ceil(month / 12),
        principalPaid: yearPrincipal,
        interestPaid: yearInterest,
        remainingBalance: Math.max(0, balance),
      });
      yearPrincipal = 0;
      yearInterest = 0;
    }
  }
  return years;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------

/**
 * Mortgage calculator (PITI: Principal, Interest, Taxes, Insurance).
 * Reuses calculateLoan() for the principal & interest portion, then layers
 * on property tax, home insurance, HOA dues, and PMI (only charged when the
 * down payment is under 20% of the home price, matching standard US lending
 * practice — this is a real rule, not a cosmetic detail).
 */
function calculateMortgage(input) {
  const {
    homePrice, downPayment, annualRatePercent, termYears,
    propertyTaxAnnualPercent = 1.1, // US national average is roughly ~1.1% of home value/year
    homeInsuranceAnnual = 1500,     // reasonable placeholder; always user-editable
    hoaMonthly = 0,
    pmiAnnualPercent = 0.5,
  } = input;

  if (!(homePrice > 0)) throw new Error('Home price must be greater than zero.');
  if (!(downPayment >= 0)) throw new Error('Down payment cannot be negative.');
  if (downPayment >= homePrice) throw new Error('Down payment must be less than the home price.');

  const loanPrincipal = homePrice - downPayment;
  const loan = calculateLoan({ principal: loanPrincipal, annualRatePercent, termMonths: termYears * 12 });

  const downPaymentPercent = (downPayment / homePrice) * 100;
  const pmiMonthly = downPaymentPercent < 20
    ? round2((loanPrincipal * pmiAnnualPercent) / 100 / 12)
    : 0;

  const propertyTaxMonthly = round2((homePrice * propertyTaxAnnualPercent) / 100 / 12);
  const insuranceMonthly = round2(homeInsuranceAnnual / 12);

  const totalMonthly = round2(
    loan.monthlyPayment + propertyTaxMonthly + insuranceMonthly + hoaMonthly + pmiMonthly
  );

  return {
    loanPrincipal: round2(loanPrincipal),
    principalAndInterest: loan.monthlyPayment,
    propertyTaxMonthly,
    insuranceMonthly,
    hoaMonthly: round2(hoaMonthly),
    pmiMonthly,
    totalMonthly,
    downPaymentPercent: round2(downPaymentPercent),
    totalInterestOverLoan: loan.totalInterest,
  };
}

/**
 * Compound interest calculator, with optional regular contributions.
 *   Growth of the starting principal:      P * (1 + r/n)^(n*t)
 *   Growth of a stream of contributions (ordinary annuity, contribution
 *   at the end of each compounding period):
 *                                           PMT * (((1 + r/n)^(n*t) - 1) / (r/n))
 * Falls back to simple multiplication when r = 0, since r/n = 0 makes the
 * annuity formula's denominator zero (undefined), exactly like the loan
 * calculator's zero-interest case.
 */
function compoundInterest(input) {
  const {
    principal, annualRatePercent, years,
    compoundsPerYear = 12, monthlyContribution = 0,
  } = input;

  if (!(principal >= 0)) throw new Error('Starting amount cannot be negative.');
  if (!(years > 0)) throw new Error('Time period must be greater than zero.');
  if (annualRatePercent < 0) throw new Error('Interest rate cannot be negative.');
  if (!(compoundsPerYear > 0)) throw new Error('Compounding frequency must be greater than zero.');
  if (monthlyContribution < 0) throw new Error('Regular contribution cannot be negative.');

  const r = annualRatePercent / 100;
  const n = compoundsPerYear;
  const t = years;
  const ratePerPeriod = r / n;
  const totalPeriods = n * t;

  // Contribution is expressed per month in the UI (most intuitive), so convert
  // it to "per compounding period" if the compounding frequency isn't monthly.
  const contributionPerPeriod = monthlyContribution * (12 / n);

  const principalGrowth = principal * Math.pow(1 + ratePerPeriod, totalPeriods);

  let contributionGrowth;
  if (ratePerPeriod === 0) {
    contributionGrowth = contributionPerPeriod * totalPeriods;
  } else {
    contributionGrowth = contributionPerPeriod * ((Math.pow(1 + ratePerPeriod, totalPeriods) - 1) / ratePerPeriod);
  }

  const futureValue = round2(principalGrowth + contributionGrowth);
  const totalContributed = round2(principal + contributionPerPeriod * totalPeriods);
  const totalInterestEarned = round2(futureValue - totalContributed);

  return { futureValue, totalContributed, totalInterestEarned };
}

// ---------------------------------------------------------------------

/**
 * Federal income tax calculator — 2026 tax year.
 * Source: IRS Revenue Procedure 2025-32 (verified against three independently
 * published worked examples before use — see build notes).
 * Covers federal income tax only: no state tax, no FICA/payroll tax, no
 * credits, and assumes the standard deduction (not itemizing).
 */
const STANDARD_DEDUCTION_2026 = {
  single: 16100,
  marriedJointly: 32200,
  headOfHousehold: 24150,
  marriedSeparately: 16100,
};

const TAX_BRACKETS_2026 = {
  single: [
    { rate: 0.10, upTo: 12400 },
    { rate: 0.12, upTo: 50400 },
    { rate: 0.22, upTo: 105700 },
    { rate: 0.24, upTo: 201775 },
    { rate: 0.32, upTo: 256225 },
    { rate: 0.35, upTo: 640600 },
    { rate: 0.37, upTo: Infinity },
  ],
  marriedJointly: [
    { rate: 0.10, upTo: 24800 },
    { rate: 0.12, upTo: 100800 },
    { rate: 0.22, upTo: 211400 },
    { rate: 0.24, upTo: 403550 },
    { rate: 0.32, upTo: 512450 },
    { rate: 0.35, upTo: 768700 },
    { rate: 0.37, upTo: Infinity },
  ],
  headOfHousehold: [
    { rate: 0.10, upTo: 17700 },
    { rate: 0.12, upTo: 67450 },
    { rate: 0.22, upTo: 105700 },
    { rate: 0.24, upTo: 201775 },
    { rate: 0.32, upTo: 256200 },
    { rate: 0.35, upTo: 640600 },
    { rate: 0.37, upTo: Infinity },
  ],
  marriedSeparately: [
    { rate: 0.10, upTo: 12400 },
    { rate: 0.12, upTo: 50400 },
    { rate: 0.22, upTo: 105700 },
    { rate: 0.24, upTo: 201775 },
    { rate: 0.32, upTo: 256225 },
    { rate: 0.35, upTo: 384350 },
    { rate: 0.37, upTo: Infinity },
  ],
};

const FILING_STATUS_LABELS = {
  single: 'Single',
  marriedJointly: 'Married Filing Jointly',
  headOfHousehold: 'Head of Household',
  marriedSeparately: 'Married Filing Separately',
};

function calculateFederalIncomeTax(input) {
  const { grossIncome, filingStatus, additionalDeductions = 0 } = input;

  if (!(grossIncome >= 0)) throw new Error('Gross income cannot be negative.');
  if (!TAX_BRACKETS_2026[filingStatus]) {
    throw new Error(`Filing status must be one of: ${Object.keys(TAX_BRACKETS_2026).join(', ')}`);
  }
  if (additionalDeductions < 0) throw new Error('Additional deductions cannot be negative.');

  const standardDeduction = STANDARD_DEDUCTION_2026[filingStatus];
  const totalDeductions = standardDeduction + additionalDeductions;
  const taxableIncome = Math.max(0, grossIncome - totalDeductions);

  const brackets = TAX_BRACKETS_2026[filingStatus];
  let tax = 0;
  let lastCap = 0;
  let marginalRatePercent = brackets[0].rate * 100;
  const breakdown = [];

  for (const b of brackets) {
    if (taxableIncome > lastCap) {
      const amountInBracket = Math.min(taxableIncome, b.upTo) - lastCap;
      const taxInBracket = amountInBracket * b.rate;
      tax += taxInBracket;
      marginalRatePercent = b.rate * 100;
      breakdown.push({
        ratePercent: round2(b.rate * 100),
        amountTaxed: round2(amountInBracket),
        taxOwed: round2(taxInBracket),
      });
    }
    lastCap = b.upTo;
    if (taxableIncome <= b.upTo) break;
  }

  const effectiveRatePercent = grossIncome > 0 ? round2((tax / grossIncome) * 100) : 0;

  return {
    taxableIncome: round2(taxableIncome),
    totalTax: round2(tax),
    effectiveRatePercent,
    marginalRatePercent: round2(marginalRatePercent),
    standardDeduction,
    breakdown,
    filingStatusLabel: FILING_STATUS_LABELS[filingStatus],
  };
}

// ---------------------------------------------------------------------

/**
 * Canada federal income tax calculator (CRA) — 2026 tax year.
 * Source: CRA 2026 indexation (2.0% factor), confirmed against multiple
 * independently published sources — verified against the CRA's own stated
 * fact that income at or below the Basic Personal Amount owes zero federal tax.
 *
 * Structurally different from the US model: Canada's Basic Personal Amount
 * (BPA) is a non-refundable CREDIT applied at the lowest bracket rate (14%),
 * not a deduction subtracted from taxable income before brackets apply.
 * The BPA itself also phases out for high earners between two income
 * thresholds, which effectively creates a hidden higher marginal rate in
 * that income band — this emerges naturally from the credit calculation
 * below rather than being hard-coded as a separate rate.
 *
 * This covers FEDERAL tax only — provincial/territorial tax is separate,
 * stacks on top, and is not included here.
 */
const CRA_FEDERAL_BRACKETS_2026 = [
  { rate: 0.14, upTo: 58523 },
  { rate: 0.205, upTo: 117045 },
  { rate: 0.26, upTo: 181440 },
  { rate: 0.29, upTo: 258482 },
  { rate: 0.33, upTo: Infinity },
];

const CRA_BPA_2026 = {
  max: 16452,      // full BPA for net income at or below phaseOutStart
  min: 14829,      // minimum BPA for net income at or above phaseOutEnd
  phaseOutStart: 181440,
  phaseOutEnd: 258482,
  creditRate: 0.14, // BPA is credited at the lowest federal bracket rate
};

function calculateCRABasicPersonalAmount(netIncome) {
  const { max, min, phaseOutStart, phaseOutEnd } = CRA_BPA_2026;
  if (netIncome <= phaseOutStart) return max;
  if (netIncome >= phaseOutEnd) return min;
  const additional = max - min;
  const reduction = additional * (netIncome - phaseOutStart) / (phaseOutEnd - phaseOutStart);
  return max - reduction;
}

function calculateFederalIncomeTaxCRA(input) {
  const { grossIncome, additionalDeductions = 0 } = input;

  if (!(grossIncome >= 0)) throw new Error('Gross income cannot be negative.');
  if (additionalDeductions < 0) throw new Error('Additional deductions cannot be negative.');

  // Canada has no standard-deduction equivalent — RRSP contributions and
  // similar registered deductions reduce taxable income directly, which is
  // what "additional deductions" represents here.
  const taxableIncome = Math.max(0, grossIncome - additionalDeductions);

  const brackets = CRA_FEDERAL_BRACKETS_2026;
  let grossTax = 0;
  let lastCap = 0;
  let statedMarginalRatePercent = brackets[0].rate * 100;
  const breakdown = [];

  for (const b of brackets) {
    if (taxableIncome > lastCap) {
      const amountInBracket = Math.min(taxableIncome, b.upTo) - lastCap;
      const taxInBracket = amountInBracket * b.rate;
      grossTax += taxInBracket;
      statedMarginalRatePercent = b.rate * 100;
      breakdown.push({
        ratePercent: round2(b.rate * 100),
        amountTaxed: round2(amountInBracket),
        taxOwed: round2(taxInBracket),
      });
    }
    lastCap = b.upTo;
    if (taxableIncome <= b.upTo) break;
  }

  const bpaAmount = round2(calculateCRABasicPersonalAmount(taxableIncome));
  const bpaCredit = round2(bpaAmount * CRA_BPA_2026.creditRate);
  const netTax = Math.max(0, round2(grossTax - bpaCredit));

  const effectiveRatePercent = grossIncome > 0 ? round2((netTax / grossIncome) * 100) : 0;
  // Flag the BPA phase-out band, where the true marginal rate is higher than
  // the stated bracket rate because each extra dollar also shrinks the credit.
  const inBpaPhaseOutBand = taxableIncome > CRA_BPA_2026.phaseOutStart && taxableIncome < CRA_BPA_2026.phaseOutEnd;

  return {
    taxableIncome: round2(taxableIncome),
    grossTax: round2(grossTax),
    bpaAmount,
    bpaCredit,
    netTax,
    effectiveRatePercent,
    statedMarginalRatePercent: round2(statedMarginalRatePercent),
    inBpaPhaseOutBand,
    breakdown,
  };
}

// ---------------------------------------------------------------------

/**
 * Percentage Calculator — four standard modes.
 * All functions validate inputs and throw a clear Error rather than
 * returning NaN or Infinity.
 */
const PercentageTools = {
  /** "20% of 50" -> 10 */
  percentOf(percent, base) {
    assertFiniteNumbers({ percent, base });
    return round2((percent / 100) * base);
  },

  /** "15 is what % of 60" -> 25 */
  whatPercentOf(part, whole) {
    assertFiniteNumbers({ part, whole });
    if (whole === 0) throw new Error("The whole amount can't be zero (that's dividing by zero).");
    return round2((part / whole) * 100);
  },

  /** "Percent change from 50 to 75" -> +50 ; "from 100 to 60" -> -40 */
  percentChange(from, to) {
    assertFiniteNumbers({ from, to });
    if (from === 0) throw new Error("The starting value can't be zero (that's dividing by zero).");
    return round2(((to - from) / Math.abs(from)) * 100);
  },

  /** "Increase 200 by 15%" -> 230 ; "decrease 200 by 15%" -> 170 (pass a negative percent to decrease) */
  applyPercentChange(base, percent) {
    assertFiniteNumbers({ base, percent });
    return round2(base * (1 + percent / 100));
  },
};

function assertFiniteNumbers(fields) {
  for (const [name, value] of Object.entries(fields)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Enter a valid number for "${name}".`);
    }
  }
}

// ---------------------------------------------------------------------

const FinanceTools = { calculateLoan, amortizationScheduleByYear, calculateMortgage, compoundInterest, calculateFederalIncomeTax, TAX_BRACKETS_2026, STANDARD_DEDUCTION_2026, FILING_STATUS_LABELS, calculateFederalIncomeTaxCRA, CRA_FEDERAL_BRACKETS_2026, CRA_BPA_2026, PercentageTools, round2 };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FinanceTools;
} else if (typeof window !== 'undefined') {
  window.FinanceTools = FinanceTools;
}
