import type { BioSkillCategory } from './catalog';
import type { BioSkillMetadata } from './loader';
import { loadCategorySkills } from './loader';

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
  loadCategory(sessionID: string, categoryNames: string[]): boolean {
    let sessionMap = this.loadedBySession.get(sessionID);
    if (!sessionMap) {
      sessionMap = new Map();
      this.loadedBySession.set(sessionID, sessionMap);
    }

    let anyLoaded = false;
    for (const categoryName of categoryNames) {
      const category = this.categories.find((c) => c.name === categoryName);
      if (!category) continue;

      // Already loaded
      if (sessionMap.has(categoryName)) {
        anyLoaded = true;
        continue;
      }

      const skills = loadCategorySkills(category.path, categoryName);
      sessionMap.set(categoryName, {
        name: categoryName,
        skills,
        loadedAt: Date.now(),
      });
      anyLoaded = true;
    }

    return anyLoaded;
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
