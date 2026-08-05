/**
 * Unit conversion engine.
 *
 * Kept separate from finance.js deliberately: these are not financial
 * calculations and finance.js is already large enough that a syntax error in it
 * takes every calculator on the site down at once.
 *
 * On exactness. Most factors below are not measurements — they are definitions,
 * fixed by international agreement, and they are exact:
 *
 *   1 inch          = 2.54 cm                (International Yard and Pound
 *   1 pound         = 0.45359237 kg           Agreement, 1959)
 *   1 yard          = 0.9144 m
 *   1 foot          = 0.3048 m
 *   1 mile          = 1609.344 m
 *   1 US gallon     = 3.785411784 L          (231 cubic inches, by definition)
 *   1 Imperial gal  = 4.54609 L              (UK Weights and Measures Act 1985)
 *   1 avoirdupois oz= 28.349523125 g         (1/16 lb)
 *   1 stone         = 6.35029318 kg          (14 lb)
 *   1 acre          = 4046.8564224 m²        (4840 square yards)
 *   1 hectare       = 10000 m²               (by definition)
 *   1 nautical mile = 1852 m                 (by international definition)
 *   1 bar           = 100000 Pa              (by definition)
 *   1 thermochemical calorie = 4.184 J       (by definition)
 *
 * Where a figure is genuinely inexact (psi to pascal derives from the
 * definitions of pound-force and inch and is exact in principle but unwieldy),
 * the full value is carried and rounding happens only at display time.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.UnitTools = api;
})(this, function () {
  'use strict';

  /** Round for display without letting floating point noise through. */
  function smartRound(value, significant) {
    if (!Number.isFinite(value)) return value;
    if (value === 0) return 0;
    const decimals = typeof significant === 'number' ? significant : 6;
    const rounded = Number(value.toPrecision(12));
    const factor = Math.pow(10, decimals);
    return Math.round(rounded * factor) / factor;
  }

  /**
   * Linear conversions: value * factor (+ offset). Temperature needs the
   * offset; everything else is a pure multiplication.
   */
  const LINEAR = {
    // --- mass ---
    kg_lb:   { factor: 1 / 0.45359237, exact: true },
    g_oz:    { factor: 1 / 28.349523125, exact: true },
    st_kg:   { factor: 6.35029318, exact: true },
    st_lb:   { factor: 14, exact: true },
    // --- length ---
    cm_in:   { factor: 1 / 2.54, exact: true },
    mm_in:   { factor: 1 / 25.4, exact: true },
    m_ft:    { factor: 1 / 0.3048, exact: true },
    m_yd:    { factor: 1 / 0.9144, exact: true },
    km_mi:   { factor: 1 / 1.609344, exact: true },
    // --- volume ---
    l_galUS: { factor: 1 / 3.785411784, exact: true },
    l_galUK: { factor: 1 / 4.54609, exact: true },
    ml_flozUS: { factor: 1 / 29.5735295625, exact: true },
    ml_flozUK: { factor: 1 / 28.4130625, exact: true },
    // --- area ---
    m2_ft2:  { factor: 1 / 0.09290304, exact: true },
    ha_acre: { factor: 1 / 0.40468564224, exact: true },
    // --- speed ---
    kph_mph: { factor: 1 / 1.609344, exact: true },
    kn_mph:  { factor: 1.852 / 1.609344, exact: true },
    kn_kph:  { factor: 1.852, exact: true },
    // --- energy ---
    kcal_kJ: { factor: 4.184, exact: true },
    // --- pressure ---
    bar_psi: { factor: 100000 / 6894.757293168361, exact: false },
    bar_kPa: { factor: 100, exact: true },
    // --- data (decimal, SI meaning) ---
    gb_mb:   { factor: 1000, exact: true },
    tb_gb:   { factor: 1000, exact: true },
  };

  function convertLinear(key, value, reverse) {
    const entry = LINEAR[key];
    if (!entry) throw new Error('Unknown conversion: ' + key);
    if (!Number.isFinite(value)) throw new Error('Enter a valid number.');
    return reverse ? value / entry.factor : value * entry.factor;
  }

  // --- temperature: the only pair on the site with an offset ---------------
  function celsiusToFahrenheit(c) {
    if (!Number.isFinite(c)) throw new Error('Enter a valid temperature.');
    return c * 9 / 5 + 32;
  }
  function fahrenheitToCelsius(f) {
    if (!Number.isFinite(f)) throw new Error('Enter a valid temperature.');
    return (f - 32) * 5 / 9;
  }
  function celsiusToKelvin(c) {
    if (!Number.isFinite(c)) throw new Error('Enter a valid temperature.');
    return c + 273.15;
  }

  /**
   * Fuel economy is an INVERSE relationship, not a linear one: mpg measures
   * distance per volume while L/100km measures volume per distance. Doubling
   * mpg halves L/100km. Treating this as a multiplication is the single most
   * common error in fuel economy conversion.
   *
   * 1 US mpg  = 235.214583... L/100km   (100 * 3.785411784 / 1.609344)
   * 1 UK mpg  = 282.480936... L/100km   (100 * 4.54609       / 1.609344)
   */
  const MPG_US_CONSTANT = 100 * 3.785411784 / 1.609344;
  const MPG_UK_CONSTANT = 100 * 4.54609 / 1.609344;

  function mpgToL100km(mpg, system) {
    if (!(mpg > 0)) throw new Error('Fuel economy must be greater than zero.');
    return (system === 'uk' ? MPG_UK_CONSTANT : MPG_US_CONSTANT) / mpg;
  }
  function l100kmToMpg(l100, system) {
    if (!(l100 > 0)) throw new Error('Fuel consumption must be greater than zero.');
    return (system === 'uk' ? MPG_UK_CONSTANT : MPG_US_CONSTANT) / l100;
  }

  /**
   * Digital storage has two competing meanings and both are in active use:
   * decimal (1 GB = 1000 MB, used by drive manufacturers and SI) and binary
   * (1 GiB = 1024 MiB, used by most operating systems when reporting sizes).
   * The gap is why a "1 TB" drive shows as roughly 931 GB in a file manager.
   */
  function dataConvert(value, fromUnit, toUnit, binary) {
    const base = binary ? 1024 : 1000;
    const order = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const fi = order.indexOf(fromUnit), ti = order.indexOf(toUnit);
    if (fi === -1 || ti === -1) throw new Error('Unknown data unit.');
    if (!Number.isFinite(value)) throw new Error('Enter a valid number.');
    return value * Math.pow(base, fi - ti);
  }

  /**
   * Cups are volume; grams are mass. There is no single factor between them —
   * it depends entirely on the ingredient's density, which is why a cup of
   * flour and a cup of sugar weigh very different amounts. Densities below are
   * typical values in grams per US customary cup (236.5882365 mL) and are
   * approximate by nature: how flour is packed changes its mass by 20% or more.
   */
  const CUP_GRAMS = {
    water: 236.6,
    'flour (all-purpose, spooned)': 125,
    'flour (bread)': 127,
    'sugar (granulated)': 200,
    'sugar (brown, packed)': 213,
    'sugar (powdered)': 120,
    'butter': 227,
    'milk': 244,
    'honey': 340,
    'rice (uncooked, long grain)': 185,
    'rolled oats': 90,
    'cocoa powder': 85,
  };
  const CUP_ML = { us: 236.5882365, metric: 250, uk: 284.130625 };

  function cupsToGrams(cups, ingredient) {
    if (!Number.isFinite(cups)) throw new Error('Enter a valid number of cups.');
    const g = CUP_GRAMS[ingredient];
    if (g === undefined) throw new Error('Unknown ingredient.');
    return cups * g;
  }
  function gramsToCups(grams, ingredient) {
    if (!Number.isFinite(grams)) throw new Error('Enter a valid weight.');
    const g = CUP_GRAMS[ingredient];
    if (g === undefined) throw new Error('Unknown ingredient.');
    return grams / g;
  }

  return {
    smartRound, convertLinear, LINEAR,
    celsiusToFahrenheit, fahrenheitToCelsius, celsiusToKelvin,
    mpgToL100km, l100kmToMpg, MPG_US_CONSTANT, MPG_UK_CONSTANT,
    dataConvert, cupsToGrams, gramsToCups, CUP_GRAMS, CUP_ML,
  };
});
