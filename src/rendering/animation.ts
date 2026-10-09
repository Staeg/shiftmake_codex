export function animate(
  durationMs: number,
  onUpdate: (t: number) => void,
  onFinish?: () => void,
  onCancel?: () => void,
): () => void {
  const start = performance.now();
  let cancelled = false;
  let finished = false;
  let handle: number | null = null;

  const frame = (now: number) => {
    handle = null;
    if (cancelled || finished) return;
    const t = Math.min(1, (now - start) / durationMs);
    onUpdate(t);
    if (cancelled || finished) return;
    if (t < 1) {
      handle = requestAnimationFrame(frame);
    } else {
      finished = true;
      onFinish?.();
    }
  };

  handle = requestAnimationFrame(frame);
  return () => {
    if (cancelled || finished) return;
    cancelled = true;
    if (handle !== null) {
      cancelAnimationFrame(handle);
      handle = null;
    }
    onCancel?.();
  };
}
