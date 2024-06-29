import type { StreamyxInstance } from '@streamyx/core';
import { type Auth } from './auth';
import type { Cms } from './types';
import { DEVICE, ROUTES } from './constants';

export const createApi = (streamyx: StreamyxInstance, auth: Auth) => {
  const request = async (url: string, method: string = 'GET') => {
    streamyx.log.debug(`Getting data from ${url}...`);
    const response = await streamyx.http.fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${auth.state.accessToken}`,
        'User-Agent': DEVICE.userAgent,
      },
    });
    const data = (await response.text()) || '';
    response.status === 401 && streamyx.log.error(`Unauthorized: ${url}`);
    response.status === 400 && streamyx.log.error(`Bad Request: ${url}`);
    const isSuccess = response.status === 200;
    if (!isSuccess) streamyx.log.debug(`Request failed. Route: ${url}. ${data}`);
    try {
      return data ? JSON.parse(data) : data;
    } catch (e) {
      streamyx.log.debug(data);
      streamyx.log.debug(e);
      streamyx.log.error(`Parsing JSON response failed. Route: ${url}`);
      process.exit(1);
    }
  };

  const getCms = () => (auth.state.cmsAuth?.cms || {}) as Cms;

  const getSign = (cms = getCms()) => ({
    Policy: cms.policy,
    Signature: cms.signature,
    'Key-Pair-Id': cms.key_pair_id,
  });

  const sign = (params: Record<string, string> = {}) =>
    new URLSearchParams({ ...params, ...getSign() }).toString();

  const DEFAULT_DUB = 'ja-JP';
  const preferDub = (language: string = DEFAULT_DUB) => ({ preferred_audio_language: language });

  return {
    auth,

    fetchProfile() {
      return request(ROUTES.profile);
    },

    fetchPlayData(id: string | number, devicePlatform = DEVICE.platform, deviceName = DEVICE.name) {
      return request(`${ROUTES.play}/${id}/${devicePlatform}/${deviceName}/play`);
    },

    revokePlayData(id: string | number, token: string) {
      return request(`${ROUTES.play}/token/${id}/${token}`, 'DELETE');
    },

    fetchObject(objectId: string | number) {
      return request(`${ROUTES.cms}${getCms().bucket}/objects/${objectId}?${sign()}`);
    },

    fetchStreams(videoId: string) {
      return request(`${ROUTES.cms}${getCms().bucket}/videos/${videoId}/streams?${sign()}`);
    },

    fetchSeries(seriesId: string, dub?: string) {
      return request(`${ROUTES.contentCms}/series/${seriesId}?${sign(preferDub(dub))}`);
    },

    fetchSeriesSeasons(seriesId: string, dub?: string) {
      return request(`${ROUTES.contentCms}/series/${seriesId}/seasons?${sign(preferDub(dub))}`);
    },

    fetchSeason(seasonId: string, dub?: string) {
      return request(`${ROUTES.contentCms}/seasons/${seasonId}?${sign(preferDub(dub))}`);
    },

    fetchEpisodes(seasonId: string) {
      return request(`${ROUTES.cms}${getCms().bucket}/episodes?${sign({ season_id: seasonId })}`);
    },
  };
};
