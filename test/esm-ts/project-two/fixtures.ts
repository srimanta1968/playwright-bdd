import { test as base } from '../fixtures.js';

export const test = base.extend<{ anotherOption: string }>({
  anotherOption: ['bar', { option: true }],
});