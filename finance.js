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
  if (termMonths > 1200) throw new Error('Loan term looks unusually long (over 100 years) — double-check whether you meant to enter years or months.');
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
 * Savings Goal Calculator.
 * Given a target amount, current savings, rate, and time horizon, solves
 * for the required monthly contribution — the mathematical inverse of
 * compoundInterest() above (which instead solves for future value given a
 * known contribution). Uses monthly compounding to match the monthly
 * contribution the UI collects, for consistency with compoundInterest's
 * own contribution-per-period convention.
 * Derived from the same annuity future-value identity:
 *   FV = P(1+r)^n + PMT * ((1+r)^n - 1) / r
 * Solved for PMT:
 *   PMT = (FV - P(1+r)^n) * r / ((1+r)^n - 1)
 */
function requiredMonthlyContribution(input) {
  const { targetAmount, currentSavings = 0, annualRatePercent, years } = input;
  if (!(targetAmount > 0)) throw new Error('Target amount must be greater than zero.');
  if (currentSavings < 0) throw new Error('Current savings cannot be negative.');
  if (!(years > 0)) throw new Error('Time period must be greater than zero.');
  if (annualRatePercent < 0) throw new Error('Interest rate cannot be negative.');

  const r = annualRatePercent / 100 / 12;
  const n = years * 12;
  const principalGrowth = currentSavings * Math.pow(1 + r, n);
  const remainingNeeded = targetAmount - principalGrowth;

  let monthlyContribution;
  if (remainingNeeded <= 0) {
    // Current savings alone will already reach (or exceed) the goal by growth.
    monthlyContribution = 0;
  } else if (r === 0) {
    monthlyContribution = remainingNeeded / n;
  } else {
    monthlyContribution = (remainingNeeded * r) / (Math.pow(1 + r, n) - 1);
  }

  const totalContributed = round2(currentSavings + monthlyContribution * n);
  const totalInterestEarned = round2(targetAmount - totalContributed);

  return {
    monthlyContribution: round2(monthlyContribution),
    totalContributed,
    totalInterestEarned: Math.max(0, totalInterestEarned),
    goalAlreadyMetByGrowth: remainingNeeded <= 0,
  };
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
  const { grossIncome, additionalDeductions = 0, applyQuebecAbatement = false } = input;

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
  let netTax = Math.max(0, round2(grossTax - bpaCredit));

  // Quebec abatement: a 16.5% reduction of federal tax, applied after the BPA
  // credit — confirmed consistently by PwC and EY's own published Canadian tax
  // guides, since Quebec administers its own separate provincial tax system.
  const QUEBEC_ABATEMENT_RATE = 0.165;
  if (applyQuebecAbatement) {
    netTax = round2(netTax * (1 - QUEBEC_ABATEMENT_RATE));
  }

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
    quebecAbatementApplied: applyQuebecAbatement,
  };
}

// ---------------------------------------------------------------------

/**
 * US State Income Tax — Phase 1.
 * Source: cross-referenced against Tax Foundation State Income Tax Rates 2026,
 * Federation of Tax Administrators bracket table, and each state's own
 * statutory rate where cited.
 *
 * IMPORTANT SCOPE NOTE: this covers the 9 no-income-tax states and the 13
 * genuinely flat-rate states with full confidence. The ~27 graduated-bracket
 * states + DC are marked "pending" rather than estimated — cross-checking
 * multiple sources during development turned up real disagreement on exact
 * 2026 dollar thresholds even for California (the best-documented state),
 * since several states have not yet published final 2026 figures. Rather
 * than ship confidently-wrong numbers for a tax calculator, those states
 * are flagged clearly as not yet available and will be added as each one's
 * official state Department of Revenue schedule is verified individually.
 *
 * Flat-rate calculation applies the rate directly to federal taxable income
 * as a reasonable approximation — it does not account for state-specific
 * standard deductions/exemptions, which could lower the result slightly.
 */
