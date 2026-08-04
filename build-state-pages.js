/**
 * State take-home comparison page generator.
 *
 * Every number on the generated pages is computed here from finance.js, using
 * exactly the same call sequence salary-calculator.html uses:
 *   federal tax -> FICA -> state tax applied to FEDERAL TAXABLE INCOME
 * so a reader who re-runs the scenario in the calculator gets identical figures.
 *
 * Narrative copy is per-pair and hand-written (the `copy` field below). Only the
 * arithmetic, tables and boilerplate are generated — this is not a mill for
 * spinning out near-identical articles.
 *
 * Usage: node build-state-pages.js
 */
const fs = require('fs');
const path = require('path');
const F = require('./finance.js');

const SITE = __dirname;
// Template source is a page this script never writes, so nav/footer extraction
// can't go circular once California vs. Texas joins the generated series.
const TEMPLATE = path.join(SITE, 'blog-getting-a-raise-walkthrough.html');
const PUBLISHED = '2026-08-02';
const LEVELS = [75000, 100000, 150000, 250000];

// ---------------------------------------------------------------- maths ----
function scenario(stateCode, salary) {
  const fed = F.calculateFederalIncomeTax({ grossIncome: salary, filingStatus: 'single' });
  const fica = F.calculateFICA(salary, 'single');
  const st = F.calculateStateTax(stateCode, fed.taxableIncome, 'single');
  if (!st.available) throw new Error('State not available: ' + stateCode);
  const net = salary - fed.totalTax - fica.totalFICA - st.stateTax;
  return {
    name: st.stateName,
    federal: fed.totalTax,
    fica: fica.totalFICA,
    state: st.stateTax,
    net: Math.round(net * 100) / 100
  };
}

