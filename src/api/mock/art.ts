/**
 * Generates placeholder artwork as SVG data URIs, so the approval viewer has
 * real images to show without any external hosting. Phase 1 replaces these with
 * short-lived signed links to the stored files and their rendered previews.
 */

const PALETTES = [
  ['#0F1B33', '#F4E9D8', '#D40000'],
  ['#1F4D3A', '#F3F0E6', '#E3A72F'],
  ['#3B2A5C', '#FBEFF4', '#E2557A'],
  ['#12384A', '#EAF4F4', '#2BA59B'],
  ['#5A2E12', '#FFF4E6', '#F07A28'],
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const uri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** A 4:5 social post. `variant` changes palette and layout so versions look different. */
export function post(headline: string, brand: string, n: number, variant = 0): string {
  const [bg, fg, accent] = PALETTES[(n + variant) % PALETTES.length];
  const circleX = variant % 2 ? 300 : 620;
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
<rect width="800" height="1000" fill="${bg}"/>
<circle cx="${circleX}" cy="380" r="230" fill="${accent}" opacity=".9"/>
<circle cx="${circleX}" cy="380" r="150" fill="${fg}" opacity=".18"/>
<rect x="60" y="640" width="680" height="4" fill="${fg}" opacity=".4"/>
<text x="60" y="730" font-family="Inter,Arial,sans-serif" font-size="58" font-weight="800" fill="${fg}">${esc(headline)}</text>
<text x="60" y="800" font-family="Inter,Arial,sans-serif" font-size="28" fill="${fg}" opacity=".75">Post ${n} · v${variant + 1}</text>
<rect x="60" y="880" width="${variant ? 200 : 160}" height="56" rx="28" fill="${variant ? accent : fg}"/>
<text x="${variant ? 160 : 140}" y="917" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="700" fill="${variant ? fg : bg}">${variant ? 'Order now' : 'Shop'}</text>
<text x="740" y="80" text-anchor="end" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="800" fill="${fg}">${esc(brand)}</text>
</svg>`);
}

/** A tall web page design with blocks, like a homepage mock-up. */
export function webPage(title: string, brand: string, variant = 0): string {
  const [bg, fg, accent] = PALETTES[variant % PALETTES.length];
  const block = (y: number, h: number, fill: string, op = 1) => `<rect x="80" y="${y}" width="1040" height="${h}" rx="16" fill="${fill}" opacity="${op}"/>`;
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800" viewBox="0 0 1200 1800">
<rect width="1200" height="1800" fill="#ffffff"/>
<rect width="1200" height="90" fill="${bg}"/>
<text x="80" y="58" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="800" fill="${fg}">${esc(brand)}</text>
<text x="1120" y="56" text-anchor="end" font-family="Inter,Arial,sans-serif" font-size="20" fill="${fg}">Menu   Stores   About   Order</text>
<rect y="90" width="1200" height="620" fill="${variant ? accent : bg}" opacity=".95"/>
<text x="80" y="330" font-family="Inter,Arial,sans-serif" font-size="76" font-weight="800" fill="#fff">${esc(title)}</text>
<text x="80" y="400" font-family="Inter,Arial,sans-serif" font-size="28" fill="#fff" opacity=".8">Version ${variant + 1} · hero, menu highlights, stores</text>
<rect x="80" y="470" width="240" height="70" rx="35" fill="#fff"/>
${[0, 1, 2].map((i) => `<rect x="${80 + i * 360}" y="780" width="320" height="300" rx="16" fill="${PALETTES[(i + variant) % 5][0]}" opacity=".85"/>`).join('')}
${block(1140, 40, '#e5e5e5')}${block(1200, 24, '#efefef')}${block(1240, 24, '#efefef')}
${block(1320, 300, bg, 0.1)}
<rect y="1680" width="1200" height="120" fill="${bg}"/>
</svg>`);
}

/** One page of a document (calendar, report, brand book). */
export function docPage(title: string, page: number, pages: number, variant = 0): string {
  const [bg, , accent] = PALETTES[variant % PALETTES.length];
  const rows = Array.from({ length: 12 }, (_, i) => {
    const y = 300 + i * 70;
    return `<rect x="80" y="${y}" width="${560 - ((i * 53) % 220)}" height="18" rx="9" fill="#d9d9d9"/><rect x="700" y="${y - 6}" width="140" height="30" rx="6" fill="${i % 3 === 0 ? accent : '#eeeeee'}" opacity="${i % 3 === 0 ? 0.25 : 1}"/>`;
  }).join('');
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" width="920" height="1300" viewBox="0 0 920 1300">
<rect width="920" height="1300" fill="#fff"/>
<rect width="920" height="12" fill="${bg}"/>
<text x="80" y="150" font-family="Inter,Arial,sans-serif" font-size="44" font-weight="800" fill="#111">${esc(title)}</text>
<text x="80" y="200" font-family="Inter,Arial,sans-serif" font-size="22" fill="#777">Page ${page} of ${pages} · v${variant + 1}</text>
${rows}
<text x="840" y="1250" text-anchor="end" font-family="Inter,Arial,sans-serif" font-size="18" fill="#999">Webinger</text>
</svg>`);
}
