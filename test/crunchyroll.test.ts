import path from 'node:path';
import { expect, test } from 'vitest';
import { StreamyxInstance, fs, http, logger as log, prompt } from '@streamyx/core';
import { crunchyroll } from '../crunchyroll';

const streamyx: StreamyxInstance = { log, http, prompt, fs };

const configPath = path.join(__dirname, './config.json');

test('create plugin', () => {
  const plugin = crunchyroll({ configPath })(streamyx);
  expect(plugin).toBeDefined();
  expect(plugin).toHaveProperty('name', 'crunchyroll');
  expect(plugin).toHaveProperty('api');
  expect(plugin).toHaveProperty('fetchMediaInfo');
});

test('sign in', async () => {
  const username = '';
  const password = '';
  if (!username || !password) return; // Skip test if credentials are not provided
  const plugin = crunchyroll({ configPath })(streamyx);
  await plugin.api.auth.signIn(username, password);
  console.log(plugin.api.auth.state);
  expect(plugin.api.auth.state.accessToken).toBeDefined();
  await plugin.api.auth.signOut();
});
