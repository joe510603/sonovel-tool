/**
 * MergeService - 分析结果合并服务
 * 
 * 负责新旧分析结果的智能合并，支持人物、技法、情绪曲线、章节结构等的合并。
 * Requirements: 1.2.1.1-1.2.1.5, 1.2.3.4, 1.3.3.3, 1.3.3.4
 */

import {
  AnalysisResult,
  CharacterAnalysis,
  TechniqueAnalysis,
  EmotionPoint,
  ChapterSummary,
  Foreshadowing,
  ChapterDetail,
  AnalysisMode,
  AnalysisRange
} from '../types';

/**
 * 合并选项
 */
export interface MergeOptions {
  /** 合并策略: append - 追加模式, merge - 智能合并模式 */
  strategy: 'append' | 'merge';
  /** 冲突时是否优先使用最新数据 */
  preferLatest: boolean;
}

/**
 * 模式感知合并选项
 * Requirements: 1.3.3.3, 1.3.3.4
 */
export interface ModeAwareMergeOptions extends MergeOptions {
  /** 分析范围列表，用于确定每个章节的分析模式 */
  ranges?: AnalysisRange[];
  /** 是否只包含深度模式的章节详情 */
  deepModeChapterDetailsOnly?: boolean;
}

/**
 * 带模式信息的分析结果
 * Requirements: 1.3.3.1
 */
export interface ModeAnnotatedResult {
  result: AnalysisResult;
  mode: AnalysisMode;
  range: AnalysisRange;
}

/**
 * 默认合并选项
 */
const DEFAULT_MERGE_OPTIONS: MergeOptions = {
  strategy: 'merge',
  preferLatest: true
};

/**
 * 默认模式感知合并选项
 */
const DEFAULT_MODE_AWARE_OPTIONS: ModeAwareMergeOptions = {
  ...DEFAULT_MERGE_OPTIONS,
  deepModeChapterDetailsOnly: true
};

export class MergeService {
  /**
   * 合并人物分析
   * Requirements: 1.2.1.1, 1.2.1.5
   * 
   * 按名称合并人物，更新成长弧线。当同名人物出现在多个范围时，
   * 合并其描述、动机、成长弧线和关系信息。
   * 
   * @param existing 已有的人物分析列表
   * @param newChars 新的人物分析列表
   * @param preferLatest 冲突时是否优先使用最新数据
   * @returns 合并后的人物分析列表
   */
  mergeCharacters(
    existing: CharacterAnalysis[],
    newChars: CharacterAnalysis[],
    preferLatest: boolean = true
  ): CharacterAnalysis[] {
    // 创建一个 Map 用于按名称索引人物
    const characterMap = new Map<string, CharacterAnalysis>();

    // 先添加已有人物
    for (const char of existing) {
      characterMap.set(char.name, { ...char });
    }

    // 合并新人物
    for (const newChar of newChars) {
      const existingChar = characterMap.get(newChar.name);

      if (!existingChar) {
        // 新人物，直接添加
        characterMap.set(newChar.name, { ...newChar });
      } else {
        // 同名人物，合并信息
        const merged = this.mergeCharacter(existingChar, newChar, preferLatest);
        characterMap.set(newChar.name, merged);
      }
    }

    // 转换回数组
    return Array.from(characterMap.values());
  }

  /**
   * 合并单个人物的信息
   * Requirements: 1.2.1.5
   * 
   * @param existing 已有人物信息
   * @param newChar 新人物信息
   * @param preferLatest 冲突时是否优先使用最新数据
   * @returns 合并后的人物信息
   */
  private mergeCharacter(
    existing: CharacterAnalysis,
    newChar: CharacterAnalysis,
    preferLatest: boolean
  ): CharacterAnalysis {
    // 基础字段：冲突时根据 preferLatest 决定使用哪个
    const merged: CharacterAnalysis = {
      name: existing.name,
      role: preferLatest ? newChar.role : existing.role,
      description: preferLatest ? newChar.description : existing.description,
      motivation: preferLatest ? newChar.motivation : existing.motivation
    };

    // 成长弧线：合并两者的成长弧线描述
    if (existing.growthArc || newChar.growthArc) {
      if (existing.growthArc && newChar.growthArc) {
        // 两者都有成长弧线，合并描述
        merged.growthArc = preferLatest
          ? `${existing.growthArc}\n\n【后续发展】\n${newChar.growthArc}`
          : `${newChar.growthArc}\n\n【前期发展】\n${existing.growthArc}`;
      } else {
        merged.growthArc = existing.growthArc || newChar.growthArc;
      }
    }

    // 关系：合并并去重
    if (existing.relationships || newChar.relationships) {
      const allRelationships = [
        ...(existing.relationships || []),
        ...(newChar.relationships || [])
      ];
      // 去重
      merged.relationships = [...new Set(allRelationships)];
    }

    return merged;
  }


