import path from 'node:path';
import { expect, test } from 'vitest';
import { registerService } from '@streamyx/core';
import crunchyroll from '../crunchyroll';

const configPath = path.join(__dirname, './config.json');

test('register service', () => {
  const service = registerService(crunchyroll, { configPath });
  expect(service).toBeDefined();
  expect(service).toHaveProperty('name', 'crunchyroll');
  expect(service).toHaveProperty('api');
  expect(service).toHaveProperty('fetchContentMetadata');
});

test('sign in', async () => {
  const username = '';
  const password = '';
  if (!username || !password) return; // Skip test if credentials are not provided
  const service = registerService(crunchyroll);
  const api = service.api!;
  await api.auth.signIn(username, password);
  console.log(api.auth.state);
  expect(api.auth.state.accessToken).toBeDefined();
  await api.auth.signOut();
});
