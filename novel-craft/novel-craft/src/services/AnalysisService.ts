/**
 * AnalysisService - 核心分析服务
 * 
 * 协调 epub 解析和 LLM 调用，实现智能拆书分析功能。
 * 支持快速、标准、深度三种分析模式。
 */

import {
  ParsedBook,
  AnalysisConfig,
  AnalysisResult,
  AnalysisProgress,
  CharacterAnalysis,
  TechniqueAnalysis,
  EmotionPoint,
  ChapterSummary,
  Foreshadowing,
  ChapterDetail,
  ChatMessage,
  Chapter,
  AnalysisMode,
  NovelType,
  IncrementalMode,
  AnalysisRange,
  BatchInfo,
  BatchFailureAction,
  BatchCompleteCallback,
  BatchFailureCallback
} from '../types';
import { MetadataService } from './MetadataService';
import { CheckpointService, AnalysisCheckpoint } from './CheckpointService';
import { LLMService } from './LLMService';
import {
  SYSTEM_PROMPT,
  getAnalysisPrompt,
  getAnalysisStages,
  getStageName,
  BASE_PROMPTS,
  STANDARD_PROMPTS,
  DEEP_PROMPTS,
  getSystemPrompt
} from './PromptTemplates';

/**
 * 分块配置
 */
interface ChunkConfig {
  /** 每块最大字数 */
  maxCharsPerChunk: number;
  /** 每块最大章节数 */
  maxChaptersPerChunk: number;
}

const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
  maxCharsPerChunk: 50000,  // 约 50k 字符，考虑到 token 限制
  maxChaptersPerChunk: 20
};

/**
 * 阶段结果回调类型
 */
type StageResultCallback = (
  stage: string,
  status: 'pending' | 'running' | 'completed' | 'error',
  message: string,
  result?: string
) => void;

/**
 * 笔记生成回调类型
 */
type NoteGeneratedCallback = (
  noteType: string,
  filePath: string
) => void;

/**
 * 分析控制状态
 */
export type AnalysisControlState = 'running' | 'paused' | 'stopped';

/**
 * 分析控制器 - 用于暂停和终止分析
 */
export class AnalysisController {
  private state: AnalysisControlState = 'running';
  private pauseResolve: (() => void) | null = null;
  private onStateChange?: (state: AnalysisControlState) => void;

  constructor(onStateChange?: (state: AnalysisControlState) => void) {
    this.onStateChange = onStateChange;
  }

  getState(): AnalysisControlState {
    return this.state;
  }

  pause(): void {
    if (this.state === 'running') {
      this.state = 'paused';
      this.onStateChange?.('paused');
    }
  }

  resume(): void {
    if (this.state === 'paused') {
      this.state = 'running';
      this.onStateChange?.('running');
      if (this.pauseResolve) {
        this.pauseResolve();
        this.pauseResolve = null;
      }
    }
  }

  stop(): void {
    this.state = 'stopped';
    this.onStateChange?.('stopped');
    // 如果正在暂停中，也要解除暂停让流程能够检测到停止
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }
  }

  reset(): void {
    this.state = 'running';
    this.pauseResolve = null;
  }

  /**
   * 检查点 - 在每个阶段开始前调用
   * 如果暂停则等待，如果停止则抛出异常
   */
  async checkpoint(): Promise<void> {
    // 检查是否已停止
    this.checkStopped();
    
    // 如果暂停，等待恢复
    while (this.state === 'paused') {
      await new Promise<void>((resolve) => {
        this.pauseResolve = resolve;
      });
    }
    
    // 等待结束后再次检查停止状态
    this.checkStopped();
  }

  /**
   * 检查是否已停止
   */
  private checkStopped(): void {
    if (this.state === 'stopped') {
      throw new AnalysisStoppedError('分析已被用户终止');
    }
  }
}

/**
 * 分析被停止的错误
 */
export class AnalysisStoppedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalysisStoppedError';
  }
}

export class AnalysisService {
  private llmService: LLMService;
  private chunkConfig: ChunkConfig;
  private onProgress: ((progress: AnalysisProgress) => void) | null = null;
  private onStageResult: StageResultCallback | null = null;
  private onNoteGenerated: NoteGeneratedCallback | null = null;
  private controller: AnalysisController | null = null;
  private checkpointService: CheckpointService | null = null;

  constructor(llmService: LLMService, chunkConfig?: Partial<ChunkConfig>) {
    this.llmService = llmService;
    this.chunkConfig = { ...DEFAULT_CHUNK_CONFIG, ...chunkConfig };
  }

  /**
   * 设置断点服务
   * @param checkpointService 断点服务实例
   */
  setCheckpointService(checkpointService: CheckpointService): void {
    this.checkpointService = checkpointService;
  }

  /**
   * 更新进度
   */
  private updateProgress(stage: string, progress: number, message: string): void {
    if (this.onProgress) {
      this.onProgress({ stage, progress, message });
    }
  }

  /**
   * 报告阶段结果
   */
  private reportStageResult(
    stage: string,
    status: 'pending' | 'running' | 'completed' | 'error',
    message: string,
    result?: string
  ): void {
    if (this.onStageResult) {
      this.onStageResult(stage, status, message, result);
    }
  }

  /**
   * 开始分析
   * @param book 已解析的书籍
   * @param config 分析配置
   * @param onProgress 进度回调
   * @returns 分析结果
   */
  async analyze(
    book: ParsedBook,
    config: AnalysisConfig,
    onProgress: (progress: AnalysisProgress) => void
  ): Promise<AnalysisResult> {
    this.onProgress = onProgress;
    const stages = getAnalysisStages(config.mode);
    const totalStages = stages.length;
    let completedStages = 0;

    // 初始化结果
    const result: AnalysisResult = {
      bookInfo: book.metadata,
      synopsis: '',
      characters: [],
      writingTechniques: [],
      takeaways: []
    };

    // 准备书籍内容（分块处理）
    const chunks = this.splitBookIntoChunks(book);
    
    this.updateProgress(
      '准备中',
      0,
      `开始分析《${book.metadata.title}》，共 ${book.chapters.length} 章，分为 ${chunks.length} 个分析块`
    );

    // 执行各分析阶段
    for (const stage of stages) {
      const stageName = getStageName(stage);
      const stageProgress = (completedStages / totalStages) * 100;
      
      this.updateProgress(
        stageName,
        stageProgress,
        `[${completedStages + 1}/${totalStages}] 正在分析: ${stageName}...`
      );

      try {
        await this.executeStage(stage, book, chunks, config, result);
        this.updateProgress(
          stageName,
          ((completedStages + 1) / totalStages) * 100,
          `[${completedStages + 1}/${totalStages}] ${stageName} 完成 ✓`
        );
      } catch (error) {
        console.error(`分析阶段 ${stage} 失败:`, error);
        this.updateProgress(
          stageName,
          stageProgress,
          `[${completedStages + 1}/${totalStages}] ${stageName} 失败，继续下一阶段...`
        );
      }

      completedStages++;
    }

    this.updateProgress('完成', 100, '分析完成！正在生成笔记...');
    this.onProgress = null;

    return result;
  }

