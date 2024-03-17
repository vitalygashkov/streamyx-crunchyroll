import type { StreamyxInstance, DownloadConfig, DrmConfig, RunArgs } from '@streamyx/plugin';
import type { CrunchyrollPluginOptions } from './lib/types';
import { useAuth } from './lib/auth';
import { useApi } from './lib/api';

const buildDrmRequestOptions = (assetId: string, accountId: string) => ({
  method: 'POST',
  body: JSON.stringify({
    user_id: accountId,
    session_id: Math.floor(Math.random() * 100000000000000).toString(),
    asset_id: assetId,
    accounting_id: 'crunchyroll',
  }),
});

function streamyxCrunchyroll(streamyx: StreamyxInstance, options: CrunchyrollPluginOptions) {
  const auth = useAuth(streamyx, options.configPath);
  const api = useApi(streamyx, auth);

  const isValidUrl = (url: string) => new URL(url).host.includes('crunchyroll');
  const init = async () => auth.signIn();

  const getDrmConfig = async (assetId: string): Promise<DrmConfig> => {
    const options = buildDrmRequestOptions(assetId, auth.state.accountId || '');
    const response = await streamyx.http.fetch(`https://pl.crunchyroll.com/drm/v1/auth`, options);
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

  const getEpisodeConfig = async (episodeId: string, args: RunArgs) => {
    const object = await api.fetchObject(episodeId);
    const isError = object.__class__ === 'error';
    if (isError) {
      streamyx.log.error(`Episode ${episodeId} not found. Code: ${object.code}. Type: ${object.type}. `);
      process.exit(1);
    }
    const episode = object.items[0];
    const rawMetadata = episode.episode_metadata;

    const streamsLink = episode.__links__.streams?.href;
    if (!streamsLink) {
      streamyx.log.error(`Stream URL not found`);
      process.exit(1);
    }
    const streamsId = streamsLink.split('/').at(-2);
    const streamsData = await api.fetchStreams(streamsId);

    // const isSubbed = rawMetadata.is_subbed;
    // const isDubbed = rawMetadata.is_dubbed;
    // const subtitleLocales = rawMetadata.subtitle_locales;
    const subtitles: any[] = [];
    for (const subtitle of Object.values(streamsData.subtitles) as any[]) {
      const containsSelectedSubtitles =
        !args.subtitleLanguages?.length ||
        args.subtitleLanguages?.some((lang: string) => subtitle.locale.includes(lang));
      if (!containsSelectedSubtitles) continue;
      subtitles.push({ url: subtitle.url, language: subtitle.locale, format: subtitle.format });
    }

    const streams: any[] = [];
    for (const streamType of Object.keys(streamsData.streams)) {
      if (streamType.includes('trailer')) continue;
      if (!streamType.includes('drm_adaptive_dash')) continue;
      const subStreams: any[] = Object.values(streamsData.streams[streamType]);
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
      streamyx.log.error(`No suitable streams found`);
      process.exit(1);
    }
    const stream: any = streams[0];
    const manifestUrl = stream.url;
    const audioType = streamsData.audio_locale === 'ja-JP' ? 'JAPANESE' : 'DUBBED';
    const assetId = stream.url.split('assets/p/')[1]?.split('_,')[0];

    const config: DownloadConfig = {
      provider: 'CR',
      manifestUrl,
      drmConfig: () => getDrmConfig(assetId),
      audioType,
      audioLanguage: streamsData.audio_locale,
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
    const configList = (await Promise.all(configQueue)).filter(Boolean);
    return configList;
  };

  const getEpisodesConfigBySeries = async (seriesId: string, args: RunArgs) => {
    const response = await api.fetchSeriesSeasons(seriesId);
    const seasons = filterSeasonsByNumber(response.data, args.seasons);
    if (!seasons.length) {
      const seasonIds = response.data.map((s: any) => s.season_number).join(', ');
      streamyx.log.error(`No suitable seasons found. Available seasons: ${seasonIds}`);
      return [];
    }
    const episodesQueue = seasons.map((season: any) => {
      const version = filterSeasonVersionsByAudio(season.versions, args.audioLanguages);
      if (!version) return [];
      return api
        .fetchEpisodes(version.guid)
        .then((data) => data.items)
        .catch(() => []);
    });
    const allEpisodes = (await Promise.all(episodesQueue)).flat();
    const episodes = filterEpisodesByNumber(allEpisodes, args.episodes);
    const episodeIds = episodes.map((episode: any) => episode.id);
    return getEpisodesConfig(episodeIds, args);
  };

  const filterSeasonsByNumber = (seasons: any, selectedSeasons: number[]) => {
    if (!selectedSeasons.length) return seasons;
    return seasons.filter((season: any) => selectedSeasons.includes(season.season_number));
  };

  const filterSeasonVersionsByAudio = (versions: any, selectedAudioLangs: string[]) => {
    const matchLang = (version: any) => selectedAudioLangs.some((lang) => version.audio_locale.startsWith(lang));
    const matchOriginal = (version: any) => !!version.original;
    const result = selectedAudioLangs.length ? versions.find(matchLang) : versions.find(matchOriginal);
    return result;
  };

  const filterEpisodesByNumber = (episodes: any, selectedEpisodes: number[]) => {
    if (!selectedEpisodes.length) return episodes;
    return episodes.filter((episode: any) => selectedEpisodes.includes(episode.episode_number));
  };

  const getConfigList = async (url: string, args: RunArgs): Promise<DownloadConfig[]> => {
    const episodeId = url.split('watch/')[1]?.split('/')[0];
    const seriesId = url.split('series/')[1]?.split('/')[0];
    const configList: DownloadConfig[] = [];
    if (episodeId) {
      const episodeConfig = await getEpisodeConfig(episodeId, args);
      configList.push(episodeConfig);
    } else if (seriesId) {
      const episodeConfigs = await getEpisodesConfigBySeries(seriesId, args);
      configList.push(...episodeConfigs);
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
