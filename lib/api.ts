import type { StreamyxInstance } from '@streamyx/plugin';
import { type Auth } from './auth';
import type { Cms } from './types';
import { ROUTES, USER_AGENTS } from './constants';

export const useApi = (streamyx: StreamyxInstance, auth: Auth) => {
  const fetchData = async (url: string, json = true) => {
    streamyx.log.debug(`Getting data from ${url}...`);
    const response = await streamyx.http.fetch(url, {
      headers: {
        authorization: `Bearer ${auth.state.accessToken}`,
        'User-Agent': USER_AGENTS.nintendoSwitch,
      },
    });
    const data = (await response.text()) || '';
    response.status === 401 && streamyx.log.error(`Unauthorized: ${url}`);
    response.status === 400 && streamyx.log.error(`Bad Request: ${url}`);
    const isSuccess = response.status === 200;
    if (!isSuccess) streamyx.log.debug(`Request failed. Route: ${url}. ${data}`);
    try {
      return json ? JSON.parse(data) : data;
    } catch (e) {
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
    fetchProfile() {
      return fetchData(ROUTES.profile);
    },

    fetchPlayData(id: string | number) {
      return fetchData(
        `https://cr-play-service.prd.crunchyrollsvc.com/v1/${id}/console/switch/play`
      );
    },

    fetchObject(objectId: string | number) {
      return fetchData(`${ROUTES.cms}${getCms().bucket}/objects/${objectId}?${sign()}`);
    },

    fetchStreams(videoId: string) {
      return fetchData(`${ROUTES.cms}${getCms().bucket}/videos/${videoId}/streams?${sign()}`);
    },

    fetchSeries(seriesId: string, dub?: string) {
      return fetchData(`${ROUTES.contentCms}/series/${seriesId}?${sign(preferDub(dub))}`);
    },

    fetchSeriesSeasons(seriesId: string, dub?: string) {
      return fetchData(`${ROUTES.contentCms}/series/${seriesId}/seasons?${sign(preferDub(dub))}`);
    },

    fetchSeason(seasonId: string, dub?: string) {
      return fetchData(`${ROUTES.contentCms}/seasons/${seasonId}?${sign(preferDub(dub))}`);
    },

    fetchEpisodes(seasonId: string) {
      return fetchData(`${ROUTES.cms}${getCms().bucket}/episodes?${sign({ season_id: seasonId })}`);
    },
  };
};
