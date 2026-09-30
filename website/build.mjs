// Builds the grrunch.com website into website/dist (Anabelle, 2026-09-29):
// a "coming soon" landing page plus the Privacy Policy, Terms of Use and
// Support pages the App Store and Google Play link to.
//
// The legal and support text is NOT copied here. It's read straight from
// the app's own source (app/lib/privacyPolicy.ts, termsOfUse.ts,
// support.ts), so the website and the app always say exactly the same
// thing. Edit the text there, then rebuild:
//
//   node website/build.mjs
//
// .github/workflows/website.yml rebuilds and deploys on every push to main
// that touches those files or this folder.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(HERE, '..', 'app');
const OUT = path.join(HERE, 'dist');
// TypeScript's transpiler: the app's own copy locally, or website/.tooling
// in CI (see .github/workflows/website.yml), which skips the full app install.
function loadTypeScript() {
  try {
    return createRequire(path.join(APP, 'package.json'))('typescript');
  } catch {
    return createRequire(path.join(HERE, '.tooling', 'package.json'))('typescript');
  }
}
const ts = loadTypeScript();

// -- Load the app's TypeScript content modules without the app's runtime.
// Each file is transpiled to CommonJS and run with a tiny require() that
// only knows the sibling lib files. purchases.tsx pulls in the RevenueCat
// SDK, so it's replaced by just the two price strings read from its source.
const cache = new Map();

function purchasesStub() {
  const src = fs.readFileSync(path.join(APP, 'lib', 'purchases.tsx'), 'utf8');
  const price = (name) => {
    const m = src.match(new RegExp(`export const ${name} = '([^']+)'`));
    if (!m) throw new Error(`${name} not found in app/lib/purchases.tsx`);
    return m[1];
  };
  return { MONTHLY_PRICE_DISPLAY: price('MONTHLY_PRICE_DISPLAY'), ANNUAL_PRICE_DISPLAY: price('ANNUAL_PRICE_DISPLAY') };
}

function loadLib(name) {
  if (name === 'purchases') return purchasesStub();
  if (cache.has(name)) return cache.get(name);
  const file = path.join(APP, 'lib', `${name}.ts`);
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const module = { exports: {} };
  const localRequire = (spec) => {
    if (!spec.startsWith('./')) throw new Error(`${name}.ts imports ${spec}, which the website build can't load`);
    return loadLib(spec.slice(2));
  };
  new Function('module', 'exports', 'require', outputText)(module, module.exports, localRequire);
  cache.set(name, module.exports);
  return module.exports;
}

const privacy = loadLib('privacyPolicy');
const terms = loadLib('termsOfUse');
const support = loadLib('support');

