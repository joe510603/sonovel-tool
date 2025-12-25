/**
 * DataSyncService - 数据同步服务
 * 
 * 管理可视化层与数据层的双向同步：
 * - 同步 AI 分析结果到数据库
 * - 同步 Canvas 修改到数据库
 * - 处理数据冲突
 * 
 * Requirements: 1.3, 10.5, 11.2, 7.4
 */

import { App, TFile, normalizePath } from 'obsidian';
import { BookDatabaseService } from './BookDatabaseService';
import {
  BookMeta,
  Character,
  StoryUnit,
  StoryEvent,
  ChapterFrontmatter,
  DataSource,
  StoryUnitAnalysis,
  DATABASE_FILES,
} from '../types/database';
import {
  AnalysisResult,
  CharacterAnalysis,
  ChapterSummary,
} from '../types';

/**
 * 数据冲突类型
 */
export interface DataConflict {
  /** 冲突类型 */
  type: 'book_meta' | 'character' | 'story_unit' | 'event' | 'chapter';
  /** 冲突字段 */
  field: string;
  /** 现有值 */
  existingValue: unknown;
  /** 新值 */
  newValue: unknown;
  /** 现有数据来源 */
  existingSource: DataSource;
  /** 新数据来源 */
  newSource: DataSource;
  /** 相关记录 ID */
  recordId?: string;
}

/**
 * 冲突解决策略
 */
export type ConflictStrategy = 'ai' | 'manual' | 'merge';

/**
 * Canvas 变更类型
 */
export interface CanvasChange {
  /** 变更类型 */
  type: 'add' | 'update' | 'delete';
  /** 节点/边 ID */
  id: string;
  /** 变更数据 */
  data?: Record<string, unknown>;
}

/**
 * Canvas 节点类型
 */
export type CanvasNodeType = 'text' | 'file' | 'link' | 'group';

/**
 * Canvas 节点
 */
export interface CanvasNode {
  /** 节点 ID */
  id: string;
  /** 节点类型 */
  type: CanvasNodeType;
  /** X 坐标 */
  x: number;
  /** Y 坐标 */
  y: number;
  /** 宽度 */
  width: number;
  /** 高度 */
  height: number;
  /** 文本内容 */
  text?: string;
  /** 文件路径 */
  file?: string;
  /** 链接 URL */
  url?: string;
  /** 背景颜色 */
  color?: string;
  /** 标签 */
  label?: string;
}

/**
 * Canvas 边
 */
export interface CanvasEdge {
  /** 边 ID */
  id: string;
  /** 起始节点 ID */
  fromNode: string;
  /** 起始端点位置 */
  fromSide: 'top' | 'right' | 'bottom' | 'left';
  /** 结束节点 ID */
  toNode: string;
  /** 结束端点位置 */
  toSide: 'top' | 'right' | 'bottom' | 'left';
  /** 边的颜色 */
  color?: string;
  /** 边的标签 */
  label?: string;
}

/**
 * Canvas 数据结构
 */
export interface CanvasData {
  /** 节点列表 */
  nodes: CanvasNode[];
  /** 边列表 */
  edges: CanvasEdge[];
}

/**
 * 同步结果
 */
export interface SyncResult {
  /** 是否成功 */
  success: boolean;
  /** 同步的记录数 */
  syncedCount: number;
  /** 冲突列表 */
  conflicts: DataConflict[];
  /** 错误信息 */
  errors: string[];
}

/**
 * DataSyncService - 数据同步服务
 */
export class DataSyncService {
  private app: App;
  private bookDatabaseService: BookDatabaseService;

  constructor(app: App, bookDatabaseService: BookDatabaseService) {
    this.app = app;
    this.bookDatabaseService = bookDatabaseService;
  }

  // ============ AI 分析结果同步 ============