  /**
   * 带实时结果的分析
   * @param book 已解析的书籍
   * @param config 分析配置
   * @param onProgress 进度回调
   * @param onStageResult 阶段结果回调
   * @param onNoteGenerated 笔记生成回调（可选）
   * @param createFile 文件创建函数（可选，用于增量生成笔记）
   * @param outputPath 输出路径（可选）
   * @param controller 分析控制器（可选，用于暂停/终止）
   * @param notesPath 笔记根路径（可选，用于断点保存）
   * @param chapterRange 章节范围（可选，用于断点保存）
   * @returns 分析结果
   */
  async analyzeWithResults(
    book: ParsedBook,
    config: AnalysisConfig,
    onProgress: (progress: AnalysisProgress) => void,
    onStageResult: StageResultCallback,
    onNoteGenerated?: NoteGeneratedCallback,
    createFile?: (path: string, content: string) => Promise<void>,
    outputPath?: string,
    controller?: AnalysisController,
    notesPath?: string,
    chapterRange?: { start: number; end: number }
  ): Promise<AnalysisResult> {
    this.onProgress = onProgress;
    this.onStageResult = onStageResult;
    this.onNoteGenerated = onNoteGenerated || null;
    this.controller = controller || null;
    
    const stages = getAnalysisStages(config.mode);
    const totalStages = stages.length;
    let completedStages = 0;

    // 初始化结果
    const result: AnalysisResult = {
      bookInfo: book.metadata,
      synopsis: '',
      characters: [],
      writingTechniques: [],
      takeaways: []
    };

    // 准备书籍内容（分块处理）
    const chunks = this.splitBookIntoChunks(book);
    
    // 准备笔记输出路径
    const bookFolderName = this.sanitizeFileName(book.metadata.title);
    const bookFolderPath = outputPath ? `${outputPath}/${bookFolderName}` : null;
    
    // Requirements: 1.2.2.1 - 创建断点
    if (this.checkpointService && notesPath) {
      const range = chapterRange || { start: 1, end: book.chapters.length };
      await this.checkpointService.createCheckpoint(
        '', // bookPath
        book.metadata.title,
        config,
        range,
        notesPath
      );
    }
    
    this.updateProgress(
      '准备中',
      0,
      `开始分析《${book.metadata.title}》，共 ${book.chapters.length} 章，分为 ${chunks.length} 个分析块`
    );

    // 执行各分析阶段
    for (const stage of stages) {
      // 检查暂停/终止状态
      if (this.controller) {
        await this.controller.checkpoint();
      }
      
      const stageName = getStageName(stage);
      const stageProgress = (completedStages / totalStages) * 100;
      
      this.updateProgress(
        stageName,
        stageProgress,
        `[${completedStages + 1}/${totalStages}] 正在分析: ${stageName}...`
      );
      
      this.reportStageResult(stageName, 'running', `正在分析 ${stageName}...`);
      
      // Requirements: 1.2.2.2 - 设置当前阶段
      if (this.checkpointService && notesPath) {
        await this.checkpointService.setCurrentStage(book.metadata.title, stage, notesPath);
      }

      try {
        const stageResult = await this.executeStageWithResult(stage, book, chunks, config, result);
        
        this.updateProgress(
          stageName,
          ((completedStages + 1) / totalStages) * 100,
          `[${completedStages + 1}/${totalStages}] ${stageName} 完成 ✓`
        );
        
        this.reportStageResult(stageName, 'completed', `${stageName} 分析完成`, stageResult);
        
        // Requirements: 1.2.2.2 - 更新断点，保存阶段结果
        if (this.checkpointService && notesPath) {
          const partialResult = this.extractStageResult(stage, result);
          await this.checkpointService.updateCheckpoint(
            book.metadata.title,
            stage,
            partialResult,
            notesPath
          );
        }
        
        // 增量生成笔记
        if (createFile && bookFolderPath) {
          await this.generateIncrementalNote(stage, book, result, config.mode, bookFolderPath, createFile);
        }
      } catch (error) {
        // 如果是用户终止，直接抛出
        if (error instanceof AnalysisStoppedError) {
          throw error;
        }
        
        console.error(`分析阶段 ${stage} 失败:`, error);
        const errorMsg = error instanceof Error ? error.message : '未知错误';
        
        this.updateProgress(
          stageName,
          stageProgress,
          `[${completedStages + 1}/${totalStages}] ${stageName} 失败，继续下一阶段...`
        );
        
        this.reportStageResult(stageName, 'error', `${stageName} 失败: ${errorMsg}`);
      }

      completedStages++;
    }

    // 分析完成，删除断点
    if (this.checkpointService && notesPath) {
      await this.checkpointService.deleteCheckpoint(book.metadata.title, notesPath);
    }

    this.updateProgress('完成', 100, '分析完成！正在生成笔记...');
    this.onProgress = null;
    this.onStageResult = null;
    this.onNoteGenerated = null;
    this.controller = null;

    return result;
  }

  /**
   * 提取阶段结果用于断点保存
   * @param stage 阶段名称
   * @param result 当前分析结果
   * @returns 该阶段的部分结果
   */
  private extractStageResult(stage: string, result: AnalysisResult): Partial<AnalysisResult> {
    switch (stage) {
      case 'synopsis':
        return { synopsis: result.synopsis };
      case 'characters':
        return { characters: result.characters };
      case 'techniques':
        return { writingTechniques: result.writingTechniques };
      case 'takeaways':
        return { takeaways: result.takeaways };
      case 'emotionCurve':
        return { emotionCurve: result.emotionCurve };
      case 'chapterStructure':
        return { chapterStructure: result.chapterStructure };
      case 'foreshadowing':
        return { foreshadowing: result.foreshadowing };
      case 'chapterDetail':
        return { chapterDetails: result.chapterDetails };
      case 'writingReview':
        return { writingReview: result.writingReview };
      default:
        return {};
    }
  }

