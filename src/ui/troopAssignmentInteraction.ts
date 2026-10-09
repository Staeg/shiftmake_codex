import { writable } from 'svelte/store';
import type { TroopId } from '../engine/types';

export type TroopDropTarget = { kind: 'rift'; riftId: string } | { kind: 'ready' };
export interface TroopDragState {
  troopId: TroopId;
  sourceRiftId: string | null;
  pointerId: number | null;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  label: string;
  portraitUrl: string;
  dropTarget: TroopDropTarget | null;
}
export interface AssignmentConflict {
  troopId?: TroopId;
  conflictTroopId?: TroopId;
  riftId?: string;
  message: string;
}

type ListenerHost = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
interface DragRuntime {
  window: ListenerHost;
  document: ListenerHost & Pick<Document, 'elementFromPoint'>;
}
interface InteractionOptions {
  runtime(): DragRuntime;
  isBlocked(troopId: TroopId): boolean;
  describeTroop(troopId: TroopId): { label: string; portraitUrl: string } | null;
  onDragComplete(troopId: TroopId): void;
  onDrop(troopId: TroopId, sourceRiftId: string | null, target: TroopDropTarget | null): void;
}

const TROOP_MIME_TYPE = 'application/x-shiftmake-troop';

export function isCurrentTroopDropTarget(target: TroopDropTarget | null, kind: 'ready' | 'rift', riftId?: string): boolean {
  return !!target && target.kind === kind && (kind === 'ready' || target.kind === 'rift' && target.riftId === riftId);
}

