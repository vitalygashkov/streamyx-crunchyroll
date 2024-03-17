import type { StreamyxInstance } from 'streamyx-plugin';
import type { AuthState, CmsAuthResponse } from './types';
import { ROUTES } from './constants';

const HEADERS = {
  authorization: 'Basic b2VkYXJteHN0bGgxanZhd2ltbnE6OWxFaHZIWkpEMzJqdVY1ZFc5Vk9TNTdkb3BkSnBnbzE=',
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
};

const buildRequestOptions = (params: Record<string, string>) => {
  return { method: 'POST', body: new URLSearchParams(params).toString(), headers: HEADERS };
};

const state: AuthState = {};

export const useAuth = (streamyx: StreamyxInstance, storeFilePath: string) => {
  const promptCredentials = async () => {
    const username = await streamyx.prompt.waitForInput('Username');
    const password = await streamyx.prompt.waitForInput('Password');
    return { username, password };
  };

  const fetchCmsAuth = async (accessToken: string) => {
    const requestOptions = { method: 'GET', headers: { authorization: `Bearer ${accessToken}` } };
    const response = await streamyx.http.fetch(ROUTES.index, requestOptions);
    if (response.status !== 200) {
      streamyx.log.error(`Can't get CMS token. Status code: ${response.status}`);
      streamyx.log.debug(await response.text());
      return;
    }
    return (await response.json()) as CmsAuthResponse;
  };

  return {
    state,

    async loadState() {
      streamyx.log.debug(`Loading auth state from ${storeFilePath}`);
      const data = await streamyx.fs.readJson<AuthState>(storeFilePath).catch<AuthState>(() => ({}));
      streamyx.http.setHeader('authorization', `Bearer ${data.accessToken}`);
      Object.assign(state, data);
      return data;
    },

    async saveState(data: AuthState) {
      Object.assign(state, data);
      await streamyx.fs.writeJson(storeFilePath, data);
    },

    checkToken() {
      const TIME_MARGIN = 60000;
      const hasToken = !!state.accessToken && !!state.refreshToken && !!state.cmsAuth?.cms;
      const isTokenExpired = hasToken && Number(state.expires) - TIME_MARGIN < new Date().getTime();
      return { hasToken, isTokenExpired };
    },

    async fetchToken(params: Record<string, string>) {
      try {
        const options = buildRequestOptions({ ...params, scope: 'offline_access' });
        const response = await streamyx.http.fetch(ROUTES.token, options);
        const auth: any = await response.json();
        const error = auth.error || response.status !== 200;
        if (!error) {
          const cmsAuth = await fetchCmsAuth(auth.access_token);
          const newState: AuthState = {
            accessToken: auth.access_token,
            refreshToken: auth.refresh_token,
            expires: new Date().getTime() + auth.expires_in * 1000,
            tokenType: auth.token_type,
            scope: auth.scope,
            country: auth.country,
            accountId: auth.account_id,
            cookies: streamyx.http.headers.cookie,
            cmsAuth,
          };
          streamyx.http.setHeader('authorization', `Bearer ${newState.accessToken}`);
          await this.saveState(newState);
          return newState;
        }
      } catch (e: any) {
        streamyx.log.debug(`Auth failed: ${e.message}`);
        process.exit(1);
      }
    },

    async fetchAccessToken(username: string, password: string) {
      return this.fetchToken({ grant_type: 'password', username, password });
    },

    async fetchRefreshToken(refreshToken: string) {
      return this.fetchToken({ grant_type: 'refresh_token', refresh_token: refreshToken });
    },

    async signIn() {
      await this.loadState();
      const { hasToken, isTokenExpired } = this.checkToken();
      if (!hasToken) {
        streamyx.log.debug(`Requesting credentials`);
        const { username, password } = await promptCredentials();
        streamyx.log.debug(`Requesting token`);
        await this.fetchAccessToken(username, password);
      } else if (isTokenExpired) {
        streamyx.log.debug(`Refreshing token`);
        if (state.refreshToken) await this.fetchRefreshToken(state.refreshToken);
      }
    },
  };
};
