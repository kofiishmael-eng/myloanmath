/**
 * numberToWords.js — v2
 * Core conversion engine: Numbers to Words, Currency to Words, Cheque Amount in Words.
 * Zero dependencies. Works in browser (window.NumberToWords) or Node (module.exports).
 *
 * Currency data follows ISO 4217 minor-unit conventions:
 *  - Most currencies use 2 decimal places (Dollar/Cent, Euro/Cent, etc.)
 *  - Zero-decimal currencies (no minor unit in practice): JPY, KRW, VND, CLP, ISK,
 *    BIF, DJF, GNF, KMF, PYG, RWF, UGX, VUV, XAF, XOF, XPF
 *  - Three-decimal currencies: BHD, IQD, JOD, KWD, LYD, OMR, TND
 */

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const INTL_SCALE = ['', 'Thousand', 'Million', 'Billion', 'Trillion', 'Quadrillion'];
const INDIAN_SCALE = ['', 'Thousand', 'Lakh', 'Crore', 'Arab', 'Kharab'];

// { major, majorPlural, minor, minorPlural, decimals }
const CURRENCIES = {
  // --- Major / global ---
  USD: { major: 'US Dollar', majorPlural: 'US Dollars', minor: 'Cent', minorPlural: 'Cents', decimals: 2 },
  EUR: { major: 'Euro', majorPlural: 'Euros', minor: 'Cent', minorPlural: 'Cents', decimals: 2 },
  GBP: { major: 'Pound Sterling', majorPlural: 'Pounds Sterling', minor: 'Penny', minorPlural: 'Pence', decimals: 2 },
  JPY: { major: 'Yen', majorPlural: 'Yen', minor: '', minorPlural: '', decimals: 0 },
  CHF: { major: 'Swiss Franc', majorPlural: 'Swiss Francs', minor: 'Rappen', minorPlural: 'Rappen', decimals: 2 },
  CAD: { major: 'Canadian Dollar', majorPlural: 'Canadian Dollars', minor: 'Cent', minorPlural: 'Cents', decimals: 2 },
  AUD: { major: 'Australian Dollar', majorPlural: 'Australian Dollars', minor: 'Cent', minorPlural: 'Cents', decimals: 2 },
  NZD: { major: 'New Zealand Dollar', majorPlural: 'New Zealand Dollars', minor: 'Cent', minorPlural: 'Cents', decimals: 2 },
  CNY: { major: 'Yuan', majorPlural: 'Yuan', minor: 'Fen', minorPlural: 'Fen', decimals: 2 },
  HKD: { major: 'Hong Kong Dollar', majorPlural: 'Hong Kong Dollars', minor: 'Cent', minorPlural: 'Cents', decimals: 2 },
  SGD: { major: 'Singapore Dollar', majorPlural: 'Singapore Dollars', minor: 'Cent', minorPlural: 'Cents', decimals: 2 },

  // --- Europe ---
  SEK: { major: 'Krona', majorPlural: 'Kronor', minor: 'Öre', minorPlural: 'Öre', decimals: 2 },
  NOK: { major: 'Krone', majorPlural: 'Kroner', minor: 'Øre', minorPlural: 'Øre', decimals: 2 },
  DKK: { major: 'Krone', majorPlural: 'Kroner', minor: 'Øre', minorPlural: 'Øre', decimals: 2 },
  ISK: { major: 'Króna', majorPlural: 'Krónur', minor: '', minorPlural: '', decimals: 0 },
  PLN: { major: 'Złoty', majorPlural: 'Złotych', minor: 'Grosz', minorPlural: 'Groszy', decimals: 2 },
  CZK: { major: 'Koruna', majorPlural: 'Koruny', minor: 'Haléř', minorPlural: 'Haléřů', decimals: 2 },
  HUF: { major: 'Forint', majorPlural: 'Forint', minor: 'Fillér', minorPlural: 'Fillér', decimals: 2 },
  RON: { major: 'Leu', majorPlural: 'Lei', minor: 'Ban', minorPlural: 'Bani', decimals: 2 },
  BGN: { major: 'Lev', majorPlural: 'Leva', minor: 'Stotinka', minorPlural: 'Stotinki', decimals: 2 },
  RUB: { major: 'Ruble', majorPlural: 'Rubles', minor: 'Kopeck', minorPlural: 'Kopecks', decimals: 2 },
  UAH: { major: 'Hryvnia', majorPlural: 'Hryvnias', minor: 'Kopiyka', minorPlural: 'Kopiykas', decimals: 2 },
  TRY: { major: 'Turkish Lira', majorPlural: 'Turkish Lira', minor: 'Kuruş', minorPlural: 'Kuruş', decimals: 2 },

  // --- Middle East ---
  AED: { major: 'Dirham', majorPlural: 'Dirhams', minor: 'Fils', minorPlural: 'Fils', decimals: 2 },
  SAR: { major: 'Riyal', majorPlural: 'Riyals', minor: 'Halala', minorPlural: 'Halalas', decimals: 2 },
  QAR: { major: 'Riyal', majorPlural: 'Riyals', minor: 'Dirham', minorPlural: 'Dirhams', decimals: 2 },
  KWD: { major: 'Kuwaiti Dinar', majorPlural: 'Kuwaiti Dinars', minor: 'Fils', minorPlural: 'Fils', decimals: 3 },
  BHD: { major: 'Bahraini Dinar', majorPlural: 'Bahraini Dinars', minor: 'Fils', minorPlural: 'Fils', decimals: 3 },
  OMR: { major: 'Rial', majorPlural: 'Rials', minor: 'Baisa', minorPlural: 'Baisa', decimals: 3 },
  JOD: { major: 'Jordanian Dinar', majorPlural: 'Jordanian Dinars', minor: 'Piastre', minorPlural: 'Piastres', decimals: 3 },
  ILS: { major: 'Shekel', majorPlural: 'Shekels', minor: 'Agora', minorPlural: 'Agorot', decimals: 2 },
  IQD: { major: 'Iraqi Dinar', majorPlural: 'Iraqi Dinars', minor: 'Fils', minorPlural: 'Fils', decimals: 3 },
  LBP: { major: 'Lebanese Pound', majorPlural: 'Lebanese Pounds', minor: 'Piastre', minorPlural: 'Piastres', decimals: 2 },

  // --- South & East Asia ---
  INR: { major: 'Rupee', majorPlural: 'Rupees', minor: 'Paisa', minorPlural: 'Paise', decimals: 2 },
  PKR: { major: 'Pakistani Rupee', majorPlural: 'Pakistani Rupees', minor: 'Paisa', minorPlural: 'Paise', decimals: 2 },
  BDT: { major: 'Taka', majorPlural: 'Taka', minor: 'Poisha', minorPlural: 'Poisha', decimals: 2 },
  LKR: { major: 'Sri Lankan Rupee', majorPlural: 'Sri Lankan Rupees', minor: 'Cent', minorPlural: 'Cents', decimals: 2 },
  NPR: { major: 'Nepalese Rupee', majorPlural: 'Nepalese Rupees', minor: 'Paisa', minorPlural: 'Paise', decimals: 2 },
  KRW: { major: 'Won', majorPlural: 'Won', minor: '', minorPlural: '', decimals: 0 },
  THB: { major: 'Baht', majorPlural: 'Baht', minor: 'Satang', minorPlural: 'Satang', decimals: 2 },
  MYR: { major: 'Ringgit', majorPlural: 'Ringgit', minor: 'Sen', minorPlural: 'Sen', decimals: 2 },
  IDR: { major: 'Rupiah', majorPlural: 'Rupiah', minor: 'Sen', minorPlural: 'Sen', decimals: 2 },
  PHP: { major: 'Philippine Peso', majorPlural: 'Philippine Pesos', minor: 'Centavo', minorPlural: 'Centavos', decimals: 2 },
  VND: { major: 'Dong', majorPlural: 'Dong', minor: '', minorPlural: '', decimals: 0 },
  TWD: { major: 'New Taiwan Dollar', majorPlural: 'New Taiwan Dollars', minor: 'Cent', minorPlural: 'Cents', decimals: 2 },

  // --- Africa ---
  ZAR: { major: 'Rand', majorPlural: 'Rand', minor: 'Cent', minorPlural: 'Cents', decimals: 2 },
  NGN: { major: 'Naira', majorPlural: 'Naira', minor: 'Kobo', minorPlural: 'Kobo', decimals: 2 },
  EGP: { major: 'Egyptian Pound', majorPlural: 'Egyptian Pounds', minor: 'Piastre', minorPlural: 'Piastres', decimals: 2 },
  KES: { major: 'Kenyan Shilling', majorPlural: 'Kenyan Shillings', minor: 'Cent', minorPlural: 'Cents', decimals: 2 },
  GHS: { major: 'Cedi', majorPlural: 'Cedis', minor: 'Pesewa', minorPlural: 'Pesewas', decimals: 2 },
  MAD: { major: 'Moroccan Dirham', majorPlural: 'Moroccan Dirhams', minor: 'Centime', minorPlural: 'Centimes', decimals: 2 },
  TND: { major: 'Tunisian Dinar', majorPlural: 'Tunisian Dinars', minor: 'Millime', minorPlural: 'Millimes', decimals: 3 },
  XOF: { major: 'CFA Franc (BCEAO)', majorPlural: 'CFA Francs (BCEAO)', minor: '', minorPlural: '', decimals: 0 },
  XAF: { major: 'CFA Franc (BEAC)', majorPlural: 'CFA Francs (BEAC)', minor: '', minorPlural: '', decimals: 0 },
  ETB: { major: 'Birr', majorPlural: 'Birr', minor: 'Santim', minorPlural: 'Santim', decimals: 2 },
  UGX: { major: 'Ugandan Shilling', majorPlural: 'Ugandan Shillings', minor: '', minorPlural: '', decimals: 0 },
  TZS: { major: 'Tanzanian Shilling', majorPlural: 'Tanzanian Shillings', minor: 'Cent', minorPlural: 'Cents', decimals: 2 },

  // --- Americas ---
  MXN: { major: 'Mexican Peso', majorPlural: 'Mexican Pesos', minor: 'Centavo', minorPlural: 'Centavos', decimals: 2 },
  BRL: { major: 'Real', majorPlural: 'Reais', minor: 'Centavo', minorPlural: 'Centavos', decimals: 2 },
  ARS: { major: 'Argentine Peso', majorPlural: 'Argentine Pesos', minor: 'Centavo', minorPlural: 'Centavos', decimals: 2 },
  CLP: { major: 'Chilean Peso', majorPlural: 'Chilean Pesos', minor: '', minorPlural: '', decimals: 0 },
  COP: { major: 'Colombian Peso', majorPlural: 'Colombian Pesos', minor: 'Centavo', minorPlural: 'Centavos', decimals: 2 },
  PEN: { major: 'Sol', majorPlural: 'Soles', minor: 'Céntimo', minorPlural: 'Céntimos', decimals: 2 },
  UYU: { major: 'Uruguayan Peso', majorPlural: 'Uruguayan Pesos', minor: 'Centésimo', minorPlural: 'Centésimos', decimals: 2 },
  VES: { major: 'Bolívar', majorPlural: 'Bolívares', minor: 'Céntimo', minorPlural: 'Céntimos', decimals: 2 },
  JMD: { major: 'Jamaican Dollar', majorPlural: 'Jamaican Dollars', minor: 'Cent', minorPlural: 'Cents', decimals: 2 },

  // --- Oceania (besides AUD/NZD above) ---
  FJD: { major: 'Fijian Dollar', majorPlural: 'Fijian Dollars', minor: 'Cent', minorPlural: 'Cents', decimals: 2 },
};

