import 'jest-location-mock';

global.fetch = jest.fn();

// Polyfill for crypto.subtle in jsdom (Node 19+ has it, but jsdom needs help)
if (typeof global.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  (global as any).TextEncoder = TextEncoder;
  (global as any).TextDecoder = TextDecoder;
}

beforeAll(() => {});

afterAll(() => {});
