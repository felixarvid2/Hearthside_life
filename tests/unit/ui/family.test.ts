import { describe, expect, it } from 'vitest';
import { feedToToast } from '../../../src/ui/hud/notify';
import { birthdayText, stageName } from '../../../src/ui/hud/familyModel';
import { sectionsOf } from '../../../src/ui/hud/socialModel';
import type { MenuOption } from '../../../src/game/api';

describe('family texts', () => {
  it('say when the birthday is, only when aging is on', () => {
    expect(birthdayText(null)).toBe('');
    expect(birthdayText(0)).toBe('Birthday today');
    expect(birthdayText(1)).toBe('Birthday tomorrow');
    expect(birthdayText(6)).toBe('Birthday in 6 days');
    expect(stageName('youngAdult')).toBe('Young adult');
  });

  it('birthdays and report cards are notifications (the family feed entry is a success toast with a sound)', () => {
    const t = feedToToast({ id: 'f1', at: 0, kind: 'family', text: 'Happy birthday, Kit!' }, { state: null, content: {} as never, household: new Set(), editing: false });
    expect(t).toMatchObject({ kind: 'success', sound: 'levelUp', text: 'Happy birthday, Kit!' });
  });

  it('care entries get their own section in the social menu, listed first', () => {
    const opt = (section: string): MenuOption => ({ interactionId: section, label: section, icon: 'x', group: 'social', enabled: true, section, token: null });
    const parts = sectionsOf('social', [opt('friendly'), opt('care'), opt('special')]);
    expect(parts.map((p) => p.id)).toEqual(['care', 'friendly', 'special']);
    expect(parts[0]!.label).toBe('Look after');
  });
});
