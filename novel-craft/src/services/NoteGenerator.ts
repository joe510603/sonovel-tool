/**
 * NoteGenerator - 笔记生成器
 * 
 * 生成结构化的分析笔记，支持多种笔记类型和深度模式下的章节笔记。
 * 需求: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import {
  ParsedBook,
  AnalysisResult,
  AnalysisMode,
  CharacterAnalysis,
  TechniqueAnalysis,
  EmotionPoint,
  Foreshadowing,
  AnalysisRange
} from '../types';

/**
 * 笔记生成配置
 */
export interface NoteGeneratorConfig {
  /** 分析模式 */
  mode: AnalysisMode;
  /** 是否包含封面图片 */
  includeCover?: boolean;
  /** 日期格式 */
  dateFormat?: string;
}

/**
 * 笔记生成器类
 */
export class NoteGenerator {
  private config: NoteGeneratorConfig;

  constructor(config: NoteGeneratorConfig) {
    this.config = {
      includeCover: true,
      dateFormat: 'YYYY-MM-DD',
      ...config
    };
  }

  /**
   * 生成书籍概览笔记
   * 包含书籍信息和故事梗概
   * 需求: 8.2
   */
  generateOverviewNote(book: ParsedBook, analysis: AnalysisResult): string {
    const { metadata } = book;
    const lines: string[] = [];

    // 标题
    lines.push(`# 《${metadata.title}》概览`);
    lines.push('');

    // 书籍信息
    lines.push('## 书籍信息');
    lines.push('');
    lines.push(`- **书名**: ${metadata.title}`);
    lines.push(`- **作者**: ${metadata.author}`);
    lines.push(`- **总字数**: ${this.formatWordCount(book.totalWordCount)}`);
    lines.push(`- **章节数**: ${book.chapters.length} 章`);
    if (metadata.description) {
      lines.push(`- **简介**: ${metadata.description}`);
    }
    lines.push(`- **分析日期**: ${this.getCurrentDate()}`);
    lines.push('');

    // 故事梗概
    lines.push('## 故事梗概');
    lines.push('');
    lines.push(analysis.synopsis || '暂无梗概');
    lines.push('');

    // 可借鉴清单（快速预览）
    if (analysis.takeaways && analysis.takeaways.length > 0) {
      lines.push('## 可借鉴清单');
      lines.push('');
      for (const takeaway of analysis.takeaways) {
        lines.push(`- ${takeaway}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }


  /**
   * 生成人物图谱笔记
   * 包含人物关系、动机和成长弧线
   * 需求: 8.3
   */
  generateCharacterNote(analysis: AnalysisResult): string {
    const lines: string[] = [];

    // 标题
    lines.push(`# 《${analysis.bookInfo.title}》人物图谱`);
    lines.push('');

    if (!analysis.characters || analysis.characters.length === 0) {
      lines.push('暂无人物分析数据。');
      return lines.join('\n');
    }

    // 按角色类型分组
    const protagonists = analysis.characters.filter(c => c.role === 'protagonist');
    const antagonists = analysis.characters.filter(c => c.role === 'antagonist');
    const supporting = analysis.characters.filter(c => c.role === 'supporting');

    // 主角
    if (protagonists.length > 0) {
      lines.push('## 主角');
      lines.push('');
      for (const char of protagonists) {
        lines.push(...this.formatCharacter(char));
      }
    }

    // 反派
    if (antagonists.length > 0) {
      lines.push('## 反派/对手');
      lines.push('');
      for (const char of antagonists) {
        lines.push(...this.formatCharacter(char));
      }
    }

    // 配角
    if (supporting.length > 0) {
      lines.push('## 配角');
      lines.push('');
      for (const char of supporting) {
        lines.push(...this.formatCharacter(char));
      }
    }

    // 人物关系网络（如果有关系数据）
    const hasRelationships = analysis.characters.some(c => c.relationships && c.relationships.length > 0);
    if (hasRelationships) {
      lines.push('## 人物关系');
      lines.push('');
      for (const char of analysis.characters) {
        if (char.relationships && char.relationships.length > 0) {
          lines.push(`### ${char.name}`);
          lines.push('');
          for (const rel of char.relationships) {
            lines.push(`- ${rel}`);
          }
          lines.push('');
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * 格式化单个人物信息
   */
  private formatCharacter(char: CharacterAnalysis): string[] {
    const lines: string[] = [];
    
    lines.push(`### ${char.name}`);
    lines.push('');
    lines.push(`**描述**: ${char.description}`);
    lines.push('');
    lines.push(`**动机**: ${char.motivation}`);
    lines.push('');
    
    if (char.growthArc) {
      lines.push(`**成长弧线**: ${char.growthArc}`);
      lines.push('');
    }
    
    return lines;
  }

  /**
   * 生成情节分析笔记
   * 包含故事结构、情绪曲线和高潮点
   * 需求: 8.4
   */
  generatePlotNote(analysis: AnalysisResult): string {
    const lines: string[] = [];

    // 标题
    lines.push(`# 《${analysis.bookInfo.title}》情节分析`);
    lines.push('');

    // 章节结构
    if (analysis.chapterStructure && analysis.chapterStructure.length > 0) {
      lines.push('## 章节结构');
      lines.push('');
      for (const chapter of analysis.chapterStructure) {
        lines.push(`### 第${chapter.index + 1}章: ${chapter.title}`);
        lines.push('');
        lines.push(`**概要**: ${chapter.summary}`);
        lines.push('');
        if (chapter.keyEvents && chapter.keyEvents.length > 0) {
          lines.push('**关键事件**:');
          for (const event of chapter.keyEvents) {
            lines.push(`- ${event}`);
          }
          lines.push('');
        }
      }
    }

    // 情绪曲线
    if (analysis.emotionCurve && analysis.emotionCurve.length > 0) {
      lines.push('## 情绪曲线');
      lines.push('');
      lines.push(this.generateEmotionCurveTable(analysis.emotionCurve));
      lines.push('');
      
      // 高潮点标注
      const climaxPoints = analysis.emotionCurve.filter(p => p.intensity >= 8);
      if (climaxPoints.length > 0) {
        lines.push('### 高潮点');
        lines.push('');
        for (const point of climaxPoints) {
          lines.push(`- **第${point.chapter}章** (强度: ${point.intensity}/10): ${point.description}`);
        }
        lines.push('');
      }
    }

    // 伏笔分析
    if (analysis.foreshadowing && analysis.foreshadowing.length > 0) {
      lines.push('## 伏笔设计');
      lines.push('');
      lines.push(this.generateForeshadowingSection(analysis.foreshadowing));
    }

    // 如果没有任何数据
    if (!analysis.chapterStructure?.length && !analysis.emotionCurve?.length && !analysis.foreshadowing?.length) {
      lines.push('暂无情节分析数据。请使用标准或深度模式进行分析以获取更详细的情节信息。');
    }

    return lines.join('\n');
  }


  /**
   * 生成情绪曲线表格
   */
  private generateEmotionCurveTable(emotionCurve: EmotionPoint[]): string {
    const lines: string[] = [];
    
    lines.push('| 章节 | 强度 | 描述 |');
    lines.push('|------|------|------|');
    
    for (const point of emotionCurve) {
      const intensityBar = '█'.repeat(point.intensity) + '░'.repeat(10 - point.intensity);
      lines.push(`| 第${point.chapter}章 | ${intensityBar} ${point.intensity}/10 | ${point.description} |`);
    }
    
    return lines.join('\n');
  }

  /**
   * 生成伏笔分析部分
   */
  private generateForeshadowingSection(foreshadowing: Foreshadowing[]): string {
    const lines: string[] = [];
    
    // 按状态分组
    const planted = foreshadowing.filter(f => f.status === 'planted');
    const resolved = foreshadowing.filter(f => f.status === 'resolved');
    const abandoned = foreshadowing.filter(f => f.status === 'abandoned');

    if (resolved.length > 0) {
      lines.push('### 已回收的伏笔');
      lines.push('');
      for (const f of resolved) {
        lines.push(`- **第${f.setupChapter}章 → 第${f.payoffChapter || '?'}章**: ${f.description}`);
      }
      lines.push('');
    }

    if (planted.length > 0) {
      lines.push('### 待回收的伏笔');
      lines.push('');
      for (const f of planted) {
        lines.push(`- **第${f.setupChapter}章埋下**: ${f.description}`);
      }
      lines.push('');
    }

    if (abandoned.length > 0) {
      lines.push('### 未回收的伏笔');
      lines.push('');
      for (const f of abandoned) {
        lines.push(`- **第${f.setupChapter}章**: ${f.description}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 生成写作技法笔记
   * 包含伏笔、节奏和爽点设计分析
   * 需求: 8.5
   */
  generateTechniqueNote(analysis: AnalysisResult): string {
    const lines: string[] = [];

    // 标题
    lines.push(`# 《${analysis.bookInfo.title}》写作技法`);
    lines.push('');

    // 写作技法分析
    if (analysis.writingTechniques && analysis.writingTechniques.length > 0) {
      lines.push('## 写作技法');
      lines.push('');
      for (const tech of analysis.writingTechniques) {
        lines.push(`### ${tech.name}`);
        lines.push('');
        lines.push(`**描述**: ${tech.description}`);
        lines.push('');
        
        if (tech.examples && tech.examples.length > 0) {
          lines.push('**示例**:');
          for (const example of tech.examples) {
            lines.push(`> ${example}`);
            lines.push('');
          }
        }
        
        lines.push(`**适用性**: ${tech.applicability}`);
        lines.push('');
      }
    }

    // 可借鉴清单
    if (analysis.takeaways && analysis.takeaways.length > 0) {
      lines.push('## 可借鉴清单');
      lines.push('');
      for (let i = 0; i < analysis.takeaways.length; i++) {
        lines.push(`${i + 1}. ${analysis.takeaways[i]}`);
      }
      lines.push('');
    }

    // 写作复盘（深度模式）
    if (analysis.writingReview) {
      lines.push('## 写作复盘');
      lines.push('');
      lines.push(analysis.writingReview);
      lines.push('');
    }

    // 如果没有任何数据
    if (!analysis.writingTechniques?.length && !analysis.takeaways?.length && !analysis.writingReview) {
      lines.push('暂无写作技法分析数据。');
    }

    return lines.join('\n');
  }

  /**
   * 生成章节笔记（深度模式）
   * 返回章节索引到笔记内容的映射
   */
  generateChapterNotes(analysis: AnalysisResult): Map<number, string> {
    const notesMap = new Map<number, string>();

    if (!analysis.chapterDetails || analysis.chapterDetails.length === 0) {
      return notesMap;
    }

    for (const detail of analysis.chapterDetails) {
      const lines: string[] = [];
      
      lines.push(`# 第${detail.index + 1}章: ${detail.title}`);
      lines.push('');
      
      // 章节分析
      lines.push('## 章节分析');
      lines.push('');
      lines.push(detail.analysis);
      lines.push('');
      
      // 使用的技法
      if (detail.techniques && detail.techniques.length > 0) {
        lines.push('## 使用的技法');
        lines.push('');
        for (const tech of detail.techniques) {
          lines.push(`- ${tech}`);
        }
        lines.push('');
      }
      
      // 亮点
      if (detail.highlights && detail.highlights.length > 0) {
        lines.push('## 亮点');
        lines.push('');
        for (const highlight of detail.highlights) {
          lines.push(`- ${highlight}`);
        }
        lines.push('');
      }

      notesMap.set(detail.index, lines.join('\n'));
    }

    return notesMap;
  }


  /**
   * 生成完整的分析笔记文件夹
   * 返回生成的文件路径列表
   * 需求: 8.1, 8.6
   * 
   * @param book 已解析的书籍
   * @param analysis 分析结果
   * @param outputPath 输出路径（书籍文件夹的父目录）
   * @param createFile 文件创建函数（由调用方提供，用于与 Obsidian Vault 交互）
   * @returns 生成的文件路径列表
   */
  async generateNotes(
    book: ParsedBook,
    analysis: AnalysisResult,
    outputPath: string,
    createFile: (path: string, content: string) => Promise<void>
  ): Promise<string[]> {
    const generatedFiles: string[] = [];
    const bookFolderName = this.sanitizeFileName(book.metadata.title);
    const bookFolderPath = `${outputPath}/${bookFolderName}`;

    // 1. 生成概览笔记
    const overviewPath = `${bookFolderPath}/00-概览.md`;
    const overviewContent = this.generateOverviewNote(book, analysis);
    await createFile(overviewPath, overviewContent);
    generatedFiles.push(overviewPath);

    // 2. 生成人物图谱笔记
    const characterPath = `${bookFolderPath}/01-人物图谱.md`;
    const characterContent = this.generateCharacterNote(analysis);
    await createFile(characterPath, characterContent);
    generatedFiles.push(characterPath);

    // 3. 生成情节分析笔记
    const plotPath = `${bookFolderPath}/02-情节分析.md`;
    const plotContent = this.generatePlotNote(analysis);
    await createFile(plotPath, plotContent);
    generatedFiles.push(plotPath);

    // 4. 生成写作技法笔记
    const techniquePath = `${bookFolderPath}/03-写作技法.md`;
    const techniqueContent = this.generateTechniqueNote(analysis);
    await createFile(techniquePath, techniqueContent);
    generatedFiles.push(techniquePath);

    // 5. 深度模式下生成章节笔记子文件夹
    if (this.config.mode === 'deep' && analysis.chapterDetails && analysis.chapterDetails.length > 0) {
      const chapterNotesPath = `${bookFolderPath}/章节笔记`;
      const chapterNotes = this.generateChapterNotes(analysis);
      
      for (const [index, content] of chapterNotes) {
        const chapterFileName = this.formatChapterFileName(index, analysis.chapterDetails.find(d => d.index === index)?.title || '');
        const chapterFilePath = `${chapterNotesPath}/${chapterFileName}`;
        await createFile(chapterFilePath, content);
        generatedFiles.push(chapterFilePath);
      }
    }

    return generatedFiles;
  }

  /**
   * 追加内容到现有笔记
   * 保留原有内容并追加新内容，添加章节范围标注头部
   * 需求: 1.1.4.2, 1.1.4.3
   * 
   * @param existingContent 现有笔记内容
   * @param newAnalysis 新的分析结果
   * @param rangeInfo 章节范围信息
   * @param noteType 笔记类型
   * @returns 追加后的完整笔记内容
   */
  appendToNote(
    existingContent: string,
    newAnalysis: AnalysisResult,
    rangeInfo: { start: number; end: number },
    noteType: 'overview' | 'character' | 'plot' | 'technique'
  ): string {
    const lines: string[] = [];
    
    // 保留原有内容
    lines.push(existingContent.trimEnd());
    lines.push('');
    lines.push('');
    
    // 添加章节范围标注头部
    const sectionHeader = `## 新增分析 (章节 ${rangeInfo.start}-${rangeInfo.end})`;
    lines.push(sectionHeader);
    lines.push('');
    lines.push(`> 分析日期: ${this.getCurrentDate()}`);
    lines.push('');
    
    // 根据笔记类型生成新内容
    switch (noteType) {
      case 'overview':
        lines.push(this.generateAppendedOverviewContent(newAnalysis));
        break;
      case 'character':
        lines.push(this.generateAppendedCharacterContent(newAnalysis));
        break;
      case 'plot':
        lines.push(this.generateAppendedPlotContent(newAnalysis));
        break;
      case 'technique':
        lines.push(this.generateAppendedTechniqueContent(newAnalysis));
        break;
    }
    
    return lines.join('\n');
  }

  /**
   * 生成追加的概览内容
   */
  private generateAppendedOverviewContent(analysis: AnalysisResult): string {
    const lines: string[] = [];
    
    if (analysis.synopsis) {
      lines.push('### 故事梗概（续）');
      lines.push('');
      lines.push(analysis.synopsis);
      lines.push('');
    }
    
    if (analysis.takeaways && analysis.takeaways.length > 0) {
      lines.push('### 新增可借鉴清单');
      lines.push('');
      for (const takeaway of analysis.takeaways) {
        lines.push(`- ${takeaway}`);
      }
      lines.push('');
    }
    
    return lines.join('\n');
  }

  /**
   * 生成追加的人物内容
   */
  private generateAppendedCharacterContent(analysis: AnalysisResult): string {
    const lines: string[] = [];
    
    if (!analysis.characters || analysis.characters.length === 0) {
      lines.push('暂无新增人物分析数据。');
      return lines.join('\n');
    }
    
    // 按角色类型分组
    const protagonists = analysis.characters.filter(c => c.role === 'protagonist');
    const antagonists = analysis.characters.filter(c => c.role === 'antagonist');
    const supporting = analysis.characters.filter(c => c.role === 'supporting');
    
    if (protagonists.length > 0) {
      lines.push('### 新增/更新主角');
      lines.push('');
      for (const char of protagonists) {
        lines.push(...this.formatCharacter(char));
      }
    }
    
    if (antagonists.length > 0) {
      lines.push('### 新增/更新反派');
      lines.push('');
      for (const char of antagonists) {
        lines.push(...this.formatCharacter(char));
      }
    }
    
    if (supporting.length > 0) {
      lines.push('### 新增/更新配角');
      lines.push('');
      for (const char of supporting) {
        lines.push(...this.formatCharacter(char));
      }
    }
    
    return lines.join('\n');
  }

  /**
   * 生成追加的情节内容
   */
  private generateAppendedPlotContent(analysis: AnalysisResult): string {
    const lines: string[] = [];
    
    // 章节结构
    if (analysis.chapterStructure && analysis.chapterStructure.length > 0) {
      lines.push('### 新增章节结构');
      lines.push('');
      for (const chapter of analysis.chapterStructure) {
        lines.push(`#### 第${chapter.index + 1}章: ${chapter.title}`);
        lines.push('');
        lines.push(`**概要**: ${chapter.summary}`);
        lines.push('');
        if (chapter.keyEvents && chapter.keyEvents.length > 0) {
          lines.push('**关键事件**:');
          for (const event of chapter.keyEvents) {
            lines.push(`- ${event}`);
          }
          lines.push('');
        }
      }
    }
    
    // 情绪曲线
    if (analysis.emotionCurve && analysis.emotionCurve.length > 0) {
      lines.push('### 新增情绪曲线');
      lines.push('');
      lines.push(this.generateEmotionCurveTable(analysis.emotionCurve));
      lines.push('');
    }
    
    // 伏笔分析
    if (analysis.foreshadowing && analysis.foreshadowing.length > 0) {
      lines.push('### 新增伏笔设计');
      lines.push('');
      lines.push(this.generateForeshadowingSection(analysis.foreshadowing));
    }
    
    if (!analysis.chapterStructure?.length && !analysis.emotionCurve?.length && !analysis.foreshadowing?.length) {
      lines.push('暂无新增情节分析数据。');
    }
    
    return lines.join('\n');
  }

  /**
   * 生成追加的技法内容
   */
  private generateAppendedTechniqueContent(analysis: AnalysisResult): string {
    const lines: string[] = [];
    
    if (analysis.writingTechniques && analysis.writingTechniques.length > 0) {
      lines.push('### 新增写作技法');
      lines.push('');
      for (const tech of analysis.writingTechniques) {
        lines.push(`#### ${tech.name}`);
        lines.push('');
        lines.push(`**描述**: ${tech.description}`);
        lines.push('');
        
        if (tech.examples && tech.examples.length > 0) {
          lines.push('**示例**:');
          for (const example of tech.examples) {
            lines.push(`> ${example}`);
            lines.push('');
          }
        }
        
        lines.push(`**适用性**: ${tech.applicability}`);
        lines.push('');
      }
    }
    
    if (analysis.takeaways && analysis.takeaways.length > 0) {
      lines.push('### 新增可借鉴清单');
      lines.push('');
      for (let i = 0; i < analysis.takeaways.length; i++) {
        lines.push(`- ${analysis.takeaways[i]}`);
      }
      lines.push('');
    }
    
    if (!analysis.writingTechniques?.length && !analysis.takeaways?.length) {
      lines.push('暂无新增写作技法分析数据。');
    }
    
    return lines.join('\n');
  }

  /**
   * 合并技法列表
   * 同名技法合并示例，新技法追加
   * 需求: 1.1.4.4
   * 
   * @param existing 现有技法列表
   * @param newTechniques 新技法列表
   * @returns 合并后的技法列表
   */
  mergeTechniques(
    existing: TechniqueAnalysis[],
    newTechniques: TechniqueAnalysis[]
  ): TechniqueAnalysis[] {
    // 创建一个 Map 用于按名称索引现有技法
    const techniqueMap = new Map<string, TechniqueAnalysis>();
    
    // 先添加所有现有技法
    for (const tech of existing) {
      techniqueMap.set(tech.name, { ...tech, examples: [...tech.examples] });
    }
    
    // 处理新技法
    for (const newTech of newTechniques) {
      const existingTech = techniqueMap.get(newTech.name);
      
      if (existingTech) {
        // 同名技法：合并示例（去重）
        const existingExamples = new Set(existingTech.examples);
        for (const example of newTech.examples) {
          if (!existingExamples.has(example)) {
            existingTech.examples.push(example);
          }
        }
        // 更新描述和适用性（使用新的，因为可能更完整）
        existingTech.description = newTech.description || existingTech.description;
        existingTech.applicability = newTech.applicability || existingTech.applicability;
      } else {
        // 新技法：直接添加
        techniqueMap.set(newTech.name, { ...newTech, examples: [...newTech.examples] });
      }
    }
    
    // 返回合并后的技法列表
    return Array.from(techniqueMap.values());
  }

  /**
   * 生成带范围标注的笔记（统一视图）
   * 需求: 1.2.3.1, 1.2.3.2, 1.2.3.3, 1.3.3.2, 1.3.3.4
   * 
   * @param analysis 合并后的分析结果
   * @param ranges 分析范围列表
   * @param rangeResults 可选，每个范围对应的分析结果（用于合并梗概）
   * @returns 带范围标注的笔记内容
   */
  generateRangeAnnotatedNote(
    analysis: AnalysisResult,
    ranges: AnalysisRange[],
    rangeResults?: Map<string, AnalysisResult>
  ): string {
    const lines: string[] = [];
    
    lines.push(`# 《${analysis.bookInfo.title}》分析汇总`);
    lines.push('');
    
    // 分析范围概览 - 包含模式信息 (1.3.3.2)
    lines.push('## 分析范围');
    lines.push('');
    
    // 检查是否存在混合模式
    const modes = new Set(ranges.map(r => r.mode));
    const hasMixedModes = modes.size > 1;
    
    if (hasMixedModes) {
      lines.push('> ℹ️ 本书使用了多种分析模式，不同模式的分析深度有所不同。');
      lines.push('');
    }
    
    for (const range of ranges) {
      const date = range.analyzedAt.split('T')[0];
      const modeLabel = this.formatModeLabel(range.mode);
      const modeIcon = this.getModeIcon(range.mode);
      lines.push(`- ${modeIcon} 第 ${range.startChapter}-${range.endChapter} 章 [${modeLabel}模式] (${date})`);
    }
    lines.push('');
    
    // 故事梗概 - 合并所有范围的梗概 (1.2.3.1)
    lines.push('## 故事梗概');
    lines.push('');
    if (rangeResults && rangeResults.size > 0) {
      // 按范围顺序合并梗概
      const sortedRanges = [...ranges].sort((a, b) => a.startChapter - b.startChapter);
      for (const range of sortedRanges) {
        const rangeResult = rangeResults.get(range.id);
        if (rangeResult?.synopsis) {
          lines.push(`### 第 ${range.startChapter}-${range.endChapter} 章`);
          lines.push('');
          lines.push(rangeResult.synopsis);
          lines.push('');
        }
      }
      // 如果没有任何范围有梗概，显示合并后的梗概
      if (!sortedRanges.some(r => rangeResults.get(r.id)?.synopsis)) {
        lines.push(analysis.synopsis || '暂无梗概');
        lines.push('');
      }
    } else {
      lines.push(analysis.synopsis || '暂无梗概');
      lines.push('');
    }
    
    // 人物列表（带范围标注）(1.2.3.2, 1.2.3.3)
    if (analysis.characters && analysis.characters.length > 0) {
      lines.push('## 人物列表');
      lines.push('');
      for (const char of analysis.characters) {
        // 查找人物出现的范围
        const charRanges = this.findCharacterRanges(char.name, ranges, rangeResults);
        const rangeAnnotation = charRanges.length > 0 
          ? ` [来源: ${charRanges.join(', ')}]`
          : '';
        
        lines.push(`### ${char.name}${rangeAnnotation}`);
        lines.push('');
        lines.push(`**角色**: ${this.formatRole(char.role)}`);
        lines.push('');
        lines.push(`**描述**: ${char.description}`);
        lines.push('');
        lines.push(`**动机**: ${char.motivation}`);
        lines.push('');
        if (char.growthArc) {
          lines.push(`**成长弧线**: ${char.growthArc}`);
          lines.push('');
        }
      }
    }
    
    // 写作技法（带范围标注）(1.2.3.3)
    if (analysis.writingTechniques && analysis.writingTechniques.length > 0) {
      lines.push('## 写作技法');
      lines.push('');
      for (const tech of analysis.writingTechniques) {
        // 查找技法出现的范围
        const techRanges = this.findTechniqueRanges(tech.name, ranges, rangeResults);
        const rangeAnnotation = techRanges.length > 0 
          ? ` [来源: ${techRanges.join(', ')}]`
          : '';
        
        lines.push(`### ${tech.name}${rangeAnnotation}`);
        lines.push('');
        lines.push(`**描述**: ${tech.description}`);
        lines.push('');
        if (tech.examples && tech.examples.length > 0) {
          lines.push('**示例**:');
          for (const example of tech.examples) {
            lines.push(`> ${example}`);
            lines.push('');
          }
        }
        lines.push(`**适用性**: ${tech.applicability}`);
        lines.push('');
      }
    }
    
    // 可借鉴清单
    if (analysis.takeaways && analysis.takeaways.length > 0) {
      lines.push('## 可借鉴清单');
      lines.push('');
      for (const takeaway of analysis.takeaways) {
        lines.push(`- ${takeaway}`);
      }
      lines.push('');
    }
    
    // 深度模式章节详情 (1.3.3.4)
    // 只显示深度模式分析的章节详情
    const deepModeRanges = ranges.filter(r => r.mode === 'deep');
    if (deepModeRanges.length > 0 && analysis.chapterDetails && analysis.chapterDetails.length > 0) {
      lines.push('## 章节详情（深度分析）');
      lines.push('');
      lines.push('> 以下章节详情仅包含使用深度模式分析的章节。');
      lines.push('');
      
      // 获取深度模式分析的章节索引
      const deepChapterIndices = new Set<number>();
      for (const range of deepModeRanges) {
        for (let i = range.startChapter; i <= range.endChapter; i++) {
          deepChapterIndices.add(i);
        }
      }
      
      // 过滤并显示深度模式的章节详情
      const deepChapterDetails = analysis.chapterDetails.filter(
        detail => deepChapterIndices.has(detail.index + 1) // index 是 0-based
      );
      
      for (const detail of deepChapterDetails) {
        lines.push(`### 第${detail.index + 1}章: ${detail.title}`);
        lines.push('');
        lines.push(detail.analysis);
        lines.push('');
        
        if (detail.techniques && detail.techniques.length > 0) {
          lines.push('**使用的技法**:');
          for (const tech of detail.techniques) {
            lines.push(`- ${tech}`);
          }
          lines.push('');
        }
        
        if (detail.highlights && detail.highlights.length > 0) {
          lines.push('**亮点**:');
          for (const highlight of detail.highlights) {
            lines.push(`- ${highlight}`);
          }
          lines.push('');
        }
      }
    }
    
    // 写作复盘（深度模式）
    if (analysis.writingReview) {
      lines.push('## 写作复盘');
      lines.push('');
      lines.push('> 以下内容来自深度模式分析。');
      lines.push('');
      lines.push(analysis.writingReview);
      lines.push('');
    }
    
    return lines.join('\n');
  }

  /**
   * 格式化分析模式标签
   * @param mode 分析模式
   * @returns 中文模式标签
   */
  private formatModeLabel(mode: string): string {
    switch (mode) {
      case 'quick':
        return '快速';
      case 'standard':
        return '标准';
      case 'deep':
        return '深度';
      default:
        return mode;
    }
  }

  /**
   * 获取分析模式图标
   * @param mode 分析模式
   * @returns 模式图标
   */
  private getModeIcon(mode: string): string {
    switch (mode) {
      case 'quick':
        return '⚡';
      case 'standard':
        return '📊';
      case 'deep':
        return '🔬';
      default:
        return '📖';
    }
  }

  /**
   * 查找人物出现的范围
   * @param characterName 人物名称
   * @param ranges 分析范围列表
   * @param rangeResults 每个范围对应的分析结果
   * @returns 人物出现的范围描述列表
   */
  private findCharacterRanges(
    characterName: string,
    ranges: AnalysisRange[],
    rangeResults?: Map<string, AnalysisResult>
  ): string[] {
    if (!rangeResults) return [];
    
    const foundRanges: string[] = [];
    for (const range of ranges) {
      const result = rangeResults.get(range.id);
      if (result?.characters?.some(c => c.name === characterName)) {
        foundRanges.push(`第${range.startChapter}-${range.endChapter}章`);
      }
    }
    return foundRanges;
  }

  /**
   * 查找技法出现的范围
   * @param techniqueName 技法名称
   * @param ranges 分析范围列表
   * @param rangeResults 每个范围对应的分析结果
   * @returns 技法出现的范围描述列表
   */
  private findTechniqueRanges(
    techniqueName: string,
    ranges: AnalysisRange[],
    rangeResults?: Map<string, AnalysisResult>
  ): string[] {
    if (!rangeResults) return [];
    
    const foundRanges: string[] = [];
    for (const range of ranges) {
      const result = rangeResults.get(range.id);
      if (result?.writingTechniques?.some(t => t.name === techniqueName)) {
        foundRanges.push(`第${range.startChapter}-${range.endChapter}章`);
      }
    }
    return foundRanges;
  }

  /**
   * 格式化角色类型
   */
  private formatRole(role: 'protagonist' | 'antagonist' | 'supporting'): string {
    switch (role) {
      case 'protagonist':
        return '主角';
      case 'antagonist':
        return '反派/对手';
      case 'supporting':
        return '配角';
      default:
        return role;
    }
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
   * 清理文件名，移除不合法字符
   */
  private sanitizeFileName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100); // 限制长度
  }

  /**
   * 格式化字数显示
   */
  private formatWordCount(count: number): string {
    if (count >= 10000) {
      return `${(count / 10000).toFixed(1)} 万字`;
    }
    return `${count} 字`;
  }

  /**
   * 获取当前日期
   */
  private getCurrentDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
