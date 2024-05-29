import type {
  StreamyxInstance,
  DownloadConfig,
  DrmConfig,
  RunArgs,
  PluginInstance,
} from '@streamyx/plugin';
import type { CrunchyrollPluginOptions } from './lib/types';
import { useAuth } from './lib/auth';
import { useApi } from './lib/api';
import { ROUTES } from './lib/constants';

const buildDrmRequestOptions = (assetId: string, accountId: string) => ({
  method: 'POST',
  body: JSON.stringify({
    user_id: accountId,
    session_id: Math.floor(Math.random() * 100000000000000).toString(),
    asset_id: assetId,
    accounting_id: 'crunchyroll',
  }),
});

function streamyxCrunchyroll(
  streamyx: StreamyxInstance,
  options: CrunchyrollPluginOptions
): PluginInstance {
  const auth = useAuth(streamyx, options.configPath);
  const api = useApi(streamyx, auth);

  const isValidUrl = (url: string) => new URL(url).host.includes('crunchyroll');
  const init = () => auth.signIn();

  const getDrmConfig = async (assetId: string): Promise<DrmConfig> => {
    const options = buildDrmRequestOptions(assetId, auth.state.accountId || '');
    const response = await streamyx.http.fetch(ROUTES.drm, options);
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

  const getAudioLocales = (versions: any) => versions.map((v: any) => v.audio_locale).join(', ');

  const getEpisodeConfig = async (episodeId: string, args: RunArgs) => {
    const object = await api.fetchObject(episodeId);
    const isError = object.__class__ === 'error';
    if (isError) {
      return streamyx.log.error(
        `Episode ${episodeId} not found. Code: ${object.code}. Type: ${object.type}. `
      );
    }
    const episode = object.items[0];
    const rawMetadata = episode.episode_metadata;

    const streamsLink = episode.__links__.streams?.href;
    if (!streamsLink) return streamyx.log.error(`Stream URL not found`);
    const streamsId = streamsLink.split('/').at(-2);
    const streamsData = await api.fetchStreams(streamsId);

    const subtitles: any[] = [];
    for (const subtitle of Object.values(streamsData.subtitles) as any[]) {
      const containsSelectedSubtitles =
        !args.subtitleLanguages?.length ||
        args.subtitleLanguages?.some((lang: string) => subtitle.locale.startsWith(lang));
      if (!containsSelectedSubtitles) continue;
      subtitles.push({ url: subtitle.url, language: subtitle.locale, format: subtitle.format });
    }

    const seasonNumberString = rawMetadata.season_number?.toString().padEnd(2, '0') || '?';
    const episodeNumberString = rawMetadata.episode_number?.toString().padEnd(2, '0') || '?';

    let data = {} as any;
    if (streamsData.versions) {
      const version = filterSeasonVersionsByAudio(streamsData.versions, args.languages);
      if (!version) {
        return streamyx.log.error(
          `No suitable version found for S${seasonNumberString}E${episodeNumberString}. Available languages: ${getAudioLocales(streamsData.versions)}`
        );
      }
      const versionObject = await api.fetchObject(version.guid);
      const versionStreamsLink = versionObject.items[0]?.__links__.streams?.href;
      const versionStreamsId = versionStreamsLink.split('/').at(-2);
      const versionStreams = await api.fetchStreams(versionStreamsId);
      data = versionStreams;
    } else {
      data = streamsData;
    }

    const streams: any[] = [];
    for (const streamType of Object.keys(data.streams)) {
      if (streamType.includes('trailer')) continue;
      if (!streamType.includes('drm_adaptive_dash')) continue;
      const subStreams: any[] = Object.values(data.streams[streamType]);
      const modifiedStreams = subStreams
        .filter((stream) => {
          const hasHardsub = !!stream.hardsub_locale;
          const needHardsub = !!args.hardsub;
          const matchHardsubLang =
            !args.subtitleLanguages.length ||
            args.subtitleLanguages.some((lang: string) => stream.hardsub_locale.includes(lang));
          if (needHardsub && hasHardsub && matchHardsubLang) return true;
          else return !needHardsub && !hasHardsub;
        })
        .map((stream) => ({ ...stream, type: streamType }));
      streams.push(...modifiedStreams);
    }

    if (!streams.length) {
      return streamyx.log.error(`No suitable streams found`);
    }
    const stream: any = streams[0];
    const manifestUrl = stream.url;
    const audioType = data.audio_locale?.slice(0, 2).toLowerCase();
    const assetId = stream.url.split('assets/p/')[1]?.split('_,')[0];

    const config: DownloadConfig = {
      provider: 'CR',
      manifestUrl,
      drmConfig: () => getDrmConfig(assetId),
      audioType,
      audioLanguage: data.audio_locale,
      subtitles,
    };

    const isMovie = !rawMetadata.episode_number;
    if (isMovie) {
      config.movie = { title: sanitizeString(rawMetadata.series_title) };
    } else {
      config.show = { title: sanitizeString(rawMetadata.series_title) };
      config.season = { number: rawMetadata.season_number };
      config.episode = {
        number: rawMetadata.episode_number,
        title: sanitizeString(episode.title),
      };
    }

    return config;
  };

  const getEpisodesConfig = async (episodeIds: string[], args: RunArgs) => {
    const configQueue = episodeIds.map((episodeId: string) => getEpisodeConfig(episodeId, args));
    const configList = (await Promise.all(configQueue)).filter(Boolean) as DownloadConfig[];
    return configList;
  };

  const getEpisodesConfigBySeries = async (seriesId: string, args: RunArgs) => {
    const response = await api.fetchSeriesSeasons(seriesId);
    const seasons = response.data;
    if (!seasons?.length) {
      streamyx.log.error(`No seasons found`);
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
      streamyx.log.error(`No suitable episodes found. Available seasons: ${availableSeasons}`);
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

  const getConfigList = async (url: string, args: RunArgs): Promise<DownloadConfig[]> => {
    const episodeId = url.split('watch/')[1]?.split('/')[0];
    const seriesId = url.split('series/')[1]?.split('/')[0];
    const configList: DownloadConfig[] = [];

    const langs = [...args.languages];
    if (!langs.length) langs.push('ja-JP');
    for (const lang of langs) {
      args.languages = [lang];
      if (episodeId) {
        const episodeConfig = await getEpisodeConfig(episodeId, args);
        if (episodeConfig) configList.push(episodeConfig);
      } else if (seriesId) {
        const episodeConfigs = await getEpisodesConfigBySeries(seriesId, args);
        configList.push(...episodeConfigs);
      }
    }
    return configList;
  };

  return {
    name: 'crunchyroll',
    isValidUrl,
    init,
    getConfigList,
  };
}

export default streamyxCrunchyroll;