  /**
   * 合并写作技法
   * Requirements: 1.2.1.2
   * 
   * 去重并合并示例。同名技法合并时，保留描述和适用性，
   * 并合并所有示例（去重）。
   * 
   * @param existing 已有的技法分析列表
   * @param newTechs 新的技法分析列表
   * @param preferLatest 冲突时是否优先使用最新数据
   * @returns 合并后的技法分析列表
   */
  mergeTechniques(
    existing: TechniqueAnalysis[],
    newTechs: TechniqueAnalysis[],
    preferLatest: boolean = true
  ): TechniqueAnalysis[] {
    // 创建一个 Map 用于按名称索引技法
    const techniqueMap = new Map<string, TechniqueAnalysis>();

    // 先添加已有技法
    for (const tech of existing) {
      techniqueMap.set(tech.name, { ...tech, examples: [...tech.examples] });
    }

    // 合并新技法
    for (const newTech of newTechs) {
      const existingTech = techniqueMap.get(newTech.name);

      if (!existingTech) {
        // 新技法，直接添加
        techniqueMap.set(newTech.name, { ...newTech, examples: [...newTech.examples] });
      } else {
        // 同名技法，合并信息
        const merged = this.mergeTechnique(existingTech, newTech, preferLatest);
        techniqueMap.set(newTech.name, merged);
      }
    }

    // 转换回数组
    return Array.from(techniqueMap.values());
  }

  /**
   * 合并单个技法的信息
   * 
   * @param existing 已有技法信息
   * @param newTech 新技法信息
   * @param preferLatest 冲突时是否优先使用最新数据
   * @returns 合并后的技法信息
   */
  private mergeTechnique(
    existing: TechniqueAnalysis,
    newTech: TechniqueAnalysis,
    preferLatest: boolean
  ): TechniqueAnalysis {
    // 合并示例并去重
    const allExamples = [...existing.examples, ...newTech.examples];
    const uniqueExamples = [...new Set(allExamples)];

    return {
      name: existing.name,
      description: preferLatest ? newTech.description : existing.description,
      examples: uniqueExamples,
      applicability: preferLatest ? newTech.applicability : existing.applicability
    };
  }


  /**
   * 合并情绪曲线
   * Requirements: 1.2.1.3
   * 
   * 按章节排序。合并两个情绪曲线时，按章节号排序，
   * 同一章节的情绪点保留最新的。
   * 
   * @param existing 已有的情绪曲线点
   * @param newPoints 新的情绪曲线点
   * @param preferLatest 冲突时是否优先使用最新数据
   * @returns 合并后的情绪曲线点（按章节排序）
   */
  mergeEmotionCurve(
    existing: EmotionPoint[],
    newPoints: EmotionPoint[],
    preferLatest: boolean = true
  ): EmotionPoint[] {
    // 创建一个 Map 用于按章节索引情绪点
    const emotionMap = new Map<number, EmotionPoint>();

    // 先添加已有情绪点
    for (const point of existing) {
      emotionMap.set(point.chapter, { ...point });
    }

    // 合并新情绪点
    for (const newPoint of newPoints) {
      const existingPoint = emotionMap.get(newPoint.chapter);

      if (!existingPoint) {
        // 新章节的情绪点，直接添加
        emotionMap.set(newPoint.chapter, { ...newPoint });
      } else if (preferLatest) {
        // 同一章节，优先使用最新数据
        emotionMap.set(newPoint.chapter, { ...newPoint });
      }
      // 如果不优先使用最新数据，保留已有的
    }

    // 转换回数组并按章节排序
    return Array.from(emotionMap.values()).sort((a, b) => a.chapter - b.chapter);
  }


