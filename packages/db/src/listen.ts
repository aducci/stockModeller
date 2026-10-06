// A dedicated connection for LISTEN, reconnecting after errors (architecture.md §2: fan-out via LISTEN/NOTIFY).
import pg from "pg";

export interface Listener {
  close(): Promise<void>;
}

export interface ListenOptions {
  connectionString: string;
  channels: string[];
  onNotify: (channel: string, payload: string) => void;
  /** Called after a reconnect: notifications sent while disconnected were lost, so callers catch up. */
  onReconnect?: () => void;
  onError?: (error: Error) => void;
  retryMs?: number;
}

export async function listen(options: ListenOptions): Promise<Listener> {
  let client: pg.Client | null = null;
  let closed = false;
  let retry: NodeJS.Timeout | undefined;

  const connect = async (isReconnect: boolean): Promise<void> => {
    const c = new pg.Client({ connectionString: options.connectionString });
    c.on("notification", (n) => options.onNotify(n.channel, n.payload ?? ""));
    c.on("error", (error) => {
      options.onError?.(error);
      scheduleReconnect(c);
    });
    c.on("end", () => scheduleReconnect(c));
    await c.connect();
    for (const channel of options.channels) await c.query(`LISTEN ${pg.escapeIdentifier(channel)}`);
    client = c;
    if (isReconnect) options.onReconnect?.();
  };

  const scheduleReconnect = (failed: pg.Client) => {
    if (closed || client !== failed || retry) return;
    client = null;
    failed.end().catch(() => {});
    retry = setTimeout(async function attempt() {
      retry = undefined;
      if (closed) return;
      try {
        await connect(true);
      } catch (error) {
        options.onError?.(error as Error);
        retry = setTimeout(attempt, options.retryMs ?? 1000);
      }
    }, options.retryMs ?? 1000);
  };

  await connect(false);
  return {
    async close() {
      closed = true;
      clearTimeout(retry);
      await client?.end();
      client = null;
    },
  };
}