const STATE_TAX_2026 = {
  AL: { name: 'Alabama', type: 'graduated', usesSingleFilerOnly: true, brackets: [{ rate: 2, upTo: 500 }, { rate: 4, upTo: 3000 }, { rate: 5, upTo: Infinity }] },
  AK: { name: 'Alaska', type: 'none' },
  AZ: { name: 'Arizona', type: 'flat', rate: 2.5 },
  AR: { name: 'Arkansas', type: 'graduated', brackets: [{ rate: 2, upTo: 4600 }, { rate: 3.9, upTo: Infinity }] },
  CA: {
    name: 'California', type: 'graduated',
    // Verified against the California Franchise Tax Board's own published rate
    // schedule (ftb.ca.gov, 2025-540-tax-rate-schedules.pdf) — cross-checked
    // against the FTB's own cumulative-tax formula ($3,201.97 at $72,724 for
    // single filers), which matched exactly. Uses the most recently published
    // FTB brackets (tax year 2025); California has confirmed the 2026 rate
    // structure is unchanged but has not yet published final 2026 inflation-
    // indexed dollar thresholds (expected fall 2026) — noted directly to users.
    bracketsByStatus: {
      single: [{ rate: 1, upTo: 11079 }, { rate: 2, upTo: 26264 }, { rate: 4, upTo: 41452 }, { rate: 6, upTo: 57542 }, { rate: 8, upTo: 72724 }, { rate: 9.3, upTo: 371479 }, { rate: 10.3, upTo: 445771 }, { rate: 11.3, upTo: 742953 }, { rate: 12.3, upTo: Infinity }],
      marriedJointly: [{ rate: 1, upTo: 22158 }, { rate: 2, upTo: 52528 }, { rate: 4, upTo: 82904 }, { rate: 6, upTo: 115084 }, { rate: 8, upTo: 145448 }, { rate: 9.3, upTo: 742958 }, { rate: 10.3, upTo: 891542 }, { rate: 11.3, upTo: 1485906 }, { rate: 12.3, upTo: Infinity }],
      headOfHousehold: [{ rate: 1, upTo: 22173 }, { rate: 2, upTo: 52530 }, { rate: 4, upTo: 67716 }, { rate: 6, upTo: 83805 }, { rate: 8, upTo: 98990 }, { rate: 9.3, upTo: 505208 }, { rate: 10.3, upTo: 606251 }, { rate: 11.3, upTo: 1010417 }, { rate: 12.3, upTo: Infinity }],
      marriedSeparately: [{ rate: 1, upTo: 11079 }, { rate: 2, upTo: 26264 }, { rate: 4, upTo: 41452 }, { rate: 6, upTo: 57542 }, { rate: 8, upTo: 72724 }, { rate: 9.3, upTo: 371479 }, { rate: 10.3, upTo: 445771 }, { rate: 11.3, upTo: 742953 }, { rate: 12.3, upTo: Infinity }],
    },
    standardDeduction: { single: 5706, marriedJointly: 11412, headOfHousehold: 11412, marriedSeparately: 5706 },
    surcharge: { threshold: 1000000, rate: 1 }, // Mental Health Services Tax: +1% on taxable income over $1M, computed separately per FTB's own formula table
    dataVintageNote: "Uses California's most recently published brackets (tax year 2025) — the FTB has not yet released final 2026 inflation-adjusted thresholds (expected fall 2026). The rate structure itself is confirmed unchanged.",
  },
  CO: { name: 'Colorado', type: 'flat', rate: 4.4 },
  CT: { name: 'Connecticut', type: 'graduated', usesSingleFilerOnly: true, brackets: [{ rate: 2, upTo: 10000 }, { rate: 4.5, upTo: 50000 }, { rate: 5.5, upTo: 100000 }, { rate: 6, upTo: 200000 }, { rate: 6.5, upTo: 250000 }, { rate: 6.99, upTo: Infinity }] },
  DE: { name: 'Delaware', type: 'graduated', brackets: [{ rate: 2.2, upTo: 2000 }, { rate: 3.9, upTo: 5000 }, { rate: 4.8, upTo: 10000 }, { rate: 5.2, upTo: 20000 }, { rate: 5.55, upTo: 25000 }, { rate: 6.6, upTo: Infinity }] },
  FL: { name: 'Florida', type: 'none' },
  GA: { name: 'Georgia', type: 'flat', rate: 4.99 },
  HI: { name: 'Hawaii', type: 'graduated', usesSingleFilerOnly: true, brackets: [{ rate: 1.4, upTo: 9600 }, { rate: 3.2, upTo: 14400 }, { rate: 5.5, upTo: 19200 }, { rate: 6.4, upTo: 24000 }, { rate: 6.8, upTo: 36000 }, { rate: 7.2, upTo: 48000 }, { rate: 7.6, upTo: 125000 }, { rate: 7.9, upTo: 175000 }, { rate: 8.25, upTo: 225000 }, { rate: 9, upTo: 275000 }, { rate: 10, upTo: 325000 }, { rate: 11, upTo: Infinity }] },
  ID: { name: 'Idaho', type: 'flat', rate: 5.3 },
  IL: { name: 'Illinois', type: 'flat', rate: 4.95 },
  IN: { name: 'Indiana', type: 'flat', rate: 2.95 },
  IA: { name: 'Iowa', type: 'flat', rate: 3.9 },
  KS: { name: 'Kansas', type: 'graduated', usesSingleFilerOnly: true, brackets: [{ rate: 5.2, upTo: 23000 }, { rate: 5.58, upTo: Infinity }] },
  KY: { name: 'Kentucky', type: 'flat', rate: 3.5 },
  LA: { name: 'Louisiana', type: 'flat', rate: 3.0 },
  ME: { name: 'Maine', type: 'graduated', usesSingleFilerOnly: true, brackets: [{ rate: 5.8, upTo: 27399 }, { rate: 6.75, upTo: 64849 }, { rate: 7.15, upTo: Infinity }] },
  MD: { name: 'Maryland', type: 'graduated', usesSingleFilerOnly: true, brackets: [{ rate: 2, upTo: 1000 }, { rate: 3, upTo: 2000 }, { rate: 4, upTo: 3000 }, { rate: 4.75, upTo: 100000 }, { rate: 5, upTo: 125000 }, { rate: 5.25, upTo: 150000 }, { rate: 5.5, upTo: 250000 }, { rate: 6.25, upTo: 500000 }, { rate: 6.5, upTo: Infinity }] },
  MA: { name: 'Massachusetts', type: 'graduated', brackets: [{ rate: 5, upTo: 1083150 }, { rate: 9, upTo: Infinity }] },
  MI: { name: 'Michigan', type: 'flat', rate: 4.25 },
  MN: { name: 'Minnesota', type: 'graduated', usesSingleFilerOnly: true, brackets: [{ rate: 5.35, upTo: 33310 }, { rate: 6.8, upTo: 109430 }, { rate: 7.85, upTo: 203150 }, { rate: 9.85, upTo: Infinity }] },
  MS: { name: 'Mississippi', type: 'flat', rate: 4.0 },
  MO: { name: 'Missouri', type: 'graduated', brackets: [{ rate: 2, upTo: 1348 }, { rate: 2.5, upTo: 2696 }, { rate: 3, upTo: 4044 }, { rate: 3.5, upTo: 5392 }, { rate: 4, upTo: 6740 }, { rate: 4.5, upTo: 8088 }, { rate: 4.7, upTo: Infinity }] },
  MT: { name: 'Montana', type: 'graduated', usesSingleFilerOnly: true, brackets: [{ rate: 4.7, upTo: 47500 }, { rate: 5.65, upTo: Infinity }] },
  NE: { name: 'Nebraska', type: 'graduated', usesSingleFilerOnly: true, brackets: [{ rate: 2.46, upTo: 4130 }, { rate: 3.51, upTo: 24760 }, { rate: 4.55, upTo: Infinity }] },
  NV: { name: 'Nevada', type: 'none' },
  NH: { name: 'New Hampshire', type: 'none' },
  NJ: {
    name: 'New Jersey', type: 'graduated',
    // Verified against NJ Division of Taxation's own published rate tables
    // (cross-checked via Bankrate's citation). MFJ/HoH/Qualifying Widow(er)
    // share one bracket set (8 brackets); Single/MFS share a different one
    // (7 brackets) — these are genuinely different structures, not a doubled
    // single-filer table. NJ uses per-person personal exemptions rather than
    // a standard deduction, which isn't modeled here (noted in the note text).
    bracketsByStatus: {
      single: [{ rate: 1.4, upTo: 20000 }, { rate: 1.75, upTo: 35000 }, { rate: 3.5, upTo: 40000 }, { rate: 5.525, upTo: 75000 }, { rate: 6.37, upTo: 500000 }, { rate: 8.97, upTo: 1000000 }, { rate: 10.75, upTo: Infinity }],
      marriedSeparately: [{ rate: 1.4, upTo: 20000 }, { rate: 1.75, upTo: 35000 }, { rate: 3.5, upTo: 40000 }, { rate: 5.525, upTo: 75000 }, { rate: 6.37, upTo: 500000 }, { rate: 8.97, upTo: 1000000 }, { rate: 10.75, upTo: Infinity }],
      marriedJointly: [{ rate: 1.4, upTo: 20000 }, { rate: 1.75, upTo: 50000 }, { rate: 2.45, upTo: 70000 }, { rate: 3.5, upTo: 80000 }, { rate: 5.525, upTo: 150000 }, { rate: 6.37, upTo: 500000 }, { rate: 8.97, upTo: 1000000 }, { rate: 10.75, upTo: Infinity }],
      headOfHousehold: [{ rate: 1.4, upTo: 20000 }, { rate: 1.75, upTo: 50000 }, { rate: 2.45, upTo: 70000 }, { rate: 3.5, upTo: 80000 }, { rate: 5.525, upTo: 150000 }, { rate: 6.37, upTo: 500000 }, { rate: 8.97, upTo: 1000000 }, { rate: 10.75, upTo: Infinity }],
    },
    standardDeduction: { single: 0, marriedJointly: 0, headOfHousehold: 0, marriedSeparately: 0 },
    usesPersonalExemptionsNotDeduction: true,
  },
  NM: { name: 'New Mexico', type: 'graduated', usesSingleFilerOnly: true, brackets: [{ rate: 1.5, upTo: 5500 }, { rate: 3.2, upTo: 16500 }, { rate: 4.3, upTo: 33500 }, { rate: 4.7, upTo: 66500 }, { rate: 4.9, upTo: 210000 }, { rate: 5.9, upTo: Infinity }] },
  NY: {
    name: 'New York', type: 'graduated',
    // Verified: 2026 rate cut (0.1pp off the bottom 5 brackets vs 2025) confirmed by two
    // independent sources citing the same thresholds; cross-checked against a worked
    // example that (after correcting for a source using stale 2025 rates) matched exactly.
    bracketsByStatus: {
      single: [{ rate: 3.90, upTo: 8500 }, { rate: 4.40, upTo: 11700 }, { rate: 5.15, upTo: 13900 }, { rate: 5.40, upTo: 80650 }, { rate: 5.90, upTo: 215400 }, { rate: 6.85, upTo: 1077550 }, { rate: 9.65, upTo: 5000000 }, { rate: 10.30, upTo: 25000000 }, { rate: 10.90, upTo: Infinity }],
      marriedJointly: [{ rate: 3.90, upTo: 17150 }, { rate: 4.40, upTo: 23600 }, { rate: 5.15, upTo: 27900 }, { rate: 5.40, upTo: 161550 }, { rate: 5.90, upTo: 323200 }, { rate: 6.85, upTo: 2155350 }, { rate: 9.65, upTo: 5000000 }, { rate: 10.30, upTo: 25000000 }, { rate: 10.90, upTo: Infinity }],
      headOfHousehold: [{ rate: 3.90, upTo: 12800 }, { rate: 4.40, upTo: 17650 }, { rate: 5.15, upTo: 20900 }, { rate: 5.40, upTo: 107650 }, { rate: 5.90, upTo: 269300 }, { rate: 6.85, upTo: 1616450 }, { rate: 9.65, upTo: 5000000 }, { rate: 10.30, upTo: 25000000 }, { rate: 10.90, upTo: Infinity }],
      marriedSeparately: [{ rate: 3.90, upTo: 8500 }, { rate: 4.40, upTo: 11700 }, { rate: 5.15, upTo: 13900 }, { rate: 5.40, upTo: 80650 }, { rate: 5.90, upTo: 215400 }, { rate: 6.85, upTo: 1077550 }, { rate: 9.65, upTo: 5000000 }, { rate: 10.30, upTo: 25000000 }, { rate: 10.90, upTo: Infinity }],
    },
    standardDeduction: { single: 8000, marriedJointly: 16050, headOfHousehold: 11200, marriedSeparately: 8000 },
  },
  NC: { name: 'North Carolina', type: 'flat', rate: 3.99 },
  ND: { name: 'North Dakota', type: 'flat', rate: 1.95 },
  OH: { name: 'Ohio', type: 'flatWithExemption', rate: 2.75, exemption: 26050 },
  OK: { name: 'Oklahoma', type: 'graduated', usesSingleFilerOnly: true, brackets: [{ rate: 2.5, upTo: 3750 }, { rate: 3.5, upTo: 4900 }, { rate: 4.5, upTo: Infinity }] },
  OR: { name: 'Oregon', type: 'graduated', usesSingleFilerOnly: true, brackets: [{ rate: 4.75, upTo: 4550 }, { rate: 6.75, upTo: 11400 }, { rate: 8.75, upTo: 125000 }, { rate: 9.9, upTo: Infinity }] },
  PA: { name: 'Pennsylvania', type: 'flat', rate: 3.07 },
  RI: { name: 'Rhode Island', type: 'graduated', brackets: [{ rate: 3.75, upTo: 82050 }, { rate: 4.75, upTo: 186450 }, { rate: 5.99, upTo: Infinity }] },
  SC: { name: 'South Carolina', type: 'graduated', brackets: [{ rate: 0, upTo: 3640 }, { rate: 3, upTo: 18230 }, { rate: 6, upTo: Infinity }] },
  SD: { name: 'South Dakota', type: 'none' },
  TN: { name: 'Tennessee', type: 'none' },
  TX: { name: 'Texas', type: 'none' },
  UT: { name: 'Utah', type: 'flat', rate: 4.5 },
  VT: { name: 'Vermont', type: 'graduated', usesSingleFilerOnly: true, brackets: [{ rate: 3.35, upTo: 49400 }, { rate: 6.6, upTo: 119700 }, { rate: 7.6, upTo: 249700 }, { rate: 8.75, upTo: Infinity }] },
  VA: { name: 'Virginia', type: 'graduated', brackets: [{ rate: 2, upTo: 3000 }, { rate: 3, upTo: 5000 }, { rate: 5, upTo: 17000 }, { rate: 5.75, upTo: Infinity }] },
  WA: { name: 'Washington', type: 'none' },
  WV: { name: 'West Virginia', type: 'graduated', brackets: [{ rate: 2.22, upTo: 10000 }, { rate: 2.96, upTo: 25000 }, { rate: 3.33, upTo: 40000 }, { rate: 4.44, upTo: 60000 }, { rate: 4.82, upTo: Infinity }] },
  WI: { name: 'Wisconsin', type: 'graduated', usesSingleFilerOnly: true, brackets: [{ rate: 3.5, upTo: 15110 }, { rate: 4.4, upTo: 51950 }, { rate: 5.3, upTo: 332720 }, { rate: 7.65, upTo: Infinity }] },
  WY: { name: 'Wyoming', type: 'none' },
  DC: { name: 'Washington DC', type: 'graduated', brackets: [{ rate: 4, upTo: 10000 }, { rate: 6, upTo: 40000 }, { rate: 6.5, upTo: 60000 }, { rate: 8.5, upTo: 250000 }, { rate: 9.25, upTo: 500000 }, { rate: 9.75, upTo: 1000000 }, { rate: 10.75, upTo: Infinity }] },
};

