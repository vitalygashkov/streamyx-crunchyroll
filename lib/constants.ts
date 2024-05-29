export const DOMAINS = {
  default: 'https://www.crunchyroll.com',
  defaultApi: 'https://api.crunchyroll.com',
  beta: 'https://beta.crunchyroll.com',
  betaApi: 'https://beta-api.crunchyroll.com',
  proto: 'https://beta-api.etp-proto0.com',
  staging: 'https://beta-stage-api.crunchyroll.com',
};

export const ROUTES = {
  rss: `${DOMAINS.default}/rss/anime`,
  token: `${DOMAINS.betaApi}/auth/v1/token`,
  cms: `${DOMAINS.betaApi}/cms/v2`,
  index: `${DOMAINS.betaApi}/index/v2`,
  contentCms: `${DOMAINS.betaApi}/content/v2/cms`,
  profile: `${DOMAINS.betaApi}/accounts/v1/me/profile`,
  drm: `${DOMAINS.betaApi}/drm/v1/auth`,
};

const FIRETV_PROD_CLIENT_ID = 'i3amc7y0k_5flypfnpk2';
const FIRETV_PROD_CLIENT_SECRET = 'lmT8sSvagLo5tiGP0xntJlf8qXGqvuiz';
const FIRETV_PROTO_CLIENT_ID = 'ys_wlhqy6xszxrzq_xz1';
const FIRETV_PROTO_CLIENT_SECRET = 'eHDBEATsYsikC5TaukArgpmfxKY7nCH9';
const FIRETV_STAGING_CLIENT_ID = 'buieosfrytrycw9gco7b';
const FIRETV_STAGING_CLIENT_SECRET = 'GAJSFWaWopNDZetpHJsS2qEd4CdlJG96\n';
const TV_PROD_CLIENT_ID = 'ju8lksokvlqmg1_fjmnv';
const TV_PROD_CLIENT_SECRET = 'AMZSQvd9Dg-kI4Qc7NPqiU5O6aKoZIkh';
const TV_PROTO_CLIENT_ID = 'haz2ernyiind8rkvoeg-';
const TV_PROTO_CLIENT_SECRET = 'kce7P5Af9-OMoNnXcVwqZCpg1vFeaR0p';
const TV_STAGING_CLIENT_ID = 'tomiq98p-npokj4zqw94';
const TV_STAGING_CLIENT_SECRET = 'Ks9ZAi2EDToP2ob6xr5bkCh5LDZIaaMS';
const MOBILE_CLIENT_ID = 'nmvjshfknymxxkg7fbh9';
const MOBILE_CLIENT_SECRET = 'ZYIVrBWUPbcXDtbD22VSLa6b4WQos3zX';

const CLIENT_ID = TV_PROD_CLIENT_ID;
const CLIENT_SECRET = TV_PROD_CLIENT_SECRET;

export const BASIC_TOKEN = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