// Case-insensitive lookup with a clear error listing how many currencies are supported.
function getCurrency(code) {
  if (!code) throw new Error('Please select a currency.');
  const currency = CURRENCIES[String(code).toUpperCase()];
  if (!currency) {
    throw new Error(`"${code}" isn't in the supported currency list yet (${Object.keys(CURRENCIES).length} currencies supported). Check the code, e.g. USD, EUR, GBP, INR, JPY.`);
  }
  return currency;
}

function listCurrencies() {
  return Object.keys(CURRENCIES).sort();
}

function chunkToWords(n, includeAnd) {
  let words = [];
  if (n >= 100) {
    words.push(ONES[Math.floor(n / 100)], 'Hundred');
    n %= 100;
    if (n > 0 && includeAnd) words.push('and');
  }
  if (n >= 20) {
    const tensWord = TENS[Math.floor(n / 10)];
    const onesDigit = n % 10;
    words.push(onesDigit ? `${tensWord}-${ONES[onesDigit]}` : tensWord);
  } else if (n > 0) {
    words.push(ONES[n]);
  }
  return words.join(' ');
}

function integerToWords(intPart, system = 'international', includeAnd = false) {
  if (intPart === 0) return 'Zero';

  if (system === 'indian') {
    const str = String(intPart);
    const groups = [];
    let s = str;
    if (s.length > 3) {
      groups.unshift(s.slice(-3));
      s = s.slice(0, -3);
      while (s.length > 0) {
        groups.unshift(s.slice(-2));
        s = s.slice(0, -2);
      }
    } else {
      groups.unshift(s);
    }
    const words = [];
    for (let i = 0; i < groups.length; i++) {
      const groupVal = parseInt(groups[i], 10);
      if (groupVal === 0) continue;
      const scaleIdx = groups.length - 1 - i;
      const scaleWord = INDIAN_SCALE[scaleIdx] || '';
      words.push(chunkToWords(groupVal, includeAnd), scaleWord);
    }
    return words.filter(Boolean).join(' ').trim();
  }

  const groups = [];
  let n = intPart;
  while (n > 0) {
    groups.unshift(n % 1000);
    n = Math.floor(n / 1000);
  }
  const words = [];
  for (let i = 0; i < groups.length; i++) {
    if (groups[i] === 0) continue;
    const scaleIdx = groups.length - 1 - i;
    words.push(chunkToWords(groups[i], includeAnd), INTL_SCALE[scaleIdx]);
  }
  return words.filter(Boolean).join(' ').trim();
}