  /**
   * 从断点恢复分析
   * Requirements: 1.2.2.5
   * 
   * 跳过已完成的阶段，从断点继续分析
   * 
   * @param book 已解析的书籍
   * @param checkpoint 断点数据
   * @param notesPath 笔记路径
   * @param onProgress 进度回调
   * @param onStageResult 阶段结果回调
   * @param onNoteGenerated 笔记生成回调（可选）
   * @param createFile 文件创建函数（可选）
   * @param outputPath 输出路径（可选）
   * @param controller 分析控制器（可选）
   * @returns 分析结果
   */
  async resumeFromCheckpoint(
    book: ParsedBook,
    checkpoint: AnalysisCheckpoint,
    notesPath: string,
    onProgress: (progress: AnalysisProgress) => void,
    onStageResult: StageResultCallback,
    onNoteGenerated?: NoteGeneratedCallback,
    createFile?: (path: string, content: string) => Promise<void>,
    outputPath?: string,
    controller?: AnalysisController
  ): Promise<AnalysisResult> {
    this.onProgress = onProgress;
    this.onStageResult = onStageResult;
    this.onNoteGenerated = onNoteGenerated || null;
    this.controller = controller || null;

    const config = checkpoint.config;
    const chapterRange = checkpoint.chapterRange;
    const completedStages = checkpoint.completedStages;
    
    // 根据章节范围过滤书籍
    const filteredBook = this.filterBookByChapterRange(book, chapterRange);
    
    const stages = getAnalysisStages(config.mode);
    const totalStages = stages.length;
    
    // 初始化结果，从断点恢复已有结果
    const result: AnalysisResult = {
      bookInfo: book.metadata,
      synopsis: checkpoint.partialResults.synopsis || '',
      characters: checkpoint.partialResults.characters || [],
      writingTechniques: checkpoint.partialResults.writingTechniques || [],
      takeaways: checkpoint.partialResults.takeaways || [],
      emotionCurve: checkpoint.partialResults.emotionCurve,
      chapterStructure: checkpoint.partialResults.chapterStructure,
      foreshadowing: checkpoint.partialResults.foreshadowing,
      chapterDetails: checkpoint.partialResults.chapterDetails,
      writingReview: checkpoint.partialResults.writingReview
    };

    // 准备书籍内容（分块处理）
    const chunks = this.splitBookIntoChunks(filteredBook);
    
    // 准备笔记输出路径
    const bookFolderName = this.sanitizeFileName(book.metadata.title);
    const bookFolderPath = outputPath ? `${outputPath}/${bookFolderName}` : null;
    
    // 计算已完成的阶段数
    let completedCount = completedStages.length;
    
    this.updateProgress(
      '从断点恢复',
      (completedCount / totalStages) * 100,
      `从断点恢复分析《${book.metadata.title}》，已完成 ${completedCount}/${totalStages} 个阶段`
    );

    // 执行各分析阶段
    for (const stage of stages) {
      // Requirements: 1.2.2.5 - 跳过已完成的阶段
      if (completedStages.includes(stage)) {
        const stageName = getStageName(stage);
        this.reportStageResult(stageName, 'completed', `${stageName} 已完成（从断点恢复）`);
        continue;
      }
      
      // 检查暂停/终止状态
      if (this.controller) {
        await this.controller.checkpoint();
      }
      
      const stageName = getStageName(stage);
      const stageProgress = (completedCount / totalStages) * 100;
      
      this.updateProgress(
        stageName,
        stageProgress,
        `[${completedCount + 1}/${totalStages}] 正在分析: ${stageName}...`
      );
      
      this.reportStageResult(stageName, 'running', `正在分析 ${stageName}...`);
      
      // 设置当前阶段
      if (this.checkpointService && notesPath) {
        await this.checkpointService.setCurrentStage(book.metadata.title, stage, notesPath);
      }

      try {
        const stageResult = await this.executeStageWithResult(stage, filteredBook, chunks, config, result);
        
        this.updateProgress(
          stageName,
          ((completedCount + 1) / totalStages) * 100,
          `[${completedCount + 1}/${totalStages}] ${stageName} 完成 ✓`
        );
        
        this.reportStageResult(stageName, 'completed', `${stageName} 分析完成`, stageResult);
        
        // 更新断点
        if (this.checkpointService && notesPath) {
          const partialResult = this.extractStageResult(stage, result);
          await this.checkpointService.updateCheckpoint(
            book.metadata.title,
            stage,
            partialResult,
            notesPath
          );
        }
        
        // 增量生成笔记
        if (createFile && bookFolderPath) {
          await this.generateIncrementalNote(stage, filteredBook, result, config.mode, bookFolderPath, createFile);
        }
      } catch (error) {
        // 如果是用户终止，直接抛出
        if (error instanceof AnalysisStoppedError) {
          throw error;
        }
        
        console.error(`分析阶段 ${stage} 失败:`, error);
        const errorMsg = error instanceof Error ? error.message : '未知错误';
        
        this.updateProgress(
          stageName,
          stageProgress,
          `[${completedCount + 1}/${totalStages}] ${stageName} 失败，继续下一阶段...`
        );
        
        this.reportStageResult(stageName, 'error', `${stageName} 失败: ${errorMsg}`);
      }

      completedCount++;
    }

    // 分析完成，删除断点
    if (this.checkpointService && notesPath) {
      await this.checkpointService.deleteCheckpoint(book.metadata.title, notesPath);
    }

    this.updateProgress('完成', 100, '分析完成！正在生成笔记...');
    this.onProgress = null;
    this.onStageResult = null;
    this.onNoteGenerated = null;
    this.controller = null;

    return result;
  }

  /**
   * 增量分析
   * Requirements: 1.1.4.1
   * 
   * @param book 已解析的书籍
   * @param config 分析配置
   * @param incrementalMode 增量模式: continue/append/restart
   * @param chapterRange 章节范围 (1-based, inclusive)
   * @param metadataService 元数据服务
   * @param notesPath 笔记路径
   * @param onProgress 进度回调
   * @param onStageResult 阶段结果回调
   * @param onNoteGenerated 笔记生成回调（可选）
   * @param createFile 文件创建函数（可选）
   * @param outputPath 输出路径（可选）
   * @param controller 分析控制器（可选）
   * @returns 分析结果
   */
  async analyzeIncremental(
    book: ParsedBook,
    config: AnalysisConfig,
    incrementalMode: IncrementalMode,
    chapterRange: { start: number; end: number },
    metadataService: MetadataService,
    notesPath: string,
    onProgress: (progress: AnalysisProgress) => void,
    onStageResult: StageResultCallback,
    onNoteGenerated?: NoteGeneratedCallback,
    createFile?: (path: string, content: string) => Promise<void>,
    outputPath?: string,
    controller?: AnalysisController
  ): Promise<AnalysisResult> {
    // 根据增量模式过滤章节
    // Requirements: 1.1.4.1 - 只处理新 Analysis_Range 中的章节
    const filteredBook = this.filterBookByChapterRange(book, chapterRange);
    
    this.updateProgress(
      '准备中',
      0,
      `增量分析模式: ${this.getIncrementalModeName(incrementalMode)}，分析章节 ${chapterRange.start}-${chapterRange.end}`
    );

    // 执行分析
    const result = await this.analyzeWithResults(
      filteredBook,
      config,
      onProgress,
      onStageResult,
      onNoteGenerated,
      createFile,
      outputPath,
      controller,
      notesPath,
      chapterRange
    );

    // 分析完成后保存元数据
    // Requirements: 1.1.3.1, 1.1.3.4
    const stages = getAnalysisStages(config.mode);
    const range: AnalysisRange = {
      id: this.generateRangeId(),
      startChapter: chapterRange.start,
      endChapter: chapterRange.end,
      mode: config.mode,
      analyzedAt: new Date().toISOString(),
      stages
    };

    // 根据模式决定是否清除旧元数据
    if (incrementalMode === 'restart') {
      // 重新分析模式：删除旧元数据后创建新的
      await metadataService.deleteMetadata(book.metadata.title, notesPath);
    }

    // 添加新的分析范围
    await metadataService.addRange(
      '', // bookPath 在这里不需要，因为 addRange 会从现有元数据获取
      book.metadata.title,
      range,
      notesPath
    );

    return result;
  }

