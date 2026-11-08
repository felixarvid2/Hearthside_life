// Milestone 11 (twelve career tracks): the six new ten-level ladders are complete, monotonic in pay, keep
// their shifts on one day and only ask for skills the content database defines. The events added with them
// are validated the same way the content checker validates the older ones.

import { describe, expect, it } from 'vitest';
import { CAREER_EVENTS } from '../../../src/content/careerEvents';
import { promotionDays } from '../../../src/content/careers';
import { content } from '../../../src/content/index';
import { careersForStage } from '../../../src/sim/careers';

const db = content();

/** The careers this task adds, with the main skills brief section 11 lists for each. */
const NEW_CAREERS: Array<{ id: string; name: string; skills: string[] }> = [
  { id: 'education', name: 'Education', skills: ['charisma', 'logic'] },
  { id: 'visualArts', name: 'Visual Arts', skills: ['painting', 'photography', 'creativity'] },
  { id: 'science', name: 'Science', skills: ['logic', 'programming', 'research'] },
  { id: 'athletics', name: 'Athletics', skills: ['fitness', 'wellness'] },
  { id: 'design', name: 'Design and Architecture', skills: ['creativity', 'handiness'] },
  { id: 'hospitality', name: 'Hospitality', skills: ['cooking', 'charisma'] },
];

describe('Milestone 11 career ladders', () => {
  it.each(NEW_CAREERS)('$name is a ready ten-level career with its brief skills', ({ id, name, skills }) => {
    const career = db.careers[id];
    expect(career, id).toBeDefined();
    expect(career!.name).toBe(name);
    expect(career!.status).toBe('ready');
    expect(career!.partTime).toBeFalsy();
    expect(career!.levels).toHaveLength(10);
    for (const skill of skills) expect(career!.skills, `${id} main skills`).toContain(skill);
    for (const skill of career!.skills) expect(db.skills[skill], `${id} references skill '${skill}'`).toBeDefined();
  });

  it('has thirteen full tracks in total (seven existing plus the six new ones)', () => {
    const full = Object.values(db.careers).filter((c) => !c.partTime);
    expect(full).toHaveLength(13);
    for (const { id } of NEW_CAREERS) expect(full.some((c) => c.id === id)).toBe(true);
  });

  it.each(NEW_CAREERS)('$name: levels 1-10 are ordered, monotonic in pay and have same-day shifts', ({ id }) => {
    const levels = db.careers[id]!.levels;
    levels.forEach((level, i) => {
      expect(level.level, id).toBe(i + 1);
      expect(level.title.trim().length, `${id} level ${level.level} title`).toBeGreaterThan(0);
      expect(Number.isInteger(level.hourlyWage)).toBe(true);
      expect(level.hourlyWage).toBeGreaterThan(0);
      if (i > 0) expect(level.hourlyWage, `${id} level ${level.level} pay`).toBeGreaterThan(levels[i - 1]!.hourlyWage);
      expect(level.days.length, `${id} level ${level.level} days`).toBeGreaterThan(0);
      expect(new Set(level.days).size).toBe(level.days.length);
      for (const day of level.days) expect(day).toBeGreaterThanOrEqual(0);
      for (const day of level.days) expect(day).toBeLessThanOrEqual(6);
      expect(level.start).toBeGreaterThanOrEqual(0);
      expect(level.end).toBeGreaterThan(level.start);
      expect(level.end).toBeLessThanOrEqual(1440);
      expect(level.promotion.performance).toBeGreaterThanOrEqual(-100);
      expect(level.promotion.performance).toBeLessThanOrEqual(100);
      // The ladder follows the convention: the days requirement grows with the level (promotionDays).
      expect(level.promotion.days ?? 0, `${id} level ${level.level} days worked`).toBe(promotionDays(level.level));
      for (const [skill, lvl] of Object.entries(level.promotion.skills)) {
        expect(db.skills[skill], `${id} level ${level.level}: unknown skill '${skill}'`).toBeDefined();
        expect(lvl).toBeGreaterThanOrEqual(1);
        expect(lvl).toBeLessThanOrEqual(10);
      }
    });
  });

  it('every promotion skill in every career exists, and the top rung is unreachable by design', () => {
    for (const career of Object.values(db.careers)) {
      for (const level of career.levels) {
        for (const skill of Object.keys(level.promotion.skills)) expect(db.skills[skill], `${career.id}: ${skill}`).toBeDefined();
      }
      if (career.partTime) continue; // part-time jobs stop at three levels and do not use the 100 cap
      const top = career.levels[career.levels.length - 1]!;
      expect(top.promotion.performance).toBe(100);
      expect(top.promotion.skills).toEqual({});
    }
  });

  it('offers every new career to adults (the job panel, job search and NPC assignment all use this filter)', () => {
    const adultJobs = careersForStage(db, 'adult').map((c) => c.id);
    for (const { id } of NEW_CAREERS) expect(adultJobs, id).toContain(id);
    // The creator's starting-jobs list and neighbourhood NPC jobs use the same ready, non-part-time set.
    expect(adultJobs).toHaveLength(13);
  });

  it('varies the work week: Education is weekdays, Hospitality evenings and weekends, Athletics early mornings', () => {
    const education = db.careers['education']!;
    for (const level of education.levels) expect(level.days.every((d) => d <= 4), level.title).toBe(true);
    const hospitality = db.careers['hospitality']!;
    expect(hospitality.levels[0]!.days.every((d) => d >= 2)).toBe(true);
    expect(hospitality.levels[0]!.start).toBeGreaterThanOrEqual(14 * 60);
    const athletics = db.careers['athletics']!;
    for (const level of athletics.levels.slice(0, 5)) expect(level.start).toBeLessThanOrEqual(7 * 60);
  });

  it('some promotion needs a friendship outside the household in each new career', () => {
    for (const { id } of NEW_CAREERS) {
      expect(db.careers[id]!.levels.some((l) => l.promotion.relationship), id).toBe(true);
    }
  });
});

describe('Milestone 11 career events', () => {
  it('adds at least the two decisions per new career and keeps every skill reward valid', () => {
    expect(CAREER_EVENTS.length).toBeGreaterThanOrEqual(17); // five existing plus two per new career
    expect(new Set(CAREER_EVENTS.map((e) => e.id)).size).toBe(CAREER_EVENTS.length);
    for (const event of CAREER_EVENTS) {
      expect(event.options.length, event.id).toBeGreaterThanOrEqual(2);
      for (const option of event.options) {
        expect(Number.isFinite(option.performance), `${event.id}/${option.id}`).toBe(true);
        if (option.skill) expect(db.skills[option.skill.id], `${event.id}/${option.id}: ${option.skill.id}`).toBeDefined();
      }
    }
  });
});