  /**
   * 合并章节结构
   * Requirements: 1.2.1.4
   * 
   * 去重并保持顺序。按章节索引合并，同一章节保留最新的摘要。
   * 
   * @param existing 已有的章节摘要列表
   * @param newSummaries 新的章节摘要列表
   * @param preferLatest 冲突时是否优先使用最新数据
   * @returns 合并后的章节摘要列表（按章节索引排序，无重复）
   */
  mergeChapterStructure(
    existing: ChapterSummary[],
    newSummaries: ChapterSummary[],
    preferLatest: boolean = true
  ): ChapterSummary[] {
    // 创建一个 Map 用于按章节索引
    const chapterMap = new Map<number, ChapterSummary>();

    // 先添加已有章节摘要
    for (const summary of existing) {
      chapterMap.set(summary.index, { ...summary, keyEvents: [...summary.keyEvents] });
    }

    // 合并新章节摘要
    for (const newSummary of newSummaries) {
      const existingSummary = chapterMap.get(newSummary.index);

      if (!existingSummary) {
        // 新章节，直接添加
        chapterMap.set(newSummary.index, { ...newSummary, keyEvents: [...newSummary.keyEvents] });
      } else if (preferLatest) {
        // 同一章节，优先使用最新数据
        chapterMap.set(newSummary.index, { ...newSummary, keyEvents: [...newSummary.keyEvents] });
      }
      // 如果不优先使用最新数据，保留已有的
    }

    // 转换回数组并按章节索引排序
    return Array.from(chapterMap.values()).sort((a, b) => a.index - b.index);
  }


  /**
   * 合并伏笔分析
   * 
   * 按描述去重，合并伏笔状态（优先使用已解决的状态）。
   * 
   * @param existing 已有的伏笔列表
   * @param newForeshadowing 新的伏笔列表
   * @param preferLatest 冲突时是否优先使用最新数据
   * @returns 合并后的伏笔列表
   */
  mergeForeshadowing(
    existing: Foreshadowing[],
    newForeshadowing: Foreshadowing[],
    preferLatest: boolean = true
  ): Foreshadowing[] {
    // 创建一个 Map 用于按描述索引伏笔
    const foreshadowingMap = new Map<string, Foreshadowing>();

    // 先添加已有伏笔
    for (const fs of existing) {
      foreshadowingMap.set(fs.description, { ...fs });
    }

    // 合并新伏笔
    for (const newFs of newForeshadowing) {
      const existingFs = foreshadowingMap.get(newFs.description);

      if (!existingFs) {
        // 新伏笔，直接添加
        foreshadowingMap.set(newFs.description, { ...newFs });
      } else {
        // 同一伏笔，合并状态
        const merged = this.mergeSingleForeshadowing(existingFs, newFs, preferLatest);
        foreshadowingMap.set(newFs.description, merged);
      }
    }

    // 转换回数组并按设置章节排序
    return Array.from(foreshadowingMap.values()).sort((a, b) => a.setupChapter - b.setupChapter);
  }

  /**
   * 合并单个伏笔的信息
   */
  private mergeSingleForeshadowing(
    existing: Foreshadowing,
    newFs: Foreshadowing,
    preferLatest: boolean
  ): Foreshadowing {
    // 状态优先级：resolved > planted > abandoned
    const statusPriority: Record<Foreshadowing['status'], number> = {
      resolved: 3,
      planted: 2,
      abandoned: 1
    };

    // 选择优先级更高的状态，或者根据 preferLatest 决定
    let finalStatus: Foreshadowing['status'];
    if (statusPriority[newFs.status] > statusPriority[existing.status]) {
      finalStatus = newFs.status;
    } else if (statusPriority[newFs.status] < statusPriority[existing.status]) {
      finalStatus = existing.status;
    } else {
      finalStatus = preferLatest ? newFs.status : existing.status;
    }

    return {
      setupChapter: existing.setupChapter,
      payoffChapter: newFs.payoffChapter || existing.payoffChapter,
      description: existing.description,
      status: finalStatus
    };
  }

