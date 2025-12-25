/**
 * UnifiedMarkRepository - 统一标记存储仓库（简化版）
 * 
 * 只保留故事单元相关功能
 */

import { App, normalizePath, TFile } from 'obsidian';
import { UnifiedMark } from '../types/unified-marking';
import { BookDatabaseService } from './BookDatabaseService';
import { StoryUnit, DATABASE_FILES } from '../types/database';

export class UnifiedMarkRepository {
  private app: App;
  private basePath: string;
  private bookDatabaseService: BookDatabaseService;
  private bookPathCache: Map<string, string> = new Map();

  constructor(app: App, basePath?: string, bookDatabaseService?: BookDatabaseService) {
    this.app = app;
    this.basePath = basePath || '.novelcraft/unified-marks';
    this.bookDatabaseService = bookDatabaseService || new BookDatabaseService(app);
  }

  setBookDatabaseService(service: BookDatabaseService): void {
    this.bookDatabaseService = service;
  }

  registerBookPath(bookId: string, bookPath: string): void {
    this.bookPathCache.set(bookId, bookPath);
  }

  private async getBookPath(bookId: string): Promise<string | null> {
    if (this.bookPathCache.has(bookId)) {
      return this.bookPathCache.get(bookId)!;
    }
    return null;
  }

  /**
   * 保存标记
   */
  async saveMark(bookId: string, mark: UnifiedMark): Promise<void> {
    const bookPath = await this.getBookPath(bookId);
    
    if (bookPath && mark.mode === 'story-unit') {
      await this.saveToDatabase(bookPath, mark);
    } else {
      // 简单的 JSON 存储作为后备
      await this.saveToJsonStorage(bookId, mark);
    }
  }

  /**
   * 获取标记
   */
  async getMark(bookId: string, markId: string): Promise<UnifiedMark | null> {
    const bookPath = await this.getBookPath(bookId);
    
    if (bookPath) {
      // 尝试从数据库获取
      const storyUnits = await this.bookDatabaseService.getStoryUnits(bookPath);
      const unit = storyUnits.find(u => u.unitId === markId);
      if (unit) {
        return this.storyUnitToMark(unit, bookId);
      }
    }
    
    // 回退到 JSON 存储
    return await this.getFromJsonStorage(bookId, markId);
  }

  /**
   * 删除标记
   */
  async deleteMark(bookId: string, markId: string): Promise<void> {
    const bookPath = await this.getBookPath(bookId);
    
    if (bookPath) {
      try {
        await this.bookDatabaseService.deleteStoryUnit(bookPath, markId);
        return;
      } catch (error) {
        // 如果数据库删除失败，尝试 JSON 存储
      }
    }
    
    await this.deleteFromJsonStorage(bookId, markId);
  }

  /**
   * 获取书籍的所有标记
   */
  async getMarksByBook(bookId: string): Promise<UnifiedMark[]> {
    const marks: UnifiedMark[] = [];
    const bookPath = await this.getBookPath(bookId);
    
    if (bookPath) {
      // 从数据库获取故事单元
      try {
        const storyUnits = await this.bookDatabaseService.getStoryUnits(bookPath);
        for (const unit of storyUnits) {
          marks.push(this.storyUnitToMark(unit, bookId));
        }
      } catch (error) {
        console.warn('从数据库获取故事单元失败:', error);
      }
    }
    
    // 从 JSON 存储获取其他标记
    const jsonMarks = await this.getAllFromJsonStorage(bookId);
    marks.push(...jsonMarks);
    
    return marks;
  }

  // ============ 数据库存储 ============

  private async saveToDatabase(bookPath: string, mark: UnifiedMark): Promise<void> {
    const storyUnit = this.markToStoryUnit(mark);
    
    const existingUnits = await this.bookDatabaseService.getStoryUnits(bookPath);
    const existingIndex = existingUnits.findIndex(u => u.unitId === mark.id);
    
    if (existingIndex >= 0) {
      await this.bookDatabaseService.updateStoryUnit(bookPath, mark.id, {
        name: storyUnit.name,
        chapterRange: storyUnit.chapterRange,
        lineType: storyUnit.lineType,
        textContent: storyUnit.textContent,
      });
    } else {
      const bookMeta = await this.bookDatabaseService.getBookMeta(bookPath);
      if (bookMeta) {
        await this.bookDatabaseService.addStoryUnit(bookPath, {
          ...storyUnit,
          bookId: bookMeta.bookId,
        });
      }
    }
  }

