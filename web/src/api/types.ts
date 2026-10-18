// Types for the engine API. The response shapes come from docs/openapi.json (generated into schema.d.ts by
// `npm run gen:types`), so a change to the engine contract shows up here as a type error, not a runtime surprise.
import type { components } from './schema';

type S = components['schemas'];

export type StudentProfile = S['StudentProfile'];
export type Recommendation = S['Recommendation'];
export type RecommendationResponse = S['RecommendationResponse'];
export type RoadmapResponse = S['RoadmapResponse'];
export type Stage = S['Stage'];
export type Resource = S['Resource'];
export type ResourceRef = S['ResourceRef'];
export type Project = S['Project'];
export type FirstAction = S['FirstAction'];
export type CareerSummary = S['CareerSummary'];
export type FactorBreakdown = S['FactorBreakdown'];
export type Fit = S['Fit'];
export type PrerequisiteGuidance = S['PrerequisiteGuidance'];
export type BridgePath = S['BridgePath'];
export type OpportunityLead = RoadmapResponse['opportunityLeads'][number];
export type ErrorBody = S['ErrorResponse'];

export interface OptionItem { id: string; label: string }

/** GET /v1/options. Enumerated answers arrive as plain ids; the survey supplies friendly labels. */
export interface OptionsResponse {
  options: {
    interests: OptionItem[];
    strengths: OptionItem[];
    workStyles: OptionItem[];
    goals: OptionItem[];
    subjects: OptionItem[];
    mathConfidence: number[];
    programmingExperience: string[];
    scienceBackground: string[];
    educationLevel: string[];
    budget: string[];
    internet: string[];
    device: string[];
    learningFormats: string[];
  };
  factorWeights: Record<string, number>;
}
export type OptionKey = keyof OptionsResponse['options'];

export interface CareerListItem extends CareerSummary { stageCount: number; projectCount: number; scored: boolean }
export interface CareersResponse { careers: CareerListItem[] }

export interface HealthResponse {
  status: string;
  knowledgeBase: { loaded: boolean; version?: string; counts?: Record<string, number> };
}