  /**
   * 合并章节详情
   * 
   * 按章节索引去重，保留最新的详情。
   * 
   * @param existing 已有的章节详情列表
   * @param newDetails 新的章节详情列表
   * @param preferLatest 冲突时是否优先使用最新数据
   * @returns 合并后的章节详情列表
   */
  mergeChapterDetails(
    existing: ChapterDetail[],
    newDetails: ChapterDetail[],
    preferLatest: boolean = true
  ): ChapterDetail[] {
    // 创建一个 Map 用于按章节索引
    const detailMap = new Map<number, ChapterDetail>();

    // 先添加已有章节详情
    for (const detail of existing) {
      detailMap.set(detail.index, {
        ...detail,
        techniques: [...detail.techniques],
        highlights: [...detail.highlights]
      });
    }

    // 合并新章节详情
    for (const newDetail of newDetails) {
      const existingDetail = detailMap.get(newDetail.index);

      if (!existingDetail) {
        // 新章节详情，直接添加
        detailMap.set(newDetail.index, {
          ...newDetail,
          techniques: [...newDetail.techniques],
          highlights: [...newDetail.highlights]
        });
      } else if (preferLatest) {
        // 同一章节，优先使用最新数据
        detailMap.set(newDetail.index, {
          ...newDetail,
          techniques: [...newDetail.techniques],
          highlights: [...newDetail.highlights]
        });
      }
    }

    // 转换回数组并按章节索引排序
    return Array.from(detailMap.values()).sort((a, b) => a.index - b.index);
  }

  /**
   * 合并完整分析结果
   * Requirements: 1.2.1.1-1.2.1.5, 1.2.3.4
   * 
   * 整合所有合并逻辑，将两个分析结果合并为一个。
   * 
   * @param existing 已有的分析结果
   * @param newResult 新的分析结果
   * @param options 合并选项
   * @returns 合并后的分析结果
   */
  mergeResults(
    existing: AnalysisResult,
    newResult: AnalysisResult,
    options: MergeOptions = DEFAULT_MERGE_OPTIONS
  ): AnalysisResult {
    const { preferLatest } = options;

    // 合并基础信息
    const merged: AnalysisResult = {
      // 书籍信息保持不变
      bookInfo: existing.bookInfo,

      // 梗概：合并两者的梗概
      synopsis: this.mergeSynopsis(existing.synopsis, newResult.synopsis, preferLatest),

      // 人物：按名称合并
      characters: this.mergeCharacters(existing.characters, newResult.characters, preferLatest),

      // 写作技法：去重并合并示例
      writingTechniques: this.mergeTechniques(
        existing.writingTechniques,
        newResult.writingTechniques,
        preferLatest
      ),

      // 可借鉴清单：合并并去重
      takeaways: this.mergeTakeaways(existing.takeaways, newResult.takeaways)
    };

    // 合并可选字段

    // 情绪曲线
    if (existing.emotionCurve || newResult.emotionCurve) {
      merged.emotionCurve = this.mergeEmotionCurve(
        existing.emotionCurve || [],
        newResult.emotionCurve || [],
        preferLatest
      );
    }

    // 章节结构
    if (existing.chapterStructure || newResult.chapterStructure) {
      merged.chapterStructure = this.mergeChapterStructure(
        existing.chapterStructure || [],
        newResult.chapterStructure || [],
        preferLatest
      );
    }

    // 伏笔
    if (existing.foreshadowing || newResult.foreshadowing) {
      merged.foreshadowing = this.mergeForeshadowing(
        existing.foreshadowing || [],
        newResult.foreshadowing || [],
        preferLatest
      );
    }

    // 章节详情
    if (existing.chapterDetails || newResult.chapterDetails) {
      merged.chapterDetails = this.mergeChapterDetails(
        existing.chapterDetails || [],
        newResult.chapterDetails || [],
        preferLatest
      );
    }

    // 写作复盘
    if (existing.writingReview || newResult.writingReview) {
      merged.writingReview = this.mergeWritingReview(
        existing.writingReview,
        newResult.writingReview,
        preferLatest
      );
    }

    return merged;
  }

  /**
   * 合并梗概
   * 
   * @param existing 已有梗概
   * @param newSynopsis 新梗概
   * @param preferLatest 冲突时是否优先使用最新数据
   * @returns 合并后的梗概
   */
  private mergeSynopsis(
    existing: string,
    newSynopsis: string,
    preferLatest: boolean
  ): string {
    if (!existing) return newSynopsis;
    if (!newSynopsis) return existing;

    // 如果两者都有内容，合并它们
    if (preferLatest) {
      return `${existing}\n\n【后续剧情】\n${newSynopsis}`;
    } else {
      return `${newSynopsis}\n\n【前期剧情】\n${existing}`;
    }
  }