function parseAmount(raw, locale = 'us') {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    throw new Error('Please enter a number.');
  }
  let s = String(raw).trim();

  if (locale === 'eu') {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }

  if (!/^-?\d+(\.\d+)?$/.test(s)) {
    throw new Error("That doesn't look like a valid number. Use digits only, e.g. 1234.56");
  }

  const value = parseFloat(s);
  if (!Number.isFinite(value)) throw new Error('Number is too large or invalid.');
  if (Math.abs(value) >= 1e18) throw new Error('Number exceeds supported range (max: 999 quadrillion).');

  return value;
}

/** Tool #1 — plain Numbers to Words. */
function numberToWords(input, opts = {}) {
  const { system = 'international', includeAnd = false, locale = 'us' } = opts;
  const value = parseAmount(input, locale);
  const isNegative = value < 0;
  const abs = Math.abs(value);

  const intPart = Math.floor(abs);
  const decimalStr = abs.toString().split('.')[1] || '';

  let words = integerToWords(intPart, system, includeAnd);
  if (decimalStr) {
    const decimalWords = decimalStr.split('').map(d => ONES[parseInt(d, 10)] || 'Zero').join(' ');
    words += ` Point ${decimalWords}`;
  }
  if (isNegative) words = `Negative ${words}`;
  return words;
}

