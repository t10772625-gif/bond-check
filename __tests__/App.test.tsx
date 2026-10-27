/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

test('renders the Bond Check splash screen', async () => {
  jest.useFakeTimers();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  try {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain('Bond Check');
  } finally {
    await ReactTestRenderer.act(async () => {
      renderer?.unmount();
    });
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});
