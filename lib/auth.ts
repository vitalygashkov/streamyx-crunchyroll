import type { StreamyxCore } from '@streamyx/core';
import type { AuthState, CmsAuthResponse } from './types';
import { DEVICE, ROUTES } from './constants';

export const HEADERS = {
  authorization: DEVICE.authorization,
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'User-Agent': DEVICE.userAgent,
};

const buildRequestOptions = (params: Record<string, string>) => {
  return { method: 'POST', body: new URLSearchParams(params).toString(), headers: HEADERS };
};

export const createAuth = (core: StreamyxCore) => {
  const promptCredentials = async () => {
    const { username, password } = await core.prompt.ask({
      username: { label: 'Username' },
      password: { label: 'Password' },
    });
    return { username, password };
  };

  const fetchCmsAuth = async (accessToken: string) => {
    const requestOptions = { method: 'GET', headers: { authorization: `Bearer ${accessToken}` } };
    const response = await core.http.fetch(ROUTES.index, requestOptions);
    if (response.status !== 200) {
      core.log.error(`Can't get CMS token. Status code: ${response.status}`);
      core.log.debug(await response.text());
      return;
    }
    return (await response.json()) as CmsAuthResponse;
  };

  return {
    checkToken() {
      const TIME_MARGIN = 60000;
      const hasToken =
        !!core.store.state.accessToken &&
        !!core.store.state.refreshToken &&
        !!core.store.state.cmsAuth?.cms;
      const isTokenExpired =
        hasToken && Number(core.store.state.expires) - TIME_MARGIN < new Date().getTime();
      return { hasToken, isTokenExpired };
    },

    async fetchToken(params: Record<string, string>) {
      try {
        const deviceId = core.store.state.deviceId || DEVICE.id;
        const deviceType = core.store.state.deviceType || DEVICE.type;
        const options = buildRequestOptions({
          ...params,
          scope: 'offline_access',
          device_id: deviceId,
          device_type: deviceType,
        });
        const response = await core.http.fetch(ROUTES.token, options);
        const auth: any = await response.json();
        const error = auth.error || response.status !== 200;
        if (error) {
          core.log.error(
            `Can't get token. Status code: ${response.status}. Message: ${auth.error}. Logging out...`
          );
          core.log.debug(JSON.stringify(auth));
          await this.signOut();
          await this.signIn();
        } else {
          const cmsAuth = await fetchCmsAuth(auth.access_token);
          const newState: AuthState = {
            accessToken: auth.access_token,
            refreshToken: auth.refresh_token,
            expires: new Date().getTime() + auth.expires_in * 1000,
            tokenType: auth.token_type,
            scope: auth.scope,
            country: auth.country,
            accountId: auth.account_id,
            cookies: core.http.headers.cookie,
            cmsAuth,
            deviceId,
            deviceType,
          };
          core.http.setHeader('authorization', `Bearer ${newState.accessToken}`);
          await core.store.setState(newState);
          return newState;
        }
      } catch (e: any) {
        core.log.debug(`Auth failed: ${e.message}`);
        process.exit(1);
      }
    },

    async fetchAccessToken(username: string, password: string) {
      return this.fetchToken({ grant_type: 'password', username, password });
    },

    async fetchRefreshToken(refreshToken: string) {
      return this.fetchToken({ grant_type: 'refresh_token', refresh_token: refreshToken });
    },

    async signIn(username?: string, password?: string) {
      await core.store.getState();
      core.http.setHeader('authorization', `Bearer ${core.store.state.accessToken}`);
      const { hasToken, isTokenExpired } = this.checkToken();
      if (!hasToken) {
        core.log.debug(`Requesting credentials`);
        const credentials =
          username && password ? { username, password } : await promptCredentials();
        core.log.debug(`Requesting token`);
        await this.fetchAccessToken(credentials.username, credentials.password);
      } else if (isTokenExpired) {
        core.log.debug(`Refreshing token`);
        if (core.store.state.refreshToken)
          await this.fetchRefreshToken(core.store.state.refreshToken);
      }
    },

    async signOut() {
      core.http.setHeader('authorization', '');
      await core.store.setState({
        accessToken: '',
        refreshToken: '',
        expires: 0,
        tokenType: '',
        deviceId: '',
        deviceType: '',
      });
    },
  };
};

export type Auth = ReturnType<typeof createAuth>;
