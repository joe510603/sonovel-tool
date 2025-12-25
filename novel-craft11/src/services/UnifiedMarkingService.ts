/**
 * UnifiedMarkingService - 统一标记服务（简化版）
 * 
 * 只保留故事单元相关功能
 */

import { App } from 'obsidian';
import { UnifiedMarkRepository } from './UnifiedMarkRepository';
import { BookDatabaseService } from './BookDatabaseService';
import { DataSyncService } from './DataSyncService';
import {
  UnifiedMark,
  TextRange,
  MarkAssociations,
  MarkVisualStyle,
  StoryUnitSelection,
  AnalysisTemplateType,
} from '../types/unified-marking';

export interface CreateMarkParams {
  bookId: string;
  mode: 'story-unit';
  range: TextRange;
  type: 'story';
  subType?: string;
  note?: string;
  associations?: Partial<MarkAssociations>;
  style?: Partial<MarkVisualStyle>;
}

export interface UpdateMarkParams {
  note?: string;
  associations?: Partial<MarkAssociations>;
  style?: Partial<MarkVisualStyle>;
  content?: string;
  unitName?: string;
  analysisTemplate?: AnalysisTemplateType;
  selections?: StoryUnitSelection[];
  analysisResult?: any;
}

export interface MarkChangeEvent {
  type: 'created' | 'updated' | 'deleted';
  mark: UnifiedMark;
  bookId: string;
}

export type MarkChangeCallback = (event: MarkChangeEvent) => void;

export class UnifiedMarkingService {
  private app: App;
  private repository: UnifiedMarkRepository;
  private bookDatabaseService: BookDatabaseService;
  private dataSyncService: DataSyncService | null = null;
  private changeCallbacks: MarkChangeCallback[] = [];
  private bookPathCache: Map<string, string> = new Map();

  constructor(app: App, repository: UnifiedMarkRepository, bookDatabaseService?: BookDatabaseService) {
    this.app = app;
    this.repository = repository;
    this.bookDatabaseService = bookDatabaseService || new BookDatabaseService(app);
  }

  setDataSyncService(service: DataSyncService): void {
    this.dataSyncService = service;
  }

  setBookDatabaseService(service: BookDatabaseService): void {
    this.bookDatabaseService = service;
  }

  registerBookPath(bookId: string, bookPath: string): void {
    this.bookPathCache.set(bookId, bookPath);
    this.repository.registerBookPath(bookId, bookPath);
  }

  private async getBookPath(bookId: string): Promise<string | null> {
    if (this.bookPathCache.has(bookId)) {
      return this.bookPathCache.get(bookId)!;
    }
    return null;
  }

  /**
   * 创建标记
   */
  async createMark(params: CreateMarkParams): Promise<UnifiedMark> {
    const mark: UnifiedMark = {
      id: this.generateMarkId(),
      bookId: params.bookId,
      mode: params.mode,
      range: params.range,
      type: params.type,
      subType: params.subType || 'main',
      category: this.getDefaultCategory(params.type, params.subType),
      note: params.note,
      associations: {
        characterName: params.associations?.characterName,
        settingName: params.associations?.settingName,
        linkedMarkIds: params.associations?.linkedMarkIds || [],
        tags: params.associations?.tags || [],
      },
      style: {
        color: params.style?.color || '#FF6B6B',
        borderStyle: params.style?.borderStyle || 'solid',
        layer: params.style?.layer || 0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.repository.saveMark(params.bookId, mark);
    this.notifyChange({ type: 'created', mark, bookId: params.bookId });
    return mark;
  }

  /**
   * 获取标记
   */
  async getMark(bookId: string, markId: string): Promise<UnifiedMark | null> {
    return await this.repository.getMark(bookId, markId);
  }

  /**
   * 更新标记
   */
  async updateMark(bookId: string, markId: string, updates: UpdateMarkParams): Promise<void> {
    const mark = await this.repository.getMark(bookId, markId);
    if (!mark) {
      throw new Error(`标记不存在: ${markId}`);
    }

    const updatedMark: UnifiedMark = {
      ...mark,
      ...updates,
      associations: updates.associations ? { ...mark.associations, ...updates.associations } : mark.associations,
      style: updates.style ? { ...mark.style, ...updates.style } : mark.style,
      updatedAt: new Date(),
    };

    await this.repository.saveMark(bookId, updatedMark);
    this.notifyChange({ type: 'updated', mark: updatedMark, bookId });
  }

  /**
   * 删除标记
   */
  async deleteMark(bookId: string, markId: string): Promise<void> {
    const mark = await this.repository.getMark(bookId, markId);
    if (!mark) {
      throw new Error(`标记不存在: ${markId}`);
    }

    await this.repository.deleteMark(bookId, markId);
    this.notifyChange({ type: 'deleted', mark, bookId });
  }

  /**
   * 获取书籍的所有标记
   */
  async getMarksByBook(bookId: string): Promise<UnifiedMark[]> {
    return await this.repository.getMarksByBook(bookId);
  }

  /**
   * 监听标记变更
   */
  onMarkChange(callback: MarkChangeCallback): void {
    this.changeCallbacks.push(callback);
  }

  /**
   * 移除标记变更监听
   */
  offMarkChange(callback: MarkChangeCallback): void {
    const index = this.changeCallbacks.indexOf(callback);
    if (index > -1) {
      this.changeCallbacks.splice(index, 1);
    }
  }

  private notifyChange(event: MarkChangeEvent): void {
    for (const callback of this.changeCallbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error('标记变更回调执行失败:', error);
      }
    }
  }

  private generateMarkId(): string {
    return `mark_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getDefaultCategory(type: string, subType?: string): string {
    if (type === 'story') {
      const labels: Record<string, string> = {
        main: '主线',
        sub: '支线',
        independent: '独立',
        custom: '自定义'
      };
      return labels[subType || 'main'] || '故事';
    }
    return '故事单元';
  }
}