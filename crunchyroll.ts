import type { StreamyxCore, DrmConfig, RunArgs, PluginInstance, MediaInfo } from '@streamyx/core';
import type { CrunchyrollPluginOptions } from './lib/types';
import { createAuth } from './lib/auth';
import { createApi } from './lib/api';
import { DEVICE, ROUTES } from './lib/constants';

const buildDrmRequestOptions = (assetId: string, accountId: string) => ({
  method: 'POST',
  body: JSON.stringify({
    user_id: accountId,
    session_id: Math.floor(Math.random() * 100000000000000).toString(),
    asset_id: assetId,
    accounting_id: 'crunchyroll',
  }),
});

export type CrunchyrollApi = ReturnType<typeof createApi>;

export const crunchyroll =
  (options: CrunchyrollPluginOptions) =>
  (core: StreamyxCore): PluginInstance<CrunchyrollApi> => {
    const auth = createAuth(core, options.configPath);
    const api = createApi(core, auth);

    const init = () => auth.signIn();

    const getDrmConfig = async (assetId: string): Promise<DrmConfig> => {
      const options = buildDrmRequestOptions(assetId, auth.state.accountId || '');
      const response = await core.http.fetch(ROUTES.drm, options);
      const data: any = await response.json();
      return {
        server: `https://lic.drmtoday.com/license-proxy-widevine/cenc/`,
        headers: {
          'dt-custom-data': data.custom_data,
          'x-dt-auth-token': data.token,
        },
      };
    };

    const sanitizeString = (value: string) => {
      return value?.replace(/[&/\\#,+()$~%.'":*?<>{}]/g, '');
    };

    const filterSeasonVersionsByAudio = (versions: any, selectedAudioLangs: string[] = []) => {
      const matchLang = (version: any) =>
        selectedAudioLangs.some((lang) => version.audio_locale.startsWith(lang));
      const matchOriginal = (version: any) => !!version.original;
      const result = selectedAudioLangs.length
        ? versions.find(matchLang)
        : versions.find(matchOriginal) || versions[0];
      return result;
    };

    const getAudioLocales = (versions: any) =>
      versions
        .map((v: any) => v.audio_locale)
        .join(', ')
        .trim();

    const getEpisodeConfig = async (episodeId: string, args: RunArgs) => {
      const object = await api.fetchObject(episodeId);
      const isError = object.__class__ === 'error';
      if (isError) {
        const response = await core.http.fetch('https://api.country.is').catch(() => null);
        const { ip, country } = await response?.json();
        core.log.info(`IP: ${ip}. Country: ${country}`);
        return core.log.error(
          `Episode ${episodeId} not found. Code: ${object.code}. Type: ${object.type}. `
        );
      }
      const episode = object.items[0];
      const rawMetadata = episode.episode_metadata;
      const seasonNumberString = rawMetadata.season_number?.toString().padEnd(2, '0') || '?';
      const episodeNumberString = rawMetadata.episode_number?.toString().padEnd(2, '0') || '?';

      const play = await api.fetchPlayData(episodeId);
      const subtitles: any[] = [];
      for (const subtitle of Object.values(play.subtitles) as any[]) {
        const containsSelectedSubtitles =
          !args.subtitleLanguages?.length ||
          args.subtitleLanguages?.some((lang: string) => subtitle.language.startsWith(lang));
        if (!containsSelectedSubtitles) continue;
        subtitles.push({ url: subtitle.url, language: subtitle.language, format: subtitle.format });
      }

      let data = play;
      if (play.versions) {
        const defaultVersion = { audio_locale: play.audioLocale, guid: episodeId };
        const versions = [defaultVersion, ...play.versions];
        const version = filterSeasonVersionsByAudio(versions, args.languages);
        if (!version) {
          core.log.warn(
            `No suitable version found for S${seasonNumberString}E${episodeNumberString}. Available audio: ${getAudioLocales(versions)}`
          );
        } else if (version.guid !== episodeId) {
          data = await api.fetchPlayData(version.guid);
        }
      }

      if (args.hardsub) {
        let url: string = '';
        for (const hardsub of Object.values(data.hardSubs) as any[]) {
          const matchHardsubLang =
            !args.subtitleLanguages.length ||
            args.subtitleLanguages.some((lang: string) => hardsub.hlang.includes(lang));
          if (matchHardsubLang) url = hardsub.url;
        }
        if (!url) return core.log.warn(`No suitable hardsub stream found`);
        else data.url = url;
      }

      const url = data.url;
      const audioType = data.audioLocale?.slice(0, 2).toLowerCase();
      const assetId = url.split('assets/p/')[1]?.split('_,')[0] || data.assetId;

      const mediaInfo: MediaInfo = {
        url,
        provider: 'CR',
        headers: {
          Authorization: `Bearer ${auth.state.accessToken}`,
          // 'X-Cr-Disable-Drm': 'true',
          'User-Agent': DEVICE.userAgent,
        },
        drmConfig: () => getDrmConfig(assetId),
        audioType,
        audioLanguage: data.audioLocale,
        subtitles,
      };

      const isMovie = !rawMetadata.episode_number;
      if (isMovie) {
        mediaInfo.movie = { title: sanitizeString(rawMetadata.series_title) };
      } else {
        mediaInfo.show = { title: sanitizeString(rawMetadata.series_title) };
        mediaInfo.season = { number: rawMetadata.season_number };
        mediaInfo.episode = {
          number: rawMetadata.episode_number,
          title: sanitizeString(episode.title),
        };
      }

      return mediaInfo;
    };

    const getEpisodesConfig = async (episodeIds: string[], args: RunArgs) => {
      const configQueue = episodeIds.map((episodeId: string) => getEpisodeConfig(episodeId, args));
      const configList = (await Promise.all(configQueue)).filter(Boolean) as MediaInfo[];
      return configList;
    };

    const getEpisodesConfigBySeries = async (seriesId: string, args: RunArgs) => {
      const response = await api.fetchSeriesSeasons(seriesId);
      const seasons = response.data;
      if (!seasons?.length) {
        core.log.error(`No seasons found`);
        return [];
      }

      const episodesQueue = seasons.map((season: any) => {
        const version = filterSeasonVersionsByAudio(season.versions);
        if (!version) return [];
        const overrideSeasonNumber = (episodes: any[]) => {
          return episodes.map((episode: any) => ({
            ...episode,
            season_number: season.season_number,
          }));
        };
        return api
          .fetchEpisodes(version.guid)
          .then((data) => overrideSeasonNumber(data.items))
          .catch(() => []);
      });
      const allEpisodes = (await Promise.all(episodesQueue)).flat();
      const episodes = filterEpisodesByNumber(allEpisodes, args.episodes);
      if (!episodes?.length) {
        const availableSeasons = seasons
          .map(
            (s: any) =>
              `S${s.season_number.toString().padStart(2, '0')} (${getAudioLocales(s.versions)})`
          )
          .join(', ');
        core.log.error(`No suitable episodes found. Available seasons: ${availableSeasons}`);
        return [];
      }
      const episodeIds = episodes.map((episode: any) => episode.id);
      return getEpisodesConfig(episodeIds, args);
    };

    const filterSeasonsByNumber = (seasons: any, selectedSeasons: RunArgs['episodes']) => {
      if (!selectedSeasons.size) return seasons;
      return seasons.filter((season: any) => selectedSeasons.has(NaN, season.season_number));
    };

    const filterEpisodesByNumber = (seasonEpisodes: any, selectedEpisodes: RunArgs['episodes']) => {
      if (!selectedEpisodes.size) return seasonEpisodes;
      return seasonEpisodes.filter((episode: any) =>
        selectedEpisodes.has(episode.episode_number, episode.season_number)
      );
    };

    const fetchMediaInfo = async (url: string, args: RunArgs): Promise<MediaInfo[]> => {
      const episodeId = url.split('watch/')[1]?.split('/')[0];
      const seriesId = url.split('series/')[1]?.split('/')[0];
      const mediaInfoList: MediaInfo[] = [];

      const langs = [...args.languages];
      if (!langs.length) langs.push('ja-JP');
      for (const lang of langs) {
        args.languages = [lang];
        if (episodeId) {
          const episodeConfig = await getEpisodeConfig(episodeId, args);
          if (episodeConfig) mediaInfoList.push(episodeConfig);
        } else if (seriesId) {
          const episodeConfigs = await getEpisodesConfigBySeries(seriesId, args);
          mediaInfoList.push(...episodeConfigs);
        }
      }
      return mediaInfoList;
    };

    return {
      name: 'crunchyroll',
      api: api as CrunchyrollApi,
      init,
      fetchMediaInfo,
    };
  };