export function createTroopAssignmentInteraction(options: InteractionOptions) {
  let state = { drag: null as TroopDragState | null, conflict: null as AssignmentConflict | null };
  const store = writable(state);
  let suppressedClickId: TroopId | null = null;
  let disposed = false;
  const listeners: Array<{ host: ListenerHost; type: string; listener: EventListener }> = [];

  function update(drag = state.drag, conflict = state.conflict): void {
    state = { drag, conflict };
    store.set(state);
  }
  function clearListeners(): void {
    listeners.splice(0).forEach(({ host, type, listener }) => host.removeEventListener(type, listener));
  }
  function listen(host: ListenerHost, type: string, listener: (event: never) => void): void {
    const callback = listener as EventListener;
    host.addEventListener(type, callback, { passive: false });
    listeners.push({ host, type, listener: callback });
  }
  function targetAt(x: number, y: number): TroopDropTarget | null {
    const element = options.runtime().document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-rift-drop-target], [data-ready-drop-target]');
    if (!element) return null;
    if (element.dataset.readyDropTarget === 'true') return { kind: 'ready' };
    return element.dataset.riftDropTarget ? { kind: 'rift', riftId: element.dataset.riftDropTarget } : null;
  }
  function begin(pointerId: number | null, x: number, y: number, troopId: TroopId,
    sourceRiftId: string | null, label: string, portraitUrl: string): void {
    update({ troopId, sourceRiftId, pointerId, startX: x, startY: y, x, y,
      active: false, label, portraitUrl, dropTarget: null });
  }
  function move(x: number, y: number, forceActive = false): void {
    const drag = state.drag;
    if (!drag) return;
    const active = forceActive || drag.active || Math.hypot(x - drag.startX, y - drag.startY) > 6;
    update({ ...drag, x, y, active, dropTarget: active ? targetAt(x, y) : null });
  }
  function cancel(): void { clearListeners(); update(null); }
  function finish(x: number, y: number): void {
    const drag = state.drag;
    if (!drag) return;
    const target = targetAt(x, y) ?? drag.dropTarget;
    cancel();
    if (!drag.active) return;
    suppressedClickId = drag.troopId;
    options.onDragComplete(drag.troopId);
    options.onDrop(drag.troopId, drag.sourceRiftId, target);
  }
  function pointerMove(event: PointerEvent): void {
    if (!state.drag || event.pointerId !== state.drag.pointerId) return;
    move(event.clientX, event.clientY);
    if (state.drag?.active) event.preventDefault();
  }
  function pointerEnd(event: PointerEvent): void {
    if (state.drag && event.pointerId === state.drag.pointerId) finish(event.clientX, event.clientY);
  }
  function pointerCancel(event: PointerEvent): void {
    if (state.drag && event.pointerId === state.drag.pointerId) cancel();
  }
  function mouseMove(event: MouseEvent): void {
    if (!state.drag) return;
    move(event.clientX, event.clientY);
    if (state.drag?.active) event.preventDefault();
  }
  function mouseEnd(event: MouseEvent): void {
    if (state.drag) finish(event.clientX, event.clientY);
  }
  function bindMouse(host: ListenerHost): void {
    listen(host, 'mousemove', mouseMove);
    listen(host, 'mouseup', mouseEnd);
  }

  return {
    subscribe: store.subscribe,
    setConflict(conflict: AssignmentConflict | null): void { update(state.drag, conflict); },
    clearSuppression(): void { suppressedClickId = null; },
    consumeClick(troopId: TroopId): boolean {
      if (suppressedClickId !== troopId) return false;
      suppressedClickId = null;
      return true;
    },
    reset(): void { cancel(); suppressedClickId = null; update(null, null); },
    dispose(): void { cancel(); suppressedClickId = null; update(null, null); disposed = true; },
    startPointer(event: PointerEvent, troopId: TroopId, sourceRiftId: string | null, label: string, portraitUrl: string): void {
      if (disposed || state.drag || options.isBlocked(troopId) || event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
      begin(event.pointerId, event.clientX, event.clientY, troopId, sourceRiftId, label, portraitUrl);
      const runtime = options.runtime();
      for (const host of [runtime.window, runtime.document]) {
        listen(host, 'pointermove', pointerMove);
        listen(host, 'pointerup', pointerEnd);
        listen(host, 'pointercancel', pointerCancel);
        if (event.pointerType === 'mouse') bindMouse(host);
      }
    },
    startMouse(event: MouseEvent, troopId: TroopId, sourceRiftId: string | null, label: string, portraitUrl: string): void {
      if (disposed || state.drag || options.isBlocked(troopId) || event.button !== 0) return;
      event.preventDefault();
      begin(null, event.clientX, event.clientY, troopId, sourceRiftId, label, portraitUrl);
      const runtime = options.runtime();
      bindMouse(runtime.window);
      bindMouse(runtime.document);
    },
    startNative(event: DragEvent, troopId: TroopId, sourceRiftId: string | null): void {
      if (disposed || !event.dataTransfer || options.isBlocked(troopId)) { event.preventDefault(); return; }
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(TROOP_MIME_TYPE, JSON.stringify({ troopId, sourceRiftId }));
      const troop = options.describeTroop(troopId);
      if (troop) {
        begin(null, event.clientX, event.clientY, troopId, sourceRiftId, troop.label, troop.portraitUrl);
        move(event.clientX, event.clientY, true);
      }
    },
    allowNativeDrop(event: DragEvent): void {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      move(event.clientX, event.clientY, true);
    },
    endNative: cancel,
    finishNativeDrop(event: DragEvent, target: TroopDropTarget): void {
      event.preventDefault();
      if (disposed) return;
      const payload = event.dataTransfer?.getData(TROOP_MIME_TYPE);
      if (!payload) return;
      try {
        const parsed: unknown = JSON.parse(payload);
        if (!parsed || typeof parsed !== 'object' || !('troopId' in parsed) || typeof parsed.troopId !== 'string' || !parsed.troopId) return;
        const source = 'sourceRiftId' in parsed ? parsed.sourceRiftId : null;
        if (source !== null && typeof source !== 'string') return;
        options.onDrop(parsed.troopId, source, target);
      } catch {
        // External drags may contain non-Shiftmake data.
      }
    },
  };
}

export type TroopAssignmentInteraction = ReturnType<typeof createTroopAssignmentInteraction>;
