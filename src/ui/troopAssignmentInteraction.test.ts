import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import { createTroopAssignmentInteraction, isCurrentTroopDropTarget } from './troopAssignmentInteraction';

class ListenerHost {
  listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject | null) => {
    if (!listener) return;
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  });
  removeEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject | null) => {
    if (listener) this.listeners.get(type)?.delete(listener);
  });
  emit(type: string, event: unknown): void {
    [...this.listeners.get(type) ?? []].forEach(listener => {
      if (typeof listener === 'function') listener(event as Event); else listener.handleEvent(event as Event);
    });
  }
  count(): number { return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0); }
}

function setup() {
  const window = new ListenerHost();
  const document = Object.assign(new ListenerHost(), { elementFromPoint: vi.fn(() => null as Element | null) });
  const options = { runtime: vi.fn(() => ({ window, document })), isBlocked: vi.fn(() => false),
    describeTroop: vi.fn(() => ({ label: 'Troop', portraitUrl: '/portrait.png' })),
    onDragComplete: vi.fn(), onDrop: vi.fn() };
  const interaction = createTroopAssignmentInteraction(options);
  const rift = (id: string) => document.elementFromPoint.mockReturnValue({ closest: () => ({ dataset: { riftDropTarget: id } }) } as unknown as Element);
  const ready = () => document.elementFromPoint.mockReturnValue({ closest: () => ({ dataset: { readyDropTarget: 'true' } }) } as unknown as Element);
  return { window, document, options, interaction, rift, ready };
}

function pointer(patch: Partial<PointerEvent> = {}): PointerEvent {
  return { pointerId: 7, pointerType: 'mouse', button: 0, clientX: 0, clientY: 0,
    currentTarget: { setPointerCapture: vi.fn() }, preventDefault: vi.fn(), ...patch } as unknown as PointerEvent;
}

function native(payload = '') {
  const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn(() => payload) };
  const event = { dataTransfer, clientX: 20, clientY: 30, preventDefault: vi.fn() } as unknown as DragEvent;
  return { event, dataTransfer };
}

