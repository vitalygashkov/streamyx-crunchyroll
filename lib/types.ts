export interface CrunchyrollPluginOptions {
  configPath: string;
}

export interface AuthState {
  username?: string;
  password?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  country?: string;
  accountId?: string;
  cookies?: string;
  expires?: number;
  cmsAuth?: CmsAuthResponse;
  deviceId?: string;
  deviceType?: string;
}

export interface CmsAuthResponse {
  cms: Cms;
  cms_beta: Cms;
  cms_web: Cms;
  service_available: boolean;
  default_marketing_opt_in: boolean;
}

export interface Cms {
  bucket: string;
  policy: string;
  signature: string;
  key_pair_id: string;
  expires: string;
}