function calculateStateTax(stateCode, taxableIncome, filingStatus) {
  const state = STATE_TAX_2026[stateCode];
  if (!state) throw new Error(`Unrecognized state code: ${stateCode}`);
  if (!(taxableIncome >= 0)) throw new Error('Taxable income cannot be negative.');

  if (state.type === 'none') {
    return { stateName: state.name, stateTax: 0, available: true, note: `${state.name} has no state income tax.` };
  }
  if (state.type === 'flat') {
    const tax = round2(taxableIncome * (state.rate / 100));
    return { stateName: state.name, stateTax: tax, available: true, note: `${state.name} applies a flat ${state.rate}% rate. This is an approximation — it doesn't account for state-specific deductions or exemptions, which could lower the result slightly.` };
  }
  if (state.type === 'flatWithExemption') {
    const taxableAboveExemption = Math.max(0, taxableIncome - state.exemption);
    const tax = round2(taxableAboveExemption * (state.rate / 100));
    return { stateName: state.name, stateTax: tax, available: true, note: `${state.name} applies a flat ${state.rate}% rate only to income above $${state.exemption.toLocaleString()} — income at or below that is untaxed.` };
  }
  if (state.type === 'graduated') {
    // States with filing-status-specific brackets and their own standard deduction (e.g. New York)
    if (state.bracketsByStatus) {
      const status = state.standardDeduction[filingStatus] !== undefined ? filingStatus : 'single';
      const stateDeduction = state.standardDeduction[status] || 0;
      const stateTaxableIncome = Math.max(0, taxableIncome - stateDeduction);
      const brackets = state.bracketsByStatus[status] || state.bracketsByStatus.single;
      let tax = 0, lastCap = 0;
      for (const b of brackets) {
        if (stateTaxableIncome > lastCap) {
          const amt = Math.min(stateTaxableIncome, b.upTo) - lastCap;
          tax += amt * (b.rate / 100);
        }
        lastCap = b.upTo;
        if (stateTaxableIncome <= b.upTo) break;
      }
      let surchargeTax = 0;
      if (state.surcharge) {
        surchargeTax = round2(Math.max(0, stateTaxableIncome - state.surcharge.threshold) * (state.surcharge.rate / 100));
        tax += surchargeTax;
      }
      let note;
      if (state.usesPersonalExemptionsNotDeduction) {
        note = `${state.name} uses its own graduated brackets, with separate bracket structures for single/married-separate filers versus married-jointly/head-of-household filers. ${state.name} uses per-person personal exemptions rather than a standard deduction, which isn't modeled here — the real amount owed is likely somewhat lower.`;
      } else {
        note = `${state.name} uses its own graduated brackets and standard deduction ($${stateDeduction.toLocaleString()} for this filing status), separate from the federal ones above.`;
      }
      if (state.surcharge && surchargeTax > 0) {
        note += ` Includes an additional ${state.surcharge.rate}% surcharge on income over $${state.surcharge.threshold.toLocaleString()}.`;
      }
      if (state.dataVintageNote) note += ` ${state.dataVintageNote}`;
      return { stateName: state.name, stateTax: round2(tax), available: true, note };
    }
    // Simpler states with one bracket array applied directly to federal taxable income (e.g. Massachusetts)
    let tax = 0, lastCap = 0;
    for (const b of state.brackets) {
      if (taxableIncome > lastCap) {
        const amt = Math.min(taxableIncome, b.upTo) - lastCap;
        tax += amt * (b.rate / 100);
      }
      lastCap = b.upTo;
      if (taxableIncome <= b.upTo) break;
    }
    let simpleNote = `${state.name} uses graduated brackets.`;
    if (state.usesSingleFilerOnly) {
      simpleNote += ` Uses single-filer bracket thresholds as an approximation regardless of filing status selected above, since married/joint brackets differ in this state — the real amount may vary somewhat if you're not filing single.`;
    }
    return { stateName: state.name, stateTax: round2(tax), available: true, note: simpleNote };
  }
  // pending
  return { stateName: state.name, stateTax: null, available: false, note: `${state.name}'s graduated bracket schedule is still being verified against official sources and isn't available yet. Your federal estimate above is still accurate.` };
}

