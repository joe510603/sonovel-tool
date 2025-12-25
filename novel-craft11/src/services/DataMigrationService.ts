/**
 * DataMigrationService - 数据迁移服务
 * 
 * 负责将旧格式数据迁移到新的数据库格式：
 * - JSON 标记数据 (.novelcraft/unified-marks/*.json) → _story_units.md
 * - 全局素材库 (.novelcraft/global-materials.json) → Dataview 兼容格式
 * 
 * Requirements: 数据迁移
 */

import { App, TFile, TFolder, normalizePath } from 'obsidian';
import { BookDatabaseService, generateBookId } from './BookDatabaseService';
import {
  UnifiedMark,
  UnifiedMarkStorage,
  GlobalMaterialStorage,
  GlobalMaterialItem,
} from '../types/unified-marking';
import {
  StoryUnit,
  Character,
  DATABASE_FILES,
} from '../types/database';

/**
 * 迁移结果
 */
export interface MigrationResult {
  /** 是否成功 */
  success: boolean;
  /** 迁移的标记数量 */
  migratedMarks: number;
  /** 迁移的素材数量 */
  migratedMaterials: number;
  /** 跳过的数量 */
  skipped: number;
  /** 错误列表 */
  errors: string[];
  /** 警告列表 */
  warnings: string[];
}

/**
 * 旧数据检测结果
 */
export interface LegacyDataDetection {
  /** 是否存在旧格式数据 */
  hasLegacyData: boolean;
  /** 旧标记文件列表 */
  legacyMarkFiles: string[];
  /** 是否存在旧全局素材库 */
  hasLegacyGlobalMaterials: boolean;
  /** 旧全局素材库路径 */
  legacyGlobalMaterialsPath?: string;
}


/**
 * 旧标记数据（只读）
 */
export interface LegacyMarkData {
  /** 书籍 ID */
  bookId: string;
  /** 书籍标题 */
  bookTitle: string;
  /** 标记列表 */
  marks: UnifiedMark[];
  /** 文件路径 */
  filePath: string;
}

/**
 * DataMigrationService - 数据迁移服务
 */
export class DataMigrationService {
  private app: App;
  private bookDatabaseService: BookDatabaseService;
  
  /** 旧标记存储路径 */
  private static readonly LEGACY_MARKS_PATH = '.novelcraft/unified-marks';
  /** 旧全局素材库路径 */
  private static readonly LEGACY_GLOBAL_MATERIALS_PATH = '.novelcraft/global-materials.json';

  constructor(app: App, bookDatabaseService?: BookDatabaseService) {
    this.app = app;
    this.bookDatabaseService = bookDatabaseService || new BookDatabaseService(app);
  }

  /**
   * 设置 BookDatabaseService 实例
   */
  setBookDatabaseService(service: BookDatabaseService): void {
    this.bookDatabaseService = service;
  }

  // ============ 旧数据检测 ============

  /**
   * 检测是否存在旧格式数据
   * 
   * Requirements: 17.4 - 检测旧格式数据并提示迁移
   */
  async detectLegacyData(): Promise<LegacyDataDetection> {
    const result: LegacyDataDetection = {
      hasLegacyData: false,
      legacyMarkFiles: [],
      hasLegacyGlobalMaterials: false,
    };

    // 检测旧标记文件
    const marksPath = normalizePath(DataMigrationService.LEGACY_MARKS_PATH);
    const marksFolder = this.app.vault.getAbstractFileByPath(marksPath);
    
    if (marksFolder instanceof TFolder) {
      for (const file of marksFolder.children) {
        if (file instanceof TFile && file.extension === 'json') {
          result.legacyMarkFiles.push(file.path);
        }
      }
    }

    // 检测旧全局素材库
    const globalMaterialsPath = normalizePath(DataMigrationService.LEGACY_GLOBAL_MATERIALS_PATH);
    if (await this.app.vault.adapter.exists(globalMaterialsPath)) {
      result.hasLegacyGlobalMaterials = true;
      result.legacyGlobalMaterialsPath = globalMaterialsPath;
    }

    result.hasLegacyData = result.legacyMarkFiles.length > 0 || result.hasLegacyGlobalMaterials;

    return result;
  }


