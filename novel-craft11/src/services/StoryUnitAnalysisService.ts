/**
 * StoryUnitAnalysisService - 故事单元分析服务
 * 
 * 负责：
 * 1. 管理故事单元的创建和编辑
 * 2. 调用 AI 进行故事分析
 * 3. 支持多种分析模板（7步法、三幕式等）
 * 
 * 重构说明 (Requirements: 2.3, 2.4):
 * - 集成 BookDatabaseService
 * - AI 分析结果写入故事单元表
 * - 自动生成事件表数据
 */

import { App } from 'obsidian';
import { LLMService } from './LLMService';
import { UnifiedMarkingService } from './UnifiedMarkingService';
import { BookDatabaseService } from './BookDatabaseService';
import { DataSyncService } from './DataSyncService';
import {
  UnifiedMark,
  StoryUnitSelection,
  AnalysisTemplateType,
  MarkAnalysisResult,
  SevenStepAnalysis,
  ThreeActAnalysis,
  ConflictResolutionAnalysis,
  ANALYSIS_TEMPLATES,
  TextRange,
  TextPosition
} from '../types/unified-marking';
import {
  StoryUnit,
  StoryUnitAnalysis,
  StoryEvent,
} from '../types/database';

/**
 * 创建故事单元参数
 */
export interface CreateStoryUnitParams {
  bookId: string;
  unitName: string;
  selections: StoryUnitSelection[];
  lineType: 'main' | 'sub' | 'independent' | 'custom';
  customLineType?: string;
  analysisTemplate: AnalysisTemplateType;
  note?: string;
  /** 章节范围（替代手动选区） */
  chapterRange?: {
    start: number;
    end: number;
  };
  /** 关联人物 ID 列表 */
  relatedCharacterIds?: string[];
}

/**
 * 分析结果
 */
export interface AnalysisResponse {
  success: boolean;
  result?: MarkAnalysisResult;
  error?: string;
  /** 同步到数据库的结果 */
  syncedToDatabase?: boolean;
}

export class StoryUnitAnalysisService {
  private app: App;
  private llmService: LLMService;
  private markingService: UnifiedMarkingService;
  private bookDatabaseService: BookDatabaseService;
  private dataSyncService: DataSyncService | null = null;
  
  /** 书籍路径缓存: bookId -> bookPath */
  private bookPathCache: Map<string, string> = new Map();

  constructor(
    app: App,
    llmService: LLMService,
    markingService: UnifiedMarkingService,
    bookDatabaseService?: BookDatabaseService
  ) {
    this.app = app;
    this.llmService = llmService;
    this.markingService = markingService;
    this.bookDatabaseService = bookDatabaseService || new BookDatabaseService(app);
  }

  /**
   * 设置 BookDatabaseService 实例
   */
  setBookDatabaseService(service: BookDatabaseService): void {
    this.bookDatabaseService = service;
  }

  /**
   * 设置 DataSyncService 实例
   */
  setDataSyncService(service: DataSyncService): void {
    this.dataSyncService = service;
  }

  /**
   * 注册书籍路径映射
   * @param bookId - 书籍 ID
   * @param bookPath - 书籍文件夹路径
   */
  registerBookPath(bookId: string, bookPath: string): void {
    this.bookPathCache.set(bookId, bookPath);
  }

  /**
   * 获取书籍路径
   * @param bookId - 书籍 ID
   * @returns 书籍文件夹路径，如果未找到返回 null
   */
  private async getBookPath(bookId: string): Promise<string | null> {
    if (this.bookPathCache.has(bookId)) {
      return this.bookPathCache.get(bookId)!;
    }
    
    // 尝试从 bookId 推断路径
    // bookId 通常是书籍文件夹名（可能是 URL 编码的）
    const decodedBookId = decodeURIComponent(bookId);
    
    // 搜索可能的书籍路径
    const possiblePaths = [
      `NovelCraft/books/${bookId}`,
      `NovelCraft/books/${decodedBookId}`,
      `books/${bookId}`,
      `books/${decodedBookId}`,
    ];
    
    for (const path of possiblePaths) {
      const exists = await this.app.vault.adapter.exists(path);
      if (exists) {
        this.bookPathCache.set(bookId, path);
        return path;
      }
    }
    
    return null;
  }