const money = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plain = n => '$' + Math.round(n).toLocaleString('en-US');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ------------------------------------------------------------- the pairs ---
// `from` = the higher-tax / origin state, `to` = the destination being compared.
const PAIRS = [
  {
    from: 'CA', to: 'TX', slug: 'california-vs-texas', published: '2026-07-31', modified: PUBLISHED,
    copy: {
      hook: '"How much more would I actually take home in Texas?" is one of the most common questions behind a relocation or remote-work decision, and it has a precise answer \u2014 because federal tax and FICA are identical in every state, the entire gap between California and Texas take-home pay comes down to exactly one number: California\u2019s state income tax.',
      pattern: 'The gap does not stay flat as income rises \u2014 it grows, because California\u2019s tax is progressive while Texas\u2019s is a flat zero. For higher earners specifically, the state-tax gap between a state like California and a no-income-tax state widens considerably faster than income does.',
      offsets: 'State income tax is one line in a much larger budget, and for this pair the counterweight is property tax. Texas funds itself without an income tax partly through property tax rates that rank among the highest in the country, and it has no equivalent of California\'s Proposition 13 limit on how fast an assessment can rise. A Texas homeowner can therefore hand back a large share of the income-tax saving through the annual property tax bill, while a Texas renter keeps far more of it.'
    }
  },
  {
    from: 'NY', to: 'FL', slug: 'new-york-vs-florida',
    copy: {
      hook: 'New York to Florida is one of the most travelled relocation routes in the country, and the income-tax half of that decision has an exact answer. Federal tax and FICA are identical in both states, so the entire take-home gap reduces to a single line: New York\u2019s state income tax, against Florida\u2019s zero.',
      pattern: 'New York\u2019s own $8,000 standard deduction takes a bite out of the bill at lower salaries, which is why the gap at $75,000 is smaller than New York\u2019s reputation suggests. It stops helping as income climbs \u2014 by $250,000 the difference is over $1,000 a month, because a fixed deduction matters less and less against a progressive rate schedule.',
      offsets: 'One caveat matters more here than anywhere else on the site: New York City levies its own local income tax on residents, on top of the state tax modelled below. If you live in the five boroughs your real gap against Florida is meaningfully larger than these figures show, because this calculator models state-level tax only. Running the other way, Florida\'s headline household cost is homeowners insurance, which across much of the state has risen far faster than general inflation.'
    }
  },
  {
    from: 'CA', to: 'WA', slug: 'california-vs-washington',
    copy: {
      hook: 'For anyone weighing a move up the west coast \u2014 or negotiating a remote role that could be based in either state \u2014 California versus Washington is the comparison that matters. Washington levies no personal income tax, so every dollar of the difference below is California state tax and nothing else.',
      pattern: 'This is the steepest curve of any pair on the site. California\u2019s brackets climb to 9.3% well before $250,000, so the gap more than doubles between $150,000 and $250,000 alone. Note that Washington funds itself differently \u2014 a higher sales tax, and a capital gains tax on large investment gains that a salaried comparison like this one never touches.',
      offsets: 'Washington funds itself differently rather than more cheaply. It carries one of the highest combined state and local sales tax rates in the country, and it taxes large long-term capital gains \u2014 something a salaried comparison like this one never touches, but which matters a great deal if a meaningful part of your compensation arrives as equity.'
    }
  },
  {
    from: 'IL', to: 'TN', slug: 'illinois-vs-tennessee',
    copy: {
      hook: 'Chicago to Nashville has become a well-worn path, and the tax side of it is unusually simple to model: Illinois charges a flat 4.95% regardless of income, and Tennessee charges nothing at all.',
      pattern: 'Because Illinois is flat rather than progressive, the gap grows in a straight line with taxable income rather than accelerating. That makes this pair predictable in a way the California and New York comparisons are not \u2014 roughly 4.95 cents of every additional taxable dollar, at any salary.',
      offsets: 'Both states lean on other taxes instead. Illinois carries some of the highest effective property tax rates in the country, so an Illinois homeowner\'s total burden is worse than the income tax figure alone suggests. Tennessee has among the highest combined state and local sales tax rates anywhere in the US, which claws back part of the income-tax advantage through everyday spending rather than through a single annual bill.'
    }
  },
  {
    from: 'MA', to: 'NH', slug: 'massachusetts-vs-new-hampshire',
    copy: {
      hook: 'The Massachusetts\u2013New Hampshire border is one of the few places in the country where people routinely live on one side and work on the other specifically because of tax. Massachusetts applies a 5% rate; New Hampshire has no tax on wages at all.',
      pattern: 'The gap tracks a clean 5% of taxable income at every level shown. One important caveat this comparison cannot capture: if you live in New Hampshire but physically work in Massachusetts, Massachusetts generally taxes that income anyway. The figures below describe someone who both lives and works in the state listed.',
      offsets: 'New Hampshire has neither an income tax on wages nor a general sales tax, and pays for that with property tax rates among the highest in the country \u2014 so the advantage below is far larger for a renter than for a homeowner. The other caveat is jurisdictional: if you live in New Hampshire but physically work in Massachusetts, Massachusetts generally taxes that income anyway, and this comparison does not describe you.'
    }
  },
  {
    from: 'OR', to: 'WA', slug: 'oregon-vs-washington',
    copy: {
      hook: 'Portland and Vancouver sit ten minutes apart across the Columbia River, in two states with opposite tax structures. Oregon has one of the highest state income tax burdens on middle incomes in the country; Washington has none.',
      pattern: 'This is the widest gap of any pair here at every salary level, and it is wide from the very bottom \u2014 Oregon\u2019s brackets reach 8.75% at income levels where most states are still in low single digits. The offsetting fact every local knows: Oregon has no sales tax and Washington\u2019s is high, so shopping habits genuinely claw some of this back.',
      offsets: 'Two local factors cut hard against these figures. Residents of the Portland area pay additional local income taxes on top of Oregon state tax, and this calculator models state-level tax only \u2014 so a Portland resident\'s real gap against Washington is wider than shown. Pulling the other way, Oregon has no sales tax at all while Washington\'s is among the highest, which is exactly why cross-river shopping is a local habit rather than a curiosity.'
    }
  },
  {
    from: 'CA', to: 'AZ', slug: 'california-vs-arizona',
    copy: {
      hook: 'Unlike most comparisons involving California, this one is between two states that both tax income \u2014 Arizona simply does it at a flat 2.5%, one of the lowest rates in the country, against California\u2019s progressive schedule.',
      pattern: 'This pair inverts the usual shape. At $75,000 the two states are close enough that income tax alone should not decide anything \u2014 a couple of hundred dollars a year. The divergence is almost entirely a high-earner phenomenon: by $250,000 the annual difference is larger than the entire California tax bill at $75,000, because a flat 2.5% simply cannot keep pace with brackets that reach 9.3%.',
      offsets: 'The offsetting factors here are smaller than in most pairs, which is part of why this comparison is unusually clean. Arizona\'s property tax burden is modest by national standards and its sales tax moderate, so the income tax gap below is closer to the whole story than it would be against Texas or Tennessee. The main omission is housing: the cost gap between California and Arizona metros is large enough to dwarf the tax difference at every income level shown.'
    }
  }
];

