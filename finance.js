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
  AL: { name: 'Alabama', type: 'pending' },
  AK: { name: 'Alaska', type: 'none' },
  AZ: { name: 'Arizona', type: 'flat', rate: 2.5 },
  AR: { name: 'Arkansas', type: 'pending' },
  CA: { name: 'California', type: 'pending' },
  CO: { name: 'Colorado', type: 'flat', rate: 4.4 },
  CT: { name: 'Connecticut', type: 'pending' },
  DE: { name: 'Delaware', type: 'pending' },
  FL: { name: 'Florida', type: 'none' },
  GA: { name: 'Georgia', type: 'flat', rate: 4.99 },
  HI: { name: 'Hawaii', type: 'pending' },
  ID: { name: 'Idaho', type: 'pending' },
  IL: { name: 'Illinois', type: 'flat', rate: 4.95 },
  IN: { name: 'Indiana', type: 'flat', rate: 3.05 },
  IA: { name: 'Iowa', type: 'flat', rate: 3.9 },
  KS: { name: 'Kansas', type: 'pending' },
  KY: { name: 'Kentucky', type: 'flat', rate: 3.5 },
  LA: { name: 'Louisiana', type: 'pending' },
  ME: { name: 'Maine', type: 'pending' },
  MD: { name: 'Maryland', type: 'pending' },
  MA: { name: 'Massachusetts', type: 'graduated', brackets: [{ rate: 5, upTo: 1000000 }, { rate: 9, upTo: Infinity }] },
  MI: { name: 'Michigan', type: 'flat', rate: 4.05 },
  MN: { name: 'Minnesota', type: 'pending' },
  MS: { name: 'Mississippi', type: 'flat', rate: 4.4 },
  MO: { name: 'Missouri', type: 'pending' },
  MT: { name: 'Montana', type: 'pending' },
  NE: { name: 'Nebraska', type: 'pending' },
  NV: { name: 'Nevada', type: 'none' },
  NH: { name: 'New Hampshire', type: 'none' },
  NJ: { name: 'New Jersey', type: 'pending' },
  NM: { name: 'New Mexico', type: 'pending' },
  NY: { name: 'New York', type: 'pending' },
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
  OH: { name: 'Ohio', type: 'pending' },
  OK: { name: 'Oklahoma', type: 'pending' },
  OR: { name: 'Oregon', type: 'pending' },
  PA: { name: 'Pennsylvania', type: 'flat', rate: 3.07 },
  RI: { name: 'Rhode Island', type: 'pending' },
  SC: { name: 'South Carolina', type: 'pending' },
  SD: { name: 'South Dakota', type: 'none' },
  TN: { name: 'Tennessee', type: 'none' },
  TX: { name: 'Texas', type: 'none' },
  UT: { name: 'Utah', type: 'flat', rate: 4.45 },
  VT: { name: 'Vermont', type: 'pending' },
  VA: { name: 'Virginia', type: 'pending' },
  WA: { name: 'Washington', type: 'none' },
  WV: { name: 'West Virginia', type: 'pending' },
  WI: { name: 'Wisconsin', type: 'pending' },
  WY: { name: 'Wyoming', type: 'none' },
  DC: { name: 'Washington DC', type: 'pending' },
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
      return { stateName: state.name, stateTax: round2(tax), available: true, note: `${state.name} uses its own graduated brackets and standard deduction ($${stateDeduction.toLocaleString()} for this filing status), separate from the federal ones above.` };
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
    return { stateName: state.name, stateTax: round2(tax), available: true, note: `${state.name} uses graduated brackets.` };
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
  QC: { name: 'Quebec', type: 'pending' },
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
      note: `${province.name}'s tax system is administered separately (Revenu Québec) on a different tax base and isn't available yet. Your federal CRA estimate above is still accurate.`,
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

  let note = `${province.name}'s official 2026 bracket rates (Canada Revenue Agency). This does not yet apply ${province.name}'s basic-personal-amount-equivalent credit or low-income tax reduction, so the real amount owed is likely somewhat lower than shown, especially at lower incomes.`;
  if (province.hasSurtax) {
    note += ` It also does not include ${province.name}'s additional provincial surtax, which applies on top for higher earners.`;
  }

  return { provinceName: province.name, available: true, provinceTax: round2(tax), note };
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

const FinanceTools = { calculateLoan, amortizationScheduleByYear, calculateMortgage, compoundInterest, calculateFederalIncomeTax, TAX_BRACKETS_2026, STANDARD_DEDUCTION_2026, FILING_STATUS_LABELS, calculateFederalIncomeTaxCRA, CRA_FEDERAL_BRACKETS_2026, CRA_BPA_2026, calculateStateTax, STATE_TAX_2026, getProvinceTaxStatus, PROVINCE_TAX_2026, PercentageTools, round2 };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FinanceTools;
} else if (typeof window !== 'undefined') {
  window.FinanceTools = FinanceTools;
}