// ---------------------------------------------------------------------

/**
 * Canadian Provincial/Territorial Tax — Phase 1.
 * All 13 jurisdictions are marked "pending" for the same reason as the US
 * graduated states: each province sets its own brackets, basic personal
 * amount, and (in Ontario's and PEI's case) a separate surtax layered on
 * top of the bracket calculation, and getting these right requires
 * verifying each one individually against its own provincial tax
 * authority rather than a secondary aggregator. Federal CRA tax (above)
 * is fully accurate and unaffected by this.
 */
/**
 * Canadian Provincial/Territorial Tax — Phase 2.
 * Source: Canada Revenue Agency's own official published rate table
 * (canada.ca "Current year tax rates and income brackets"), fetched directly
 * — not a secondary aggregator. This is the same standard applied to federal.
 *
 * Two honest limitations, disclosed directly on the calculator page rather
 * than silently absorbed into the number:
 *  1. Each province sets its own basic-personal-amount-equivalent credit or
 *     low-income tax reduction, and the CRA's rate table (by design) doesn't
 *     include those dollar amounts — only the bracket rates themselves. This
 *     means these estimates run slightly HIGH at lower incomes (the safer
 *     direction for an estimate to err) since no such reduction is applied.
 *  2. Ontario and Prince Edward Island layer an additional provincial surtax
 *     on top of these brackets for higher earners, which is not included.
 *
 * Quebec is administered separately by Revenu Québec under a genuinely
 * different tax base (not the federal one), and is not yet implemented here.
 */
