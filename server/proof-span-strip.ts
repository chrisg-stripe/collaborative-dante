const authoredProofAttrRegex = /data-proof\s*=\s*(?:"authored"|'authored'|authored)/i;

type AuthoredSpanBounds = {
  openStart: number;
  contentStart: number;
  contentEnd: number;
  closeEnd: number;
};

function isAuthoredProofSpan(tag: string): boolean {
  return authoredProofAttrRegex.test(tag);
}

/**
 * Strip Proof-authored `<span data-proof="authored" ...>` HTML tags from markdown,
 * leaving the inner text content intact. Non-Proof `<span>` tags are preserved.
 *
 * Used by:
 * - Agent snapshot endpoint (block markdown)
 * - Agent edit operations (anchor/search matching)
 * - Share text/markdown content negotiation
 */
export function stripProofSpanTags(markdown: string): string {
  const spanTagRegex = /<\/?span\b[^>]*>/gi;
  const proofStack: boolean[] = [];
  let result = '';
  let lastIndex = 0;

  for (const match of markdown.matchAll(spanTagRegex)) {
    const index = match.index ?? -1;
    if (index < 0) continue;
    const tag = match[0];

    result += markdown.slice(lastIndex, index);
    lastIndex = index + tag.length;

    const isClosing = tag.startsWith('</');
    if (isClosing) {
      if (proofStack.length === 0) {
        result += tag;
        continue;
      }
      const isProof = proofStack.pop();
      if (!isProof) {
        result += tag;
      }
      continue;
    }

    const isProof = isAuthoredProofSpan(tag);
    proofStack.push(isProof);
    if (!isProof) {
      result += tag;
    }
  }

  result += markdown.slice(lastIndex);
  return result;
}

/**
 * Build a mapping from stripped-text indices back to original-text indices.
 * Returns an array where strippedToOriginal[i] is the index in the original
 * string corresponding to position i in the stripped string.
 */
export function buildStrippedIndexMap(markdown: string): { stripped: string; map: number[] } {
  const spanTagRegex = /<\/?span\b[^>]*>/gi;
  const proofStack: boolean[] = [];
  const resultChars: string[] = [];
  const indexMap: number[] = [];
  let lastIndex = 0;

  for (const match of markdown.matchAll(spanTagRegex)) {
    const matchIndex = match.index ?? -1;
    if (matchIndex < 0) continue;
    const tag = match[0];

    // Copy characters between last tag and this tag
    for (let i = lastIndex; i < matchIndex; i++) {
      resultChars.push(markdown[i]);
      indexMap.push(i);
    }
    lastIndex = matchIndex + tag.length;

    const isClosing = tag.startsWith('</');
    if (isClosing) {
      if (proofStack.length === 0) {
        // Non-proof closing tag — keep it
        for (let i = matchIndex; i < matchIndex + tag.length; i++) {
          resultChars.push(markdown[i]);
          indexMap.push(i);
        }
        continue;
      }
      const isProof = proofStack.pop();
      if (!isProof) {
        for (let i = matchIndex; i < matchIndex + tag.length; i++) {
          resultChars.push(markdown[i]);
          indexMap.push(i);
        }
      }
      // Proof closing tags are stripped (not added to result)
      continue;
    }

    const isProof = isAuthoredProofSpan(tag);
    proofStack.push(isProof);
    if (!isProof) {
      for (let i = matchIndex; i < matchIndex + tag.length; i++) {
        resultChars.push(markdown[i]);
        indexMap.push(i);
      }
    }
    // Proof opening tags are stripped (not added to result)
  }

  // Copy remaining characters after last tag
  for (let i = lastIndex; i < markdown.length; i++) {
    resultChars.push(markdown[i]);
    indexMap.push(i);
  }

  return { stripped: resultChars.join(''), map: indexMap };
}

export function listAuthoredProofSpanBounds(markdown: string): AuthoredSpanBounds[] {
  const spanTagRegex = /<\/?span\b[^>]*>/gi;
  const stack: Array<{ authored: boolean; openStart: number; contentStart: number }> = [];
  const spans: AuthoredSpanBounds[] = [];

  for (const match of markdown.matchAll(spanTagRegex)) {
    const matchIndex = match.index ?? -1;
    if (matchIndex < 0) continue;
    const tag = match[0];

    if (tag.startsWith('</')) {
      const entry = stack.pop();
      if (!entry?.authored) continue;
      spans.push({
        openStart: entry.openStart,
        contentStart: entry.contentStart,
        contentEnd: matchIndex,
        closeEnd: matchIndex + tag.length,
      });
      continue;
    }

    stack.push({
      authored: isAuthoredProofSpan(tag),
      openStart: matchIndex,
      contentStart: matchIndex + tag.length,
    });
  }

  return spans;
}

export function expandRangeToIncludeFullyWrappedAuthoredSpan(
  markdown: string,
  start: number,
  end: number,
): { start: number; end: number } {
  let nextStart = start;
  let nextEnd = end;

  for (const span of listAuthoredProofSpanBounds(markdown)) {
    if (nextStart === span.contentStart && nextEnd === span.contentEnd) {
      nextStart = span.openStart;
      nextEnd = span.closeEnd;
      break;
    }
  }

  return { start: nextStart, end: nextEnd };
}

export function moveIndexPastTrailingAuthoredSpans(markdown: string, index: number): number {
  let nextIndex = index;

  while (true) {
    let advanced = false;
    let bestCloseEnd = nextIndex;

    for (const span of listAuthoredProofSpanBounds(markdown)) {
      if (span.contentEnd === nextIndex && span.closeEnd > bestCloseEnd) {
        bestCloseEnd = span.closeEnd;
        advanced = true;
      }
    }

    if (!advanced) return nextIndex;
    nextIndex = bestCloseEnd;
  }
}