  private markToStoryUnit(mark: UnifiedMark): Omit<StoryUnit, 'unitId' | 'createdAt' | 'updatedAt'> {
    const startChapter = (mark.range?.start?.chapterIndex ?? 0) + 1;
    const endChapter = (mark.range?.end?.chapterIndex ?? startChapter - 1) + 1;
    
    return {
      bookId: mark.bookId,
      name: mark.unitName || mark.note || `故事单元_${mark.id.slice(-6)}`,
      chapterRange: {
        start: startChapter,
        end: endChapter,
      },
      preciseRange: {
        start: {
          chapterIndex: mark.range?.start?.chapterIndex ?? 0,
          lineNumber: (mark.range?.start?.paragraphIndex ?? 0) + 1,
          characterOffset: mark.range?.start?.characterOffset ?? 0,
        },
        end: {
          chapterIndex: mark.range?.end?.chapterIndex ?? 0,
          lineNumber: (mark.range?.end?.paragraphIndex ?? 0) + 1,
          characterOffset: mark.range?.end?.characterOffset ?? 0,
        },
      },
      lineType: this.mapSubTypeToLineType(mark.subType),
      customLineType: mark.subType === 'custom' ? mark.category : undefined,
      categories: mark.associations?.tags || [],
      relatedCharacters: mark.associations?.characterName ? [mark.associations.characterName] : [],
      textContent: mark.content || mark.range?.textSnapshot || '',
      analysisTemplate: (mark.analysisTemplate as StoryUnit['analysisTemplate']) || 'seven-step',
      source: 'manual',
    };
  }

  private storyUnitToMark(unit: StoryUnit, bookId: string): UnifiedMark {
    return {
      id: unit.unitId,
      bookId: bookId,
      mode: 'story-unit',
      range: {
        start: {
          chapterIndex: unit.preciseRange?.start.chapterIndex ?? (unit.chapterRange.start - 1),
          paragraphIndex: unit.preciseRange?.start.lineNumber ? unit.preciseRange.start.lineNumber - 1 : 0,
          characterOffset: unit.preciseRange?.start.characterOffset ?? 0,
        },
        end: {
          chapterIndex: unit.preciseRange?.end.chapterIndex ?? (unit.chapterRange.end - 1),
          paragraphIndex: unit.preciseRange?.end.lineNumber ? unit.preciseRange.end.lineNumber - 1 : 0,
          characterOffset: unit.preciseRange?.end.characterOffset ?? 0,
        },
        textSnapshot: unit.textContent?.slice(0, 200) || '',
      },
      type: 'story',
      subType: unit.lineType,
      category: unit.customLineType || this.getLineTypeLabel(unit.lineType),
      unitName: unit.name,
      note: unit.name,
      associations: {
        characterName: unit.relatedCharacters[0],
        linkedMarkIds: [],
        tags: unit.categories || [],
      },
      style: {
        color: '#FF6B6B',
        borderStyle: 'solid',
        layer: 0,
      },
      content: unit.textContent,
      analysisTemplate: unit.analysisTemplate,
      analysisResult: unit.aiAnalysis ? this.convertAnalysisResult(unit.aiAnalysis) : undefined,
      createdAt: new Date(unit.createdAt),
      updatedAt: new Date(unit.updatedAt),
    };
  }

  private mapSubTypeToLineType(subType?: string): StoryUnit['lineType'] {
    switch (subType) {
      case 'main': return 'main';
      case 'sub': return 'sub';
      case 'independent': return 'independent';
      default: return 'main';
    }
  }

  private getLineTypeLabel(lineType: StoryUnit['lineType']): string {
    const labels: Record<StoryUnit['lineType'], string> = {
      main: '主线',
      sub: '支线',
      independent: '独立',
      custom: '自定义',
    };
    return labels[lineType] || lineType;
  }

  private convertAnalysisResult(analysis: any): any {
    // 简单转换，保持兼容性
    return analysis;
  }

  // ============ JSON 存储（后备） ============

  private async saveToJsonStorage(bookId: string, mark: UnifiedMark): Promise<void> {
    const storage = await this.loadJsonStorage(bookId);
    storage.marks[mark.id] = mark;
    await this.saveJsonStorage(bookId, storage);
  }

  private async getFromJsonStorage(bookId: string, markId: string): Promise<UnifiedMark | null> {
    const storage = await this.loadJsonStorage(bookId);
    return storage.marks[markId] || null;
  }

  private async deleteFromJsonStorage(bookId: string, markId: string): Promise<void> {
    const storage = await this.loadJsonStorage(bookId);
    delete storage.marks[markId];
    await this.saveJsonStorage(bookId, storage);
  }

  private async getAllFromJsonStorage(bookId: string): Promise<UnifiedMark[]> {
    const storage = await this.loadJsonStorage(bookId);
    return Object.values(storage.marks);
  }

  private async loadJsonStorage(bookId: string): Promise<{ marks: Record<string, UnifiedMark> }> {
    const path = this.getStoragePath(bookId);
    
    try {
      const content = await this.app.vault.adapter.read(path);
      return JSON.parse(content);
    } catch {
      return { marks: {} };
    }
  }

  private async saveJsonStorage(bookId: string, storage: { marks: Record<string, UnifiedMark> }): Promise<void> {
    const path = this.getStoragePath(bookId);
    const folderPath = path.substring(0, path.lastIndexOf('/'));
    
    if (folderPath && !(await this.app.vault.adapter.exists(folderPath))) {
      await this.app.vault.createFolder(folderPath);
    }
    
    await this.app.vault.adapter.write(path, JSON.stringify(storage, null, 2));
  }

  private getStoragePath(bookId: string): string {
    return normalizePath(`${this.basePath}/${bookId}.json`);
  }
}