  // ============ 只读访问旧数据 ============

  /**
   * 读取旧格式标记数据（只读）
   * 
   * Requirements: 17.4 - 支持读取旧格式数据（只读）
   */
  async readLegacyMarks(filePath: string): Promise<LegacyMarkData | null> {
    try {
      const normalizedPath = normalizePath(filePath);
      const exists = await this.app.vault.adapter.exists(normalizedPath);
      
      if (!exists) {
        return null;
      }

      const content = await this.app.vault.adapter.read(normalizedPath);
      const storage: UnifiedMarkStorage = JSON.parse(content);

      // 反序列化日期字段
      const marks = storage.marks.map(mark => ({
        ...mark,
        createdAt: new Date(mark.createdAt),
        updatedAt: new Date(mark.updatedAt),
        analysisResult: mark.analysisResult ? {
          ...mark.analysisResult,
          analyzedAt: new Date(mark.analysisResult.analyzedAt),
        } : undefined,
      }));

      return {
        bookId: storage.bookId,
        bookTitle: storage.bookTitle,
        marks,
        filePath: normalizedPath,
      };
    } catch (error) {
      console.error(`Failed to read legacy marks from ${filePath}:`, error);
      return null;
    }
  }

  /**
   * 读取所有旧格式标记数据（只读）
   * 
   * Requirements: 17.4 - 支持读取旧格式数据（只读）
   */
  async readAllLegacyMarks(): Promise<LegacyMarkData[]> {
    const detection = await this.detectLegacyData();
    const results: LegacyMarkData[] = [];

    for (const filePath of detection.legacyMarkFiles) {
      const data = await this.readLegacyMarks(filePath);
      if (data) {
        results.push(data);
      }
    }

    return results;
  }

  /**
   * 读取旧格式全局素材库（只读）
   * 
   * Requirements: 17.4 - 支持读取旧格式数据（只读）
   */
  async readLegacyGlobalMaterials(): Promise<GlobalMaterialItem[] | null> {
    try {
      const path = normalizePath(DataMigrationService.LEGACY_GLOBAL_MATERIALS_PATH);
      const exists = await this.app.vault.adapter.exists(path);
      
      if (!exists) {
        return null;
      }

      const content = await this.app.vault.adapter.read(path);
      const storage: GlobalMaterialStorage = JSON.parse(content);

      // 反序列化日期字段
      return storage.materials.map(material => ({
        ...material,
        createdAt: new Date(material.createdAt),
        updatedAt: new Date(material.updatedAt),
      }));
    } catch (error) {
      console.error('Failed to read legacy global materials:', error);
      return null;
    }
  }


  // ============ 完整迁移 ============

