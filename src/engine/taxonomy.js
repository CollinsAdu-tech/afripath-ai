// Manually maintained career taxonomy.
//
// WHY THIS EXISTS: the v0.7 knowledge base has NO fields describing which interests,
// strengths, work styles or goals suit a career (verified against all 9 career records).
// So matching needs an explicit, reviewable mapping. Every number below is an EDITORIAL
// judgement (0 = no relationship, 1 = core fit), grounded in the evidence strings, which
// cite the career's category/summary/audiences/quick-start/roadmap in the KB.
// These are not statistics. Review them with educators and update TAXONOMY_VERSION when changed.
// Keys not listed for a career are treated as "unknown" (excluded), not as zero.
//
// `prep` (0 none .. 3 strong) is the HELPFUL preparation for later stages, not an entry requirement:
// in the KB every career's first stage is documented as beginner-friendly ("no prerequisites" or
// introductory resources). A prep gap only nudges the academic factor (see config.prepGapFloor),
// and drives prerequisite guidance in the roadmap. It never excludes a career.
// `foundationPath: true` marks an introductory path that is less useful to someone who already codes.

export const TAXONOMY_VERSION = '0.1.0-editorial';

// order: intelligent_systems, web_building, data_patterns, security_investigation,
//        cloud_infrastructure, science_quantum, ai_ethics_governance, organizing_projects, helping_solving
const I = (a) => Object.fromEntries(['intelligent_systems','web_building','data_patterns','security_investigation','cloud_infrastructure','science_quantum','ai_ethics_governance','organizing_projects','helping_solving'].map((k,i)=>[k,a[i]]));
// order: logical_reasoning, mathematics, communication, creativity, research, problem_solving, teamwork, organization, programming, analytical_thinking
const S = (a) => Object.fromEntries(['logical_reasoning','mathematics','communication','creativity','research','problem_solving','teamwork','organization','programming','analytical_thinking'].map((k,i)=>[k,a[i]]));
// order: building, investigating, analyzing, researching, helping_people, planning_coordinating
const W = (a) => Object.fromEntries(['building','investigating','analyzing','researching','helping_people','planning_coordinating'].map((k,i)=>[k,a[i]]));
// order: build_products, research, protect_people_orgs, improve_education, solve_community_problems, start_business, technical_career
const G = (a) => Object.fromEntries(['build_products','research','protect_people_orgs','improve_education','solve_community_problems','start_business','technical_career'].map((k,i)=>[k,a[i]]));
// order: mathematics, physics, ict_computing, biology_chemistry, social_science_humanities, business_economics, languages_communication
const U = (a) => Object.fromEntries(['mathematics','physics','ict_computing','biology_chemistry','social_science_humanities','business_economics','languages_communication'].map((k,i)=>[k,a[i]]));