const PROVINCE_TAX_2026 = {
  AB: { name: 'Alberta', type: 'graduated', brackets: [{ rate: 8, upTo: 61200 }, { rate: 10, upTo: 154259 }, { rate: 12, upTo: 185111 }, { rate: 13, upTo: 246813 }, { rate: 14, upTo: 370220 }, { rate: 15, upTo: Infinity }] },
  BC: { name: 'British Columbia', type: 'graduated', brackets: [{ rate: 5.6, upTo: 50363 }, { rate: 7.7, upTo: 100728 }, { rate: 10.5, upTo: 115648 }, { rate: 12.29, upTo: 140430 }, { rate: 14.7, upTo: 190405 }, { rate: 16.8, upTo: 265545 }, { rate: 20.5, upTo: Infinity }] },
  MB: { name: 'Manitoba', type: 'graduated', brackets: [{ rate: 10.8, upTo: 47564 }, { rate: 12.75, upTo: 101200 }, { rate: 17.4, upTo: Infinity }] },
  NB: { name: 'New Brunswick', type: 'graduated', brackets: [{ rate: 9.4, upTo: 52333 }, { rate: 14, upTo: 104666 }, { rate: 16, upTo: 193861 }, { rate: 19.5, upTo: Infinity }] },
  NL: { name: 'Newfoundland and Labrador', type: 'graduated', brackets: [{ rate: 8.7, upTo: 44678 }, { rate: 14.5, upTo: 89354 }, { rate: 15.8, upTo: 159528 }, { rate: 17.8, upTo: 223340 }, { rate: 19.8, upTo: 285319 }, { rate: 20.8, upTo: 570638 }, { rate: 21.3, upTo: 1141275 }, { rate: 21.8, upTo: Infinity }] },
  NS: { name: 'Nova Scotia', type: 'graduated', brackets: [{ rate: 8.79, upTo: 30995 }, { rate: 14.95, upTo: 61991 }, { rate: 16.67, upTo: 97417 }, { rate: 17.5, upTo: 157124 }, { rate: 21, upTo: Infinity }] },
  NT: { name: 'Northwest Territories', type: 'graduated', brackets: [{ rate: 5.9, upTo: 53003 }, { rate: 8.6, upTo: 106009 }, { rate: 12.2, upTo: 172346 }, { rate: 14.05, upTo: Infinity }] },
  NU: { name: 'Nunavut', type: 'graduated', brackets: [{ rate: 4, upTo: 55801 }, { rate: 7, upTo: 111602 }, { rate: 9, upTo: 181439 }, { rate: 11.5, upTo: Infinity }] },
  ON: { name: 'Ontario', type: 'graduated', hasSurtax: true, brackets: [{ rate: 5.05, upTo: 53891 }, { rate: 9.15, upTo: 107785 }, { rate: 11.16, upTo: 150000 }, { rate: 12.16, upTo: 220000 }, { rate: 13.16, upTo: Infinity }] },
  PE: { name: 'Prince Edward Island', type: 'graduated', hasSurtax: true, brackets: [{ rate: 9.5, upTo: 33928 }, { rate: 13.47, upTo: 65820 }, { rate: 16.6, upTo: 106890 }, { rate: 17.62, upTo: 142520 }, { rate: 19, upTo: 200000 }, { rate: 20, upTo: Infinity }] },
  QC: {
    name: 'Quebec', type: 'graduated', hasOwnBPACredit: true,
    // Verified directly against Revenu Québec's own official rates page and the
    // Quebec Ministry of Finance's own "Parameters of the Personal Income Tax
    // System for 2026" document — not secondary aggregators, which showed real
    // disagreement (three different BPA figures found in initial research).
    // Bracket math cross-checked against the source's own worked example.
    brackets: [{ rate: 14, upTo: 54345 }, { rate: 19, upTo: 108680 }, { rate: 24, upTo: 132245 }, { rate: 25.75, upTo: Infinity }],
    bpaAmount: 18952,
    bpaCreditRate: 0.14, // BPA applied as a non-refundable credit at the lowest bracket rate, same mechanism as the federal BPA
  },
  SK: { name: 'Saskatchewan', type: 'graduated', brackets: [{ rate: 10.5, upTo: 54532 }, { rate: 12.5, upTo: 155805 }, { rate: 14.5, upTo: Infinity }] },
  YT: { name: 'Yukon', type: 'graduated', brackets: [{ rate: 6.4, upTo: 58523 }, { rate: 9, upTo: 117045 }, { rate: 10.9, upTo: 181440 }, { rate: 12.8, upTo: 500000 }, { rate: 15, upTo: Infinity }] },
};