  /**
   * 同步 AI 分析结果到数据库
   * 
   * @param bookPath - 书籍文件夹路径
   * @param result - AI 分析结果
   * @returns 同步结果
   * 
   * Requirements: 1.3, 11.2
   */
  async syncAnalysisResult(bookPath: string, result: AnalysisResult): Promise<SyncResult> {
    const syncResult: SyncResult = {
      success: true,
      syncedCount: 0,
      conflicts: [],
      errors: [],
    };

    try {
      // 1. 同步书籍元数据
      await this.syncBookMeta(bookPath, result, syncResult);

      // 2. 同步人物数据
      await this.syncCharacters(bookPath, result.characters, syncResult);

      // 3. 同步章节概述到 Frontmatter
      if (result.chapterStructure) {
        await this.syncChapterSummaries(bookPath, result.chapterStructure, syncResult);
      }

    } catch (error) {
      syncResult.success = false;
      syncResult.errors.push(
        error instanceof Error ? error.message : '同步过程中发生未知错误'
      );
    }

    return syncResult;
  }

  /**
   * 同步书籍元数据
   */
  private async syncBookMeta(
    bookPath: string,
    result: AnalysisResult,
    syncResult: SyncResult
  ): Promise<void> {
    const existingMeta = await this.bookDatabaseService.getBookMeta(bookPath);
    
    if (!existingMeta) {
      // 如果数据库不存在，先初始化
      await this.bookDatabaseService.initializeDatabase(bookPath, {
        title: result.bookInfo.title,
        author: result.bookInfo.author,
        description: result.bookInfo.description,
      });
      syncResult.syncedCount++;
    }

    // 更新 AI 分析结果
    const updates: Partial<BookMeta> = {
      aiSynopsis: result.synopsis,
      aiWritingTechniques: result.writingTechniques?.map(t => t.name) || [],
      aiTakeaways: result.takeaways || [],
    };

    // 检查冲突
    if (existingMeta?.aiSynopsis && existingMeta.aiSynopsis !== result.synopsis) {
      syncResult.conflicts.push({
        type: 'book_meta',
        field: 'aiSynopsis',
        existingValue: existingMeta.aiSynopsis,
        newValue: result.synopsis,
        existingSource: 'ai',
        newSource: 'ai',
      });
    }

    await this.bookDatabaseService.updateBookMeta(bookPath, updates);
    syncResult.syncedCount++;
  }

  /**
   * 同步人物数据
   */
  private async syncCharacters(
    bookPath: string,
    characters: CharacterAnalysis[],
    syncResult: SyncResult
  ): Promise<void> {
    if (!characters || characters.length === 0) {
      return;
    }

    const bookId = await this.bookDatabaseService.getBookId(bookPath);
    if (!bookId) {
      syncResult.errors.push('无法获取书籍 ID，跳过人物同步');
      return;
    }

    const existingCharacters = await this.bookDatabaseService.getCharacters(bookPath);
    const existingNameMap = new Map(existingCharacters.map(c => [c.name, c]));

    for (const char of characters) {
      const existing = existingNameMap.get(char.name);

      if (existing) {
        // 检查冲突
        if (existing.source === 'manual' && existing.aiDescription !== char.description) {
          syncResult.conflicts.push({
            type: 'character',
            field: 'aiDescription',
            existingValue: existing.aiDescription,
            newValue: char.description,
            existingSource: existing.source,
            newSource: 'ai',
            recordId: existing.characterId,
          });
        }

        // 更新现有人物
        await this.bookDatabaseService.updateCharacter(bookPath, existing.characterId, {
          aiDescription: char.description,
          aiMotivation: char.motivation,
          aiGrowthArc: char.growthArc,
          role: this.mapCharacterRole(char.role),
        });
      } else {
        // 添加新人物
        await this.bookDatabaseService.addCharacter(bookPath, {
          bookId,
          name: char.name,
          role: this.mapCharacterRole(char.role),
          aiDescription: char.description,
          aiMotivation: char.motivation,
          aiGrowthArc: char.growthArc,
          relationships: this.parseRelationships(char.relationships || []),
          firstAppearanceChapter: 0,
          appearanceChapters: [],
          source: 'ai',
        });
      }
      syncResult.syncedCount++;
    }
  }

