// Converts raw questionnaire answers into a consistent, validated student profile.
//
// Contract:
//  - Never throws.
//  - `errors`   : the request is malformed (wrong type/shape). The caller should reject it.
//  - `warnings` : something was ignored (unknown option id, unknown field, out-of-range number).
//  - Missing / empty answers stay null or [] and are treated by the engine as "not answered",
//    never as lack of ability or interest.
//  - Only the fields below are read. Anything else is ignored with a warning, so a frontend does
//    not accidentally send (and a deployment does not accidentally process) personal data.

import { QUESTIONNAIRE_OPTIONS as O } from './options.js';
import { CONFIG } from './config.js';

const slug = (v) => String(v).trim().toLowerCase().replace(/[\s\-/]+/g, '_').replace(/[^a-z0-9_]/g, '');
const idsOf = (list) => new Set(list.map((o) => (typeof o === 'string' ? o : o.id)));

export const ARRAY_FIELDS = Object.freeze({
  interests: idsOf(O.interests),
  currentSkills: idsOf(O.strengths),
  skillsToDevelop: idsOf(O.strengths),
  workStyles: idsOf(O.workStyles),
  goals: idsOf(O.goals),
  subjects: idsOf(O.subjects),
  learningFormats: idsOf(O.learningFormats),
});
export const ENUM_FIELDS = Object.freeze({
  programmingExperience: idsOf(O.programmingExperience),
  scienceBackground: idsOf(O.scienceBackground),
  educationLevel: idsOf(O.educationLevel),
  budget: idsOf(O.budget),
  internet: idsOf(O.internet),
  device: idsOf(O.device),
});
const NUMBER_FIELDS = ['mathConfidence', 'weeklyHours', 'experienceByCareer'];
export const KNOWN_FIELDS = Object.freeze(new Set([...Object.keys(ARRAY_FIELDS), ...Object.keys(ENUM_FIELDS), ...NUMBER_FIELDS]));

const isBlank = (v) => v === undefined || v === null || v === '';
/** Accepts a finite number or a numeric string; rejects booleans, arrays, objects. */
const toNumber = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
};

/**
 * @param {unknown} raw
 * @returns {{profile: object|null, warnings: {field:string,code:string,message:string}[], errors: {field:string,code:string,message:string}[]}}
 */
export function normalizeProfile(raw) {
  const warnings = [];
  const errors = [];
  const warn = (field, code, message) => warnings.push({ field, code, message });
  const fail = (field, code, message) => errors.push({ field, code, message });

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('profile', 'INVALID_TYPE', 'The student profile must be an object of questionnaire answers.');
    return { profile: null, warnings, errors };
  }

  for (const key of Object.keys(raw)) {
    if (!KNOWN_FIELDS.has(key)) warn(key.slice(0, 40), 'UNKNOWN_FIELD', `"${key.slice(0, 40)}" is not a questionnaire field and was ignored. Do not send personal information.`);
  }

  const profile = {};
  const max = CONFIG.limits.maxArrayAnswers;

  for (const [field, allowed] of Object.entries(ARRAY_FIELDS)) {
    const v = raw[field];
    if (isBlank(v)) { profile[field] = []; continue; }
    if (!Array.isArray(v)) { fail(field, 'INVALID_TYPE', `"${field}" must be a list of option ids.`); profile[field] = []; continue; }
    const out = [];
    for (const item of v.slice(0, max)) {
      if (typeof item !== 'string') { warn(field, 'IGNORED_VALUE', `Ignored a non-text value in "${field}".`); continue; }
      const id = slug(item);
      if (!allowed.has(id)) { warn(field, 'UNKNOWN_OPTION', `Ignored unknown option "${item.slice(0, 40)}" in "${field}".`); continue; }
      if (!out.includes(id)) out.push(id);
    }
    if (v.length > max) warn(field, 'TOO_MANY_VALUES', `Only the first ${max} answers in "${field}" were used.`);
    profile[field] = out;
  }

  for (const [field, allowed] of Object.entries(ENUM_FIELDS)) {
    const v = raw[field];
    if (isBlank(v)) { profile[field] = null; continue; }
    if (typeof v !== 'string') { fail(field, 'INVALID_TYPE', `"${field}" must be a text option id.`); profile[field] = null; continue; }
    const id = slug(v);
    if (!allowed.has(id)) { warn(field, 'UNKNOWN_OPTION', `Ignored unknown value "${v.slice(0, 40)}" for "${field}".`); profile[field] = null; continue; }
    profile[field] = id;
  }

  const mc = raw.mathConfidence;
  profile.mathConfidence = null;
  if (!isBlank(mc)) {
    const n = toNumber(mc);
    if (Number.isInteger(n) && n >= 1 && n <= 5) profile.mathConfidence = n;
    else if (typeof mc === 'number' || typeof mc === 'string') warn('mathConfidence', 'OUT_OF_RANGE', 'Ignored "mathConfidence": expected a whole number from 1 to 5.');
    else fail('mathConfidence', 'INVALID_TYPE', '"mathConfidence" must be a whole number from 1 to 5.');
  }

  const wh = raw.weeklyHours;
  profile.weeklyHours = null;
  if (!isBlank(wh)) {
    const n = toNumber(wh);
    if (Number.isFinite(n) && n >= 0 && n <= 80) profile.weeklyHours = n;
    else if (typeof wh === 'number' || typeof wh === 'string') warn('weeklyHours', 'OUT_OF_RANGE', 'Ignored "weeklyHours": expected a number from 0 to 80.');
    else fail('weeklyHours', 'INVALID_TYPE', '"weeklyHours" must be a number from 0 to 80.');
  }

  // Optional prior experience per career id: 'none' | 'some' | 'solid'. Lets a returning student skip ahead.
  profile.experienceByCareer = {};
  const ebc = raw.experienceByCareer;
  if (!isBlank(ebc)) {
    if (typeof ebc !== 'object' || Array.isArray(ebc)) fail('experienceByCareer', 'INVALID_TYPE', '"experienceByCareer" must be an object mapping career ids to "none", "some" or "solid".');
    else {
      for (const [cid, lvl] of Object.entries(ebc)) {
        const l = typeof lvl === 'string' ? slug(lvl) : '';
        if (cid !== '__proto__' && /^[a-z0-9_]{1,80}$/.test(cid) && ['none', 'some', 'solid'].includes(l)) profile.experienceByCareer[cid] = l;
        else warn('experienceByCareer', 'IGNORED_VALUE', `Ignored experience entry for "${cid.slice(0, 40)}".`);
      }
    }
  }
  return { profile, warnings, errors };
}