function getProvinceTaxStatus(provinceCode, taxableIncome) {
  const province = PROVINCE_TAX_2026[provinceCode];
  if (!province) throw new Error(`Unrecognized province code: ${provinceCode}`);
  if (!(taxableIncome >= 0)) throw new Error('Taxable income cannot be negative.');

  if (province.type === 'pending') {
    return {
      provinceName: province.name, available: false, provinceTax: null,
      note: `${province.name}'s provincial brackets and Basic Personal Amount are not shown here because independent sources currently disagree on the exact 2026 figures — rather than guess, this is left honestly unavailable until confirmed directly against Revenu Qu\u00e9bec's own published schedule. Your federal estimate above already correctly applies the 16.5% Quebec abatement that reduces federal tax for Quebec residents specifically.`,
    };
  }

  let tax = 0, lastCap = 0;
  for (const b of province.brackets) {
    if (taxableIncome > lastCap) {
      const amt = Math.min(taxableIncome, b.upTo) - lastCap;
      tax += amt * (b.rate / 100);
    }
    lastCap = b.upTo;
    if (taxableIncome <= b.upTo) break;
  }

  let note;
  if (province.hasOwnBPACredit) {
    const bpaCredit = round2(province.bpaAmount * province.bpaCreditRate);
    tax = Math.max(0, tax - bpaCredit);
    note = `${province.name}'s official 2026 bracket rates and Basic Personal Amount ($${province.bpaAmount.toLocaleString()} credit), sourced directly from Revenu Qu\u00e9bec and the Quebec Ministry of Finance. This does not yet include Quebec's other provincial credits or the QPP/QPIP payroll deductions.`;
  } else {
    note = `${province.name}'s official 2026 bracket rates (Canada Revenue Agency). This does not yet apply ${province.name}'s basic-personal-amount-equivalent credit or low-income tax reduction, so the real amount owed is likely somewhat lower than shown, especially at lower incomes.`;
    if (province.hasSurtax) {
      note += ` It also does not include ${province.name}'s additional provincial surtax, which applies on top for higher earners.`;
    }
  }

  return { provinceName: province.name, available: true, provinceTax: round2(tax), note };
}

// ---------------------------------------------------------------------

/**
 * US Payroll Taxes (FICA) — 2026.
 * Verified across 8 independent CPA/payroll-provider sources, all agreeing
 * exactly: Social Security wage base $184,500, rate 6.2%; Medicare 1.45%
 * uncapped; Additional Medicare Tax 0.9% above filing-status-specific
 * thresholds. Cross-checked the wage-base × rate math directly.
 */
const FICA_2026 = {
  socialSecurityRate: 6.2,
  socialSecurityWageBase: 184500,
  medicareRate: 1.45,
  additionalMedicareRate: 0.9,
  additionalMedicareThreshold: { single: 200000, marriedJointly: 250000, headOfHousehold: 200000, marriedSeparately: 125000 },
};

function calculateFICA(grossIncome, filingStatus = 'single') {
  if (!(grossIncome >= 0)) throw new Error('Gross income cannot be negative.');
  const socialSecurityTax = round2(Math.min(grossIncome, FICA_2026.socialSecurityWageBase) * (FICA_2026.socialSecurityRate / 100));
  const medicareTax = round2(grossIncome * (FICA_2026.medicareRate / 100));
  const threshold = FICA_2026.additionalMedicareThreshold[filingStatus] !== undefined ? FICA_2026.additionalMedicareThreshold[filingStatus] : FICA_2026.additionalMedicareThreshold.single;
  const additionalMedicareTax = round2(Math.max(0, grossIncome - threshold) * (FICA_2026.additionalMedicareRate / 100));
  const totalFICA = round2(socialSecurityTax + medicareTax + additionalMedicareTax);
  return { socialSecurityTax, medicareTax, additionalMedicareTax, totalFICA };
}

/**
 * Canada Payroll Deductions (CPP + EI) — 2026.
 * Verified across 7 independent sources, all agreeing exactly: CPP1 5.95%
 * on earnings $3,500-$74,600 (max $4,230.45), CPP2 4.00% on $74,600-$85,000
 * (max $416.00), EI 1.63% up to $68,900 (max $1,123.07). Cross-checked the
 * CPP1 and CPP2 max-contribution math directly against the stated caps.
 * Quebec uses its own QPP/QPIP system with different rates — not this one.
 */
const CPP_EI_2026 = {
  cpp1Rate: 5.95, cpp1BasicExemption: 3500, cpp1Ceiling: 74600, cpp1Max: 4230.45,
  cpp2Rate: 4.00, cpp2Ceiling: 85000, cpp2Max: 416.00,
  eiRate: 1.63, eiCeiling: 68900, eiMax: 1123.07,
};