// prep: helpful starting preparation on a 0..3 scale (0 none, 1 some, 2 comfortable, 3 strong).
// These guide the STARTING POINT and prerequisite hints; they never exclude a career.
export const CAREER_TAXONOMY = Object.freeze({
  career_ai_ml_engineering: {
    interests: I([1, .3, .8, .2, .3, .4, .3, .1, .3]),
    strengths: S([.8, .8, .3, .5, .6, .9, .4, .3, .9, .9]),
    workStyles: W([1, .4, .8, .6, .3, .2]),
    goals: G([.9, .6, .2, .3, .6, .6, .9]),
    subjects: U([.9, .5, 1, .2, .2, .2, .1]),
    prep: { math: 1, programming: 1, science: 0 },
    evidence: ['KB summary: builds systems that learn from data and make predictions or decisions',
      'KB Level 1 resources: Kaggle Python, Intro to Machine Learning, Google generative-AI intro',
      'KB audience: undergraduates of any major; source says a formal technical background is not required',
      'KB Level 1 has no prerequisites and includes a Python micro-course; the KB states no maths requirement, so prep is kept low'],
  },
  career_cybersecurity: {
    interests: I([.2, .25, .3, 1, .4, .1, .2, .2, .3]),
    strengths: S([.8, .4, .5, .5, .6, 1, .5, .5, .6, .9]),
    workStyles: W([.5, 1, .7, .5, .4, .3]),
    goals: G([.3, .4, 1, .3, .5, .4, .9]),
    subjects: U([.5, .3, 1, .1, .2, .2, .2]),
    prep: { math: 0, programming: 0, science: 0 },
    evidence: ['KB skills: security fundamentals, networking, threat awareness, incident response, ethical testing',
      'KB projects: home lab, incident checklist, CTF write-ups (investigation and defence focus)',
      'KB lists no programming or maths skill for this path; audiences include undergraduates of any major'],
  },
  career_data_careers: {
    interests: I([.6, .2, 1, .1, .3, .4, .2, .3, .4]),
    strengths: S([.7, .8, .7, .4, .7, .8, .5, .6, .7, 1]),
    workStyles: W([.5, .6, 1, .6, .5, .3]),
    goals: G([.6, .6, .3, .4, .8, .6, .9]),
    subjects: U([1, .4, .8, .4, .4, .6, .1]),
    prep: { math: 1, programming: 1, science: 0 },
    evidence: ['KB category: Data; track-based plan (choose one data career track)',
      'KB projects: data reports and analysis deliverables',
      'KB skills include Python for data, R for data, data wrangling, data visualization and data storytelling'],
  },
  career_cloud_computing_aws: {
    interests: I([.2, .4, .2, .35, 1, .1, .05, .3, .15]),
    strengths: S([.7, .3, .4, .3, .4, .9, .5, .7, .6, .6]),
    workStyles: W([.9, .6, .4, .2, .2, .5]),
    goals: G([.7, .1, .4, .1, .3, .7, 1]),
    subjects: U([.3, .2, 1, 0, .1, .3, .1]),
    prep: { math: 0, programming: 0, science: 0 },
    evidence: ['KB category: Cloud Computing; AWS-focused roadmap and projects (static site, serverless API, monitoring)',
      'KB audience includes technical and non-technical learners aiming for cloud roles',
      'KB README: AWS Free Tier can incur charges; use budgets/alerts, MFA, least privilege'],
  },
  career_full_stack_web_development: {
    interests: I([.25, 1, .3, .2, .4, .05, .05, .25, .35]),
    strengths: S([.8, .3, .5, .9, .4, .9, .6, .5, 1, .5]),
    workStyles: W([1, .4, .3, .2, .5, .4]),
    goals: G([1, .1, .2, .3, .6, .9, .9]),
    subjects: U([.3, .1, 1, 0, .1, .3, .3]),
    prep: { math: 0, programming: 0, science: 0 },
    evidence: ['KB category: Software Development; Exploration stage starts from web basics (HTML/CSS, JavaScript); projects: portfolio site, e-commerce, CMS, collaboration'],
  },
  career_intro_to_coding: {
    foundationPath: true,
    interests: I([.45, .6, .4, .3, .2, .3, .05, .1, .4]),
    strengths: S([.9, .4, .3, .6, .3, .9, .3, .4, .6, .6]),
    workStyles: W([1, .5, .4, .2, .3, .2]),
    goals: G([.6, .2, .2, .5, .5, .4, .7]),
    subjects: U([.5, .3, .9, .1, .1, .1, .2]),
    prep: { math: 0, programming: 0, science: 0 },
    evidence: ['KB: four-week beginner JavaScript track for total beginners, students and career-switchers; browser-based tools, no local setup',
      'Treated as a general foundation path: moderately aligned with many technical interests, strongly aligned with building and programming'],
  },
  career_quantum_computing: {
    interests: I([.35, .05, .25, .3, .15, 1, .05, .05, .2]),
    strengths: S([.8, 1, .4, .4, .9, .8, .3, .3, .6, .9]),
    workStyles: W([.5, .5, .7, 1, .1, .1]),
    goals: G([.2, 1, .2, .3, .1, .1, .6]),
    subjects: U([1, 1, .6, .2, 0, 0, 0]),
    prep: { math: 2, programming: 1, science: 1 },
    evidence: ['KB category: Quantum Technologies; audiences: students in computing, mathematics, physics or engineering, plus curious beginners',
      'KB projects are educational simulations (random-number generator, BB84-style, teleportation, Grover, variational circuit)',
      'KB skills include linear algebra foundations and Qiskit basics; Level 4 lists "basic quantum states and gates" as a prerequisite; the source describes a beginner-friendly exploration path'],
  },
  career_ai_safety: {
    interests: I([.6, .05, .3, .35, .05, .3, 1, .25, .4]),
    strengths: S([.7, .5, .9, .5, 1, .6, .6, .6, .4, .9]),
    workStyles: W([.3, .5, .8, 1, .6, .5]),
    goals: G([.2, .9, .7, .4, .6, .1, .5]),
    subjects: U([.4, .2, .6, .2, 1, .5, .7]),
    prep: { math: 0, programming: 0, science: 0 },
    evidence: ['KB: multidisciplinary path spanning technical alignment, evaluation, governance and responsible-AI practice',
      'KB audiences include policy, law and social-science learners as well as computer-science learners',
      'KB Level 4 asks the student to choose a focus: technical alignment, evaluation, governance, or responsible AI'],
  },
  career_project_management: {
    interests: I([.1, .15, .2, .1, .15, .05, .2, 1, .5]),
    strengths: S([.5, .2, 1, .5, .4, .7, 1, 1, .2, .6]),
    workStyles: W([.3, .3, .5, .2, .8, 1]),
    goals: G([.5, .1, .3, .4, .8, .7, .5]),
    subjects: U([.3, .1, .5, .1, .5, 1, .8]),
    prep: { math: 0, programming: 0, science: 0 },
    evidence: ['KB audiences: students leading clubs, events or group projects; operations and no-code automation',
      'KB projects: campus event plan, NGO program delivery plan, workflow automation, Airtable dashboard'],
  },
});

/** Structural check of the taxonomy. Returns a list of problems (empty when valid). */
export function validateTaxonomy(taxonomy = CAREER_TAXONOMY) {
  const problems = [];
  const groups = { interests: 9, strengths: 10, workStyles: 6, goals: 7, subjects: 7 };
  for (const [cid, t] of Object.entries(taxonomy)) {
    for (const [g, n] of Object.entries(groups)) {
      const m = t[g];
      if (!m || Object.keys(m).length !== n) problems.push(`${cid}.${g}: expected ${n} entries`);
      for (const [k, v] of Object.entries(m || {})) if (!(typeof v === 'number' && v >= 0 && v <= 1)) problems.push(`${cid}.${g}.${k}: ${v} is not in 0..1`);
    }
    for (const d of ['math', 'programming', 'science']) if (!Number.isInteger(t.prep?.[d]) || t.prep[d] < 0 || t.prep[d] > 3) problems.push(`${cid}.prep.${d}: expected integer 0..3`);
    if (!Array.isArray(t.evidence) || t.evidence.length === 0) problems.push(`${cid}.evidence: at least one evidence note is required`);
  }
  return problems;
}