  /**
   * 从旧格式迁移到新格式
   * 
   * Requirements: 17.1 - 实现 migrateFromLegacy()
   */
  async migrateFromLegacy(bookPath: string): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: true,
      migratedMarks: 0,
      migratedMaterials: 0,
      skipped: 0,
      errors: [],
      warnings: [],
    };

    try {
      // 检测旧数据
      const detection = await this.detectLegacyData();
      
      if (!detection.hasLegacyData) {
        result.warnings.push('未检测到旧格式数据');
        return result;
      }

      // 确保数据库已初始化
      const isInitialized = await this.bookDatabaseService.isDatabaseInitialized(bookPath);
      if (!isInitialized) {
        // 尝试从旧数据推断书籍信息
        const legacyMarks = await this.readAllLegacyMarks();
        const firstMark = legacyMarks[0];
        
        if (firstMark) {
          await this.bookDatabaseService.initializeDatabase(bookPath, {
            title: firstMark.bookTitle || '未知书籍',
          });
        } else {
          result.errors.push('无法初始化数据库：缺少书籍信息');
          result.success = false;
          return result;
        }
      }

      // 迁移标记数据
      const markResult = await this.migrateMarksToStoryUnits(bookPath);
      result.migratedMarks = markResult.migrated;
      result.skipped += markResult.skipped;
      result.errors.push(...markResult.errors);
      result.warnings.push(...markResult.warnings);

      // 迁移全局素材库
      if (detection.hasLegacyGlobalMaterials) {
        const materialResult = await this.migrateGlobalMaterials(bookPath);
        result.migratedMaterials = materialResult.migrated;
        result.skipped += materialResult.skipped;
        result.errors.push(...materialResult.errors);
        result.warnings.push(...materialResult.warnings);
      }

      result.success = result.errors.length === 0;
    } catch (error) {
      result.success = false;
      result.errors.push(
        error instanceof Error ? error.message : '迁移过程中发生未知错误'
      );
    }

    return result;
  }


  // ============ JSON 标记数据迁移 ============

  /**
   * 将 JSON 标记数据迁移到 _story_units.md
   * 
   * Requirements: 17.2 - 将 .novelcraft/unified-marks/*.json 迁移到 _story_units.md
   */
  async migrateMarksToStoryUnits(bookPath: string): Promise<{
    migrated: number;
    skipped: number;
    errors: string[];
    warnings: string[];
  }> {
    const result = {
      migrated: 0,
      skipped: 0,
      errors: [] as string[],
      warnings: [] as string[],
    };

    try {
      // 获取书籍 ID
      const bookId = await this.bookDatabaseService.getBookId(bookPath);
      if (!bookId) {
        result.errors.push('无法获取书籍 ID');
        return result;
      }

      // 读取所有旧标记数据
      const legacyDataList = await this.readAllLegacyMarks();
      
      // 查找与当前书籍匹配的数据
      const matchingData = legacyDataList.find(data => {
        // 尝试通过 bookId 或书名匹配
        return data.bookId === bookId || 
               data.bookId.startsWith(bookId.split('_')[0]) ||
               bookId.startsWith(data.bookId.split('_')[0]);
      });

      if (!matchingData) {
        result.warnings.push('未找到与当前书籍匹配的旧标记数据');
        return result;
      }

      // 获取现有故事单元以避免重复
      const existingUnits = await this.bookDatabaseService.getStoryUnits(bookPath);
      const existingNames = new Set(existingUnits.map(u => u.name));

      // 迁移每个标记
      for (const mark of matchingData.marks) {
        try {
          // 只迁移故事单元类型的标记
          if (mark.mode !== 'story-unit') {
            result.skipped++;
            continue;
          }

          // 检查是否已存在
          const unitName = mark.unitName || mark.note || `故事单元_${mark.id.slice(-6)}`;
          if (existingNames.has(unitName)) {
            result.skipped++;
            result.warnings.push(`故事单元 "${unitName}" 已存在，跳过`);
            continue;
          }

          // 转换为 StoryUnit 格式
          const storyUnit = this.markToStoryUnit(mark, bookId);

          // 添加到数据库
          await this.bookDatabaseService.addStoryUnit(bookPath, storyUnit);
          existingNames.add(unitName);
          result.migrated++;
        } catch (error) {
          result.errors.push(
            `迁移标记 ${mark.id} 失败: ${error instanceof Error ? error.message : '未知错误'}`
          );
        }
      }
    } catch (error) {
      result.errors.push(
        error instanceof Error ? error.message : '迁移标记数据时发生未知错误'
      );
    }

    return result;
  }


  /**
   * 将 UnifiedMark 转换为 StoryUnit
   */
  private markToStoryUnit(
    mark: UnifiedMark,
    bookId: string
  ): Omit<StoryUnit, 'unitId' | 'createdAt' | 'updatedAt'> {
    // 安全地获取章节索引
    const startChapterIndex = mark.range?.start?.chapterIndex ?? 0;
    const endChapterIndex = mark.range?.end?.chapterIndex ?? startChapterIndex;
    const startParagraphIndex = mark.range?.start?.paragraphIndex ?? 0;
    const endParagraphIndex = mark.range?.end?.paragraphIndex ?? 0;
    const startCharOffset = mark.range?.start?.characterOffset ?? 0;
    const endCharOffset = mark.range?.end?.characterOffset ?? 0;

    return {
      bookId,
      name: mark.unitName || mark.note || `故事单元_${mark.id.slice(-6)}`,
      chapterRange: {
        start: startChapterIndex + 1, // 转换为 1-based
        end: endChapterIndex + 1,
      },
      preciseRange: {
        start: {
          chapterIndex: startChapterIndex,
          lineNumber: startParagraphIndex + 1,
          characterOffset: startCharOffset,
        },
        end: {
          chapterIndex: endChapterIndex,
          lineNumber: endParagraphIndex + 1,
          characterOffset: endCharOffset,
        },
      },
      lineType: this.mapSubTypeToLineType(mark.subType),
      customLineType: mark.subType === 'custom' ? mark.category : undefined,
      categories: mark.associations?.tags || [],
      relatedCharacters: mark.associations?.characterName ? [mark.associations.characterName] : [],
      textContent: mark.content || mark.range?.textSnapshot || '',
      analysisTemplate: mark.analysisTemplate || 'seven-step',
      aiAnalysis: mark.analysisResult ? {
        summary: mark.analysisResult.summary,
        sevenStep: mark.analysisResult.sevenStep ? {
          step1Advantage: mark.analysisResult.sevenStep.step1_advantage,
          step2Villain: mark.analysisResult.sevenStep.step2_villain,
          step3Friction: mark.analysisResult.sevenStep.step3_friction,
          step4Expectation: mark.analysisResult.sevenStep.step4_expectation,
          step5Climax: mark.analysisResult.sevenStep.step5_climax,
          step6Shock: mark.analysisResult.sevenStep.step6_shock,
          step7Reward: mark.analysisResult.sevenStep.step7_reward,
        } : undefined,
        techniques: mark.analysisResult.techniques?.map(t => 
          typeof t === 'string' ? t : t.name
        ),
        takeaways: mark.analysisResult.takeaways,
        analyzedAt: mark.analysisResult.analyzedAt instanceof Date 
          ? mark.analysisResult.analyzedAt.toISOString() 
          : String(mark.analysisResult.analyzedAt),
      } : undefined,
      source: 'manual',
    };
  }

  /**
   * 映射子类型到故事线类型
   */
  private mapSubTypeToLineType(subType?: string): StoryUnit['lineType'] {
    switch (subType) {
      case 'main': return 'main';
      case 'sub': return 'sub';
      case 'independent': return 'independent';
      default: return 'main';
    }
  }


  // ============ 全局素材库迁移 ============

  /**
   * 将全局素材库迁移到 Dataview 兼容格式
   * 
   * Requirements: 17.3 - 将 .novelcraft/global-materials.json 迁移到 Dataview 兼容格式
   */
  async migrateGlobalMaterials(bookPath: string): Promise<{
    migrated: number;
    skipped: number;
    errors: string[];
    warnings: string[];
  }> {
    const result = {
      migrated: 0,
      skipped: 0,
      errors: [] as string[],
      warnings: [] as string[],
    };

    try {
      // 读取旧全局素材库
      const legacyMaterials = await this.readLegacyGlobalMaterials();
      
      if (!legacyMaterials || legacyMaterials.length === 0) {
        result.warnings.push('旧全局素材库为空或不存在');
        return result;
      }

      // 获取书籍 ID
      const bookId = await this.bookDatabaseService.getBookId(bookPath);
      if (!bookId) {
        result.errors.push('无法获取书籍 ID');
        return result;
      }

      // 筛选与当前书籍相关的素材
      const relevantMaterials = legacyMaterials.filter(m => 
        m.sourceBookId === bookId ||
        m.sourceBookId.startsWith(bookId.split('_')[0]) ||
        bookId.startsWith(m.sourceBookId.split('_')[0])
      );

      if (relevantMaterials.length === 0) {
        result.warnings.push('未找到与当前书籍相关的素材');
        return result;
      }

      // 获取现有数据以避免重复
      const existingUnits = await this.bookDatabaseService.getStoryUnits(bookPath);
      const existingCharacters = await this.bookDatabaseService.getCharacters(bookPath);
      const existingUnitNames = new Set(existingUnits.map(u => u.name));
      const existingCharacterNames = new Set(existingCharacters.map(c => c.name));

      // 迁移每个素材
      for (const material of relevantMaterials) {
        try {
          if (material.type === 'character') {
            // 迁移人物素材
            if (existingCharacterNames.has(material.title)) {
              result.skipped++;
              continue;
            }

            await this.bookDatabaseService.addCharacter(bookPath, {
              bookId,
              name: material.title,
              role: 'supporting',
              tags: material.tags,
              aiDescription: material.content,
              relationships: [],
              firstAppearanceChapter: 0,
              appearanceChapters: [],
              source: 'manual',
            });
            existingCharacterNames.add(material.title);
            result.migrated++;
          } else if (material.type === 'story-unit') {
            // 迁移故事单元素材
            if (existingUnitNames.has(material.title)) {
              result.skipped++;
              continue;
            }

            await this.bookDatabaseService.addStoryUnit(bookPath, {
              bookId,
              name: material.title,
              chapterRange: { start: 1, end: 1 },
              lineType: 'main',
              categories: material.tags,
              relatedCharacters: [],
              textContent: material.content,
              analysisTemplate: 'seven-step',
              aiAnalysis: material.analysis ? {
                summary: material.analysis.summary,
                sevenStep: material.analysis.sevenStep ? {
                  step1Advantage: material.analysis.sevenStep.step1_advantage,
                  step2Villain: material.analysis.sevenStep.step2_villain,
                  step3Friction: material.analysis.sevenStep.step3_friction,
                  step4Expectation: material.analysis.sevenStep.step4_expectation,
                  step5Climax: material.analysis.sevenStep.step5_climax,
                  step6Shock: material.analysis.sevenStep.step6_shock,
                  step7Reward: material.analysis.sevenStep.step7_reward,
                } : undefined,
                techniques: material.analysis.techniques?.map(t => 
                  typeof t === 'string' ? t : t.name
                ),
                takeaways: material.analysis.takeaways,
                analyzedAt: material.analysis.analyzedAt instanceof Date
                  ? material.analysis.analyzedAt.toISOString()
                  : String(material.analysis.analyzedAt),
              } : undefined,
              source: 'manual',
            });
            existingUnitNames.add(material.title);
            result.migrated++;
          } else {
            // 其他类型素材暂不迁移到数据库
            result.skipped++;
            result.warnings.push(`素材 "${material.title}" 类型为 ${material.type}，暂不支持迁移`);
          }
        } catch (error) {
          result.errors.push(
            `迁移素材 "${material.title}" 失败: ${error instanceof Error ? error.message : '未知错误'}`
          );
        }
      }
    } catch (error) {
      result.errors.push(
        error instanceof Error ? error.message : '迁移全局素材库时发生未知错误'
      );
    }

    return result;
  }


  // ============ 批量迁移 ============

  /**
   * 迁移所有书籍的旧数据
   * 
   * @param booksRootPath - 书籍根目录
   */
  async migrateAllBooks(booksRootPath: string = 'NovelCraft/books'): Promise<{
    totalBooks: number;
    successfulBooks: number;
    failedBooks: number;
    results: Map<string, MigrationResult>;
  }> {
    const results = new Map<string, MigrationResult>();
    let successfulBooks = 0;
    let failedBooks = 0;

    // 扫描所有书籍文件夹
    const normalizedPath = normalizePath(booksRootPath);
    const rootFolder = this.app.vault.getAbstractFileByPath(normalizedPath);
    
    if (!(rootFolder instanceof TFolder)) {
      return {
        totalBooks: 0,
        successfulBooks: 0,
        failedBooks: 0,
        results,
      };
    }

    const bookFolders: TFolder[] = [];
    for (const child of rootFolder.children) {
      if (child instanceof TFolder) {
        // 检查是否是有效的书籍文件夹
        const metaPath = normalizePath(`${child.path}/${DATABASE_FILES.BOOK_META}`);
        if (await this.app.vault.adapter.exists(metaPath)) {
          bookFolders.push(child);
        }
      }
    }

    // 迁移每本书
    for (const folder of bookFolders) {
      const result = await this.migrateFromLegacy(folder.path);
      results.set(folder.path, result);
      
      if (result.success) {
        successfulBooks++;
      } else {
        failedBooks++;
      }
    }

    return {
      totalBooks: bookFolders.length,
      successfulBooks,
      failedBooks,
      results,
    };
  }

  // ============ 迁移状态检查 ============

  /**
   * 检查书籍是否需要迁移
   */
  async needsMigration(bookPath: string): Promise<boolean> {
    // 检查是否存在旧数据
    const detection = await this.detectLegacyData();
    if (!detection.hasLegacyData) {
      return false;
    }

    // 检查数据库是否已初始化
    const isInitialized = await this.bookDatabaseService.isDatabaseInitialized(bookPath);
    if (!isInitialized) {
      return true;
    }

    // 检查是否有未迁移的标记
    const bookId = await this.bookDatabaseService.getBookId(bookPath);
    if (!bookId) {
      return false;
    }

    const legacyDataList = await this.readAllLegacyMarks();
    const matchingData = legacyDataList.find(data => 
      data.bookId === bookId ||
      data.bookId.startsWith(bookId.split('_')[0]) ||
      bookId.startsWith(data.bookId.split('_')[0])
    );

    if (!matchingData) {
      return false;
    }

    // 检查是否有故事单元类型的标记未迁移
    const existingUnits = await this.bookDatabaseService.getStoryUnits(bookPath);
    const existingNames = new Set(existingUnits.map(u => u.name));

    for (const mark of matchingData.marks) {
      if (mark.mode === 'story-unit') {
        const unitName = mark.unitName || mark.note || `故事单元_${mark.id.slice(-6)}`;
        if (!existingNames.has(unitName)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 获取迁移统计信息
   */
  async getMigrationStats(bookPath: string): Promise<{
    legacyMarksCount: number;
    legacyMaterialsCount: number;
    migratedUnitsCount: number;
    pendingMigration: number;
  }> {
    let legacyMarksCount = 0;
    let legacyMaterialsCount = 0;
    let migratedUnitsCount = 0;
    let pendingMigration = 0;

    // 获取书籍 ID
    const bookId = await this.bookDatabaseService.getBookId(bookPath);

    // 统计旧标记数据
    const legacyDataList = await this.readAllLegacyMarks();
    if (bookId) {
      const matchingData = legacyDataList.find(data => 
        data.bookId === bookId ||
        data.bookId.startsWith(bookId.split('_')[0]) ||
        bookId.startsWith(data.bookId.split('_')[0])
      );
      if (matchingData) {
        legacyMarksCount = matchingData.marks.filter(m => m.mode === 'story-unit').length;
      }
    }

    // 统计旧素材数据
    const legacyMaterials = await this.readLegacyGlobalMaterials();
    if (legacyMaterials && bookId) {
      legacyMaterialsCount = legacyMaterials.filter(m => 
        m.sourceBookId === bookId ||
        m.sourceBookId.startsWith(bookId.split('_')[0]) ||
        bookId.startsWith(m.sourceBookId.split('_')[0])
      ).length;
    }

    // 统计已迁移的故事单元
    const existingUnits = await this.bookDatabaseService.getStoryUnits(bookPath);
    migratedUnitsCount = existingUnits.length;

    // 计算待迁移数量
    pendingMigration = Math.max(0, legacyMarksCount - migratedUnitsCount);

    return {
      legacyMarksCount,
      legacyMaterialsCount,
      migratedUnitsCount,
      pendingMigration,
    };
  }
}