  /**
   * 同步章节概述到 Frontmatter
   */
  private async syncChapterSummaries(
    bookPath: string,
    chapterStructure: ChapterSummary[],
    syncResult: SyncResult
  ): Promise<void> {
    const chapters = await this.bookDatabaseService.getChapters(bookPath);
    const chapterFiles = await this.bookDatabaseService.scanChapterFiles(bookPath);

    for (const summary of chapterStructure) {
      // 找到对应的章节文件
      const chapterFile = chapterFiles.find(f => {
        const num = parseInt(f.name.match(/^(\d+)/)?.[1] || '0', 10);
        return num === summary.index;
      });

      if (!chapterFile) {
        continue;
      }

      // 找到对应的章节 Frontmatter
      const existingChapter = chapters.find(c => c.chapterNum === summary.index);

      const frontmatter: ChapterFrontmatter = existingChapter || {
        bookId: await this.bookDatabaseService.getBookId(bookPath) || '',
        chapterId: `chapter_${summary.index}`,
        chapterNum: summary.index,
        title: summary.title,
        wordCount: 0,
        readStatus: 'unread',
      };

      // 更新 AI 分析结果
      frontmatter.aiSummary = summary.summary;
      frontmatter.aiKeyEvents = summary.keyEvents;

      await this.bookDatabaseService.updateChapterFrontmatter(
        chapterFile.path,
        frontmatter
      );
      syncResult.syncedCount++;
    }
  }

  // ============ 数据冲突处理 ============

  /**
   * 解决数据冲突
   * 
   * @param bookPath - 书籍文件夹路径
   * @param conflict - 冲突信息
   * @param strategy - 解决策略
   * 
   * Requirements: 10.5
   */
  async resolveConflict(
    bookPath: string,
    conflict: DataConflict,
    strategy: ConflictStrategy
  ): Promise<void> {
    let valueToUse: unknown;

    switch (strategy) {
      case 'ai':
        // 使用 AI 生成的值（新值）
        valueToUse = conflict.newValue;
        break;
      case 'manual':
        // 保留手动输入的值（现有值）
        valueToUse = conflict.existingValue;
        break;
      case 'merge':
        // 合并两个值
        valueToUse = this.mergeValues(conflict.existingValue, conflict.newValue);
        break;
    }

    // 根据冲突类型更新数据
    switch (conflict.type) {
      case 'book_meta':
        await this.bookDatabaseService.updateBookMeta(bookPath, {
          [this.camelToSnake(conflict.field)]: valueToUse,
        } as Partial<BookMeta>);
        break;

      case 'character':
        if (conflict.recordId) {
          await this.bookDatabaseService.updateCharacter(
            bookPath,
            conflict.recordId,
            { [conflict.field]: valueToUse } as Partial<Character>
          );
        }
        break;

      case 'story_unit':
        if (conflict.recordId) {
          await this.bookDatabaseService.updateStoryUnit(
            bookPath,
            conflict.recordId,
            { [conflict.field]: valueToUse } as Partial<StoryUnit>
          );
        }
        break;

      case 'event':
        if (conflict.recordId) {
          await this.bookDatabaseService.updateEvent(
            bookPath,
            conflict.recordId,
            { [conflict.field]: valueToUse } as Partial<StoryEvent>
          );
        }
        break;
    }
  }

  /**
   * 批量解决冲突
   * 
   * @param bookPath - 书籍文件夹路径
   * @param conflicts - 冲突列表
   * @param strategy - 解决策略
   */
  async resolveConflicts(
    bookPath: string,
    conflicts: DataConflict[],
    strategy: ConflictStrategy
  ): Promise<void> {
    for (const conflict of conflicts) {
      await this.resolveConflict(bookPath, conflict, strategy);
    }
  }

  // ============ Canvas 同步 ============