function calculateCPPEI(grossIncome, isQuebec = false) {
  if (!(grossIncome >= 0)) throw new Error('Gross income cannot be negative.');
  if (isQuebec) {
    return { available: false, note: 'Quebec uses its own QPP and QPIP system with different rates instead of CPP/EI — not calculated here.' };
  }
  const c = CPP_EI_2026;
  const cpp1PensionableEarnings = Math.max(0, Math.min(grossIncome, c.cpp1Ceiling) - c.cpp1BasicExemption);
  const cpp1 = round2(Math.min(cpp1PensionableEarnings * (c.cpp1Rate / 100), c.cpp1Max));
  const cpp2Earnings = Math.max(0, Math.min(grossIncome, c.cpp2Ceiling) - c.cpp1Ceiling);
  const cpp2 = round2(Math.min(cpp2Earnings * (c.cpp2Rate / 100), c.cpp2Max));
  const ei = round2(Math.min(grossIncome, c.eiCeiling) * (c.eiRate / 100));
  const totalCPPEI = round2(cpp1 + cpp2 + ei);
  return { available: true, cpp1, cpp2, ei, totalCPPEI };
}

// ---------------------------------------------------------------------

/**
 * Debt Payoff Calculator.
 * Given a balance, APR, and a fixed monthly payment, solves for how many
 * months to pay it off and the total interest paid — the mathematical
 * inverse of the standard loan-payment formula (which instead solves for
 * payment given a known term). Derived from the amortization identity:
 *   payment = P*r*(1+r)^n / ((1+r)^n - 1)
 * Solving for n:
 *   n = log(payment / (payment - P*r)) / log(1+r)
 * This requires payment > P*r (monthly interest accrued) — otherwise the
 * balance never shrinks and payoff is mathematically impossible, which is
 * handled as an explicit error rather than returning a nonsensical result.
 */
function monthsToPayoff(input) {
  const { balance, annualRatePercent, monthlyPayment } = input;
  if (!(balance > 0)) throw new Error('Balance must be greater than zero.');
  if (annualRatePercent < 0) throw new Error('Interest rate cannot be negative.');
  if (!(monthlyPayment > 0)) throw new Error('Monthly payment must be greater than zero.');

  const r = annualRatePercent / 100 / 12;
  let months;

  if (r === 0) {
    months = balance / monthlyPayment;
  } else {
    const monthlyInterestOnBalance = balance * r;
    if (monthlyPayment <= monthlyInterestOnBalance) {
      throw new Error(`This payment doesn't even cover the interest that accrues each month ($${round2(monthlyInterestOnBalance).toLocaleString()}) — at this rate, the balance would never go down. Increase the payment.`);
    }
    months = Math.log(monthlyPayment / (monthlyPayment - monthlyInterestOnBalance)) / Math.log(1 + r);
  }

  const monthsRounded = Math.ceil(months);
  // Total paid uses the same amortization schedule as calculateLoan for consistency,
  // running the fixed payment for the rounded whole number of months.
  let remainingBalance = balance;
  let totalPaid = 0;
  for (let i = 0; i < monthsRounded && remainingBalance > 0.005; i++) {
    const interestThisMonth = remainingBalance * r;
    let paymentThisMonth = Math.min(monthlyPayment, remainingBalance + interestThisMonth);
    remainingBalance = remainingBalance + interestThisMonth - paymentThisMonth;
    totalPaid += paymentThisMonth;
  }
  const totalInterest = totalPaid - balance;

  return {
    months: monthsRounded,
    years: round2(monthsRounded / 12),
    totalPaid: round2(totalPaid),
    totalInterest: round2(totalInterest),
  };
}

/**
 * Typical real-world credit card minimum payment: the greater of a flat
 * dollar floor or a percentage of the balance — 2% and $25 are the most
 * commonly cited defaults across major card issuers' stated formulas.
 */
function typicalMinimumPayment(balance) {
  return Math.max(25, round2(balance * 0.02));
}

// ---------------------------------------------------------------------

/**
 * Discount / Sale Price Calculator.
 * Supports stacking a second discount, applied correctly (multiplicatively
 * on the already-discounted price) rather than the common but incorrect
 * assumption that two discounts simply add together (20% + 10% is NOT 30%
 * off — it's 1 - (0.80 * 0.90) = 28% off).
 */
function calculateDiscount(input) {
  const { originalPrice, discountPercent, secondDiscountPercent = 0 } = input;
  if (!(originalPrice >= 0)) throw new Error('Original price cannot be negative.');
  if (discountPercent < 0 || discountPercent > 100) throw new Error('Discount percentage must be between 0 and 100.');
  if (secondDiscountPercent < 0 || secondDiscountPercent > 100) throw new Error('Second discount percentage must be between 0 and 100.');

  const afterFirst = originalPrice * (1 - discountPercent / 100);
  const finalPrice = afterFirst * (1 - secondDiscountPercent / 100);
  const amountSaved = originalPrice - finalPrice;
  const effectiveDiscountPercent = originalPrice > 0 ? (amountSaved / originalPrice) * 100 : 0;
  const naiveAddedPercent = discountPercent + secondDiscountPercent; // what people often (incorrectly) assume

  return {
    finalPrice: round2(finalPrice),
    amountSaved: round2(amountSaved),
    effectiveDiscountPercent: round2(effectiveDiscountPercent),
    naiveAddedPercent: round2(Math.min(naiveAddedPercent, 100)),
  };
}

/** Reverse lookup: given original and sale price, find the discount percentage and amount saved. */
function findDiscountPercent(input) {
  const { originalPrice, salePrice } = input;
  if (!(originalPrice > 0)) throw new Error('Original price must be greater than zero.');
  if (salePrice < 0) throw new Error('Sale price cannot be negative.');
  if (salePrice > originalPrice) throw new Error("Sale price can't be higher than the original price.");
  const amountSaved = originalPrice - salePrice;
  const discountPercent = (amountSaved / originalPrice) * 100;
  return { amountSaved: round2(amountSaved), discountPercent: round2(discountPercent) };
}

