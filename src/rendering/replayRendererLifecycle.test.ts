import { describe, expect, it, vi } from 'vitest';
import { createReplayRendererLifecycle } from './replayRendererLifecycle';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness() {
  const host = { isConnected: true };
  const route = { active: true, host };
  const imports = deferred<(container: typeof host) => { init(): Promise<void>; destroy(): void }>();
  const initialization = deferred<void>();
  const renderer = { init: vi.fn(() => initialization.promise), destroy: vi.fn() };
  const create = vi.fn(() => renderer);
  const changed = vi.fn();
  const failed = vi.fn();
  const load = vi.fn(() => imports.promise);
  const lifecycle = createReplayRendererLifecycle({
    load, changed, failed, isCurrent: (candidate: typeof host) => route.active && candidate === route.host,
  });
  return { host, route, imports, initialization, renderer, create, changed, failed, load, lifecycle };
}

describe('replay renderer lifecycle', () => {
  it('coalesces import and initialization and releases a ready renderer exactly once', async () => {
    const h = harness();
    const pending = h.lifecycle.ensure(h.host);
    expect(h.lifecycle.ensure(h.host)).toBe(pending);
    h.imports.resolve(h.create);
    await Promise.resolve();
    await Promise.resolve();
    expect(h.lifecycle.ensure(h.host)).toBe(pending);
    h.initialization.resolve();
    await pending;
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.renderer.init).toHaveBeenCalledTimes(1);
    expect(h.changed.mock.calls).toEqual([[h.renderer]]);
    h.lifecycle.reset();
    h.lifecycle.reset();
    expect(h.renderer.destroy).toHaveBeenCalledTimes(1);
    expect(h.changed.mock.calls).toEqual([[h.renderer], [null]]);
  });

  it('never constructs a renderer after leaving during a pending import', async () => {
    const h = harness();
    const pending = h.lifecycle.ensure(h.host);
    h.lifecycle.reset();
    h.imports.resolve(h.create);
    await pending;
    expect(h.create).not.toHaveBeenCalled();
    expect(h.changed).not.toHaveBeenCalled();
  });

  it('releases a renderer immediately when leaving during initialization', async () => {
    const h = harness();
    const pending = h.lifecycle.ensure(h.host);
    h.imports.resolve(h.create);
    await Promise.resolve();
    await Promise.resolve();
    expect(h.renderer.init).toHaveBeenCalledTimes(1);
    h.lifecycle.reset();
    expect(h.renderer.destroy).toHaveBeenCalledTimes(1);
    h.initialization.resolve();
    await pending;
    expect(h.renderer.destroy).toHaveBeenCalledTimes(1);
    expect(h.changed).not.toHaveBeenCalled();
  });

  it('does not let an old initialization replace or clear a newer host attempt', async () => {
    const h = harness();
    const first = h.lifecycle.ensure(h.host);
    h.imports.resolve(h.create);
    await Promise.resolve();
    await Promise.resolve();
    const nextHost = { isConnected: true };
    h.route.host = nextHost;
    const nextInit = deferred<void>();
    const nextRenderer = { init: vi.fn(() => nextInit.promise), destroy: vi.fn() };
    h.create.mockReturnValueOnce(nextRenderer);
    const second = h.lifecycle.ensure(nextHost);
    await Promise.resolve();
    await Promise.resolve();
    h.initialization.resolve();
    await first;
    expect(h.lifecycle.ensure(nextHost)).toBe(second);
    nextInit.resolve();
    await second;
    expect(h.changed.mock.calls).toEqual([[nextRenderer]]);
    expect(h.renderer.destroy).toHaveBeenCalledTimes(1);
    h.lifecycle.dispose();
    expect(nextRenderer.destroy).toHaveBeenCalledTimes(1);
  });

  it('skips disconnected hosts and rejects a stale route after initialization', async () => {
    const h = harness();
    h.host.isConnected = false;
    await h.lifecycle.ensure(h.host);
    expect(h.load).not.toHaveBeenCalled();
    h.host.isConnected = true;
    const pending = h.lifecycle.ensure(h.host);
    h.imports.resolve(h.create);
    await Promise.resolve();
    await Promise.resolve();
    h.route.active = false;
    h.initialization.resolve();
    await pending;
    expect(h.changed).not.toHaveBeenCalled();
    expect(h.renderer.destroy).toHaveBeenCalledTimes(1);
  });

  it('reports current initialization failures and permits retry', async () => {
    const h = harness();
    const pending = h.lifecycle.ensure(h.host);
    h.imports.resolve(h.create);
    h.initialization.reject(new Error('Textures failed'));
    await pending;
    expect(h.failed).toHaveBeenCalledTimes(1);
    expect(h.renderer.destroy).toHaveBeenCalledTimes(1);
    const nextRenderer = { init: vi.fn(async () => {}), destroy: vi.fn() };
    h.create.mockReturnValueOnce(nextRenderer);
    await h.lifecycle.ensure(h.host);
    expect(h.changed.mock.calls).toEqual([[nextRenderer]]);
    h.lifecycle.dispose();
  });

  it('reports import failures without creating resources', async () => {
    const h = harness();
    const pending = h.lifecycle.ensure(h.host);
    h.imports.reject(new Error('Import failed'));
    await pending;
    expect(h.failed).toHaveBeenCalledTimes(1);
    expect(h.create).not.toHaveBeenCalled();
  });

  it('suppresses stale failures and cannot resurrect after disposal', async () => {
    const h = harness();
    const pending = h.lifecycle.ensure(h.host);
    h.imports.resolve(h.create);
    await Promise.resolve();
    await Promise.resolve();
    h.lifecycle.dispose();
    h.lifecycle.dispose();
    h.initialization.reject(new Error('Canceled load failed'));
    await pending;
    await h.lifecycle.ensure(h.host);
    expect(h.renderer.destroy).toHaveBeenCalledTimes(1);
    expect(h.failed).not.toHaveBeenCalled();
    expect(h.changed).not.toHaveBeenCalled();
    expect(h.create).toHaveBeenCalledTimes(1);
  });
});
