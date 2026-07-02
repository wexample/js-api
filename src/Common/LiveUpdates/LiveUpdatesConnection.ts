import RetryBackoffScheduler from '@wexample/js-helpers/Common/RetryBackoffScheduler';
import { type ReconnectBackoffOptions } from '@wexample/js-helpers/Helper/Reconnect';
import type { LiveUpdatesDriverInterface } from './LiveUpdatesDriver';

export type LiveUpdatesConnectionStatus = 'connecting' | 'open' | 'error' | 'closed';

export type LiveUpdatesConnectionOptions = {
  driver: LiveUpdatesDriverInterface;
  topics: string[];
  onMessage?: (payload: unknown, event: MessageEvent) => void;
  onStatusChange?: (
    status: LiveUpdatesConnectionStatus,
    previousStatus: LiveUpdatesConnectionStatus
  ) => void;
  reconnect?: ReconnectBackoffOptions;
};

const DEFAULT_RECONNECT_OPTIONS: ReconnectBackoffOptions = {
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  factor: 2,
  jitterRatio: 0.2,
};

// Framework-agnostic live-updates connection: opens a stream through the
// injected driver, parses JSON payloads and transparently reconnects with
// an exponential backoff. App layers (Vue services, etc.) can build their
// own orchestration on top of it.
export default class LiveUpdatesConnection {
  private readonly driver: LiveUpdatesDriverInterface;
  private readonly topics: string[];
  private readonly onMessage?: (payload: unknown, event: MessageEvent) => void;
  private readonly onStatusChange?: (
    status: LiveUpdatesConnectionStatus,
    previousStatus: LiveUpdatesConnectionStatus
  ) => void;
  private readonly reconnectScheduler: RetryBackoffScheduler;
  private source: EventSource | null = null;
  private currentStatus: LiveUpdatesConnectionStatus = 'connecting';

  constructor(options: LiveUpdatesConnectionOptions) {
    this.driver = options.driver;
    this.topics = [...options.topics];
    this.onMessage = options.onMessage;
    this.onStatusChange = options.onStatusChange;
    this.reconnectScheduler = new RetryBackoffScheduler(
      options.reconnect ?? DEFAULT_RECONNECT_OPTIONS
    );

    this.open();
  }

  getStatus(): LiveUpdatesConnectionStatus {
    return this.currentStatus;
  }

  getTopics(): string[] {
    return [...this.topics];
  }

  close(): void {
    this.reconnectScheduler.cancel();
    this.closeSource();
    this.updateStatus('closed');
  }

  private open(): void {
    let result: EventSource | Promise<EventSource>;

    try {
      result = this.driver.connect({ topics: [...this.topics] });
    } catch {
      this.handleOpenFailure();
      return;
    }

    if (result instanceof Promise) {
      result
        .then((source) => {
          if (this.currentStatus === 'closed') {
            source.close();
            return;
          }
          this.source = source;
          this.bindSource(source);
        })
        .catch(() => {
          this.handleOpenFailure();
        });
      return;
    }

    this.source = result;
    this.bindSource(result);
  }

  private handleOpenFailure(): void {
    if (this.currentStatus === 'closed') {
      return;
    }

    this.updateStatus('error');
    this.scheduleReconnect();
  }

  private bindSource(source: EventSource): void {
    source.onopen = () => {
      this.reconnectScheduler.reset();
      this.updateStatus('open');
    };

    source.onerror = () => {
      this.updateStatus('error');
      this.scheduleReconnect();
    };

    source.onmessage = (event: MessageEvent) => {
      this.onMessage?.(this.parseMessageData(event.data), event);
    };
  }

  private parseMessageData(data: unknown): unknown {
    if (typeof data !== 'string') {
      return data;
    }

    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }

  private scheduleReconnect(): void {
    if (this.currentStatus === 'closed' || !this.reconnectScheduler.canRetry()) {
      return;
    }

    this.reconnectScheduler.schedule(() => {
      if (this.currentStatus === 'closed') {
        return;
      }

      this.closeSource();
      this.updateStatus('connecting');
      this.open();
    });
  }

  private closeSource(): void {
    if (!this.source) {
      return;
    }

    this.source.onopen = null;
    this.source.onerror = null;
    this.source.onmessage = null;
    this.source.close();
    this.source = null;
  }

  private updateStatus(nextStatus: LiveUpdatesConnectionStatus): void {
    if (this.currentStatus === nextStatus) {
      return;
    }

    const previousStatus = this.currentStatus;
    this.currentStatus = nextStatus;
    this.onStatusChange?.(nextStatus, previousStatus);
  }
}
