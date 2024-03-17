import type { StreamyxInstance } from 'streamyx-plugin';

import { ROUTES } from './constants';
import { useAuth } from './auth';
import type { Cms } from '../types';

export const useApi = (streamyx: StreamyxInstance, auth: ReturnType<typeof useAuth>) => {
  const fetchData = async (url: string, json = true) => {
    streamyx.log.debug(`Getting data from ${url}...`);
    const response = await streamyx.http.fetch(url);
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

  const sign = (params: Record<string, string> = {}) => new URLSearchParams({ ...params, ...getSign() }).toString();

  const japDub = { preferred_audio_language: 'ja-JP' };

  return {
    fetchProfile() {
      return fetchData(ROUTES.profile);
    },

    fetchObject(objectId: string | number) {
      return fetchData(`${ROUTES.cms}${getCms().bucket}/objects/${objectId}?${sign()}`);
    },

    fetchStreams(videoId: string) {
      return fetchData(`${ROUTES.cms}${getCms().bucket}/videos/${videoId}/streams?${sign()}`);
    },

    fetchSeries(seriesId: string) {
      return fetchData(`${ROUTES.contentCms}/series/${seriesId}?${sign(japDub)}`);
    },

    fetchSeriesSeasons(seriesId: string) {
      return fetchData(`${ROUTES.contentCms}/series/${seriesId}/seasons?${sign(japDub)}`);
    },

    fetchSeason(seasonId: string) {
      return fetchData(`${ROUTES.contentCms}/seasons/${seasonId}?${sign(japDub)}`);
    },

    fetchEpisodes(seasonId: string) {
      return fetchData(`${ROUTES.cms}${getCms().bucket}/episodes?${sign({ season_id: seasonId })}`);
    },
  };
};
