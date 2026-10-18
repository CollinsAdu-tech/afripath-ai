import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom has no IntersectionObserver or scrollTo; the app's own fallbacks cover the first, stub the others.
window.scrollTo = () => {};
Element.prototype.scrollIntoView = () => {};

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
});
