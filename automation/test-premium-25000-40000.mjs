// Additional tests written for integration. The separate premium test mentioned in
// the supplied spec was not present in Downloads and has not been represented as supplied.
import assert from 'node:assert/strict';
import { parseDrawText, validate } from './prizebond-parser.mjs';
for (const sample of [
  {
    den: 25000,
    no: 23,
    first: ['151975', '154149'],
    second: ['322522', '428227', '504842', '579060', '647138'],
    third: 700,
  },
  {
    den: 40000,
    no: 38,
    first: ['308105'],
    second: ['222525', '282397', '765216'],
    third: 660,
  },
]) {
  const text =
    `${sample.no}th DRAW OF Rs.${sample.den}/- DENOMINATION PREMIUM PRIZE BONDS\nHELD ON 10-09-2026\nFirst Prize\n` +
    sample.first.join(' ') +
    '\nSecond Prize\n' +
    sample.second.join(' ') +
    '\nThird Prize\n' +
    Array.from({ length: sample.third }, (_, i) => String(i + 100000)).join(
      '\n',
    );
  const result = parseDrawText(text, { denomination: sample.den });
  assert.deepEqual(result.first, sample.first);
  assert.deepEqual(result.second, sample.second);
  assert.equal(validate(result).ok, true);
  console.log(
    `ok premium Rs${sample.den}: first=${result.first.length}, second=${result.second.length}, third=${result.third.length}`,
  );
}