  /**
   * 创建故事单元
   * 
   * Requirements: 2.3, 2.4
   */
  async createStoryUnit(params: CreateStoryUnitParams): Promise<UnifiedMark> {
    let combinedContent = '';
    let range: TextRange;

    // 检查是否使用章节范围选择
    if (params.chapterRange && params.selections.length === 0) {
      // 使用章节范围选择 - 从数据库获取章节内容
      const bookPath = await this.getBookPath(params.bookId);
      if (bookPath) {
        try {
          combinedContent = await this.bookDatabaseService.getChapterContent(
            bookPath,
            params.chapterRange.start,
            params.chapterRange.end
          );
        } catch (error) {
          console.error('获取章节内容失败:', error);
          combinedContent = '';
        }
      }

      // 创建基于章节范围的 range
      range = {
        start: {
          chapterIndex: params.chapterRange.start - 1, // 转为 0-based
          paragraphIndex: 0,
          characterOffset: 0,
        },
        end: {
          chapterIndex: params.chapterRange.end - 1, // 转为 0-based
          paragraphIndex: 0,
          characterOffset: 0,
        },
        textSnapshot: combinedContent.slice(0, 500) // 摘要
      };
    } else {
      // 使用手动选区
      combinedContent = params.selections
        .sort((a, b) => a.order - b.order)
        .map(s => s.range?.textSnapshot || '')
        .join('\n\n---\n\n');

      // 计算整体范围（取第一个选区的起始和最后一个选区的结束）
      const sortedSelections = [...params.selections].sort((a, b) => {
        if (a.chapterIndex !== b.chapterIndex) return a.chapterIndex - b.chapterIndex;
        const aStart = a.range?.start?.paragraphIndex ?? 0;
        const bStart = b.range?.start?.paragraphIndex ?? 0;
        return aStart - bStart;
      });

      const firstSelection = sortedSelections[0];
      const lastSelection = sortedSelections[sortedSelections.length - 1];

      // 安全地获取 range，处理 undefined 情况
      const defaultPosition: TextPosition = {
        chapterIndex: 0,
        paragraphIndex: 0,
        characterOffset: 0,
      };

      range = {
        start: firstSelection?.range?.start ?? defaultPosition,
        end: lastSelection?.range?.end ?? defaultPosition,
        textSnapshot: combinedContent.slice(0, 500) // 摘要
      };
    }

    // 创建标记
    const mark = await this.markingService.createMark({
      bookId: params.bookId,
      mode: 'story-unit',
      type: 'story',
      subType: params.lineType,
      range: range
    });

    // 更新标记的所有字段，确保正确保存
    await this.markingService.updateMark(params.bookId, mark.id, {
      note: params.note,
      unitName: params.unitName,
      analysisTemplate: params.analysisTemplate,
      content: combinedContent,
      selections: params.selections
    });

    // 重新获取更新后的标记，确保数据一致性
    const updatedMark = await this.markingService.getMark(params.bookId, mark.id);
    if (!updatedMark) {
      throw new Error('创建故事单元后无法获取标记数据');
    }

    // 同步到数据库 (Requirements: 2.3)
    await this.syncStoryUnitToDatabase(params.bookId, updatedMark);

    return updatedMark;
  }

