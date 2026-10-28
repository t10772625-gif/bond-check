import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { AutomationStatus, CloudLoginScreen } from '../src/cloud/CloudScreens';
import { Seg } from '../src/components/ui';
const mockSignIn = jest.fn().mockResolvedValue(undefined);
const mockSignUp = jest.fn().mockResolvedValue({ confirmationRequired: true });
jest.mock('../src/store/AppStore', () => ({
  useApp: () => ({
    big: false,
    toast: jest.fn(),
    automation: {
      configured: true,
      loaded: true,
      error: '',
      busy: false,
      session: null,
      snapshot: { status: { verified: 164, total: 177, pending_jobs: 0 } },
      complete: false,
      connected: true,
      signIn: mockSignIn,
      signUp: mockSignUp,
    },
  }),
}));

test('incomplete coverage renders its counts and warning inside native Text', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  try {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<AutomationStatus />);
    });
    const visibleText = renderer!.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .join(' ');
    expect(visibleText).toContain('164 of 177 known draws verified');
    expect(visibleText).toContain('Checking is incomplete.');
  } finally {
    await ReactTestRenderer.act(async () => renderer?.unmount());
  }
}, 120000);

test('cloud login submits to the cloud account flow without local demo authentication', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  try {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<CloudLoginScreen />);
    });
    const fields = renderer!.root.findAllByType(TextInput);
    await ReactTestRenderer.act(async () => {
      fields[0].props.onChangeText('owner@example.com');
      fields[1].props.onChangeText('example-password');
    });
    await ReactTestRenderer.act(async () => {
      renderer!.root.findByProps({ title: 'Log in' }).props.onPress();
    });
    expect(mockSignIn).toHaveBeenCalledWith(
      'owner@example.com',
      'example-password',
    );
    expect(JSON.stringify(renderer!.toJSON())).toContain('Each account keeps its own private bonds');
  } finally {
    await ReactTestRenderer.act(async () => {
      renderer?.unmount();
    });
  }
}, 120000);

test('original signup layout validates and submits a real cloud registration flow', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  try {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<CloudLoginScreen />);
    });
    await ReactTestRenderer.act(async () => {
      renderer!.root.findByType(Seg).props.onChange('signup');
    });
    const fields = renderer!.root.findAllByType(TextInput);
    expect(fields).toHaveLength(4);
    await ReactTestRenderer.act(async () => {
      fields[0].props.onChangeText('Test Owner');
      fields[1].props.onChangeText('owner@example.com');
      fields[2].props.onChangeText('example-password');
      fields[3].props.onChangeText('example-password');
    });
    await ReactTestRenderer.act(async () => {
      const press = renderer!.root.findByProps({ title: 'Create account' }).props.onPress;
      await Promise.all([press(), press(), press()]);
    });
    expect(mockSignUp).toHaveBeenCalledWith(
      'Test Owner',
      'owner@example.com',
      'example-password',
    );
    expect(mockSignUp).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(renderer!.toJSON())).toContain('Check your email');
  } finally {
    await ReactTestRenderer.act(async () => {
      renderer?.unmount();
    });
  }
}, 120000);
