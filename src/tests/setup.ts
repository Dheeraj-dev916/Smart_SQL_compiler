import '@testing-library/jest-dom/vitest';

// jsdom lacks layout APIs that CodeMirror touches when measuring text.
const emptyRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
const zeroRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() {} }) as DOMRect;
if (typeof Range !== 'undefined') {
  Range.prototype.getClientRects ??= emptyRects;
  Range.prototype.getBoundingClientRect ??= zeroRect;
}
if (typeof document !== 'undefined') document.elementFromPoint ??= () => null;
