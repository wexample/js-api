import LiveUpdatesError from '../Errors/LiveUpdatesError';
import type {
  LiveUpdatesDriverConnectOptions,
  LiveUpdatesDriverInterface,
} from './LiveUpdatesDriver';

export type MercureDriverConfig = {
  hubUrl: string;
  jwt?: string | null;
  hubPath?: string;
  topicParamName?: string;
  jwtParamName?: string;
  withCredentials?: boolean;
  additionalParams?: Record<string, string | number | boolean>;
};

export default class MercureLiveUpdatesDriver implements LiveUpdatesDriverInterface {
  private readonly configResolver: () => MercureDriverConfig;

  constructor(config: MercureDriverConfig | (() => MercureDriverConfig)) {
    this.configResolver = typeof config === 'function' ? config : () => config;
  }

  connect(options: LiveUpdatesDriverConnectOptions): EventSource {
    const config = this.configResolver();
    const hubPath = config.hubPath ?? '/.well-known/mercure';
    const topicParamName = config.topicParamName ?? 'topic';
    const jwtParamName = config.jwtParamName ?? 'jwt';
    const withCredentials = config.withCredentials ?? true;

    if (!config.hubUrl) {
      throw new LiveUpdatesError({
        message: 'Mercure hubUrl is required.',
        code: 'ERR_MERCURE_HUB_URL_REQUIRED',
      });
    }

    const url = new URL(hubPath, config.hubUrl);

    options.topics.forEach((topic) => {
      url.searchParams.append(topicParamName, topic);
    });

    if (config.jwt) {
      url.searchParams.append(jwtParamName, config.jwt);
    }

    Object.entries(config.additionalParams || {}).forEach(([key, value]) => {
      url.searchParams.append(key, String(value));
    });

    return new EventSource(url.toString(), {
      withCredentials,
    });
  }
}
