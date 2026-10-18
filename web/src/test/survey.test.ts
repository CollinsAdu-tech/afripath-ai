import { describe, expect, it } from 'vitest';
import { buildProfile, optionsFor, SURVEY_STEPS } from '../survey/model';
import { engine, KNOWN_FIELDS } from './engine';

describe('survey model', () => {
  it('only asks questions the engine accepts, once each', () => {
    const keys = SURVEY_STEPS.flatMap((s) => s.fields.map((f) => f.key));
    for (const k of keys) expect(KNOWN_FIELDS.has(k), `${k} is not an engine field`).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('offers every option the engine defines, each with a label', () => {
    const opts = engine.options().options as Record<string, unknown[]>;
    for (const step of SURVEY_STEPS) for (const f of step.fields) {
      if (f.kind === 'number') continue;
      const shown = optionsFor(f, engine.options().options);
      const expected = (opts[f.source ?? f.key] ?? []).map((o) => String(typeof o === 'object' && o ? (o as { id: string }).id : o));
      expect(shown.map((o) => String(o.id)), `${f.key} options`).toEqual(expected);
      for (const o of shown) expect(o.label.length, `${f.key}:${o.id} label`).toBeGreaterThan(0);
    }
  });

  it('drops empty answers, coerces numbers and ignores unknown keys', () => {
    const p = buildProfile({ interests: [], goals: ['research'], mathConfidence: '4', weeklyHours: '5', budget: '', device: undefined, evil: 'x', email: 'a@b.c' } as never);
    expect(p).toEqual({ goals: ['research'], mathConfidence: 4, weeklyHours: 5 });
    expect(buildProfile({})).toEqual({});
    expect(buildProfile(null)).toEqual({});
  });

  it('produces a profile the engine accepts without warnings', () => {
    const answers = { interests: ['web_building'], currentSkills: ['programming'], workStyles: ['building'], educationLevel: 'senior_secondary', subjects: ['ict_computing'], mathConfidence: '3', programmingExperience: 'none', goals: ['technical_career'], budget: 'none', internet: 'limited', device: 'phone_only', weeklyHours: '5', learningFormats: ['text'] };
    const res = engine.recommend(buildProfile(answers));
    expect(res.warnings).toEqual([]);
    expect(res.recommendations.length).toBeGreaterThan(0);
  });
});
