import { describe, expect, it } from 'vitest';
import { isRoutineMultiplayerStatus, multiplayerStatusCode } from './multiplayerProtocol';

describe('multiplayer status compatibility', () => {
  it('uses explicit codes even when display text conflicts', () => {
    expect(multiplayerStatusCode({ statusCode: 'cycle-resolved', message: 'Localized result' })).toBe('cycle-resolved');
    expect(multiplayerStatusCode({ statusCode: 'error', message: 'Cycle end canceled.' })).toBe('error');
    expect(multiplayerStatusCode({ statusCode: 'future-code', message: 'Cycle end canceled.' })).toBe('unknown');
    expect(multiplayerStatusCode({ statusCode: null, message: 'Cycle end canceled.' })).toBe('unknown');
  });

  it.each([
    ['Cycle ended. Waiting for the other player.', 'cycle-submitted'],
    ['Cycle end canceled.', 'cycle-canceled'],
    ['Both players submitted. Resolving...', 'resolving'],
    ['Both players submitted. Cycle resolved.', 'cycle-resolved'],
    ['Both players submitted. Contest updated.', 'contest-updated'],
  ])('supports code-less legacy status %s', (message, code) => {
    expect(multiplayerStatusCode({ message })).toBe(code);
  });

  it('preserves unknown notices and resolving feedback', () => {
    expect(multiplayerStatusCode({ message: null })).toBe('idle');
    expect(multiplayerStatusCode({ message: 'Something unexpected' })).toBe('unknown');
    expect(isRoutineMultiplayerStatus('resolving')).toBe(false);
    expect(isRoutineMultiplayerStatus('error')).toBe(false);
    expect(isRoutineMultiplayerStatus('unknown')).toBe(false);
  });
});