// -- HTML helpers --
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const paragraphs = (s) =>
  String(s)
    .split(/\n\n+/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
const emailLinks = (html) =>
  html.replace(/([a-z0-9._%+-]+@grrunch\.com)/gi, '<a href="mailto:$1">$1</a>');

function legalBody({ effectiveDate, intro, sections, outro }) {
  const blocks = sections
    .map((section) => {
      const inner = section.blocks
        .map((b) =>
          b.type === 'text'
            ? paragraphs(b.value)
            : `<ul>${b.items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`
        )
        .join('\n');
      return `<section><h2>${esc(section.title)}</h2>\n${inner}</section>`;
    })
    .join('\n');
  return emailLinks(
    `<p class="effective">Effective ${esc(effectiveDate)}</p>\n${paragraphs(intro)}\n${blocks}${outro ? `\n${paragraphs(outro)}` : ''}`
  );
}

const MASCOT = fs.readFileSync(path.join(APP, 'assets', 'grrunch-illus-01.svg'), 'utf8');
const YEAR = new Date().getFullYear();

// Store marks for the "coming soon" line (Anabelle, 2026-09-29: logos, not
// button-looking pills). Plain ink logos, not links, since the apps aren't
// in the stores yet. At launch, swap for the official badges linking to
// each listing. Apple logo: app/assets/apple-logo-svgrepo-com.svg; the
// Play triangle is drawn here.
const APPLE_LOGO =
  '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="currentColor"><path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.1 22C7.79 22.05 6.8 20.68 5.96 19.47C4.25 17 2.94 12.45 4.7 9.39C5.57 7.87 7.13 6.91 8.82 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z"/></svg>';
const PLAY_LOGO =
  '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M5.5 3.5 19.5 12 5.5 20.5Z" fill="currentColor" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/></svg>';

function page({ title, description, pathName, body, bodyClass = '' }) {
  const canonical = `https://grrunch.com${pathName}`;
  const nav = (href, label) =>
    `<a href="${href}"${pathName === href ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="https://grrunch.com/icon.png">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
</head>
<body class="${bodyClass}">
<header class="top">
  <a class="brand" href="/" aria-label="Grrunch home"><span class="brand-face" aria-hidden="true">${MASCOT}</span><span>Grrunch</span></a>
</header>
<main>
${body}
</main>
<footer class="foot">
  <nav>${nav('/privacy/', 'Privacy Policy')}${nav('/terms/', 'Terms of Use')}${nav('/support/', 'Support')}</nav>
  <p>© ${YEAR} 17216891 Canada Inc. Grrunch is available in British Columbia.</p>
</footer>
</body>
</html>
`;
}

// -- Pages --
const landing = page({
  title: 'Grrunch: meals from this week’s grocery deals',
  description:
    'Grrunch scans BC grocery flyers every week, picks the deals worth buying, and turns them into affordable recipes and your grocery list.',
  pathName: '/',
  bodyClass: 'home',
  body: `<section class="hero">
  <div class="hero-face" aria-hidden="true">${MASCOT}</div>
  <h1>Let the deals decide dinner</h1>
  <p class="lede">Every week, Grrunch scans the grocery flyers, picks the deals actually worth buying, and turns them into affordable recipes and your grocery list.</p>
  <p class="soon">Coming soon to iPhone and Android</p>
  <div class="stores">
    <span class="store-mark">${APPLE_LOGO}<span>App Store</span></span>
    <span class="store-mark">${PLAY_LOGO}<span>Google Play</span></span>
  </div>
  <p class="where">Launching first in British Columbia.</p>
</section>
<section class="cards">
  <article class="card">
    <h2>Leave the deal hunting to us</h2>
    <p>We check Save-On-Foods, Real Canadian Superstore, No Frills, Safeway and Walmart every week.</p>
  </article>
  <article class="card">
    <h2>Recipes built on real sales</h2>
    <p>Every recipe starts from this week’s deals, with the price per serving worked out for you.</p>
  </article>
  <article class="card">
    <h2>One list, every store</h2>
    <p>Add recipes and deals, and your grocery list sorts itself by store.</p>
  </article>
</section>`,
});

const privacyPage = page({
  title: 'Privacy Policy | Grrunch',
  description: 'How Grrunch collects, uses and protects your information.',
  pathName: '/privacy/',
  body: `<article class="doc"><h1>Privacy Policy</h1>\n${legalBody({
    effectiveDate: privacy.PRIVACY_POLICY_EFFECTIVE_DATE,
    intro: privacy.PRIVACY_POLICY_INTRO,
    sections: privacy.PRIVACY_POLICY_SECTIONS,
  })}</article>`,
});

const termsPage = page({
  title: 'Terms of Use | Grrunch',
  description: 'The terms for using Grrunch and Grrunch Membership.',
  pathName: '/terms/',
  body: `<article class="doc"><h1>Terms of Use</h1>\n${legalBody({
    effectiveDate: terms.TERMS_OF_USE_EFFECTIVE_DATE,
    intro: terms.TERMS_OF_USE_INTRO,
    sections: terms.TERMS_OF_USE_SECTIONS,
    outro: terms.TERMS_OF_USE_OUTRO,
  })}</article>`,
});

const faq = support.FAQ_ITEMS.map((item) => {
  // true = the live, purchases-configured answer (see app/lib/support.ts).
  const answer = typeof item.answer === 'function' ? item.answer(true) : item.answer;
  return `<details class="faq"><summary>${esc(item.question)}</summary>${paragraphs(answer)}</details>`;
}).join('\n');

const supportPage = page({
  title: 'Support | Grrunch',
  description: 'Get help with Grrunch.',
  pathName: '/support/',
  body: `<article class="doc"><h1>Support</h1>
<p>Questions, feedback or trouble with your membership? Email us and we’ll get back to you.</p>
<p><a class="button" href="mailto:${esc(support.SUPPORT_EMAIL)}">${esc(support.SUPPORT_EMAIL)}</a></p>
<h2>Frequently asked questions</h2>
${faq}
</article>`,
});

// -- Write --
fs.rmSync(OUT, { recursive: true, force: true });
const write = (rel, content) => {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
write('index.html', landing);
write('privacy/index.html', privacyPage);
write('terms/index.html', termsPage);
write('support/index.html', supportPage);
write('404.html', landing.replace('<main>', '<main><p class="notfound">That page doesn’t exist. Here’s the home page.</p>'));
write('CNAME', 'grrunch.com\n');
fs.copyFileSync(path.join(HERE, 'styles.css'), path.join(OUT, 'styles.css'));
fs.copyFileSync(path.join(APP, 'assets', 'favicon.png'), path.join(OUT, 'favicon.png'));
fs.copyFileSync(path.join(APP, 'assets', 'icon.png'), path.join(OUT, 'icon.png'));
console.log(`Built ${OUT}`);
