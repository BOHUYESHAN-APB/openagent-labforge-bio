import type { BioSkillCategory } from './catalog';
import type { BioSkillMetadata } from './loader';
import { loadCategorySkills } from './loader';

export interface BioSkillLoadRequest {
  name: string;
  query?: string;
  limit?: number;
  skills?: string[];
}

export interface LoadedCategoryResult {
  name: string;
  selectedSkills: BioSkillMetadata[];
  totalAvailable: number;
  addedCount: number;
  totalLoaded: number;
  query?: string;
  limit?: number;
}

export interface LoadedCategory {
  name: string;
  skills: BioSkillMetadata[];
  loadedAt: number;
}

/**
 * Manages loaded bio skills per session
 */
export class BioSkillsSessionManager {
  private loadedBySession = new Map<string, Map<string, LoadedCategory>>();
  private categories: BioSkillCategory[];

  constructor(categories: BioSkillCategory[]) {
    this.categories = categories;
  }

  /**
   * Load categories for a specific session
   */
  loadCategory(
    sessionID: string,
    requests: Array<string | BioSkillLoadRequest>,
  ): LoadedCategoryResult[] {
    let sessionMap = this.loadedBySession.get(sessionID);
    if (!sessionMap) {
      sessionMap = new Map();
      this.loadedBySession.set(sessionID, sessionMap);
    }

    const results: LoadedCategoryResult[] = [];
    for (const rawRequest of requests) {
      const request = normalizeRequest(rawRequest);
      const category = this.categories.find((c) => c.name === request.name);
      if (!category) continue;

      const allSkills = loadCategorySkills(category.path, request.name);
      const selectedSkills = selectSkills(allSkills, request);

      const existing = sessionMap.get(request.name);
      const mergedSkills = mergeSkills(existing?.skills ?? [], selectedSkills);
      const addedCount = mergedSkills.length - (existing?.skills.length ?? 0);

      sessionMap.set(request.name, {
        name: request.name,
        skills: mergedSkills,
        loadedAt: Date.now(),
      });

      results.push({
        name: request.name,
        selectedSkills,
        totalAvailable: allSkills.length,
        addedCount,
        totalLoaded: mergedSkills.length,
        query: request.query,
        limit: request.limit,
      });
    }

    return results;
  }

  /**
   * Get all loaded skills for a session
   */
  getLoadedSkills(sessionID: string): BioSkillMetadata[] {
    const sessionMap = this.loadedBySession.get(sessionID);
    if (!sessionMap) return [];

    const allSkills: BioSkillMetadata[] = [];
    for (const loaded of sessionMap.values()) {
      allSkills.push(...loaded.skills);
    }
    return allSkills;
  }

  /**
   * Get loaded category names for a session
   */
  getLoadedCategories(sessionID: string): string[] {
    const sessionMap = this.loadedBySession.get(sessionID);
    if (!sessionMap) return [];
    return Array.from(sessionMap.keys());
  }

  /**
   * Clear loaded skills for a session
   */
  clearSession(sessionID: string): void {
    this.loadedBySession.delete(sessionID);
  }

  /**
   * Get available categories catalog
   */
  getCatalog(): BioSkillCategory[] {
    return this.categories;
  }
}

function normalizeRequest(
  request: string | BioSkillLoadRequest,
): BioSkillLoadRequest {
  if (typeof request === 'string') {
    return { name: request };
  }

  return request;
}

function mergeSkills(
  existing: BioSkillMetadata[],
  incoming: BioSkillMetadata[],
): BioSkillMetadata[] {
  const byPath = new Map(existing.map((skill) => [skill.filePath, skill]));
  for (const skill of incoming) {
    byPath.set(skill.filePath, skill);
  }

  return Array.from(byPath.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

function selectSkills(
  allSkills: BioSkillMetadata[],
  request: BioSkillLoadRequest,
): BioSkillMetadata[] {
  const explicitSkills = new Set(
    (request.skills ?? []).map((value) => value.trim()),
  );
  const limit = clampLimit(request.limit);

  if (explicitSkills.size > 0) {
    const explicitMatches = allSkills.filter((skill) =>
      explicitSkills.has(skill.name),
    );
    return explicitMatches.slice(0, limit);
  }

  const query = request.query?.trim().toLowerCase();
  if (!query) {
    return [...allSkills]
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit);
  }

  return [...allSkills]
    .map((skill) => ({
      skill,
      score: scoreSkill(skill, query),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.skill.name.localeCompare(right.skill.name);
    })
    .slice(0, limit)
    .map((entry) => entry.skill);
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return 12;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), 50);
}

function scoreSkill(skill: BioSkillMetadata, query: string): number {
  const haystacks = [
    skill.name.toLowerCase(),
    skill.description.toLowerCase(),
    skill.category.toLowerCase(),
    skill.toolType?.toLowerCase() ?? '',
    skill.primaryTool?.toLowerCase() ?? '',
  ];
  const fullText = haystacks.join(' ');
  const tokens = query.split(/\s+/).filter(Boolean);

  let score = 0;
  if (skill.name.toLowerCase().includes(query)) {
    score += 12;
  }
  if (skill.description.toLowerCase().includes(query)) {
    score += 7;
  }
  if (skill.primaryTool?.toLowerCase().includes(query)) {
    score += 5;
  }

  for (const token of tokens) {
    if (skill.name.toLowerCase().includes(token)) {
      score += 4;
    }
    if (skill.description.toLowerCase().includes(token)) {
      score += 3;
    }
    if (fullText.includes(token)) {
      score += 1;
    }
  }

  return score;
}