// ------------------------------------------------------- template pieces ---
const templateHtml = fs.readFileSync(TEMPLATE, 'utf8');

function slice(startMark, endMark) {
  const a = templateHtml.indexOf(startMark);
  const b = templateHtml.indexOf(endMark, a);
  if (a === -1 || b === -1) throw new Error('Template markers not found: ' + startMark);
  return templateHtml.slice(a, b + endMark.length);
}
// Reuse the live nav and footer so generated pages can never drift out of sync.
const NAV = slice('<nav class="topnav', '</nav>');
const FOOTER = slice('<footer class="site-footer">', '</footer>');
const HEAD_STYLE = slice('<style>', '</style>');

function relatedLinks(currentSlug) {
  // Link every guide to every sibling. With only two siblings each, the newer
  // pages ended up with a single inbound link from the blog index, which is
  // thin for a cluster that is meant to be crawled as a set.
  let out = '    <a href="salary-calculator.html">Salary Calculator</a>\n';
  out += '      <a href="tax-calculator.html">Tax Calculator (US - IRS)</a>\n';
  return out;
}

/** The full set of sibling comparisons, rendered as its own block. */
function siblingBlock(currentSlug) {
  const others = PAIRS.filter(p => p.slug !== currentSlug);
  let items = others.map(p =>
    `    <a href="blog-take-home-pay-${p.slug}.html">${esc(titleOf(p))}</a>`).join('\n');
  return `
<div class="related">
  <p class="label">Compare other states</p>
  <div class="related-list">
${items}
  </div>
</div>
`;
}

function titleOf(pair) {
  const a = scenario(pair.from, 100000).name;
  const b = scenario(pair.to, 100000).name;
  return `${a} vs. ${b}`;
}