  /**
   * 同步故事单元到数据库
   * 
   * @param bookId - 书籍 ID
   * @param mark - 标记数据
   * 
   * Requirements: 2.3
   */
  private async syncStoryUnitToDatabase(bookId: string, mark: UnifiedMark): Promise<void> {
    const bookPath = await this.getBookPath(bookId);
    if (!bookPath) {
      console.warn('无法获取书籍路径，跳过数据库同步');
      return;
    }

    try {
      // 确保数据库已初始化
      await this.ensureDatabaseInitialized(bookPath, bookId);
      
      // 检查是否已存在
      const existingUnits = await this.bookDatabaseService.getStoryUnits(bookPath);
      const existingUnit = existingUnits.find(u => u.unitId === mark.id);

      // 安全地获取章节索引
      const startChapterIndex = mark.range?.start?.chapterIndex ?? 0;
      const endChapterIndex = mark.range?.end?.chapterIndex ?? startChapterIndex;
      const startParagraphIndex = mark.range?.start?.paragraphIndex ?? 0;
      const endParagraphIndex = mark.range?.end?.paragraphIndex ?? 0;
      const startCharOffset = mark.range?.start?.characterOffset ?? 0;
      const endCharOffset = mark.range?.end?.characterOffset ?? 0;

      const storyUnitData: Omit<StoryUnit, 'unitId' | 'createdAt' | 'updatedAt'> = {
        bookId,
        name: mark.unitName || mark.note || `故事单元_${mark.id.slice(-6)}`,
        chapterRange: {
          start: startChapterIndex + 1,
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
        textContent: mark.content,
        analysisTemplate: (mark.analysisTemplate as StoryUnit['analysisTemplate']) || 'seven-step',
        source: 'manual',
      };

      if (existingUnit) {
        await this.bookDatabaseService.updateStoryUnit(bookPath, mark.id, storyUnitData);
      } else {
        await this.bookDatabaseService.addStoryUnit(bookPath, storyUnitData);
      }
      
      console.log(`故事单元已保存到数据库: ${mark.unitName || mark.id}`);
    } catch (error) {
      console.error('同步故事单元到数据库失败:', error);
      throw error; // 重新抛出错误，让调用者知道保存失败
    }
  }

  /**
   * 确保数据库已初始化
   */
  private async ensureDatabaseInitialized(bookPath: string, bookId: string): Promise<void> {
    // 检查数据库文件是否存在
    const storyUnitsPath = `${bookPath}/_story_units.md`;
    const exists = await this.app.vault.adapter.exists(storyUnitsPath);
    
    if (!exists) {
      // 从书籍路径提取标题
      const bookTitle = decodeURIComponent(bookId);
      console.log(`初始化书籍数据库: ${bookTitle}`);
      
      await this.bookDatabaseService.initializeDatabase(bookPath, {
        title: bookTitle,
      });
    }
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

  /**
   * 分析故事单元
   * 
   * Requirements: 2.4
   */
  async analyzeStoryUnit(
    bookId: string,
    markId: string,
    templateType: AnalysisTemplateType,
    customPrompt?: string
  ): Promise<AnalysisResponse> {
    try {
      // 获取标记
      const mark = await this.markingService.getMark(bookId, markId);
      if (!mark) {
        return { success: false, error: '标记不存在' };
      }

      // 获取内容 - 优先使用 mark.content，如果太短则尝试从数据库获取
      let content = mark.content || '';
      
      // 如果内容太短，尝试从数据库获取完整章节内容
      if (content.length < 100) {
        const bookPath = await this.getBookPath(bookId);
        if (bookPath) {
          // 从 range 获取章节范围
          const startChapter = (mark.range?.start?.chapterIndex ?? 0) + 1;
          const endChapter = (mark.range?.end?.chapterIndex ?? startChapter - 1) + 1;
          
          try {
            const chapterContent = await this.bookDatabaseService.getChapterContent(
              bookPath,
              startChapter,
              endChapter
            );
            if (chapterContent && chapterContent.length > content.length) {
              content = chapterContent;
              // 更新 mark.content 以便后续使用
              mark.content = content;
            }
          } catch (error) {
            console.warn('从数据库获取章节内容失败:', error);
          }
        }
      }
      
      // 如果还是没有足够内容，使用 textSnapshot
      if (content.length < 50) {
        content = mark.range?.textSnapshot || '';
      }
      
      if (!content || content.length < 50) {
        return { success: false, error: `内容太短（${content.length}字），无法分析。请确保选择了有效的章节范围。` };
      }

      // 获取模板
      const template = ANALYSIS_TEMPLATES[templateType];
      if (!template && templateType !== 'custom') {
        return { success: false, error: '未知的分析模板' };
      }

      // 构建 prompt
      const prompt = customPrompt || template?.prompt || '';
      const finalPrompt = prompt.replace('{{content}}', content);

      // 调用 LLM
      const response = await this.llmService.chat([
        { role: 'user', content: finalPrompt }
      ]);

      // 解析结果
      const analysisResult = this.parseAnalysisResponse(response, templateType);
      
      if (!analysisResult) {
        return { success: false, error: '无法解析分析结果' };
      }

      // 更新标记
      mark.analysisResult = analysisResult;
      mark.analysisTemplate = templateType;
      
      await this.markingService.updateMark(bookId, markId, {
        // analysisResult 需要通过其他方式更新
      });

      // 同步分析结果到数据库 (Requirements: 2.4)
      let syncedToDatabase = false;
      try {
        await this.syncAnalysisResultToDatabase(bookId, markId, analysisResult, mark);
        syncedToDatabase = true;
      } catch (syncError) {
        console.error('同步分析结果到数据库失败:', syncError);
      }

      return { success: true, result: analysisResult, syncedToDatabase };
    } catch (error) {
      console.error('Story unit analysis error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '分析失败' 
      };
    }
  }

  /**
   * 同步分析结果到数据库
   * 
   * @param bookId - 书籍 ID
   * @param markId - 标记 ID
   * @param analysisResult - 分析结果
   * @param mark - 标记数据
   * 
   * Requirements: 2.4
   */
  private async syncAnalysisResultToDatabase(
    bookId: string,
    markId: string,
    analysisResult: MarkAnalysisResult,
    mark: UnifiedMark
  ): Promise<void> {
    const bookPath = await this.getBookPath(bookId);
    if (!bookPath) {
      console.warn('无法获取书籍路径，跳过数据库同步');
      return;
    }

    // 转换分析结果格式
    const dbAnalysis: StoryUnitAnalysis = {
      summary: analysisResult.summary,
      sevenStep: analysisResult.sevenStep ? {
        step1Advantage: analysisResult.sevenStep.step1_advantage,
        step2Villain: analysisResult.sevenStep.step2_villain,
        step3Friction: analysisResult.sevenStep.step3_friction,
        step4Expectation: analysisResult.sevenStep.step4_expectation,
        step5Climax: analysisResult.sevenStep.step5_climax,
        step6Shock: analysisResult.sevenStep.step6_shock,
        step7Reward: analysisResult.sevenStep.step7_reward,
      } : undefined,
      threeAct: analysisResult.threeAct ? {
        act1Setup: {
          introduction: analysisResult.threeAct.act1_setup?.introduction || '',
          incitingIncident: analysisResult.threeAct.act1_setup?.incitingIncident || '',
        },
        act2Confrontation: {
          risingAction: analysisResult.threeAct.act2_confrontation?.risingAction || '',
          midpoint: analysisResult.threeAct.act2_confrontation?.midpoint || '',
          complications: analysisResult.threeAct.act2_confrontation?.complications || '',
        },
        act3Resolution: {
          climax: analysisResult.threeAct.act3_resolution?.climax || '',
          fallingAction: analysisResult.threeAct.act3_resolution?.fallingAction || '',
          denouement: analysisResult.threeAct.act3_resolution?.denouement || '',
        },
      } : undefined,
      conflictResolution: analysisResult.conflictResolution ? {
        conflictSetup: analysisResult.conflictResolution.conflictSetup,
        escalation: analysisResult.conflictResolution.escalation,
        climax: analysisResult.conflictResolution.climax,
        resolution: analysisResult.conflictResolution.resolution,
        aftermath: analysisResult.conflictResolution.aftermath,
      } : undefined,
      techniques: analysisResult.techniques?.map(t => typeof t === 'string' ? t : t.name),
      takeaways: analysisResult.takeaways,
      analyzedAt: analysisResult.analyzedAt instanceof Date 
        ? analysisResult.analyzedAt.toISOString() 
        : new Date().toISOString(),
    };

    // 更新故事单元表
    await this.bookDatabaseService.updateStoryUnit(bookPath, markId, {
      aiAnalysis: dbAnalysis,
    });

    // 如果有 DataSyncService，使用它来同步
    if (this.dataSyncService) {
      await this.dataSyncService.syncStoryUnitAnalysis(bookPath, markId, dbAnalysis);
    }

    // 自动生成事件表数据（如果分析结果包含关键事件）
    await this.generateEventsFromAnalysis(bookPath, bookId, markId, analysisResult, mark);
  }

  /**
   * 从分析结果自动生成事件
   * 
   * @param bookPath - 书籍路径
   * @param bookId - 书籍 ID
   * @param markId - 标记 ID
   * @param analysisResult - 分析结果
   * @param mark - 标记数据
   */
  private async generateEventsFromAnalysis(
    bookPath: string,
    bookId: string,
    markId: string,
    analysisResult: MarkAnalysisResult,
    mark: UnifiedMark
  ): Promise<void> {
    try {
      // 从7步法分析中提取事件
      if (analysisResult.sevenStep) {
        const sevenStep = analysisResult.sevenStep;
        const events: Array<{ name: string; description: string; order: number }> = [];

        if (sevenStep.step1_advantage) {
          events.push({ name: '主角优势', description: sevenStep.step1_advantage, order: 1 });
        }
        if (sevenStep.step2_villain) {
          events.push({ name: '反派出场', description: sevenStep.step2_villain, order: 2 });
        }
        if (sevenStep.step3_friction) {
          events.push({ name: '摩擦交集', description: sevenStep.step3_friction, order: 3 });
        }
        if (sevenStep.step4_expectation) {
          events.push({ name: '拉期待', description: sevenStep.step4_expectation, order: 4 });
        }
        if (sevenStep.step5_climax) {
          events.push({ name: '冲突爆发', description: sevenStep.step5_climax, order: 5 });
        }
        if (sevenStep.step6_shock) {
          events.push({ name: '震惊四座', description: sevenStep.step6_shock, order: 6 });
        }
        if (sevenStep.step7_reward) {
          events.push({ name: '收获奖励', description: sevenStep.step7_reward, order: 7 });
        }

        // 获取现有事件，避免重复创建
        const existingEvents = await this.bookDatabaseService.getEvents(bookPath);
        const existingEventNames = new Set(
          existingEvents
            .filter(e => e.storyUnitId === markId)
            .map(e => e.name)
        );

        // 创建新事件
        for (const event of events) {
          if (!existingEventNames.has(event.name)) {
            // 安全地获取章节索引
            const startChapterIndex = mark.range?.start?.chapterIndex ?? 0;
            const endChapterIndex = mark.range?.end?.chapterIndex ?? startChapterIndex;
            
            await this.bookDatabaseService.addEvent(bookPath, {
              bookId,
              storyUnitId: markId,
              name: event.name,
              description: event.description,
              pseudoTimeOrder: event.order,
              durationSpan: 1,
              layer: 0,
              color: this.getEventColor(event.order),
              chapterRange: {
                start: startChapterIndex + 1,
                end: endChapterIndex + 1,
              },
            });
          }
        }
      }
    } catch (error) {
      console.error('生成事件失败:', error);
    }
  }

  /**
   * 获取事件颜色
   */
  private getEventColor(order: number): string {
    const colors = [
      '#4ECDC4', // 主角优势 - 青色
      '#FF6B6B', // 反派出场 - 红色
      '#FFE66D', // 摩擦交集 - 黄色
      '#95E1D3', // 拉期待 - 浅绿
      '#F38181', // 冲突爆发 - 粉红
      '#AA96DA', // 震惊四座 - 紫色
      '#FCBAD3', // 收获奖励 - 粉色
    ];
    return colors[(order - 1) % colors.length];
  }

  /**
   * 解析 AI 响应
   */
  private parseAnalysisResponse(
    response: string,
    templateType: AnalysisTemplateType
  ): MarkAnalysisResult | null {
    try {
      // 尝试提取 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('No JSON found in response');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      const result: MarkAnalysisResult = {
        templateId: templateType,
        summary: parsed.summary || '',
        techniques: parsed.techniques || [],
        takeaways: parsed.takeaways || [],
        analyzedAt: new Date()
      };

      // 根据模板类型解析特定字段
      if (templateType === 'seven-step' && parsed.sevenStep) {
        result.sevenStep = parsed.sevenStep as SevenStepAnalysis;
      } else if (templateType === 'three-act' && parsed.threeAct) {
        result.threeAct = parsed.threeAct as ThreeActAnalysis;
      } else if (templateType === 'conflict-resolution' && parsed.conflictResolution) {
        result.conflictResolution = parsed.conflictResolution as ConflictResolutionAnalysis;
      } else if (templateType === 'custom') {
        result.customAnalysis = parsed;
      }

      return result;
    } catch (error) {
      console.error('Failed to parse analysis response:', error);
      return null;
    }
  }

  /**
   * 获取故事单元列表
   * 优先从数据库获取，回退到标记服务
   * 
   * Requirements: 2.3
   */
  async getStoryUnits(bookId: string): Promise<UnifiedMark[]> {
    // 尝试从数据库获取
    const bookPath = await this.getBookPath(bookId);
    if (bookPath) {
      try {
        const dbUnits = await this.bookDatabaseService.getStoryUnits(bookPath);
        if (dbUnits.length > 0) {
          // 转换为 UnifiedMark 格式
          return dbUnits.map(unit => this.storyUnitToMark(unit, bookId));
        }
      } catch (error) {
        console.warn('从数据库获取故事单元失败，回退到标记服务:', error);
      }
    }

    // 回退到标记服务
    const marks = await this.markingService.getMarksByBook(bookId);
    return marks.filter(m => m.mode === 'story-unit');
  }

  /**
   * 从数据库获取故事单元
   * 
   * @param bookId - 书籍 ID
   * @returns 故事单元列表
   * 
   * Requirements: 2.3
   */
  async getStoryUnitsFromDatabase(bookId: string): Promise<StoryUnit[]> {
    const bookPath = await this.getBookPath(bookId);
    if (!bookPath) {
      return [];
    }

    try {
      return await this.bookDatabaseService.getStoryUnits(bookPath);
    } catch (error) {
      console.error('获取故事单元失败:', error);
      return [];
    }
  }

  /**
   * 将 StoryUnit 转换为 UnifiedMark
   */
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
      analysisResult: unit.aiAnalysis ? {
        templateId: unit.analysisTemplate,
        summary: unit.aiAnalysis.summary,
        sevenStep: unit.aiAnalysis.sevenStep ? {
          step1_advantage: unit.aiAnalysis.sevenStep.step1Advantage,
          step2_villain: unit.aiAnalysis.sevenStep.step2Villain,
          step3_friction: unit.aiAnalysis.sevenStep.step3Friction,
          step4_expectation: unit.aiAnalysis.sevenStep.step4Expectation,
          step5_climax: unit.aiAnalysis.sevenStep.step5Climax,
          step6_shock: unit.aiAnalysis.sevenStep.step6Shock,
          step7_reward: unit.aiAnalysis.sevenStep.step7Reward,
        } : undefined,
        techniques: unit.aiAnalysis.techniques?.map(t => ({ name: t, description: '', effect: '' })),
        takeaways: unit.aiAnalysis.takeaways,
        analyzedAt: new Date(unit.aiAnalysis.analyzedAt),
      } : undefined,
      createdAt: new Date(unit.createdAt),
      updatedAt: new Date(unit.updatedAt),
    };
  }

  /**
   * 获取故事线类型标签
   */
  private getLineTypeLabel(lineType: StoryUnit['lineType']): string {
    const labels: Record<StoryUnit['lineType'], string> = {
      main: '主线',
      sub: '支线',
      independent: '独立',
      custom: '自定义',
    };
    return labels[lineType] || lineType;
  }

  /**
   * 添加选区到故事单元
   */
  async addSelectionToUnit(
    bookId: string,
    markId: string,
    selection: StoryUnitSelection
  ): Promise<boolean> {
    const mark = await this.markingService.getMark(bookId, markId);
    if (!mark || mark.mode !== 'story-unit') {
      return false;
    }

    if (!mark.selections) {
      mark.selections = [];
    }

    // 设置顺序
    selection.order = mark.selections.length;
    mark.selections.push(selection);

    // 更新内容
    const combinedContent = mark.selections
      .sort((a, b) => a.order - b.order)
      .map(s => s.range.textSnapshot)
      .join('\n\n---\n\n');
    
    mark.content = combinedContent;
    mark.range.textSnapshot = combinedContent.slice(0, 500);

    return true;
  }

  /**
   * 从故事单元移除选区
   */
  async removeSelectionFromUnit(
    bookId: string,
    markId: string,
    selectionId: string
  ): Promise<boolean> {
    const mark = await this.markingService.getMark(bookId, markId);
    if (!mark || mark.mode !== 'story-unit' || !mark.selections) {
      return false;
    }

    mark.selections = mark.selections.filter(s => s.id !== selectionId);
    
    // 重新排序
    mark.selections.forEach((s, i) => s.order = i);

    // 更新内容
    const combinedContent = mark.selections
      .sort((a, b) => a.order - b.order)
      .map(s => s.range.textSnapshot)
      .join('\n\n---\n\n');
    
    mark.content = combinedContent;
    mark.range.textSnapshot = combinedContent.slice(0, 500);

    return true;
  }

  /**
   * 生成选区ID
   */
  generateSelectionId(): string {
    return `sel_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * 从编辑器选择创建选区
   */
  createSelectionFromEditor(
    chapterIndex: number,
    chapterTitle: string,
    startLine: number,
    startCh: number,
    endLine: number,
    endCh: number,
    selectedText: string
  ): StoryUnitSelection {
    const start: TextPosition = {
      chapterIndex,
      paragraphIndex: startLine,
      characterOffset: startCh
    };

    const end: TextPosition = {
      chapterIndex,
      paragraphIndex: endLine,
      characterOffset: endCh
    };

    return {
      id: this.generateSelectionId(),
      chapterIndex,
      chapterTitle,
      range: {
        start,
        end,
        textSnapshot: selectedText
      },
      order: 0
    };
  }
}
