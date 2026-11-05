// Types for the unit tests that import models.mjs / kit.mjs (the tools themselves are plain JavaScript).
import type { Model } from './kit.mjs';

export type ModelBuilder = () => Model;
export const MODEL_GROUPS: Record<string, Record<string, ModelBuilder>>;
export const MODEL_GROUP_OF: Record<string, string>;
export const EXTRA_MODELS: Record<string, ModelBuilder>;
export function mergeModelGroups(groups: Record<string, Record<string, unknown>>): { all: Record<string, ModelBuilder>; groupOf: Record<string, string> };
export function buildModels(group?: string): Record<string, Model>;
