import assert from 'node:assert/strict';
import { test } from 'node:test';
import { code128Svg, code128Values, code128Widths, newBarcode } from './code128.ts';

test('subset B values carry start, checksum and stop', () => {
  // "A" is value 33; checksum = (104 + 33·1) mod 103 = 34.
  assert.deepEqual(code128Values('A'), [104, 33, 34, 106]);
  // "RG-7K3Q" → the published way of computing the check digit: Σ value·position mod 103.
  const values = code128Values('RG-7K3Q');
  assert.equal(values[0], 104);
  assert.equal(values[values.length - 1], 106);
  const payload = values.slice(0, -2);
  assert.equal(values[values.length - 2], payload.reduce((sum, value, index) => sum + value * Math.max(1, index), 0) % 103);
  assert.throws(() => code128Values('ü'));
});

test('every symbol is eleven modules wide, the stop thirteen', () => {
  const widths = code128Widths('Tube 14');
  const symbols = code128Values('Tube 14').length;
  assert.equal(widths.length, 6 * (symbols - 1) + 7);
  assert.equal(
    widths.reduce((sum, width) => sum + width, 0),
    11 * (symbols - 1) + 13
  );
});

test('svg has bars and a caption, and barcodes are short with a type prefix', () => {
  const svg = code128Svg('SM-ABC234');
  assert.match(svg, /^<svg /);
  assert.match(svg, /<rect /);
  assert.match(svg, />SM-ABC234<\/text>/);
  assert.match(newBarcode('sample'), /^SM-[A-HJ-NP-Z2-9]{6}$/);
  assert.match(newBarcode('unknown'), /^LN-/);
});
