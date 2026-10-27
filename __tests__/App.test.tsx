/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
jest.mock('../src/cloud/generatedConfig', () => ({
  cloudConfig: {
    url: 'https://dwagvpxegvixgztmovyx.supabase.co',
    publishableKey: '',
  },
}));

test('renders the Bond Check splash screen', async () => {
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
  }
}, 120000);