  /**
   * 同步 Canvas 修改到数据库
   * 
   * @param bookPath - 书籍文件夹路径
   * @param canvasType - Canvas 类型
   * @param changes - 变更列表
   * 
   * Requirements: 7.4
   */
  async syncCanvasChanges(
    bookPath: string,
    canvasType: 'character' | 'story',
    changes: CanvasChange[]
  ): Promise<SyncResult> {
    const syncResult: SyncResult = {
      success: true,
      syncedCount: 0,
      conflicts: [],
      errors: [],
    };

    try {
      for (const change of changes) {
        if (canvasType === 'character') {
          await this.syncCharacterCanvasChange(bookPath, change, syncResult);
        } else {
          await this.syncStoryCanvasChange(bookPath, change, syncResult);
        }
      }
    } catch (error) {
      syncResult.success = false;
      syncResult.errors.push(
        error instanceof Error ? error.message : 'Canvas 同步失败'
      );
    }

    return syncResult;
  }

  /**
   * 同步人物关系 Canvas 变更
   */
  private async syncCharacterCanvasChange(
    bookPath: string,
    change: CanvasChange,
    syncResult: SyncResult
  ): Promise<void> {
    const bookId = await this.bookDatabaseService.getBookId(bookPath);
    if (!bookId) {
      syncResult.errors.push('无法获取书籍 ID');
      return;
    }

    switch (change.type) {
      case 'add':
        if (change.data?.name) {
          await this.bookDatabaseService.addCharacter(bookPath, {
            bookId,
            name: String(change.data.name),
            role: 'supporting',
            relationships: [],
            firstAppearanceChapter: 0,
            appearanceChapters: [],
            source: 'manual',
          });
          syncResult.syncedCount++;
        }
        break;

      case 'update':
        if (change.data) {
          await this.bookDatabaseService.updateCharacter(
            bookPath,
            change.id,
            change.data as Partial<Character>
          );
          syncResult.syncedCount++;
        }
        break;

      case 'delete':
        await this.bookDatabaseService.deleteCharacter(bookPath, change.id);
        syncResult.syncedCount++;
        break;
    }
  }

  /**
   * 同步故事发展 Canvas 变更
   */
  private async syncStoryCanvasChange(
    bookPath: string,
    change: CanvasChange,
    syncResult: SyncResult
  ): Promise<void> {
    const bookId = await this.bookDatabaseService.getBookId(bookPath);
    if (!bookId) {
      syncResult.errors.push('无法获取书籍 ID');
      return;
    }

    switch (change.type) {
      case 'add':
        if (change.data?.name) {
          await this.bookDatabaseService.addStoryUnit(bookPath, {
            bookId,
            name: String(change.data.name),
            chapterRange: {
              start: Number(change.data.startChapter) || 1,
              end: Number(change.data.endChapter) || 1,
            },
            lineType: 'main',
            relatedCharacters: [],
            analysisTemplate: 'seven-step',
            source: 'manual',
          });
          syncResult.syncedCount++;
        }
        break;

      case 'update':
        if (change.data) {
          await this.bookDatabaseService.updateStoryUnit(
            bookPath,
            change.id,
            change.data as Partial<StoryUnit>
          );
          syncResult.syncedCount++;
        }
        break;

      case 'delete':
        await this.bookDatabaseService.deleteStoryUnit(bookPath, change.id);
        syncResult.syncedCount++;
        break;
    }
  }