describe('troop assignment interaction', () => {
  it('starts captured pointer drag without allowing the overlapping mouse start', () => {
    const { interaction, window, document } = setup();
    const event = pointer();
    interaction.startPointer(event, 'troop', null, 'Troop', '/portrait.png');
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect((event.currentTarget as HTMLElement).setPointerCapture).toHaveBeenCalledWith(7);
    expect(get(interaction).drag).toMatchObject({ pointerId: 7, active: false, troopId: 'troop' });
    expect(window.count()).toBe(5);
    expect(document.count()).toBe(5);
    interaction.startMouse(pointer({ clientX: 99 }), 'other', null, 'Other', '/other.png');
    expect(get(interaction).drag?.troopId).toBe('troop');
    expect(window.count()).toBe(5);
  });

  it('blocks holding troops, non-primary mouse buttons and use after disposal', () => {
    const { interaction, options, window } = setup();
    options.isBlocked.mockReturnValue(true);
    interaction.startPointer(pointer(), 'holding', null, 'Holding', '/portrait.png');
    interaction.startMouse(pointer(), 'holding', null, 'Holding', '/portrait.png');
    expect(get(interaction).drag).toBeNull();
    options.isBlocked.mockReturnValue(false);
    interaction.startPointer(pointer({ button: 2 }), 'troop', null, 'Troop', '/portrait.png');
    interaction.startMouse(pointer({ button: 2 }), 'troop', null, 'Troop', '/portrait.png');
    interaction.dispose();
    interaction.startPointer(pointer(), 'troop', null, 'Troop', '/portrait.png');
    expect(window.count()).toBe(0);
    expect(get(interaction).drag).toBeNull();
  });

  it('activates only beyond the movement threshold and retains active drag when moving back', () => {
    const { interaction, window, rift } = setup();
    interaction.startPointer(pointer(), 'troop', null, 'Troop', '/portrait.png');
    rift('a');
    window.emit('pointermove', pointer({ clientX: 6 }));
    expect(get(interaction).drag).toMatchObject({ active: false, dropTarget: null });
    const move = pointer({ clientX: 7 });
    window.emit('pointermove', move);
    expect(move.preventDefault).toHaveBeenCalledOnce();
    expect(get(interaction).drag).toMatchObject({ active: true, dropTarget: { kind: 'rift', riftId: 'a' } });
    window.emit('pointermove', pointer());
    expect(get(interaction).drag?.active).toBe(true);
  });

  it('finishes once at the release target, clears every listener and suppresses only the dragged click', () => {
    const { interaction, window, document, options, rift } = setup();
    interaction.startPointer(pointer(), 'troop', 'source', 'Troop', '/portrait.png');
    rift('hovered');
    window.emit('pointermove', pointer({ clientX: 20 }));
    rift('released');
    window.emit('pointerup', pointer({ clientX: 30 }));
    document.emit('pointerup', pointer({ clientX: 30 }));
    window.emit('mouseup', pointer({ clientX: 30 }));
    expect(options.onDragComplete.mock.calls).toEqual([['troop']]);
    expect(options.onDrop.mock.calls).toEqual([['troop', 'source', { kind: 'rift', riftId: 'released' }]]);
    expect(window.count() + document.count()).toBe(0);
    expect(get(interaction).drag).toBeNull();
    expect(interaction.consumeClick('other')).toBe(false);
    expect(interaction.consumeClick('troop')).toBe(true);
    expect(interaction.consumeClick('troop')).toBe(false);
  });

  it('does not turn a click below the threshold into assignment', () => {
    const { interaction, window, options, rift } = setup();
    interaction.startPointer(pointer(), 'troop', null, 'Troop', '/portrait.png');
    rift('a');
    window.emit('pointerup', pointer({ clientX: 2 }));
    expect(options.onDrop).not.toHaveBeenCalled();
    expect(options.onDragComplete).not.toHaveBeenCalled();
    expect(interaction.consumeClick('troop')).toBe(false);
    expect(window.count()).toBe(0);
  });

  it('ignores foreign pointer events and cancels the matching pointer without a drop', () => {
    const { interaction, window, options, rift } = setup();
    interaction.startPointer(pointer({ pointerType: 'touch' }), 'troop', null, 'Troop', '/portrait.png');
    expect(window.count()).toBe(3);
    rift('a');
    window.emit('pointermove', pointer({ pointerId: 9, clientX: 20 }));
    window.emit('pointerup', pointer({ pointerId: 9 }));
    window.emit('pointercancel', pointer({ pointerId: 9 }));
    expect(get(interaction).drag?.active).toBe(false);
    window.emit('pointercancel', pointer());
    expect(get(interaction).drag).toBeNull();
    expect(options.onDrop).not.toHaveBeenCalled();
    expect(window.count()).toBe(0);
  });

  it('supports mouse fallback and dropping assigned troops into the ready zone', () => {
    const { interaction, window, document, options, ready } = setup();
    interaction.startMouse(pointer(), 'troop', 'source', 'Troop', '/portrait.png');
    expect(window.count()).toBe(2);
    ready();
    document.emit('mousemove', pointer({ clientX: 20 }));
    document.emit('mouseup', pointer({ clientX: 20 }));
    expect(options.onDrop.mock.calls).toEqual([['troop', 'source', { kind: 'ready' }]]);
    expect(window.count() + document.count()).toBe(0);
  });

  it('cleans listeners and stale events on reset/disposal and clears conflicts/suppression', () => {
    const { interaction, window, document, options, rift } = setup();
    interaction.startMouse(pointer(), 'troop', null, 'Troop', '/portrait.png');
    interaction.setConflict({ troopId: 'troop', riftId: 'a', message: 'Conflict' });
    interaction.reset();
    expect(get(interaction)).toEqual({ drag: null, conflict: null });
    window.emit('mousemove', pointer({ clientX: 20 }));
    expect(options.onDrop).not.toHaveBeenCalled();
    interaction.startPointer(pointer(), 'troop', null, 'Troop', '/portrait.png');
    rift('a');
    window.emit('pointermove', pointer({ clientX: 20 }));
    interaction.dispose();
    window.emit('pointerup', pointer({ clientX: 20 }));
    expect(options.onDrop).not.toHaveBeenCalled();
    expect(window.count() + document.count()).toBe(0);
    expect(window.removeEventListener.mock.calls.length).toBe(window.addEventListener.mock.calls.length);
  });

  it('exposes native drag payload/visuals and releases visual state at drag end', () => {
    const { interaction, rift, options } = setup();
    const { event, dataTransfer } = native();
    rift('a');
    interaction.startNative(event, 'troop', 'source');
    expect(dataTransfer.effectAllowed).toBe('move');
    expect(dataTransfer.setData).toHaveBeenCalledWith('application/x-shiftmake-troop', JSON.stringify({ troopId: 'troop', sourceRiftId: 'source' }));
    expect(get(interaction).drag).toMatchObject({ active: true, label: 'Troop', dropTarget: { kind: 'rift', riftId: 'a' } });
    interaction.allowNativeDrop(event);
    expect(dataTransfer.dropEffect).toBe('move');
    interaction.endNative();
    expect(get(interaction).drag).toBeNull();
    expect(options.onDrop).not.toHaveBeenCalled();
  });

  it('accepts native troop drops but rejects malformed external payloads', () => {
    const { interaction, options } = setup();
    interaction.finishNativeDrop(native(JSON.stringify({ troopId: 'troop', sourceRiftId: 'source' })).event, { kind: 'ready' });
    expect(options.onDrop.mock.calls).toEqual([['troop', 'source', { kind: 'ready' }]]);
    options.onDrop.mockClear();
    for (const payload of ['', 'bad json', 'null', '[]', '{}', '{"troopId":1}', '{"troopId":""}', '{"troopId":"a","sourceRiftId":1}']) {
      interaction.finishNativeDrop(native(payload).event, { kind: 'ready' });
    }
    expect(options.onDrop).not.toHaveBeenCalled();
    interaction.finishNativeDrop(native('{"troopId":"a"}').event, { kind: 'rift', riftId: 'a' });
    expect(options.onDrop.mock.calls).toEqual([['a', null, { kind: 'rift', riftId: 'a' }]]);
    interaction.dispose();
    options.onDrop.mockClear();
    interaction.finishNativeDrop(native('{"troopId":"a"}').event, { kind: 'ready' });
    expect(options.onDrop).not.toHaveBeenCalled();
  });

  it('blocks native drags for holding troops or missing data transfer', () => {
    const { interaction, options } = setup();
    options.isBlocked.mockReturnValue(true);
    const { event, dataTransfer } = native();
    interaction.startNative(event, 'troop', null);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(dataTransfer.setData).not.toHaveBeenCalled();
    options.isBlocked.mockReturnValue(false);
    const withoutTransfer = { preventDefault: vi.fn(), dataTransfer: null } as unknown as DragEvent;
    interaction.startNative(withoutTransfer, 'troop', null);
    expect(withoutTransfer.preventDefault).toHaveBeenCalledOnce();
    expect(get(interaction).drag).toBeNull();
  });

  it('matches ready/rift highlights by target identity', () => {
    expect(isCurrentTroopDropTarget(null, 'ready')).toBe(false);
    expect(isCurrentTroopDropTarget({ kind: 'ready' }, 'ready')).toBe(true);
    expect(isCurrentTroopDropTarget({ kind: 'ready' }, 'rift', 'a')).toBe(false);
    expect(isCurrentTroopDropTarget({ kind: 'rift', riftId: 'a' }, 'rift', 'a')).toBe(true);
    expect(isCurrentTroopDropTarget({ kind: 'rift', riftId: 'a' }, 'rift', 'b')).toBe(false);
  });
});