/** Tool #3 — Currency to Words (cents/subunits fully spelled out). */
function currencyToWords(input, currencyCode = 'USD', opts = {}) {
  const { system = 'international', includeAnd = false, locale = 'us' } = opts;
  const currency = getCurrency(currencyCode);
  const value = parseAmount(input, locale);
  const isNegative = value < 0;

  const multiplier = Math.pow(10, currency.decimals);
  const totalMinor = Math.round(Math.abs(value) * multiplier);
  const majorUnits = currency.decimals === 0 ? totalMinor : Math.floor(totalMinor / multiplier);
  const minorUnits = currency.decimals === 0 ? 0 : totalMinor % multiplier;

  const majorWords = integerToWords(majorUnits, system, includeAnd);
  const majorLabel = majorUnits === 1 ? currency.major : currency.majorPlural;
  let result = `${majorWords} ${majorLabel}`;

  if (currency.decimals > 0 && minorUnits > 0) {
    const minorWords = integerToWords(minorUnits, system, includeAnd);
    const minorLabel = minorUnits === 1 ? currency.minor : currency.minorPlural;
    result += ` and ${minorWords} ${minorLabel}`;
  }

  return isNegative ? `Negative ${result}` : result;
}

/** Tool #2 — Cheque Amount in Words (banking convention: fraction, not spelled-out subunits). */
function chequeAmountToWords(input, currencyCode = 'USD', opts = {}) {
  const { system = 'international', includeAnd = false, locale = 'us', appendOnly = true } = opts;
  const currency = getCurrency(currencyCode);
  const value = parseAmount(input, locale);
  if (value < 0) throw new Error('Cheque amounts cannot be negative.');
  if (value === 0) throw new Error('Cheque amount must be greater than zero.');

  const multiplier = Math.pow(10, currency.decimals);
  const totalMinor = Math.round(value * multiplier);
  const majorUnits = currency.decimals === 0 ? totalMinor : Math.floor(totalMinor / multiplier);
  const minorUnits = currency.decimals === 0 ? 0 : totalMinor % multiplier;

  const majorWords = integerToWords(majorUnits, system, includeAnd);
  const majorLabel = majorUnits === 1 ? currency.major : currency.majorPlural;

  let result;
  if (currency.decimals === 0) {
    // No minor unit in practice (e.g. Yen, Won, Dong) — no fraction to show.
    result = `${majorWords} ${majorLabel}`;
  } else {
    const fraction = String(minorUnits).padStart(currency.decimals, '0');
    const denominator = multiplier; // 100 or 1000
    result = `${majorWords} and ${fraction}/${denominator} ${majorLabel}`;
  }
  if (appendOnly) result += ' Only';
  return result;
}