  /**
   * 同步数据库变更到 Canvas
   * 
   * @param bookPath - 书籍文件夹路径
   * @param canvasType - Canvas 类型
   * @returns 同步结果
   * 
   * Requirements: 7.4
   */
  async syncDatabaseToCanvas(
    bookPath: string,
    canvasType: 'character' | 'story'
  ): Promise<SyncResult> {
    const syncResult: SyncResult = {
      success: true,
      syncedCount: 0,
      conflicts: [],
      errors: [],
    };

    try {
      const normalizedPath = normalizePath(bookPath);
      const canvasPath = canvasType === 'character'
        ? normalizePath(`${normalizedPath}/${DATABASE_FILES.CHARACTER_CANVAS}`)
        : normalizePath(`${normalizedPath}/${DATABASE_FILES.STORY_CANVAS}`);

      // 读取现有 Canvas 数据
      const existingCanvasData = await this.readCanvasFile(canvasPath);
      
      if (canvasType === 'character') {
        // 同步人物数据到 Canvas
        const characters = await this.bookDatabaseService.getCharacters(bookPath);
        const canvasData = this.buildCharacterCanvasData(characters);
        
        // 合并现有位置信息（保留用户手动调整的位置）
        const mergedData = this.mergeCanvasPositions(existingCanvasData, canvasData);
        
        await this.writeCanvasFile(canvasPath, mergedData);
        syncResult.syncedCount = characters.length;
      } else {
        // 同步故事单元数据到 Canvas
        const storyUnits = await this.bookDatabaseService.getStoryUnits(bookPath);
        const canvasData = this.buildStoryCanvasData(storyUnits);
        
        // 合并现有位置信息
        const mergedData = this.mergeCanvasPositions(existingCanvasData, canvasData);
        
        await this.writeCanvasFile(canvasPath, mergedData);
        syncResult.syncedCount = storyUnits.length;
      }
    } catch (error) {
      syncResult.success = false;
      syncResult.errors.push(
        error instanceof Error ? error.message : '同步到 Canvas 失败'
      );
    }

    return syncResult;
  }

  /**
   * 读取 Canvas 文件
   */
  private async readCanvasFile(canvasPath: string): Promise<CanvasData> {
    try {
      const file = this.app.vault.getAbstractFileByPath(canvasPath);
      if (!(file instanceof TFile)) {
        return { nodes: [], edges: [] };
      }
      
      const content = await this.app.vault.read(file);
      const data = JSON.parse(content);
      return {
        nodes: data.nodes || [],
        edges: data.edges || [],
      };
    } catch {
      return { nodes: [], edges: [] };
    }
  }

