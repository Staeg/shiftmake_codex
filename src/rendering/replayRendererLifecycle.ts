interface RendererHost {
  readonly isConnected: boolean;
}

interface ReplayRenderer {
  init(): Promise<void>;
  destroy(): void;
}

interface RendererLifecycleOptions<H extends RendererHost, R extends ReplayRenderer> {
  load(): Promise<(host: H) => R>;
  isCurrent(host: H): boolean;
  changed(renderer: R | null): void;
  failed(error: unknown): void;
}

export function createReplayRendererLifecycle<H extends RendererHost, R extends ReplayRenderer>(options: RendererLifecycleOptions<H, R>) {
  type Attempt = { host: H; renderer: R | null; released: boolean; ready: boolean; promise: Promise<void> };
  let current: Attempt | null = null;
  let disposed = false;

  function release(attempt: Attempt): void {
    if (attempt.renderer && !attempt.released) {
      attempt.released = true;
      attempt.renderer.destroy();
    }
  }

  function reset(): void {
    const previous = current;
    current = null;
    if (previous) {
      release(previous);
      if (previous.ready) {
        options.changed(null);
      }
    }
  }

  function isCurrent(attempt: Attempt): boolean {
    return !disposed && current === attempt && attempt.host.isConnected && options.isCurrent(attempt.host);
  }

  function ensure(host: H): Promise<void> {
    if (disposed || !host.isConnected || !options.isCurrent(host)) {
      return Promise.resolve();
    }
    if (current?.host === host) {
      return current.promise;
    }
    reset();
    const attempt: Attempt = { host, renderer: null, released: false, ready: false, promise: Promise.resolve() };
    current = attempt;
    // Claim the attempt before loading so concurrent callers cannot create duplicates.
    attempt.promise = Promise.resolve().then(async () => {
      try {
        const createRenderer = await options.load();
        if (!isCurrent(attempt)) {
          return;
        }
        attempt.renderer = createRenderer(host);
        await attempt.renderer.init();
        if (!isCurrent(attempt)) {
          return;
        }
        attempt.ready = true;
        options.changed(attempt.renderer);
      } catch (error) {
        const report = isCurrent(attempt);
        if (current === attempt) {
          current = null;
        }
        release(attempt);
        if (attempt.ready) {
          options.changed(null);
        }
        if (report) {
          options.failed(error);
        }
      } finally {
        if (!isCurrent(attempt)) {
          release(attempt);
          if (current === attempt) {
            current = null;
          }
        }
      }
    });
    return attempt.promise;
  }

  return {
    ensure,
    reset,
    dispose() {
      disposed = true;
      reset();
    },
  };
}
