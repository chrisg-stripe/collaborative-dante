import { buildStrippedIndexMap, stripProofSpanTags } from '../../server/proof-span-strip.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${String(expected)}, got ${String(actual)}`);
  }
}

function run(): void {
  const markdown = [
    'Hello ',
    '<span data-proof="authored" data-by="ai:test">draft</span>',
    ' and ',
    '<span data-proof="comment" data-id="c1" data-by="human:test">commented</span>',
    ' text.',
  ].join('');

  const stripped = stripProofSpanTags(markdown);
  assertEqual(
    stripped,
    'Hello draft and <span data-proof="comment" data-id="c1" data-by="human:test">commented</span> text.',
    'Expected authored spans to be stripped while comment spans remain intact',
  );

  const { stripped: mapped, map } = buildStrippedIndexMap(markdown);
  assertEqual(mapped, stripped, 'Expected stripped index map to preserve the same output as stripProofSpanTags');

  const commentSpanStart = mapped.indexOf('<span data-proof="comment"');
  assert(commentSpanStart >= 0, 'Expected comment span markup to remain in mapped output');
  assertEqual(
    markdown[map[commentSpanStart] ?? -1],
    '<',
    'Expected mapped comment span start to point back to the original comment markup',
  );

  const authoredTextStart = mapped.indexOf('draft');
  assert(authoredTextStart >= 0, 'Expected authored span text to remain after stripping wrapper');
  assertEqual(
    markdown[map[authoredTextStart] ?? -1],
    'd',
    'Expected authored text to map back to the original authored content',
  );

  console.log('✓ proof span stripping preserves non-authored marks');
}

run();
