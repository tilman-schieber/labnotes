// Code 128 (subset B) as an SVG, for printable labels. Any scanner reads it back as the plain
// text, which a `#` lookup resolves by the entity's barcode attribute.

// Bar/space widths for values 0–106 (103–105 are the start codes, 106 the stop pattern).
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];

const START_B = 104;
const STOP = 106;

// Symbol values for `text` in subset B, including start, checksum and stop.
export function code128Values(text: string): number[] {
  const values = [START_B];
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code < 32 || code > 126) {
      throw new Error(`Code 128 B cannot encode "${char}"`);
    }
    values.push(code - 32);
  }
  const checksum = values.reduce((sum, value, index) => sum + value * Math.max(1, index), 0) % 103;
  values.push(checksum, STOP);
  return values;
}

// Module widths, bars and spaces alternating, bar first.
export function code128Widths(text: string): number[] {
  return code128Values(text).flatMap((value) => [...PATTERNS[value]].map(Number));
}

export function code128Svg(text: string, options: { height?: number; module?: number; quiet?: number; label?: boolean } = {}): string {
  const { height = 44, module = 2, quiet = 10, label = true } = options;
  const widths = code128Widths(text);
  const total = widths.reduce((sum, width) => sum + width, 0) + 2 * quiet;
  const width = total * module;
  const textHeight = label ? 14 : 0;
  let x = quiet * module;
  const bars: string[] = [];
  widths.forEach((modules, index) => {
    const w = modules * module;
    if (index % 2 === 0) {
      bars.push(`<rect x="${x}" y="0" width="${w}" height="${height}" />`);
    }
    x += w;
  });
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const caption = label ? `<text x="${width / 2}" y="${height + 11}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="11">${escaped}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + textHeight}" viewBox="0 0 ${width} ${height + textHeight}" shape-rendering="crispEdges" fill="#000">${bars.join('')}${caption}</svg>`;
}

// A short, scanner-friendly code: a type prefix and six characters without look-alikes.
export function newBarcode(type: string): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const prefix = { compound: 'CP', batch: 'BT', reagent: 'RG', sample: 'SM', specimen: 'SP', instrument: 'IN', container: 'CT', location: 'LC' }[type] ?? 'LN';
  let code = '';
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `${prefix}-${code}`;
}
