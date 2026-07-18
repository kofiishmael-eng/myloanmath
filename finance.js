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

const FinanceTools = { calculateLoan, amortizationScheduleByYear, calculateMortgage, compoundInterest, PercentageTools, round2 };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FinanceTools;
} else if (typeof window !== 'undefined') {
  window.FinanceTools = FinanceTools;
}