  /**
   * 合并可借鉴清单
   * 
   * @param existing 已有清单
   * @param newTakeaways 新清单
   * @returns 合并后的清单（去重）
   */
  private mergeTakeaways(existing: string[], newTakeaways: string[]): string[] {
    const allTakeaways = [...existing, ...newTakeaways];
    // 去重
    return [...new Set(allTakeaways)];
  }

  /**
   * 合并写作复盘
   * 
   * @param existing 已有复盘
   * @param newReview 新复盘
   * @param preferLatest 冲突时是否优先使用最新数据
   * @returns 合并后的复盘
   */
  private mergeWritingReview(
    existing: string | undefined,
    newReview: string | undefined,
    preferLatest: boolean
  ): string {
    if (!existing) return newReview || '';
    if (!newReview) return existing;

    // 如果两者都有内容，合并它们
    if (preferLatest) {
      return `${existing}\n\n【后续分析补充】\n${newReview}`;
    } else {
      return `${newReview}\n\n【前期分析】\n${existing}`;
    }
  }

  /**
   * 模式感知的结果合并
   * Requirements: 1.3.3.3, 1.3.3.4
   * 
   * 合并来自不同分析模式的结果，保留模式特定数据。
   * 深度模式的章节详情会被选择性包含。
   * 
   * @param existing 已有的分析结果
   * @param newResult 新的分析结果
   * @param existingMode 已有结果的分析模式
   * @param newMode 新结果的分析模式
   * @param options 模式感知合并选项
   * @returns 合并后的分析结果
   */
  mergeResultsWithModeAwareness(
    existing: AnalysisResult,
    newResult: AnalysisResult,
    existingMode: AnalysisMode,
    newMode: AnalysisMode,
    options: ModeAwareMergeOptions = DEFAULT_MODE_AWARE_OPTIONS
  ): AnalysisResult {
    const { preferLatest, deepModeChapterDetailsOnly } = options;

    // 首先使用基础合并逻辑
    const merged = this.mergeResults(existing, newResult, { 
      strategy: options.strategy, 
      preferLatest 
    });

    // Requirements: 1.3.3.4 - 深度模式章节详情选择性包含
    if (deepModeChapterDetailsOnly && merged.chapterDetails) {
      merged.chapterDetails = this.filterChapterDetailsByMode(
        existing.chapterDetails || [],
        newResult.chapterDetails || [],
        existingMode,
        newMode
      );
    }

    // Requirements: 1.3.3.3 - 保留模式特定数据
    // 深度模式特有的写作复盘
    if (existingMode === 'deep' || newMode === 'deep') {
      // 写作复盘只在深度模式下生成，保留深度模式的复盘
      if (existingMode === 'deep' && newMode !== 'deep') {
        merged.writingReview = existing.writingReview;
      } else if (newMode === 'deep' && existingMode !== 'deep') {
        merged.writingReview = newResult.writingReview;
      }
      // 如果两者都是深度模式，使用已合并的复盘
    }

    // 标准/深度模式特有的情绪曲线、章节结构、伏笔
    // 这些数据只在标准和深度模式下生成
    if (existingMode === 'quick' && newMode !== 'quick') {
      // 已有结果是快速模式，使用新结果的标准/深度模式数据
      merged.emotionCurve = newResult.emotionCurve;
      merged.chapterStructure = newResult.chapterStructure;
      merged.foreshadowing = newResult.foreshadowing;
    } else if (newMode === 'quick' && existingMode !== 'quick') {
      // 新结果是快速模式，保留已有的标准/深度模式数据
      merged.emotionCurve = existing.emotionCurve;
      merged.chapterStructure = existing.chapterStructure;
      merged.foreshadowing = existing.foreshadowing;
    }

    return merged;
  }

  /**
   * 根据分析模式过滤章节详情
   * Requirements: 1.3.3.4
   * 
   * 只保留深度模式分析的章节详情。
   * 
   * @param existingDetails 已有的章节详情
   * @param newDetails 新的章节详情
   * @param existingMode 已有结果的分析模式
   * @param newMode 新结果的分析模式
   * @returns 过滤后的章节详情列表
   */
  private filterChapterDetailsByMode(
    existingDetails: ChapterDetail[],
    newDetails: ChapterDetail[],
    existingMode: AnalysisMode,
    newMode: AnalysisMode
  ): ChapterDetail[] {
    const detailMap = new Map<number, ChapterDetail>();

    // 只添加深度模式的章节详情
    if (existingMode === 'deep') {
      for (const detail of existingDetails) {
        detailMap.set(detail.index, {
          ...detail,
          techniques: [...detail.techniques],
          highlights: [...detail.highlights]
        });
      }
    }

    if (newMode === 'deep') {
      for (const detail of newDetails) {
        // 深度模式的新详情覆盖已有的
        detailMap.set(detail.index, {
          ...detail,
          techniques: [...detail.techniques],
          highlights: [...detail.highlights]
        });
      }
    }

    return Array.from(detailMap.values()).sort((a, b) => a.index - b.index);
  }

