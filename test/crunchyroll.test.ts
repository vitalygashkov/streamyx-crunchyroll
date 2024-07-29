import path from 'node:path';
import { expect, test } from 'vitest';
import { create } from '@streamyx/core';
import { crunchyroll } from '../crunchyroll';

const configPath = path.join(__dirname, './config.json');

test('create plugin', () => {
  const core = create(crunchyroll.name);
  const plugin = crunchyroll({ configPath })(core);
  expect(plugin).toBeDefined();
  expect(plugin).toHaveProperty('name', 'crunchyroll');
  expect(plugin).toHaveProperty('api');
  expect(plugin).toHaveProperty('fetchMediaInfo');
});

test('sign in', async () => {
  const username = '';
  const password = '';
  if (!username || !password) return; // Skip test if credentials are not provided
  const core = create(crunchyroll.name);
  const plugin = crunchyroll({ configPath })(core);
  await plugin.api.auth.signIn(username, password);
  console.log(plugin.api.auth.state);
  expect(plugin.api.auth.state.accessToken).toBeDefined();
  await plugin.api.auth.signOut();
});
