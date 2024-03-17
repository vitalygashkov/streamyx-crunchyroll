export const DOMAINS = {
  default: 'https://www.crunchyroll.com',
  defaultApi: 'https://api.crunchyroll.com',
  beta: 'https://beta.crunchyroll.com',
  betaApi: 'https://beta-api.crunchyroll.com',
};

export const ROUTES = {
  rss: `${DOMAINS.default}/rss/anime`,
  token: `${DOMAINS.betaApi}/auth/v1/token`,
  cms: `${DOMAINS.betaApi}/cms/v2`,
  index: `${DOMAINS.betaApi}/index/v2`,
  contentCms: `${DOMAINS.betaApi}/content/v2/cms`,
  profile: `${DOMAINS.betaApi}/accounts/v1/me/profile`,
};
