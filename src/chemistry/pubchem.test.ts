import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseGhs } from './pubchem.ts';

// The shape PUG View returns for `?heading=GHS+Classification`, trimmed to what matters.
const record = {
  Record: {
    RecordType: 'CID',
    RecordNumber: 1118,
    Section: [
      {
        TOCHeading: 'Safety and Hazards',
        Section: [
          {
            TOCHeading: 'Hazards Identification',
            Section: [
              {
                TOCHeading: 'GHS Classification',
                Information: [
                  {
                    Name: 'Pictogram(s)',
                    Value: {
                      StringWithMarkup: [
                        {
                          String: 'Corrosive Acute Toxic',
                          Markup: [
                            { URL: 'https://pubchem.ncbi.nlm.nih.gov/images/ghs/GHS05.svg', Extra: 'Corrosive' },
                            { URL: 'https://pubchem.ncbi.nlm.nih.gov/images/ghs/GHS06.svg', Extra: 'Acute Toxic' }
                          ]
                        }
                      ]
                    }
                  },
                  { Name: 'Signal', Value: { StringWithMarkup: [{ String: 'Danger' }] } },
                  {
                    Name: 'GHS Hazard Statements',
                    Value: {
                      StringWithMarkup: [
                        { String: 'H290 (18.6%): May be corrosive to metals [Warning Corrosive to Metals]' },
                        { String: 'H314 (100%): Causes severe skin burns and eye damage [Danger Skin corrosion/irritation]' },
                        { String: 'H314 (95%): Causes severe skin burns and eye damage [Danger Skin corrosion/irritation]' }
                      ]
                    }
                  },
                  { Name: 'Precautionary Statement Codes', Value: { StringWithMarkup: [{ String: 'P234, P260, P280, P301+P330+P331, and P305+P351+P338' }] } },
                  { Name: 'Signal', Value: { StringWithMarkup: [{ String: 'Warning' }] } }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
};

test('a PUG View GHS section becomes a compact summary', () => {
  const ghs = parseGhs(record)!;
  assert.equal(ghs.signalWord, 'Danger', 'Danger wins over Warning across sources');
  assert.deepEqual(ghs.pictograms, ['GHS05', 'GHS06']);
  assert.deepEqual(ghs.hStatements, [
    { code: 'H290', text: 'May be corrosive to metals' },
    { code: 'H314', text: 'Causes severe skin burns and eye damage' }
  ]);
  assert.deepEqual(ghs.pCodes, ['P234', 'P260', 'P280', 'P301+P330+P331', 'P305+P351+P338']);
  assert.equal(ghs.source, 'pubchem');
});

test('records without a GHS section give null', () => {
  assert.equal(parseGhs({ Record: { Section: [{ TOCHeading: 'Names and Identifiers' }] } }), null);
  assert.equal(parseGhs({}), null);
  assert.equal(parseGhs(null), null);
});