// ---------------------------------------------------------------------

/**
 * Words to Numbers — the reverse of numberToWords().
 * Built from the SAME ONES/TENS/scale arrays the forward converter uses,
 * so the two can never silently drift out of sync with each other.
 */
const WORD_TO_VALUE = { zero: 0 };
ONES.forEach((word, i) => { if (word) WORD_TO_VALUE[word.toLowerCase()] = i; });
TENS.forEach((word, i) => { if (word) WORD_TO_VALUE[word.toLowerCase()] = i * 10; });

const SCALE_TO_VALUE = { hundred: 100 };
INTL_SCALE.forEach((word, i) => { if (word) SCALE_TO_VALUE[word.toLowerCase()] = Math.pow(1000, i); });
INDIAN_SCALE.forEach((word) => {
  if (!word) return;
  const w = word.toLowerCase();
  if (w === 'thousand') SCALE_TO_VALUE.thousand = 1000;
  else if (w === 'lakh') SCALE_TO_VALUE.lakh = 1e5;
  else if (w === 'crore') SCALE_TO_VALUE.crore = 1e7;
  else if (w === 'arab') SCALE_TO_VALUE.arab = 1e9;
  else if (w === 'kharab') SCALE_TO_VALUE.kharab = 1e11;
});

function parseIntegerWords(tokens) {
  let total = 0;
  let current = 0;
  let sawAnyToken = false;

  for (const token of tokens) {
    if (token === 'and' || token === '') continue;
    sawAnyToken = true;

    if (Object.prototype.hasOwnProperty.call(WORD_TO_VALUE, token)) {
      current += WORD_TO_VALUE[token];
    } else if (token === 'hundred') {
      current = (current === 0 ? 1 : current) * 100;
    } else if (Object.prototype.hasOwnProperty.call(SCALE_TO_VALUE, token) && token !== 'hundred') {
      const multiplier = SCALE_TO_VALUE[token];
      total += (current === 0 ? 1 : current) * multiplier;
      current = 0;
    } else {
      throw new Error(`Didn't recognize the word "${token}" — check the spelling.`);
    }
  }
  if (!sawAnyToken) throw new Error('Please enter a number in words, e.g. "one thousand two hundred".');
  return total + current;
}

/**
 * @param {string} input - e.g. "one thousand two hundred thirty-four point five" / "negative twelve"
 */
function wordsToNumber(input) {
  if (!input || !String(input).trim()) throw new Error('Please enter a number in words.');

  let text = String(input).toLowerCase().trim()
    .replace(/-/g, ' ')      // "thirty-four" -> "thirty four"
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ');

  let isNegative = false;
  const negativeWords = ['negative', 'minus'];
  for (const neg of negativeWords) {
    if (text.startsWith(neg + ' ')) {
      isNegative = true;
      text = text.slice(neg.length + 1);
      break;
    }
  }

  // Split off a decimal part introduced by "point" (e.g. "twelve point five zero").
  let integerText = text;
  let decimalDigits = '';
  const pointIdx = text.split(' ').indexOf('point');
  if (pointIdx !== -1) {
    const tokens = text.split(' ');
    integerText = tokens.slice(0, pointIdx).join(' ');
    const decimalTokens = tokens.slice(pointIdx + 1);
    for (const t of decimalTokens) {
      if (t === '' ) continue;
      if (!Object.prototype.hasOwnProperty.call(WORD_TO_VALUE, t) || WORD_TO_VALUE[t] > 9) {
        throw new Error(`After "point", expected single digits (zero-nine), got "${t}".`);
      }
      decimalDigits += String(WORD_TO_VALUE[t]);
    }
  }

  const integerTokens = integerText.split(' ').filter(Boolean);
  let value = integerTokens.length ? parseIntegerWords(integerTokens) : 0;

  if (decimalDigits) value = parseFloat(`${value}.${decimalDigits}`);
  if (isNegative) value = -value;

  return value;
}

const NumberToWords = { numberToWords, currencyToWords, chequeAmountToWords, wordsToNumber, parseAmount, listCurrencies, CURRENCIES };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = NumberToWords;
} else if (typeof window !== 'undefined') {
  window.NumberToWords = NumberToWords;
}