  /**
   * 分批分析
   * Requirements: 1.3.1.3, 1.3.1.4, 1.3.2.1, 1.3.2.2, 1.3.2.3, 1.3.2.4
   * 
   * 自动将章节分割为批次进行分析，每批完成后立即保存结果。
   * 支持批次失败时的重试或跳过选项。
   * 
   * @param book 已解析的书籍
   * @param config 分析配置
   * @param batchSize 每批章节数
   * @param chapterRange 章节范围 (1-based, inclusive)
   * @param metadataService 元数据服务
   * @param notesPath 笔记路径
   * @param onProgress 进度回调
   * @param onStageResult 阶段结果回调
   * @param onBatchComplete 批次完成回调
   * @param onBatchFailure 批次失败回调（返回处理方式）
   * @param onNoteGenerated 笔记生成回调（可选）
   * @param createFile 文件创建函数（可选）
   * @param outputPath 输出路径（可选）
   * @param controller 分析控制器（可选）
   * @returns 合并后的分析结果
   */
  async analyzeBatched(
    book: ParsedBook,
    config: AnalysisConfig,
    batchSize: number,
    chapterRange: { start: number; end: number },
    metadataService: MetadataService,
    notesPath: string,
    onProgress: (progress: AnalysisProgress) => void,
    onStageResult: StageResultCallback,
    onBatchComplete: BatchCompleteCallback,
    onBatchFailure: BatchFailureCallback,
    onNoteGenerated?: NoteGeneratedCallback,
    createFile?: (path: string, content: string) => Promise<void>,
    outputPath?: string,
    controller?: AnalysisController
  ): Promise<AnalysisResult> {
    this.onProgress = onProgress;
    this.onStageResult = onStageResult;
    this.onNoteGenerated = onNoteGenerated || null;
    this.controller = controller || null;

    // 计算批次
    const batches = this.calculateBatches(chapterRange, batchSize);
    const totalBatches = batches.length;

    // 初始化批次信息
    const batchInfos: BatchInfo[] = batches.map((batch, index) => ({
      batchIndex: index,
      totalBatches,
      startChapter: batch.start,
      endChapter: batch.end,
      status: 'pending' as const
    }));

    // 存储所有批次的结果
    const batchResults: AnalysisResult[] = [];
    
    // 初始化合并后的结果
    let mergedResult: AnalysisResult = {
      bookInfo: book.metadata,
      synopsis: '',
      characters: [],
      writingTechniques: [],
      takeaways: []
    };

    this.updateProgress(
      '分批分析',
      0,
      `开始分批分析《${book.metadata.title}》，共 ${totalBatches} 批`
    );

    // 逐批分析
    for (let i = 0; i < batchInfos.length; i++) {
      const batchInfo = batchInfos[i];
      
      // 检查暂停/终止状态
      if (this.controller) {
        await this.controller.checkpoint();
      }

      // Requirements: 1.3.1.4 - 显示批次进度
      this.updateProgress(
        '分批分析',
        (i / totalBatches) * 100,
        `正在分析第 ${i + 1}/${totalBatches} 批 (章节 ${batchInfo.startChapter}-${batchInfo.endChapter})`
      );

      batchInfo.status = 'running';
      this.reportStageResult(
        `批次 ${i + 1}/${totalBatches}`,
        'running',
        `正在分析章节 ${batchInfo.startChapter}-${batchInfo.endChapter}...`
      );

      let retryCount = 0;
      const maxRetries = 3;
      let batchSuccess = false;

      while (!batchSuccess && retryCount <= maxRetries) {
        try {
          // 过滤当前批次的章节
          const batchBook = this.filterBookByChapterRange(book, {
            start: batchInfo.startChapter,
            end: batchInfo.endChapter
          });

          // 分析当前批次
          const batchResult = await this.analyzeWithResults(
            batchBook,
            config,
            (progress) => {
              // 调整进度显示，包含批次信息
              const batchProgress = (i + progress.progress / 100) / totalBatches * 100;
              this.updateProgress(
                progress.stage,
                batchProgress,
                `[批次 ${i + 1}/${totalBatches}] ${progress.message}`
              );
            },
            (stage, status, message, result) => {
              this.reportStageResult(
                `[批次 ${i + 1}] ${stage}`,
                status,
                message,
                result
              );
            },
            onNoteGenerated,
            undefined, // 不在这里创建文件，由 onBatchComplete 处理
            undefined,
            controller,
            notesPath,
            { start: batchInfo.startChapter, end: batchInfo.endChapter }
          );

          // 批次成功
          batchInfo.status = 'completed';
          batchInfo.result = batchResult;
          batchResults.push(batchResult);

          // Requirements: 1.3.2.1 - 每批完成后立即保存结果
          await onBatchComplete(batchInfo, batchResult);

          this.reportStageResult(
            `批次 ${i + 1}/${totalBatches}`,
            'completed',
            `章节 ${batchInfo.startChapter}-${batchInfo.endChapter} 分析完成 ✓`
          );

          batchSuccess = true;

        } catch (error) {
          // 如果是用户终止，直接抛出
          if (error instanceof AnalysisStoppedError) {
            throw error;
          }

          retryCount++;
          const errorMsg = error instanceof Error ? error.message : '未知错误';
          
          console.error(`批次 ${i + 1} 分析失败 (尝试 ${retryCount}/${maxRetries + 1}):`, error);

          if (retryCount > maxRetries) {
            // Requirements: 1.3.2.2 - 失败时保留已完成批次结果
            // Requirements: 1.3.2.3 - 提供重试或跳过选项
            batchInfo.status = 'failed';
            batchInfo.error = errorMsg;

            this.reportStageResult(
              `批次 ${i + 1}/${totalBatches}`,
              'error',
              `章节 ${batchInfo.startChapter}-${batchInfo.endChapter} 分析失败: ${errorMsg}`
            );

            // 询问用户如何处理
            const action = await onBatchFailure(batchInfo, error instanceof Error ? error : new Error(errorMsg));

            if (action === 'retry') {
              // 重置重试计数，再试一次
              retryCount = 0;
              continue;
            } else if (action === 'skip') {
              // 跳过当前批次
              batchInfo.status = 'skipped';
              this.reportStageResult(
                `批次 ${i + 1}/${totalBatches}`,
                'error',
                `章节 ${batchInfo.startChapter}-${batchInfo.endChapter} 已跳过`
              );
              batchSuccess = true; // 标记为"成功"以继续下一批
            } else {
              // 中止整个分析
              throw new Error(`分析在批次 ${i + 1} 中止: ${errorMsg}`);
            }
          } else {
            // 自动重试
            this.updateProgress(
              '分批分析',
              (i / totalBatches) * 100,
              `批次 ${i + 1} 失败，正在重试 (${retryCount}/${maxRetries})...`
            );
            
            // 等待一段时间后重试（指数退避）
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount - 1)));
          }
        }
      }
    }

    // Requirements: 1.3.2.4 - 所有批次完成后合并结果
    this.updateProgress(
      '合并结果',
      95,
      '正在合并所有批次的分析结果...'
    );

    // 使用 MergeService 合并所有批次结果
    const { MergeService } = await import('./MergeService');
    const mergeService = new MergeService();

    for (const batchResult of batchResults) {
      mergedResult = mergeService.mergeResults(mergedResult, batchResult, {
        strategy: 'merge',
        preferLatest: true
      });
    }

    // 保存最终合并的元数据
    const stages = getAnalysisStages(config.mode);
    const range: AnalysisRange = {
      id: this.generateRangeId(),
      startChapter: chapterRange.start,
      endChapter: chapterRange.end,
      mode: config.mode,
      analyzedAt: new Date().toISOString(),
      stages
    };

    await metadataService.addRange(
      '',
      book.metadata.title,
      range,
      notesPath
    );

    // 生成最终合并的笔记
    if (createFile && outputPath) {
      const { NoteGenerator } = await import('./NoteGenerator');
      const generator = new NoteGenerator({ mode: config.mode });
      await generator.generateNotes(book, mergedResult, outputPath, createFile);
    }

    this.updateProgress('完成', 100, `分批分析完成！共完成 ${batchResults.length}/${totalBatches} 批`);

    this.onProgress = null;
    this.onStageResult = null;
    this.onNoteGenerated = null;
    this.controller = null;

    return mergedResult;
  }

  /**
   * 计算批次划分
   * Requirements: 1.3.1.3 - 自动分割章节为批次
   * 
   * @param chapterRange 章节范围 (1-based, inclusive)
   * @param batchSize 每批章节数
   * @returns 批次数组，每个元素包含 start 和 end (1-based, inclusive)
   */
  private calculateBatches(
    chapterRange: { start: number; end: number },
    batchSize: number
  ): Array<{ start: number; end: number }> {
    const batches: Array<{ start: number; end: number }> = [];
    let currentStart = chapterRange.start;

    while (currentStart <= chapterRange.end) {
      const currentEnd = Math.min(currentStart + batchSize - 1, chapterRange.end);
      batches.push({ start: currentStart, end: currentEnd });
      currentStart = currentEnd + 1;
    }

    return batches;
  }

  /**
   * 根据章节范围过滤书籍
   * Requirements: 1.1.4.1 - 只处理指定范围内的章节
   * 
   * @param book 原始书籍
   * @param chapterRange 章节范围 (1-based, inclusive)
   * @returns 过滤后的书籍
   */
  private filterBookByChapterRange(
    book: ParsedBook,
    chapterRange: { start: number; end: number }
  ): ParsedBook {
    // 转换为 0-based 索引
    const startIndex = chapterRange.start - 1;
    const endIndex = chapterRange.end - 1;

    // 过滤章节
    const filteredChapters = book.chapters.filter((_, index) => 
      index >= startIndex && index <= endIndex
    );

    // 重新计算总字数
    const totalWordCount = filteredChapters.reduce(
      (sum, chapter) => sum + chapter.wordCount,
      0
    );

    return {
      metadata: book.metadata,
      chapters: filteredChapters,
      totalWordCount
    };
  }

  /**
   * 获取增量模式的中文名称
   */
  private getIncrementalModeName(mode: IncrementalMode): string {
    const names: Record<IncrementalMode, string> = {
      continue: '继续分析',
      append: '追加分析',
      restart: '重新分析'
    };
    return names[mode];
  }

  /**
   * 生成唯一的范围 ID
   */
  private generateRangeId(): string {
    return `range-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 增量生成笔记
   */
  private async generateIncrementalNote(
    stage: string,
    book: ParsedBook,
    result: AnalysisResult,
    mode: AnalysisMode,
    bookFolderPath: string,
    createFile: (path: string, content: string) => Promise<void>
  ): Promise<void> {
    const { NoteGenerator } = await import('./NoteGenerator');
    const generator = new NoteGenerator({ mode });
    
    let notePath: string | null = null;
    let noteContent: string | null = null;
    let noteType: string | null = null;

    switch (stage) {
      case 'synopsis':
        // 生成概览笔记（包含梗概）
        notePath = `${bookFolderPath}/00-概览.md`;
        noteContent = generator.generateOverviewNote(book, result);
        noteType = '概览笔记';
        break;
        
      case 'characters':
        // 生成人物图谱笔记
        notePath = `${bookFolderPath}/01-人物图谱.md`;
        noteContent = generator.generateCharacterNote(result);
        noteType = '人物图谱';
        break;
        
      case 'techniques':
      case 'takeaways':
        // 生成写作技法笔记（技法+可借鉴清单完成后）
        if (stage === 'takeaways' || (stage === 'techniques' && !getAnalysisStages(mode).includes('takeaways'))) {
          notePath = `${bookFolderPath}/03-写作技法.md`;
          noteContent = generator.generateTechniqueNote(result);
          noteType = '写作技法';
        }
        break;
        
      case 'emotionCurve':
      case 'chapterStructure':
      case 'foreshadowing':
        // 生成情节分析笔记（任一完成后更新）
        notePath = `${bookFolderPath}/02-情节分析.md`;
        noteContent = generator.generatePlotNote(result);
        noteType = '情节分析';
        break;
        
      case 'writingReview':
        // 更新写作技法笔记（包含复盘）
        notePath = `${bookFolderPath}/03-写作技法.md`;
        noteContent = generator.generateTechniqueNote(result);
        noteType = '写作技法（含复盘）';
        break;
        
      case 'chapterDetail':
        // 生成章节笔记
        if (result.chapterDetails && result.chapterDetails.length > 0) {
          const chapterNotes = generator.generateChapterNotes(result);
          for (const [index, content] of chapterNotes) {
            const detail = result.chapterDetails.find(d => d.index === index);
            const chapterFileName = this.formatChapterFileName(index, detail?.title || '');
            const chapterFilePath = `${bookFolderPath}/章节笔记/${chapterFileName}`;
            await createFile(chapterFilePath, content);
            if (this.onNoteGenerated) {
              this.onNoteGenerated(`章节${index + 1}笔记`, chapterFilePath);
            }
          }
        }
        return; // 章节笔记单独处理，直接返回
    }

    if (notePath && noteContent && noteType) {
      await createFile(notePath, noteContent);
      if (this.onNoteGenerated) {
        this.onNoteGenerated(noteType, notePath);
      }
    }
  }

  /**
   * 清理文件名
   */
  private sanitizeFileName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);
  }

  /**
   * 格式化章节文件名
   */
  private formatChapterFileName(index: number, title: string): string {
    const paddedIndex = String(index + 1).padStart(3, '0');
    const sanitizedTitle = this.sanitizeFileName(title);
    return `${paddedIndex}-${sanitizedTitle}.md`;
  }

  /**
   * 执行单个分析阶段并返回结果
   */
  private async executeStageWithResult(
    stage: string,
    book: ParsedBook,
    chunks: BookChunk[],
    config: AnalysisConfig,
    result: AnalysisResult
  ): Promise<string> {
    let stageResult: unknown;
    
    switch (stage) {
      case 'synopsis':
        result.synopsis = await this.analyzeSynopsis(book, chunks, config);
        stageResult = result.synopsis;
        break;
      case 'characters':
        result.characters = await this.analyzeCharacters(book, chunks, config);
        stageResult = result.characters;
        break;
      case 'techniques':
        result.writingTechniques = await this.analyzeTechniques(book, chunks, config);
        stageResult = result.writingTechniques;
        break;
      case 'takeaways':
        result.takeaways = await this.analyzeTakeaways(book, chunks, config, result);
        stageResult = result.takeaways;
        break;
      case 'emotionCurve':
        result.emotionCurve = await this.analyzeEmotionCurve(book, chunks, config);
        stageResult = result.emotionCurve;
        break;
      case 'chapterStructure':
        result.chapterStructure = await this.analyzeChapterStructure(book, chunks, config);
        stageResult = result.chapterStructure;
        break;
      case 'foreshadowing':
        result.foreshadowing = await this.analyzeForeshadowing(book, chunks, config);
        stageResult = result.foreshadowing;
        break;
      case 'chapterDetail':
        result.chapterDetails = await this.analyzeChapterDetails(book, config);
        stageResult = result.chapterDetails;
        break;
      case 'writingReview':
        result.writingReview = await this.analyzeWritingReview(book, config, result);
        stageResult = result.writingReview;
        break;
      default:
        stageResult = null;
    }
    
    // 将结果转换为字符串
    if (typeof stageResult === 'string') {
      return stageResult;
    }
    return JSON.stringify(stageResult, null, 2);
  }


  /**
   * 执行单个分析阶段
   */
  private async executeStage(
    stage: string,
    book: ParsedBook,
    chunks: BookChunk[],
    config: AnalysisConfig,
    result: AnalysisResult
  ): Promise<void> {
    switch (stage) {
      case 'synopsis':
        result.synopsis = await this.analyzeSynopsis(book, chunks, config);
        break;
      case 'characters':
        result.characters = await this.analyzeCharacters(book, chunks, config);
        break;
      case 'techniques':
        result.writingTechniques = await this.analyzeTechniques(book, chunks, config);
        break;
      case 'takeaways':
        result.takeaways = await this.analyzeTakeaways(book, chunks, config, result);
        break;
      case 'emotionCurve':
        result.emotionCurve = await this.analyzeEmotionCurve(book, chunks, config);
        break;
      case 'chapterStructure':
        result.chapterStructure = await this.analyzeChapterStructure(book, chunks, config);
        break;
      case 'foreshadowing':
        result.foreshadowing = await this.analyzeForeshadowing(book, chunks, config);
        break;
      case 'chapterDetail':
        result.chapterDetails = await this.analyzeChapterDetails(book, config);
        break;
      case 'writingReview':
        result.writingReview = await this.analyzeWritingReview(book, config, result);
        break;
    }
  }

  /**
   * 将书籍分割成多个块
   */
  private splitBookIntoChunks(book: ParsedBook): BookChunk[] {
    const chunks: BookChunk[] = [];
    let currentChunk: BookChunk = {
      chapters: [],
      startIndex: 0,
      endIndex: 0,
      totalChars: 0
    };

    for (let i = 0; i < book.chapters.length; i++) {
      const chapter = book.chapters[i];
      const chapterChars = chapter.content.length;

      // 检查是否需要开始新块
      const wouldExceedChars = currentChunk.totalChars + chapterChars > this.chunkConfig.maxCharsPerChunk;
      const wouldExceedChapters = currentChunk.chapters.length >= this.chunkConfig.maxChaptersPerChunk;

      if (currentChunk.chapters.length > 0 && (wouldExceedChars || wouldExceedChapters)) {
        // 保存当前块，开始新块
        currentChunk.endIndex = i - 1;
        chunks.push(currentChunk);
        currentChunk = {
          chapters: [],
          startIndex: i,
          endIndex: i,
          totalChars: 0
        };
      }

      currentChunk.chapters.push(chapter);
      currentChunk.totalChars += chapterChars;
      currentChunk.endIndex = i;
    }

    // 添加最后一个块
    if (currentChunk.chapters.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * 构建章节内容文本
   */
  private buildChapterContent(chapters: Chapter[]): string {
    return chapters.map(ch => 
      `## ${ch.title}\n\n${ch.content}`
    ).join('\n\n---\n\n');
  }

  /**
   * 发送 LLM 请求
   */
  private async sendLLMRequest(prompt: string, content: string, customPrompts?: Record<string, string>): Promise<string> {
    const systemPrompt = getSystemPrompt(customPrompts);
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `${prompt}\n\n以下是小说内容：\n\n${content}` }
    ];

    return await this.llmService.chat(messages);
  }

  /**
   * 解析 JSON 响应
   */
  private parseJsonResponse<T>(response: string, defaultValue: T): T {
    try {
      // 尝试提取 JSON 部分
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as T;
      }
      return defaultValue;
    } catch {
      console.warn('JSON 解析失败，使用默认值');
      return defaultValue;
    }
  }


  /**
   * 分析故事梗概
   */
  private async analyzeSynopsis(
    book: ParsedBook,
    chunks: BookChunk[],
    config: AnalysisConfig
  ): Promise<string> {
    this.updateProgress('故事梗概', 0, '故事梗概: 正在采样关键章节内容...');
    
    const prompt = getAnalysisPrompt(config.mode, config.novelType, 'synopsis', config.customPrompts, config.customTypePrompts);
    
    // 对于梗概，使用首尾章节 + 中间采样
    const sampledContent = this.sampleBookContent(book, chunks);
    
    this.updateProgress('故事梗概', 0, '故事梗概: 正在等待 AI 响应... ⏳');
    
    const response = await this.sendLLMRequest(prompt, sampledContent, config.customPrompts);
    
    this.updateProgress('故事梗概', 0, '故事梗概: AI 响应完成 ✓');
    
    return response;
  }

  /**
   * 分析人物
   */
  private async analyzeCharacters(
    book: ParsedBook,
    chunks: BookChunk[],
    config: AnalysisConfig
  ): Promise<CharacterAnalysis[]> {
    const prompt = getAnalysisPrompt(config.mode, config.novelType, 'characters', config.customPrompts, config.customTypePrompts);
    
    // 分块分析人物，然后合并
    const allCharacters: CharacterAnalysis[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chapterRange = `章节 ${chunk.startIndex + 1}-${chunk.endIndex + 1}`;
      
      this.updateProgress(
        '人物分析',
        0,
        `人物分析: [${i + 1}/${chunks.length}] 准备分析 ${chapterRange}...`
      );
      
      const content = this.buildChapterContent(chunk.chapters);
      
      this.updateProgress(
        '人物分析',
        0,
        `人物分析: [${i + 1}/${chunks.length}] 正在等待 AI 响应 (${chapterRange})... ⏳`
      );
      
      const response = await this.sendLLMRequest(prompt, content, config.customPrompts);
      
      this.updateProgress(
        '人物分析',
        0,
        `人物分析: [${i + 1}/${chunks.length}] AI 响应完成，正在解析结果...`
      );
      
      const parsed = this.parseJsonResponse<{ characters: CharacterAnalysis[] }>(
        response,
        { characters: [] }
      );
      
      // 合并人物，避免重复
      for (const char of parsed.characters) {
        const existing = allCharacters.find(c => c.name === char.name);
        if (!existing) {
          allCharacters.push(char);
        } else {
          // 合并信息
          if (char.growthArc && !existing.growthArc) {
            existing.growthArc = char.growthArc;
          }
          if (char.relationships) {
            existing.relationships = [
              ...(existing.relationships || []),
              ...char.relationships.filter(r => !existing.relationships?.includes(r))
            ];
          }
        }
      }
      
      this.updateProgress(
        '人物分析',
        0,
        `人物分析: [${i + 1}/${chunks.length}] 完成 ✓ 已发现 ${allCharacters.length} 个人物`
      );
    }

    return allCharacters;
  }

  /**
   * 分析写作技法
   */
  private async analyzeTechniques(
    book: ParsedBook,
    chunks: BookChunk[],
    config: AnalysisConfig
  ): Promise<TechniqueAnalysis[]> {
    const prompt = getAnalysisPrompt(config.mode, config.novelType, 'techniques', config.customPrompts, config.customTypePrompts);
    
    const allTechniques: TechniqueAnalysis[] = [];
    
    // 分析前几块和后几块（开头和高潮部分通常技法最丰富）
    const chunksToAnalyze = this.selectKeyChunks(chunks);
    
    for (let i = 0; i < chunksToAnalyze.length; i++) {
      const chunk = chunksToAnalyze[i];
      
      this.updateProgress(
        '写作技法',
        0,
        `写作技法: [${i + 1}/${chunksToAnalyze.length}] 准备分析关键块...`
      );
      
      const content = this.buildChapterContent(chunk.chapters);
      
      this.updateProgress(
        '写作技法',
        0,
        `写作技法: [${i + 1}/${chunksToAnalyze.length}] 正在等待 AI 响应... ⏳`
      );
      
      const response = await this.sendLLMRequest(prompt, content, config.customPrompts);
      
      this.updateProgress(
        '写作技法',
        0,
        `写作技法: [${i + 1}/${chunksToAnalyze.length}] AI 响应完成，正在解析...`
      );
      
      const parsed = this.parseJsonResponse<{ techniques: TechniqueAnalysis[] }>(
        response,
        { techniques: [] }
      );
      
      // 合并技法，避免重复
      for (const tech of parsed.techniques) {
        const existing = allTechniques.find(t => t.name === tech.name);
        if (!existing) {
          allTechniques.push(tech);
        } else {
          // 合并例子
          existing.examples = [
            ...existing.examples,
            ...tech.examples.filter(e => !existing.examples.includes(e))
          ].slice(0, 5); // 最多保留 5 个例子
        }
      }
      
      this.updateProgress(
        '写作技法',
        0,
        `写作技法: [${i + 1}/${chunksToAnalyze.length}] 完成 ✓ 已发现 ${allTechniques.length} 种技法`
      );
    }

    return allTechniques;
  }

  /**
   * 分析可借鉴清单
   */
  private async analyzeTakeaways(
    book: ParsedBook,
    chunks: BookChunk[],
    config: AnalysisConfig,
    partialResult: AnalysisResult
  ): Promise<string[]> {
    this.updateProgress('可借鉴清单', 0, '可借鉴清单: 正在整合已有分析结果...');
    
    const prompt = getAnalysisPrompt(config.mode, config.novelType, 'takeaways', config.customPrompts, config.customTypePrompts);
    
    // 基于已有分析结果生成可借鉴清单
    const context = `
书籍信息：《${book.metadata.title}》 作者：${book.metadata.author}

已分析的人物：
${partialResult.characters.map(c => `- ${c.name}（${c.role}）：${c.description}`).join('\n')}

已分析的写作技法：
${partialResult.writingTechniques.map(t => `- ${t.name}：${t.description}`).join('\n')}

故事梗概：
${partialResult.synopsis}
`;

    this.updateProgress('可借鉴清单', 0, '可借鉴清单: 正在等待 AI 响应... ⏳');
    
    const response = await this.sendLLMRequest(prompt, context, config.customPrompts);
    
    this.updateProgress('可借鉴清单', 0, '可借鉴清单: AI 响应完成，正在解析...');
    
    const parsed = this.parseJsonResponse<{ takeaways: unknown[] }>(
      response,
      { takeaways: [] }
    );

    // Bug fix: 清洗 takeaways 数据，确保返回字符串数组
    const normalizedTakeaways = this.normalizeTakeaways(parsed.takeaways);

    this.updateProgress('可借鉴清单', 0, `可借鉴清单: 完成 ✓ 已生成 ${normalizedTakeaways.length} 条借鉴要点`);

    return normalizedTakeaways;
  }

  /**
   * 清洗 takeaways 数据，确保返回纯字符串数组
   * 处理 LLM 可能返回的各种格式：
   * - 字符串数组: ["item1", "item2"]
   * - 对象数组: [{ title: "xxx", content: "xxx" }]
   * - 混合数组: ["item1", { title: "xxx" }]
   */
  private normalizeTakeaways(takeaways: unknown[]): string[] {
    if (!Array.isArray(takeaways)) {
      return [];
    }

    return takeaways
      .map((item) => {
        // 如果已经是字符串，直接返回
        if (typeof item === 'string') {
          return item.trim();
        }
        
        // 如果是对象，尝试提取文本内容
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          
          // 尝试常见的字段名
          const textFields = ['title', 'content', 'description', 'text', 'name', 'value', 'point', 'takeaway'];
          
          // 优先使用 title + content 组合
          if (obj.title && obj.content) {
            return `${String(obj.title).trim()}：${String(obj.content).trim()}`;
          }
          
          // 尝试单个字段
          for (const field of textFields) {
            if (obj[field] && typeof obj[field] === 'string') {
              return String(obj[field]).trim();
            }
          }
          
          // 如果有 title 或 name，使用它
          if (obj.title) {
            return String(obj.title).trim();
          }
          if (obj.name) {
            return String(obj.name).trim();
          }
          
          // 最后尝试 JSON 序列化（但过滤掉 [object Object]）
          try {
            const jsonStr = JSON.stringify(item);
            if (jsonStr && jsonStr !== '{}' && !jsonStr.includes('[object Object]')) {
              // 如果是简单对象，提取所有值
              const values = Object.values(obj)
                .filter(v => typeof v === 'string' || typeof v === 'number')
                .map(v => String(v).trim())
                .filter(v => v.length > 0);
              if (values.length > 0) {
                return values.join('：');
              }
            }
          } catch {
            // 忽略序列化错误
          }
        }
        
        // 如果是数字或其他基本类型，转为字符串
        if (item !== null && item !== undefined) {
          const str = String(item).trim();
          if (str && str !== '[object Object]') {
            return str;
          }
        }
        
        return '';
      })
      .filter((item) => item.length > 0); // 过滤空字符串
  }


  /**
   * 分析情绪曲线（标准模式+）
   */
  private async analyzeEmotionCurve(
    book: ParsedBook,
    chunks: BookChunk[],
    config: AnalysisConfig
  ): Promise<EmotionPoint[]> {
    const prompt = getAnalysisPrompt(config.mode, config.novelType, 'emotionCurve', config.customPrompts, config.customTypePrompts);
    
    const allPoints: EmotionPoint[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chapterRange = `章节 ${chunk.startIndex + 1}-${chunk.endIndex + 1}`;
      
      this.updateProgress(
        '情绪曲线',
        0,
        `情绪曲线: [${i + 1}/${chunks.length}] 准备分析 ${chapterRange}...`
      );
      
      const content = this.buildChapterContent(chunk.chapters);
      
      this.updateProgress(
        '情绪曲线',
        0,
        `情绪曲线: [${i + 1}/${chunks.length}] 正在等待 AI 响应 (${chapterRange})... ⏳`
      );
      
      const response = await this.sendLLMRequest(prompt, content, config.customPrompts);
      
      this.updateProgress(
        '情绪曲线',
        0,
        `情绪曲线: [${i + 1}/${chunks.length}] AI 响应完成，正在解析...`
      );
      
      const parsed = this.parseJsonResponse<{ emotionCurve: EmotionPoint[] }>(
        response,
        { emotionCurve: [] }
      );
      
      allPoints.push(...parsed.emotionCurve);
      
      this.updateProgress(
        '情绪曲线',
        0,
        `情绪曲线: [${i + 1}/${chunks.length}] 完成 ✓ 已记录 ${allPoints.length} 个情绪点`
      );
    }

    // 按章节排序
    return allPoints.sort((a, b) => a.chapter - b.chapter);
  }

  /**
   * 分析章节结构（标准模式+）
   */
  private async analyzeChapterStructure(
    book: ParsedBook,
    chunks: BookChunk[],
    config: AnalysisConfig
  ): Promise<ChapterSummary[]> {
    const prompt = getAnalysisPrompt(config.mode, config.novelType, 'chapterStructure', config.customPrompts, config.customTypePrompts);
    
    const allSummaries: ChapterSummary[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chapterRange = `章节 ${chunk.startIndex + 1}-${chunk.endIndex + 1}`;
      
      this.updateProgress(
        '章节结构',
        0,
        `章节结构: [${i + 1}/${chunks.length}] 准备分析 ${chapterRange}...`
      );
      
      const content = this.buildChapterContent(chunk.chapters);
      
      this.updateProgress(
        '章节结构',
        0,
        `章节结构: [${i + 1}/${chunks.length}] 正在等待 AI 响应 (${chapterRange})... ⏳`
      );
      
      const response = await this.sendLLMRequest(prompt, content, config.customPrompts);
      
      this.updateProgress(
        '章节结构',
        0,
        `章节结构: [${i + 1}/${chunks.length}] AI 响应完成，正在解析...`
      );
      
      const parsed = this.parseJsonResponse<{ chapterStructure: ChapterSummary[] }>(
        response,
        { chapterStructure: [] }
      );
      
      allSummaries.push(...parsed.chapterStructure);
      
      this.updateProgress(
        '章节结构',
        0,
        `章节结构: [${i + 1}/${chunks.length}] 完成 ✓ 已分析 ${allSummaries.length} 章`
      );
    }

    // 按章节索引排序
    return allSummaries.sort((a, b) => a.index - b.index);
  }

  /**
   * 分析伏笔（标准模式+）
   */
  private async analyzeForeshadowing(
    book: ParsedBook,
    chunks: BookChunk[],
    config: AnalysisConfig
  ): Promise<Foreshadowing[]> {
    this.updateProgress('伏笔分析', 0, '伏笔分析: 正在采样全书关键章节...');
    
    const prompt = getAnalysisPrompt(config.mode, config.novelType, 'foreshadowing', config.customPrompts, config.customTypePrompts);
    
    // 伏笔分析需要全局视角，使用采样内容
    const sampledContent = this.sampleBookContent(book, chunks);
    
    this.updateProgress('伏笔分析', 0, '伏笔分析: 正在等待 AI 响应... ⏳');
    
    const response = await this.sendLLMRequest(prompt, sampledContent, config.customPrompts);
    
    this.updateProgress('伏笔分析', 0, '伏笔分析: AI 响应完成，正在解析...');
    
    const parsed = this.parseJsonResponse<{ foreshadowing: Foreshadowing[] }>(
      response,
      { foreshadowing: [] }
    );

    this.updateProgress('伏笔分析', 0, `伏笔分析: 完成 ✓ 已识别 ${parsed.foreshadowing.length} 处伏笔`);

    return parsed.foreshadowing;
  }

  /**
   * 逐章拆解（深度模式）
   */
  private async analyzeChapterDetails(
    book: ParsedBook,
    config: AnalysisConfig
  ): Promise<ChapterDetail[]> {
    const prompt = getAnalysisPrompt(config.mode, config.novelType, 'chapterDetail', config.customPrompts, config.customTypePrompts);
    
    const details: ChapterDetail[] = [];
    
    // 深度模式下逐章分析（可能很耗时）
    // 为了控制成本，可以选择性分析关键章节
    const keyChapterIndices = this.selectKeyChapterIndices(book);
    
    this.updateProgress(
      '逐章拆解',
      0,
      `逐章拆解: 将分析 ${keyChapterIndices.length} 个关键章节...`
    );
    
    for (let i = 0; i < keyChapterIndices.length; i++) {
      const index = keyChapterIndices[i];
      const chapter = book.chapters[index];
      
      this.updateProgress(
        '逐章拆解',
        0,
        `逐章拆解: [${i + 1}/${keyChapterIndices.length}] 准备分析第${index + 1}章: ${chapter.title}...`
      );
      
      const content = `## ${chapter.title}\n\n${chapter.content}`;
      
      this.updateProgress(
        '逐章拆解',
        0,
        `逐章拆解: [${i + 1}/${keyChapterIndices.length}] 正在等待 AI 响应 (第${index + 1}章)... ⏳`
      );
      
      const response = await this.sendLLMRequest(prompt, content, config.customPrompts);
      
      this.updateProgress(
        '逐章拆解',
        0,
        `逐章拆解: [${i + 1}/${keyChapterIndices.length}] AI 响应完成，正在解析...`
      );
      
      const parsed = this.parseJsonResponse<{ chapterDetail: ChapterDetail }>(
        response,
        { 
          chapterDetail: {
            index,
            title: chapter.title,
            analysis: response,
            techniques: [],
            highlights: []
          }
        }
      );
      
      details.push(parsed.chapterDetail);
      
      this.updateProgress(
        '逐章拆解',
        0,
        `逐章拆解: [${i + 1}/${keyChapterIndices.length}] 完成 ✓ 第${index + 1}章分析完毕`
      );
    }

    return details;
  }

  /**
   * 写作复盘（深度模式）
   */
  private async analyzeWritingReview(
    book: ParsedBook,
    config: AnalysisConfig,
    partialResult: AnalysisResult
  ): Promise<string> {
    this.updateProgress('写作复盘', 0, '写作复盘: 正在整合全书分析数据...');
    
    const prompt = getAnalysisPrompt(config.mode, config.novelType, 'writingReview', config.customPrompts, config.customTypePrompts);
    
    // 基于已有分析结果进行整体复盘
    const context = `
书籍信息：《${book.metadata.title}》 作者：${book.metadata.author}
总字数：${book.totalWordCount} 字
章节数：${book.chapters.length} 章

故事梗概：
${partialResult.synopsis}

主要人物：
${partialResult.characters.map(c => `- ${c.name}（${c.role}）：${c.description}`).join('\n')}

写作技法：
${partialResult.writingTechniques.map(t => `- ${t.name}：${t.description}`).join('\n')}

情绪曲线概要：
${partialResult.emotionCurve?.slice(0, 10).map(e => `第${e.chapter}章：${e.description}（强度${e.intensity}）`).join('\n') || '无'}

伏笔设计：
${partialResult.foreshadowing?.map(f => `- ${f.description}（${f.status}）`).join('\n') || '无'}
`;

    this.updateProgress('写作复盘', 0, '写作复盘: 正在等待 AI 响应... ⏳');
    
    const response = await this.sendLLMRequest(prompt, context, config.customPrompts);
    
    this.updateProgress('写作复盘', 0, '写作复盘: 完成 ✓ 复盘报告生成完毕');
    
    return response;
  }


  /**
   * 采样书籍内容（用于需要全局视角的分析）
   * 策略：首章 + 尾章 + 中间均匀采样
   */
  private sampleBookContent(book: ParsedBook, chunks: BookChunk[]): string {
    const chapters = book.chapters;
    const sampleIndices: number[] = [];
    
    // 首章
    sampleIndices.push(0);
    
    // 中间采样（每 10 章取 1 章）
    const step = Math.max(1, Math.floor(chapters.length / 10));
    for (let i = step; i < chapters.length - 1; i += step) {
      sampleIndices.push(i);
    }
    
    // 尾章
    if (chapters.length > 1) {
      sampleIndices.push(chapters.length - 1);
    }

    // 去重并排序
    const uniqueIndices = [...new Set(sampleIndices)].sort((a, b) => a - b);
    
    // 构建采样内容
    const sampledChapters = uniqueIndices.map(i => chapters[i]);
    return this.buildChapterContent(sampledChapters);
  }

  /**
   * 选择关键块（用于技法分析等）
   * 策略：首块 + 尾块 + 中间块
   */
  private selectKeyChunks(chunks: BookChunk[]): BookChunk[] {
    if (chunks.length <= 3) {
      return chunks;
    }

    const keyChunks: BookChunk[] = [];
    
    // 首块
    keyChunks.push(chunks[0]);
    
    // 中间块
    const midIndex = Math.floor(chunks.length / 2);
    keyChunks.push(chunks[midIndex]);
    
    // 尾块
    keyChunks.push(chunks[chunks.length - 1]);

    return keyChunks;
  }

  /**
   * 选择关键章节索引（用于深度模式逐章分析）
   * 策略：开头几章 + 高潮章节 + 结尾几章
   */
  private selectKeyChapterIndices(book: ParsedBook): number[] {
    const chapters = book.chapters;
    const indices: number[] = [];
    
    // 开头 3 章
    for (let i = 0; i < Math.min(3, chapters.length); i++) {
      indices.push(i);
    }
    
    // 中间关键章节（每 20 章取 1 章）
    const step = Math.max(1, Math.floor(chapters.length / 5));
    for (let i = step; i < chapters.length - 3; i += step) {
      indices.push(i);
    }
    
    // 结尾 3 章
    for (let i = Math.max(0, chapters.length - 3); i < chapters.length; i++) {
      if (!indices.includes(i)) {
        indices.push(i);
      }
    }

    return [...new Set(indices)].sort((a, b) => a - b);
  }

  /**
   * 获取 prompt 模板（供外部使用）
   */
  getPromptTemplate(mode: AnalysisMode, novelType: NovelType): string {
    const stages = getAnalysisStages(mode);
    const prompts: string[] = [];

    for (const stage of stages) {
      const prompt = getAnalysisPrompt(mode, novelType, stage as keyof typeof BASE_PROMPTS);
      if (prompt) {
        prompts.push(`### ${getStageName(stage)}\n\n${prompt}`);
      }
    }

    return prompts.join('\n\n---\n\n');
  }
}

/**
 * 书籍分块
 */
interface BookChunk {
  chapters: Chapter[];
  startIndex: number;
  endIndex: number;
  totalChars: number;
}

// 导出类型
export type { BookChunk, ChunkConfig };