// ------------------------------------------------------------- rendering ---
function buildPage(pair) {
  const fromName = scenario(pair.from, 100000).name;
  const toName = scenario(pair.to, 100000).name;
  const title = `Take-Home Pay: ${fromName} vs. ${toName}`;
  const file = `blog-take-home-pay-${pair.slug}.html`;
  const url = `https://myloanmath.com/${file}`;
  const published = pair.published || PUBLISHED;
  const modified = pair.modified || published;

  const rows = LEVELS.map(salary => {
    const A = scenario(pair.from, salary);
    const B = scenario(pair.to, salary);
    const gap = Math.round((B.net - A.net) * 100) / 100;
    return { salary, A, B, gap };
  });

  const toIsFree = rows.every(r => r.B.state === 0);
  const desc = `The same salary, two states — a calculated comparison of take-home pay in ${fromName} vs. ${toName} at $75k, $100k, $150k, and $250k.`;

  let sections = '';
  rows.forEach(r => {
    const better = r.gap >= 0 ? toName : fromName;
    const amount = Math.abs(r.gap);
    sections += `
<h2>At ${plain(r.salary)}</h2>
<div class="figure-box">
  <div class="figure-label">Single filer, ${plain(r.salary)} salary</div>
  <table>
    <tr><th></th><th>${esc(fromName)}</th><th>${esc(toName)}</th></tr>
    <tr><td>Federal tax</td><td>${money(r.A.federal)}</td><td>${money(r.B.federal)}</td></tr>
    <tr><td>State tax</td><td>${money(r.A.state)}</td><td>${money(r.B.state)}</td></tr>
    <tr><td>FICA</td><td>${money(r.A.fica)}</td><td>${money(r.B.fica)}</td></tr>
    <tr><td><strong>Net take-home</strong></td><td><strong>${money(r.A.net)}</strong></td><td><strong>${money(r.B.net)}</strong></td></tr>
  </table>
</div>
<p>${esc(better)} take-home is ${money(amount)} higher &mdash; about ${money(amount / 12)} more per month.</p>
`;
  });

  const spread = `At ${plain(rows[0].salary)} the difference is about ${money(Math.abs(rows[0].gap) / 12)} a month; at ${plain(rows[rows.length - 1].salary)} it is ${money(Math.abs(rows[rows.length - 1].gap) / 12)} a month.`;

  const approximationNote = toIsFree
    ? `${esc(toName)} levies no personal income tax on wages, so its column is federal tax and FICA only. ${esc(fromName)}&rsquo;s figure comes from its own published brackets.`
    : `Both states tax income here, so both columns carry a state figure.`;

  const body = `<header class="page-head">
  <div class="eyebrow">// myloanmath state guide</div>
  <h1 id="main-heading">${esc(title)}</h1>
  <p class="article-meta">Published ${published}${modified !== published ? ' &middot; Updated ' + modified : ''}</p>
</header>

<div class="card article-body">

<p>${pair.copy.hook} Here is what that looks like at four salary levels, computed exactly the way our <a href="salary-calculator.html">salary calculator</a> does it.</p>
${sections}
<h2>The pattern worth noticing</h2>
<p>${pair.copy.pattern} ${spread}</p>

<h2>What this comparison doesn&rsquo;t include</h2>
<p>${pair.copy.offsets}</p>
<p>A note on precision: these figures apply each state&rsquo;s bracket schedule to your <em>federal</em> taxable income. ${approximationNote} States also have their own credits, exemptions and deductions that this model does not carry, so treat the numbers as a close estimate of the gap rather than a filled-in tax return. The <a href="methodology.html">methodology page</a> sets out exactly what is and is not modelled.</p>

<h2>Run your own numbers</h2>
<p>Every figure above assumes a single filer taking the standard federal deduction and nothing else. Your own result will move with filing status, deductions, and your actual salary \u2014 put your real number into the <a href="salary-calculator.html">salary calculator</a> for ${esc(fromName)}, ${esc(toName)}, or any other state, and you can share or bookmark the result straight from the page.</p>

</div>

<div class="ad-slot"><!-- AD SLOT: below article. Paste your AdSense ad unit code here once approved. --></div>

<div class="related">
  <p class="label">Related tools</p>
  <div class="related-list">
${relatedLinks(pair.slug)}  </div>
</div>
${siblingBlock(pair.slug)}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XL6TXYDCLD"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XL6TXYDCLD');
</script>

<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} | MyLoanMath</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<meta property="og:image" content="https://myloanmath.com/assets/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://myloanmath.com/assets/og-image.png">
<link rel="preconnect" href="https://pagead2.googlesyndication.com">
<link rel="icon" type="image/svg+xml" href="favicon.svg">
<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
<link rel="stylesheet" href="style.css">
${HEAD_STYLE}
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Article', headline: title, description: desc,
    datePublished: published, dateModified: modified,
    author: { '@type': 'Organization', name: 'MyLoanMath' },
    publisher: { '@type': 'Organization', name: 'MyLoanMath' },
    mainEntityOfPage: url
  })}</script>
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9412143347948347" crossorigin="anonymous"></script>
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://myloanmath.com/' },
      { '@type': 'ListItem', position: 2, name: title, item: url }
    ]
  })}</script>
</head>
<body>
<a href="#main-heading" class="skip-link">Skip to content</a>
${NAV}
<div class="wrap">
${body}
</div>
${FOOTER}
</body>
</html>
`;

  return { file, html, title, rows, fromName, toName };
}

// ----------------------------------------------------------------- write ---
const built = PAIRS.map(buildPage);
if (require.main === module) {
built.forEach(b => {
  fs.writeFileSync(path.join(SITE, b.file), b.html, 'utf8');
  const first = b.rows[0], last = b.rows[b.rows.length - 1];
  console.log(`wrote ${b.file}`);
  console.log(`   ${b.fromName} vs ${b.toName}: gap ${money(Math.abs(first.gap))} at ${plain(first.salary)} -> ${money(Math.abs(last.gap))} at ${plain(last.salary)}`);
});
console.log(`\n${built.length} pages generated.`);
}
module.exports = { PAIRS, scenario, LEVELS };