  /**
   * 写入 Canvas 文件
   */
  private async writeCanvasFile(canvasPath: string, data: CanvasData): Promise<void> {
    const normalizedPath = normalizePath(canvasPath);
    
    // 确保目录存在
    const folderPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));
    await this.ensureFolder(folderPath);
    
    const content = JSON.stringify(data, null, 2);
    
    const existingFile = this.app.vault.getAbstractFileByPath(normalizedPath);
    
    if (existingFile instanceof TFile) {
      await this.app.vault.modify(existingFile, content);
    } else {
      await this.app.vault.create(normalizedPath, content);
    }
  }

  /**
   * 确保文件夹存在
   */
  private async ensureFolder(folderPath: string): Promise<void> {
    const normalizedPath = normalizePath(folderPath);
    
    if (!this.app.vault.getAbstractFileByPath(normalizedPath)) {
      await this.app.vault.createFolder(normalizedPath);
    }
  }

  /**
   * 合并 Canvas 位置信息
   * 保留用户手动调整的节点位置
   */
  private mergeCanvasPositions(existing: CanvasData, updated: CanvasData): CanvasData {
    const existingPositions = new Map(
      existing.nodes.map(n => [n.id, { x: n.x, y: n.y }])
    );
    
    // 更新节点位置（如果存在则保留原位置）
    const mergedNodes = updated.nodes.map(node => {
      const existingPos = existingPositions.get(node.id);
      if (existingPos) {
        return { ...node, x: existingPos.x, y: existingPos.y };
      }
      return node;
    });
    
    return {
      nodes: mergedNodes,
      edges: updated.edges,
    };
  }

  /**
   * 构建人物关系 Canvas 数据
   */
  private buildCharacterCanvasData(characters: Character[]): CanvasData {
    const nodes: CanvasNode[] = [];
    const edges: CanvasEdge[] = [];
    
    // 角色颜色映射
    const roleColors: Record<string, string> = {
      protagonist: '1',  // 红色
      antagonist: '5',   // 紫色
      supporting: '4',   // 蓝色
      minor: '6',        // 灰色
    };
    
    // 关系颜色映射
    const relationshipColors: Record<string, string> = {
      friend: '4',
      enemy: '1',
      family: '3',
      lover: '2',
      rival: '5',
      custom: '6',
    };
    
    // 按角色类型分组并计算位置
    const roleGroups = new Map<string, Character[]>();
    for (const char of characters) {
      const role = char.role;
      if (!roleGroups.has(role)) {
        roleGroups.set(role, []);
      }
      roleGroups.get(role)!.push(char);
    }
    
    const roleLayout = [
      { role: 'protagonist', row: 0 },
      { role: 'antagonist', row: 1 },
      { role: 'supporting', row: 2 },
      { role: 'minor', row: 3 },
    ];
    
    const spacing = { horizontal: 300, vertical: 200 };
    
    for (const { role, row } of roleLayout) {
      const chars = roleGroups.get(role) || [];
      const startX = -(chars.length - 1) * spacing.horizontal / 2;
      
      chars.forEach((char, index) => {
        const x = startX + index * spacing.horizontal;
        const y = row * spacing.vertical;
        
        // 构建节点文本
        const lines = [`## ${char.name}`];
        if (char.aliases?.length) {
          lines.push(`*别名: ${char.aliases.join(', ')}*`);
        }
        if (char.tags?.length) {
          lines.push(`标签: ${char.tags.join(', ')}`);
        }
        if (char.aiDescription) {
          const shortDesc = char.aiDescription.length > 100
            ? char.aiDescription.substring(0, 100) + '...'
            : char.aiDescription;
          lines.push('', shortDesc);
        }
        
        nodes.push({
          id: char.characterId,
          type: 'text',
          x,
          y,
          width: 200,
          height: 100,
          text: lines.join('\n'),
          color: roleColors[char.role] || '6',
        });
      });
    }
    
    // 创建关系连线
    const characterIdMap = new Map(characters.map(c => [c.characterId, c]));
    const characterNameMap = new Map(characters.map(c => [c.name, c]));
    
    for (const char of characters) {
      for (const rel of char.relationships) {
        let target = characterIdMap.get(rel.targetCharacterId);
        if (!target) {
          target = characterNameMap.get(rel.targetName);
        }
        
        if (target && char.characterId < target.characterId) {
          edges.push({
            id: `edge_${char.characterId}_${target.characterId}`,
            fromNode: char.characterId,
            fromSide: 'right',
            toNode: target.characterId,
            toSide: 'left',
            color: relationshipColors[rel.relationshipType] || '6',
            label: rel.description || rel.customType || this.getRelationshipLabel(rel.relationshipType),
          });
        }
      }
    }
    
    return { nodes, edges };
  }

  /**
   * 构建故事发展 Canvas 数据
   */
  private buildStoryCanvasData(storyUnits: StoryUnit[]): CanvasData {
    const nodes: CanvasNode[] = [];
    const edges: CanvasEdge[] = [];
    
    // 故事线颜色映射
    const lineColors: Record<string, string> = {
      main: '1',
      sub: '4',
      independent: '3',
      custom: '6',
    };
    
    // 按故事线类型分组
    const lineGroups = new Map<string, StoryUnit[]>();
    for (const unit of storyUnits) {
      const lineType = unit.lineType;
      if (!lineGroups.has(lineType)) {
        lineGroups.set(lineType, []);
      }
      lineGroups.get(lineType)!.push(unit);
    }
    
    const lineRows: Record<string, number> = {
      main: 0,
      sub: 1,
      independent: 2,
      custom: 3,
    };
    
    const spacing = { horizontal: 300, vertical: 200 };
    
    for (const [lineType, units] of lineGroups) {
      const row = lineRows[lineType] ?? 3;
      const sortedUnits = [...units].sort((a, b) => a.chapterRange.start - b.chapterRange.start);
      
      sortedUnits.forEach((unit, index) => {
        const x = index * spacing.horizontal;
        const y = row * spacing.vertical;
        
        // 构建节点文本
        const lines = [
          `## ${unit.name}`,
          `章节: ${unit.chapterRange.start}-${unit.chapterRange.end}`,
        ];
        if (unit.categories?.length) {
          lines.push(`分类: ${unit.categories.join(', ')}`);
        }
        if (unit.aiAnalysis?.summary) {
          const shortSummary = unit.aiAnalysis.summary.length > 80
            ? unit.aiAnalysis.summary.substring(0, 80) + '...'
            : unit.aiAnalysis.summary;
          lines.push('', shortSummary);
        }
        
        nodes.push({
          id: unit.unitId,
          type: 'text',
          x,
          y,
          width: 250,
          height: 120,
          text: lines.join('\n'),
          color: lineColors[unit.lineType] || '6',
        });
      });
      
      // 创建故事流程连线
      for (let i = 0; i < sortedUnits.length - 1; i++) {
        const current = sortedUnits[i];
        const next = sortedUnits[i + 1];
        
        edges.push({
          id: `edge_${current.unitId}_${next.unitId}`,
          fromNode: current.unitId,
          fromSide: 'right',
          toNode: next.unitId,
          toSide: 'left',
          color: lineColors[lineType] || '6',
        });
      }
    }
    
    return { nodes, edges };
  }

  /**
   * 获取关系类型的中文标签
   */
  private getRelationshipLabel(type: string): string {
    const labels: Record<string, string> = {
      friend: '朋友',
      enemy: '敌人',
      family: '家人',
      lover: '恋人',
      rival: '对手',
      custom: '',
    };
    return labels[type] || type;
  }

  // ============ 故事单元分析结果同步 ============

  /**
   * 同步故事单元分析结果
   * 
   * @param bookPath - 书籍文件夹路径
   * @param unitId - 故事单元 ID
   * @param analysis - 分析结果
   */
  async syncStoryUnitAnalysis(
    bookPath: string,
    unitId: string,
    analysis: StoryUnitAnalysis
  ): Promise<void> {
    await this.bookDatabaseService.updateStoryUnit(bookPath, unitId, {
      aiAnalysis: analysis,
    });
  }

  // ============ 辅助方法 ============

  /**
   * 映射人物角色类型
   */
  private mapCharacterRole(role: CharacterAnalysis['role']): Character['role'] {
    const roleMap: Record<CharacterAnalysis['role'], Character['role']> = {
      protagonist: 'protagonist',
      antagonist: 'antagonist',
      supporting: 'supporting',
    };
    return roleMap[role] || 'supporting';
  }

  /**
   * 解析人物关系字符串
   */
  private parseRelationships(relationships: string[]): Character['relationships'] {
    return relationships.map(rel => {
      // 尝试解析格式: "人物名（关系类型）"
      const match = rel.match(/^(.+?)（(.+?)）$/);
      if (match) {
        return {
          targetCharacterId: '',
          targetName: match[1],
          relationshipType: this.mapRelationshipType(match[2]),
          description: rel,
        };
      }
      return {
        targetCharacterId: '',
        targetName: rel,
        relationshipType: 'custom' as const,
        description: rel,
      };
    });
  }

  /**
   * 映射关系类型
   */
  private mapRelationshipType(type: string): Character['relationships'][0]['relationshipType'] {
    const typeMap: Record<string, Character['relationships'][0]['relationshipType']> = {
      '朋友': 'friend',
      '好友': 'friend',
      '敌人': 'enemy',
      '仇人': 'enemy',
      '家人': 'family',
      '亲人': 'family',
      '恋人': 'lover',
      '爱人': 'lover',
      '对手': 'rival',
      '竞争对手': 'rival',
    };
    return typeMap[type] || 'custom';
  }

  /**
   * 合并两个值
   */
  private mergeValues(existing: unknown, newValue: unknown): unknown {
    // 如果是字符串，合并为数组或拼接
    if (typeof existing === 'string' && typeof newValue === 'string') {
      if (existing === newValue) {
        return existing;
      }
      return `${existing}\n\n---\n\n${newValue}`;
    }

    // 如果是数组，合并去重
    if (Array.isArray(existing) && Array.isArray(newValue)) {
      return [...new Set([...existing, ...newValue])];
    }

    // 如果是对象，深度合并
    if (
      typeof existing === 'object' &&
      typeof newValue === 'object' &&
      existing !== null &&
      newValue !== null
    ) {
      return { ...existing, ...newValue };
    }

    // 默认使用新值
    return newValue;
  }

  /**
   * 驼峰转蛇形命名
   */
  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }
}