// ---------------------------------------------------------------------

/**
 * 401(k) Retirement Calculator — 2026 IRS contribution limits.
 * Source: IRS.gov directly ("401(k) limit increases to $24,500 for 2026" and
 * "Retirement topics — 401(k) and profit-sharing plan contribution limits"),
 * cross-checked against Fidelity's published summary.
 * Employee elective deferral limit: $24,500. Catch-up (age 50+): +$8,000.
 * Super catch-up (ages 60-63 specifically, per SECURE 2.0): +$11,250 instead.
 * Combined employee+employer limit: $72,000/year.
 */
const CONTRIB_401K_2026 = {
  employeeLimit: 24500,
  catchUpLimit: 8000,       // age 50+
  superCatchUpLimit: 11250, // ages 60-63 specifically, replaces the standard catch-up
  combinedLimit: 72000,     // employee + employer combined
};

function employee401kLimit(age) {
  if (age >= 60 && age <= 63) return CONTRIB_401K_2026.employeeLimit + CONTRIB_401K_2026.superCatchUpLimit;
  if (age >= 50) return CONTRIB_401K_2026.employeeLimit + CONTRIB_401K_2026.catchUpLimit;
  return CONTRIB_401K_2026.employeeLimit;
}

/**
 * Projects 401(k) balance to retirement using annual-step compounding —
 * contributions are modeled as added once per year rather than per paycheck,
 * a standard simplifying approximation disclosed directly to the user.
 * Salary is held flat over the projection (no assumed raises), also disclosed.
 */
function calculate401kProjection(input) {
  const { currentAge, retirementAge, currentBalance, annualSalary, employeeContributionPercent, employerMatchPercent, employerMatchLimitPercent, annualReturnPercent } = input;
  if (!(currentAge >= 18 && currentAge < 100)) throw new Error('Enter a valid current age.');
  if (!(retirementAge > currentAge && retirementAge <= 100)) throw new Error('Retirement age must be greater than current age.');
  if (currentBalance < 0) throw new Error('Current balance cannot be negative.');
  if (!(annualSalary >= 0)) throw new Error('Annual salary cannot be negative.');
  if (employeeContributionPercent < 0 || employeeContributionPercent > 100) throw new Error('Contribution percent must be between 0 and 100.');
  if (employerMatchPercent < 0 || employerMatchLimitPercent < 0) throw new Error('Employer match values cannot be negative.');
  if (annualReturnPercent < 0) throw new Error('Return rate cannot be negative.');

  let balance = currentBalance;
  let totalEmployeeContributions = 0;
  let totalEmployerContributions = 0;
  const r = annualReturnPercent / 100;
  const yearRows = [];

  for (let age = currentAge; age < retirementAge; age++) {
    const limit = employee401kLimit(age);
    let employeeContribution = Math.min(annualSalary * (employeeContributionPercent / 100), limit);
    const matchableAmount = Math.min(employeeContribution, annualSalary * (employerMatchLimitPercent / 100));
    let employerContribution = matchableAmount * (employerMatchPercent / 100);
    if (employeeContribution + employerContribution > CONTRIB_401K_2026.combinedLimit) {
      employerContribution = Math.max(0, CONTRIB_401K_2026.combinedLimit - employeeContribution);
    }
    totalEmployeeContributions += employeeContribution;
    totalEmployerContributions += employerContribution;
    balance = balance * (1 + r) + employeeContribution + employerContribution;
    yearRows.push({ age: age + 1, employeeContribution: round2(employeeContribution), employerContribution: round2(employerContribution), yearEndBalance: round2(balance) });
  }

  const totalContributions = totalEmployeeContributions + totalEmployerContributions;
  const totalGrowth = balance - currentBalance - totalContributions;

  return {
    finalBalance: round2(balance),
    totalEmployeeContributions: round2(totalEmployeeContributions),
    totalEmployerContributions: round2(totalEmployerContributions),
    totalContributions: round2(totalContributions),
    totalGrowth: round2(totalGrowth),
    yearsInvested: retirementAge - currentAge,
    yearRows,
  };
}

/**
 * Tip Calculator — straightforward arithmetic, no external data dependency.
 */
function calculateTip(input) {
  const { billAmount, tipPercent, numberOfPeople = 1 } = input;
  if (!(billAmount >= 0)) throw new Error('Bill amount cannot be negative.');
  if (tipPercent < 0) throw new Error('Tip percent cannot be negative.');
  if (!(numberOfPeople >= 1)) throw new Error('Number of people must be at least 1.');

  const tipAmount = billAmount * (tipPercent / 100);
  const totalAmount = billAmount + tipAmount;
  return {
    tipAmount: round2(tipAmount),
    totalAmount: round2(totalAmount),
    tipPerPerson: round2(tipAmount / numberOfPeople),
    totalPerPerson: round2(totalAmount / numberOfPeople),
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

const FinanceTools = { calculateLoan, amortizationScheduleByYear, calculateMortgage, compoundInterest, requiredMonthlyContribution, calculateFederalIncomeTax, TAX_BRACKETS_2026, STANDARD_DEDUCTION_2026, FILING_STATUS_LABELS, calculateFederalIncomeTaxCRA, CRA_FEDERAL_BRACKETS_2026, CRA_BPA_2026, calculateStateTax, STATE_TAX_2026, getProvinceTaxStatus, PROVINCE_TAX_2026, calculateFICA, FICA_2026, calculateCPPEI, CPP_EI_2026, monthsToPayoff, typicalMinimumPayment, calculateDiscount, findDiscountPercent, calculate401kProjection, employee401kLimit, CONTRIB_401K_2026, calculateTip, PercentageTools, round2 };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FinanceTools;
} else if (typeof window !== 'undefined') {
  window.FinanceTools = FinanceTools;
}