  /**
   * 合并多个带模式标注的分析结果
   * Requirements: 1.3.3.1, 1.3.3.3, 1.3.3.4
   * 
   * 将多个不同模式的分析结果合并为一个统一的结果。
   * 
   * @param annotatedResults 带模式标注的分析结果列表
   * @param options 模式感知合并选项
   * @returns 合并后的分析结果
   */
  mergeMultipleModeResults(
    annotatedResults: ModeAnnotatedResult[],
    options: ModeAwareMergeOptions = DEFAULT_MODE_AWARE_OPTIONS
  ): AnalysisResult {
    if (annotatedResults.length === 0) {
      throw new Error('No results to merge');
    }

    if (annotatedResults.length === 1) {
      return annotatedResults[0].result;
    }

    // 按范围的起始章节排序
    const sortedResults = [...annotatedResults].sort(
      (a, b) => a.range.startChapter - b.range.startChapter
    );

    // 从第一个结果开始，依次合并
    let merged = sortedResults[0].result;
    let currentMode = sortedResults[0].mode;

    for (let i = 1; i < sortedResults.length; i++) {
      const { result, mode } = sortedResults[i];
      merged = this.mergeResultsWithModeAwareness(
        merged,
        result,
        currentMode,
        mode,
        options
      );
      // 更新当前模式为最新的模式（用于下一次合并）
      currentMode = mode;
    }

    return merged;
  }

  /**
   * 获取指定章节的分析模式
   * Requirements: 1.3.3.1
   * 
   * @param chapterIndex 章节索引（1-based）
   * @param ranges 分析范围列表
   * @returns 该章节的分析模式，如果未找到则返回 null
   */
  getModeForChapter(chapterIndex: number, ranges: AnalysisRange[]): AnalysisMode | null {
    for (const range of ranges) {
      if (chapterIndex >= range.startChapter && chapterIndex <= range.endChapter) {
        return range.mode;
      }
    }
    return null;
  }

  /**
   * 检查是否存在混合模式
   * Requirements: 1.3.3.1
   * 
   * @param ranges 分析范围列表
   * @returns 是否存在不同模式的分析范围
   */
  hasMixedModes(ranges: AnalysisRange[]): boolean {
    if (ranges.length <= 1) {
      return false;
    }
    const modes = new Set(ranges.map(r => r.mode));
    return modes.size > 1;
  }

  /**
   * 获取所有深度模式分析的章节索引
   * Requirements: 1.3.3.4
   * 
   * @param ranges 分析范围列表
   * @returns 深度模式分析的章节索引数组
   */
  getDeepModeChapters(ranges: AnalysisRange[]): number[] {
    const deepChapters: number[] = [];
    for (const range of ranges) {
      if (range.mode === 'deep') {
        for (let i = range.startChapter; i <= range.endChapter; i++) {
          deepChapters.push(i);
        }
      }
    }
    return deepChapters;
  }

  /**
   * 根据范围过滤章节详情
   * Requirements: 1.3.3.4
   * 
   * 只保留指定范围内的章节详情。
   * 
   * @param details 章节详情列表
   * @param ranges 分析范围列表
   * @param deepModeOnly 是否只保留深度模式的章节详情
   * @returns 过滤后的章节详情列表
   */
  filterChapterDetailsByRanges(
    details: ChapterDetail[],
    ranges: AnalysisRange[],
    deepModeOnly: boolean = true
  ): ChapterDetail[] {
    if (!deepModeOnly) {
      return details;
    }

    const deepChapters = new Set(this.getDeepModeChapters(ranges));
    
    return details.filter(detail => {
      // 章节索引是 0-based，范围是 1-based
      const chapterNumber = detail.index + 1;
      return deepChapters.has(chapterNumber);
    });
  }
}
