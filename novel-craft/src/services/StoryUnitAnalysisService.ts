/**
 * 故事单元AI分析服务
 * 
 * 复用 LLMService 和 AnalysisService，提供故事单元级别的AI拆解分析功能
 * 分析结果存储到 ai_analysis 表（关联 story_unit_id）
 * 
 * Requirements: 1.5, 2.1
 */

import { App, TFile } from 'obsidian';
import { LLMService } from './LLMService';
import { StoryUnitService } from './StoryUnitService';
import { databaseService } from './DatabaseService';
import { AIAnalysisRecord, StoryUnitRecord } from '../types/database';
import { ChatMessage } from '../types';
import { AIAnalysisError } from '../types/errors';
import { 
  AnalysisTemplate, 
  AnalysisTemplateStep, 
  SEVEN_STEP_STORY_TEMPLATE,
  getTemplateById 
} from './AnalysisTemplates';

/**
 * AI分析进度回调类型
 */
export type AnalysisProgressCallback = (
  step: string,
  status: 'pending' | 'running' | 'completed' | 'error',
  message: string,
  result?: string
) => void;

/**
 * 流式响应回调类型
 */
export type StreamCallback = (chunk: string) => void;

/**
 * 分析结果项
 */
export interface AnalysisResultItem {
  /** 步骤ID */
  stepId: string;
  /** 步骤名称 */
  stepName: string;
  /** 分析结果内容 */
  content: string;
  /** 是否已手动编辑 */
  isEdited: boolean;
  /** 原始AI结果（用于重置） */
  originalContent: string;
  /** 分类：basic=基础元素, extra=附加元素 */
  category?: 'basic' | 'extra';
}

/**
 * 人物关系项
 */
export interface CharacterRelationItem {
  /** 人物名称 */
  name: string;
  /** 人物身份/描述 */
  identity: string;
  /** 与主角的关系类型：friend=友方, neutral=中立, enemy=敌方 */
  relationType: 'friend' | 'neutral' | 'enemy';
  /** 关系描述 */
  relationDesc: string;
}

/**
 * 完整分析结果
 */
export interface StoryUnitAnalysisResult {
  /** 分析ID */
  id: string;
  /** 故事单元ID */
  storyUnitId: string;
  /** 使用的模板ID */
  templateId: string;
  /** 模板名称 */
  templateName: string;
  /** 各步骤分析结果 */
  steps: AnalysisResultItem[];
  /** 人物关系列表 */
  characterRelations?: CharacterRelationItem[];
  /** 故事梗概 */
  summary?: string;
  /** 情绪折线 */
  emotionCurve?: string;
  /** 完整分析文档路径 */
  fullDocPath?: string;
  /** 分析状态 */
  status: 'pending' | 'analyzing' | 'completed' | 'failed';
  /** 错误信息 */
  errorMessage?: string;
  /** 创建时间 */
  createTime: number;
  /** 更新时间 */
  updateTime: number;
}

/**
 * 故事单元AI分析服务类
 */
export class StoryUnitAnalysisService {
  private app: App;
  private llmService: LLMService;
  private storyUnitService: StoryUnitService;

  constructor(app: App, llmService: LLMService) {
    this.app = app;
    this.llmService = llmService;
    this.storyUnitService = new StoryUnitService(app);
  }

  /**
   * 对故事单元进行AI分析
   * 
   * @param storyUnitId 故事单元ID
   * @param templateId 分析模板ID（默认使用七步故事法）
   * @param onProgress 进度回调
   * @param onStream 流式响应回调
   * @param customPrompt 自定义提示词（可选）
   * @returns 分析结果
   */
  async analyzeStoryUnit(
    storyUnitId: string,
    templateId: string = 'seven-step-story',
    onProgress?: AnalysisProgressCallback,
    onStream?: StreamCallback,
    customPrompt?: string
  ): Promise<StoryUnitAnalysisResult> {
    // 获取故事单元
    const storyUnit = await this.storyUnitService.getStoryUnit(storyUnitId);
    if (!storyUnit) {
      throw new AIAnalysisError('故事单元不存在', templateId);
    }

    // 获取分析模板
    const template = getTemplateById(templateId);
    if (!template) {
      throw new AIAnalysisError(`分析模板 "${templateId}" 不存在`, templateId);
    }

    // 提取故事单元内容
    const content = await this.storyUnitService.extractChapterContent(
      storyUnit.book_id,
      storyUnit.chapter_start,
      storyUnit.chapter_end
    );

    if (!content || content.trim().length === 0) {
      throw new AIAnalysisError('故事单元内容为空，无法进行分析', templateId);
    }

    // 创建分析记录
    const analysisId = await this.createAnalysisRecord(storyUnitId, templateId);

    // 更新故事单元的 ai_analysis_id
    await this.storyUnitService.updateStoryUnit(storyUnitId, {});
    await databaseService.storyUnits.update(storyUnitId, { ai_analysis_id: analysisId });

    // 执行分析
    const steps: AnalysisResultItem[] = [];
    let characterRelations: CharacterRelationItem[] = [];
    
    try {
      // 更新状态为分析中
      await this.updateAnalysisStatus(analysisId, 'analyzing');

      for (const step of template.steps) {
        onProgress?.(step.name, 'running', `正在分析: ${step.name}...`);

        try {
          const result = await this.analyzeStep(
            content,
            storyUnit,
            step,
            template,
            onStream,
            customPrompt
          );

          steps.push({
            stepId: step.id,
            stepName: step.name,
            content: result,
            isEdited: false,
            originalContent: result,
            category: step.category || 'basic'
          });

          onProgress?.(step.name, 'completed', `${step.name} 分析完成`, result);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : '未知错误';
          
          // 记录失败的步骤，但继续分析其他步骤
          steps.push({
            stepId: step.id,
            stepName: step.name,
            content: `未找到相关情节 → 点击编辑`,
            isEdited: false,
            originalContent: '',
            category: step.category || 'basic'
          });

          onProgress?.(step.name, 'error', `${step.name} 分析失败: ${errorMsg}`);
        }
      }

      // 如果模板包含人物关系分析，执行人物关系分析
      if (template.includeCharacterRelations) {
        onProgress?.('人物关系', 'running', '正在分析人物关系...');
        try {
          characterRelations = await this.analyzeCharacterRelations(
            content,
            storyUnit,
            onStream
          );
          onProgress?.('人物关系', 'completed', '人物关系分析完成');
        } catch (error) {
          onProgress?.('人物关系', 'error', '人物关系分析失败');
        }
      }

      // 分析故事梗概
      let summary = '';
      if (template.includeSummary) {
        onProgress?.('故事梗概', 'running', '正在生成故事梗概...');
        try {
          summary = await this.analyzeSummary(content, storyUnit, onStream);
          onProgress?.('故事梗概', 'completed', '故事梗概生成完成');
        } catch (error) {
          onProgress?.('故事梗概', 'error', '故事梗概生成失败');
        }
      }

      // 分析情绪折线
      let emotionCurve = '';
      if (template.includeEmotionCurve) {
        onProgress?.('情绪折线', 'running', '正在分析情绪折线...');
        try {
          emotionCurve = await this.analyzeEmotionCurve(content, storyUnit, onStream);
          onProgress?.('情绪折线', 'completed', '情绪折线分析完成');
        } catch (error) {
          onProgress?.('情绪折线', 'error', '情绪折线分析失败');
        }
      }

      // 生成完整分析文档
      let fullDocPath = '';
      onProgress?.('生成文档', 'running', '正在生成完整分析文档...');
      try {
        fullDocPath = await this.generateFullAnalysisDoc(
          storyUnit,
          template,
          steps,
          characterRelations,
          summary,
          emotionCurve
        );
        onProgress?.('生成文档', 'completed', '完整分析文档已生成');
      } catch (error) {
        onProgress?.('生成文档', 'error', '文档生成失败');
      }

      // 保存分析结果
      await this.saveAnalysisResult(analysisId, steps, characterRelations, summary, emotionCurve, fullDocPath);
      await this.updateAnalysisStatus(analysisId, 'completed');

      return {
        id: analysisId,
        storyUnitId,
        templateId,
        templateName: template.name,
        steps,
        characterRelations,
        summary,
        emotionCurve,
        fullDocPath,
        status: 'completed',
        createTime: Date.now(),
        updateTime: Date.now()
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      await this.updateAnalysisStatus(analysisId, 'failed', errorMsg);
      
      throw new AIAnalysisError(`AI分析失败: ${errorMsg}`, templateId);
    }
  }

  /**
   * 分析人物关系
   */
  private async analyzeCharacterRelations(
    content: string,
    storyUnit: StoryUnitRecord,
    onStream?: StreamCallback
  ): Promise<CharacterRelationItem[]> {
    const systemPrompt = `你是一位专业的小说分析师，擅长梳理故事中的人物关系。
请分析故事中出现的人物，并按照与主角的关系进行分类。

输出格式要求（JSON数组）：
[
  {"name": "人物名", "identity": "身份描述", "relationType": "friend/neutral/enemy", "relationDesc": "与主角的关系描述"}
]

relationType说明：
- friend: 友方，主角的朋友、盟友、支持者
- neutral: 中立，暂时中立或立场不明的人物
- enemy: 敌方，反派、对手、敌对势力

请只输出JSON数组，不要输出其他内容。`;

    const userPrompt = `请分析以下故事片段中出现的人物及其与主角的关系：

【故事单元】${storyUnit.title}
【章节范围】第${storyUnit.chapter_start}章 - 第${storyUnit.chapter_end}章

【故事内容】
${content}

请输出人物关系的JSON数组：`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    let result = '';
    if (onStream) {
      await this.llmService.chatStream(messages, (chunk) => {
        result += chunk;
        onStream(chunk);
      });
    } else {
      result = await this.llmService.chat(messages);
    }

    // 解析JSON结果
    try {
      // 尝试提取JSON数组
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * 分析单个步骤
   */
  private async analyzeStep(
    content: string,
    storyUnit: StoryUnitRecord,
    step: AnalysisTemplateStep,
    template: AnalysisTemplate,
    onStream?: StreamCallback,
    customPrompt?: string
  ): Promise<string> {
    // 构建系统提示词
    const systemPrompt = this.buildSystemPrompt(template, customPrompt);
    
    // 构建用户提示词
    const userPrompt = this.buildStepPrompt(content, storyUnit, step, customPrompt);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    // 如果有流式回调，使用流式请求
    if (onStream) {
      let result = '';
      await this.llmService.chatStream(messages, (chunk) => {
        result += chunk;
        onStream(chunk);
      });
      return result.trim();
    }

    // 否则使用普通请求
    const result = await this.llmService.chat(messages);
    return result.trim();
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(template: AnalysisTemplate, customPrompt?: string): string {
    let prompt = `你是一位专业的网络小说分析师，专注于使用「${template.name}」方法分析故事结构。

${template.description}

分析要求：
1. 针对给定的故事片段进行深入分析
2. 如果某个分析维度在文本中没有明确体现，请如实说明"未找到相关情节"
3. 分析结果要具体、有针对性，引用原文作为依据
4. 使用清晰的结构化格式输出
5. 所有输出使用中文`;

    if (customPrompt && customPrompt.trim()) {
      prompt += `

【用户自定义要求】
${customPrompt.trim()}`;
    }

    return prompt;
  }

  /**
   * 构建步骤提示词
   */
  private buildStepPrompt(
    content: string,
    storyUnit: StoryUnitRecord,
    step: AnalysisTemplateStep,
    customPrompt?: string
  ): string {
    let prompt = `请分析以下故事片段中的「${step.name}」部分。

【故事单元信息】
- 标题: ${storyUnit.title}
- 章节范围: 第${storyUnit.chapter_start}章 - 第${storyUnit.chapter_end}章

【分析维度】
${step.name}: ${step.description}

【分析提示】
${step.prompt}`;

    if (customPrompt && customPrompt.trim()) {
      prompt += `

【额外要求】
${customPrompt.trim()}`;
    }

    prompt += `

【故事内容】
${content}

请根据上述内容，分析并输出「${step.name}」的具体内容。如果文本中没有明确体现该维度，请说明"未找到相关情节"。`;

    return prompt;
  }

  /**
   * 创建分析记录
   */
  private async createAnalysisRecord(
    storyUnitId: string,
    templateId: string
  ): Promise<string> {
    // 获取故事单元以获取 book_id
    const storyUnit = await this.storyUnitService.getStoryUnit(storyUnitId);
    if (!storyUnit) {
      throw new AIAnalysisError('故事单元不存在', templateId);
    }

    const id = await databaseService.aiAnalysis.create({
      book_id: storyUnit.book_id,
      template_type: templateId,
      analysis_result: JSON.stringify([]),
      edit_status: JSON.stringify({}),
      status: 'pending'
    });

    return id;
  }

  /**
   * 更新分析状态
   */
  private async updateAnalysisStatus(
    analysisId: string,
    status: 'pending' | 'analyzing' | 'completed' | 'failed',
    errorMessage?: string
  ): Promise<void> {
    const updates: Partial<AIAnalysisRecord> = { status };
    if (errorMessage) {
      updates.error_message = errorMessage;
    }
    await databaseService.aiAnalysis.update(analysisId, updates);
  }

  /**
   * 保存分析结果
   */
  private async saveAnalysisResult(
    analysisId: string,
    steps: AnalysisResultItem[],
    characterRelations?: CharacterRelationItem[],
    summary?: string,
    emotionCurve?: string,
    fullDocPath?: string
  ): Promise<void> {
    const editStatus: Record<string, boolean> = {};
    steps.forEach(step => {
      editStatus[step.stepId] = step.isEdited;
    });

    const resultData = {
      steps,
      characterRelations: characterRelations || [],
      summary: summary || '',
      emotionCurve: emotionCurve || '',
      fullDocPath: fullDocPath || ''
    };

    await databaseService.aiAnalysis.update(analysisId, {
      analysis_result: JSON.stringify(resultData),
      edit_status: JSON.stringify(editStatus)
    });
  }

  /**
   * 分析故事梗概
   */
  private async analyzeSummary(
    content: string,
    storyUnit: StoryUnitRecord,
    onStream?: StreamCallback
  ): Promise<string> {
    const systemPrompt = `你是一位专业的小说分析师。请用50-100字概括故事的主要情节。
要求：简洁明了，突出核心冲突和结果。`;

    const userPrompt = `请概括以下故事片段的主要情节：

【故事单元】${storyUnit.title}
【章节范围】第${storyUnit.chapter_start}章 - 第${storyUnit.chapter_end}章

【故事内容】
${content}

请用50-100字概括：`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    let result = '';
    if (onStream) {
      await this.llmService.chatStream(messages, (chunk) => {
        result += chunk;
        onStream(chunk);
      });
    } else {
      result = await this.llmService.chat(messages);
    }

    return result.trim();
  }

  /**
   * 分析情绪折线
   */
  private async analyzeEmotionCurve(
    content: string,
    storyUnit: StoryUnitRecord,
    onStream?: StreamCallback
  ): Promise<string> {
    const systemPrompt = `你是一位专业的小说分析师。请分析故事的情绪起伏变化。
用箭头表示情绪走向，格式：事件（↓下行/↑上行）→ 事件（↓/↑）
要求：精简，不超过50字。`;

    const userPrompt = `请分析以下故事的情绪折线：

【故事单元】${storyUnit.title}
【章节范围】第${storyUnit.chapter_start}章 - 第${storyUnit.chapter_end}章

【故事内容】
${content}

请用箭头表示情绪走向：`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    let result = '';
    if (onStream) {
      await this.llmService.chatStream(messages, (chunk) => {
        result += chunk;
        onStream(chunk);
      });
    } else {
      result = await this.llmService.chat(messages);
    }

    return result.trim();
  }

  /**
   * 生成完整分析文档
   */
  private async generateFullAnalysisDoc(
    storyUnit: StoryUnitRecord,
    template: AnalysisTemplate,
    steps: AnalysisResultItem[],
    characterRelations: CharacterRelationItem[],
    summary: string,
    emotionCurve: string
  ): Promise<string> {
    // 构建完整文档内容
    let content = `# ${storyUnit.title} - 完整分析报告\n\n`;
    content += `> 分析模板: ${template.name}\n`;
    content += `> 章节范围: 第${storyUnit.chapter_start}章 - 第${storyUnit.chapter_end}章\n`;
    content += `> 生成时间: ${new Date().toLocaleString()}\n\n`;
    content += `---\n\n`;

    // 故事梗概
    if (summary) {
      content += `## 📖 故事梗概\n\n${summary}\n\n`;
    }

    // 情绪折线
    if (emotionCurve) {
      content += `## 📈 情绪折线\n\n${emotionCurve}\n\n`;
    }

    // 人物关系
    if (characterRelations && characterRelations.length > 0) {
      content += `## 👥 人物关系\n\n`;
      
      const friends = characterRelations.filter(r => r.relationType === 'friend');
      const neutrals = characterRelations.filter(r => r.relationType === 'neutral');
      const enemies = characterRelations.filter(r => r.relationType === 'enemy');
      
      if (friends.length > 0) {
        content += `### 友方\n`;
        for (const char of friends) {
          content += `- **${char.name}**${char.identity ? `（${char.identity}）` : ''}${char.relationDesc ? `: ${char.relationDesc}` : ''}\n`;
        }
        content += '\n';
      }
      
      if (neutrals.length > 0) {
        content += `### 中立\n`;
        for (const char of neutrals) {
          content += `- **${char.name}**${char.identity ? `（${char.identity}）` : ''}${char.relationDesc ? `: ${char.relationDesc}` : ''}\n`;
        }
        content += '\n';
      }
      
      if (enemies.length > 0) {
        content += `### 敌方\n`;
        for (const char of enemies) {
          content += `- **${char.name}**${char.identity ? `（${char.identity}）` : ''}${char.relationDesc ? `: ${char.relationDesc}` : ''}\n`;
        }
        content += '\n';
      }
    }

    // 七步故事法分析表格
    content += `## 📊 ${template.name}分析\n\n`;
    content += `| 类别 | 具体条目 | 分析内容 |\n`;
    content += `|------|---------|----------|\n`;
    
    const basicSteps = steps.filter(s => s.category === 'basic');
    const extraSteps = steps.filter(s => s.category === 'extra');
    
    for (let i = 0; i < basicSteps.length; i++) {
      const step = basicSteps[i];
      const category = i === 0 ? '基础元素' : '';
      const stepContent = (step.content || '无').replace(/\n/g, ' ').replace(/\|/g, '\\|');
      content += `| ${category} | ${step.stepName} | ${stepContent} |\n`;
    }
    
    for (let i = 0; i < extraSteps.length; i++) {
      const step = extraSteps[i];
      const category = i === 0 ? '附加元素' : '';
      const stepContent = (step.content || '无').replace(/\n/g, ' ').replace(/\|/g, '\\|');
      content += `| ${category} | ${step.stepName} | ${stepContent} |\n`;
    }

    content += '\n---\n\n';
    content += `*本报告由 NovelCraft AI 自动生成*\n`;

    // 获取书籍信息
    const book = await databaseService.books.getById(storyUnit.book_id);
    const bookPath = book?.file_path || 'NovelCraft/books';
    
    // 创建文档路径
    const docPath = `${bookPath}/分析报告/${storyUnit.title}-完整分析.md`;
    
    // 确保目录存在
    const dirPath = docPath.substring(0, docPath.lastIndexOf('/'));
    const existingFolder = this.app.vault.getAbstractFileByPath(dirPath);
    if (!existingFolder) {
      await this.app.vault.createFolder(dirPath);
    }
    
    // 创建或更新文件
    const existingFile = this.app.vault.getAbstractFileByPath(docPath);
    if (existingFile) {
      await this.app.vault.modify(existingFile as any, content);
    } else {
      await this.app.vault.create(docPath, content);
    }

    return docPath;
  }

  /**
   * 获取故事单元的分析结果
   */
  async getAnalysisResult(storyUnitId: string): Promise<StoryUnitAnalysisResult | null> {
    const storyUnit = await this.storyUnitService.getStoryUnit(storyUnitId);
    if (!storyUnit || !storyUnit.ai_analysis_id) {
      return null;
    }

    const record = await databaseService.aiAnalysis.getById(storyUnit.ai_analysis_id);
    if (!record) {
      return null;
    }

    const template = getTemplateById(record.template_type);
    
    // 解析分析结果（兼容旧格式）
    let steps: AnalysisResultItem[] = [];
    let characterRelations: CharacterRelationItem[] = [];
    let summary = '';
    let emotionCurve = '';
    let fullDocPath = '';
    
    try {
      const parsed = JSON.parse(record.analysis_result || '{}');
      if (Array.isArray(parsed)) {
        // 旧格式：直接是steps数组
        steps = parsed;
      } else {
        // 新格式：包含所有字段
        steps = parsed.steps || [];
        characterRelations = parsed.characterRelations || [];
        summary = parsed.summary || '';
        emotionCurve = parsed.emotionCurve || '';
        fullDocPath = parsed.fullDocPath || '';
      }
    } catch {
      steps = [];
    }

    return {
      id: record.id,
      storyUnitId,
      templateId: record.template_type,
      templateName: template?.name || record.template_type,
      steps,
      characterRelations,
      summary,
      emotionCurve,
      fullDocPath,
      status: record.status,
      errorMessage: record.error_message,
      createTime: record.create_time,
      updateTime: record.update_time
    };
  }

  /**
   * 更新分析结果步骤内容（手动编辑）
   * 
   * Requirements: 2.4 - 手动编辑分析结果时标注「已手动编辑」
   */
  async updateStepContent(
    analysisId: string,
    stepId: string,
    newContent: string
  ): Promise<boolean> {
    const record = await databaseService.aiAnalysis.getById(analysisId);
    if (!record) {
      return false;
    }

    const steps: AnalysisResultItem[] = JSON.parse(record.analysis_result || '[]');
    const stepIndex = steps.findIndex(s => s.stepId === stepId);
    
    if (stepIndex === -1) {
      return false;
    }

    // 更新内容并标记为已编辑
    steps[stepIndex].content = newContent;
    steps[stepIndex].isEdited = true;

    // 更新编辑状态
    const editStatus: Record<string, boolean> = JSON.parse(record.edit_status || '{}');
    editStatus[stepId] = true;

    await databaseService.aiAnalysis.update(analysisId, {
      analysis_result: JSON.stringify(steps),
      edit_status: JSON.stringify(editStatus)
    });

    return true;
  }

  /**
   * 重置步骤为AI原始结果
   * 
   * Requirements: 2.5 - 支持「重置为AI结果」操作
   */
  async resetStepToOriginal(
    analysisId: string,
    stepId: string
  ): Promise<boolean> {
    const record = await databaseService.aiAnalysis.getById(analysisId);
    if (!record) {
      return false;
    }

    const steps: AnalysisResultItem[] = JSON.parse(record.analysis_result || '[]');
    const stepIndex = steps.findIndex(s => s.stepId === stepId);
    
    if (stepIndex === -1) {
      return false;
    }

    // 重置为原始内容
    steps[stepIndex].content = steps[stepIndex].originalContent;
    steps[stepIndex].isEdited = false;

    // 更新编辑状态
    const editStatus: Record<string, boolean> = JSON.parse(record.edit_status || '{}');
    editStatus[stepId] = false;

    await databaseService.aiAnalysis.update(analysisId, {
      analysis_result: JSON.stringify(steps),
      edit_status: JSON.stringify(editStatus)
    });

    return true;
  }

  /**
   * 清空步骤内容
   * 
   * Requirements: 2.5 - 支持「清空内容」操作
   */
  async clearStepContent(
    analysisId: string,
    stepId: string
  ): Promise<boolean> {
    const record = await databaseService.aiAnalysis.getById(analysisId);
    if (!record) {
      return false;
    }

    const steps: AnalysisResultItem[] = JSON.parse(record.analysis_result || '[]');
    const stepIndex = steps.findIndex(s => s.stepId === stepId);
    
    if (stepIndex === -1) {
      return false;
    }

    // 清空内容并标记为已编辑
    steps[stepIndex].content = '';
    steps[stepIndex].isEdited = true;

    // 更新编辑状态
    const editStatus: Record<string, boolean> = JSON.parse(record.edit_status || '{}');
    editStatus[stepId] = true;

    await databaseService.aiAnalysis.update(analysisId, {
      analysis_result: JSON.stringify(steps),
      edit_status: JSON.stringify(editStatus)
    });

    return true;
  }

  /**
   * 删除分析结果
   */
  async deleteAnalysisResult(analysisId: string): Promise<boolean> {
    // 清除故事单元的关联
    const records = await databaseService.storyUnits.query({ ai_analysis_id: analysisId });
    for (const record of records) {
      await databaseService.storyUnits.update(record.id, { ai_analysis_id: undefined });
    }

    return await databaseService.aiAnalysis.delete(analysisId);
  }

  /**
   * 重新分析故事单元
   * 删除旧的分析结果并重新分析
   */
  async reanalyzeStoryUnit(
    storyUnitId: string,
    templateId?: string,
    onProgress?: AnalysisProgressCallback,
    onStream?: StreamCallback
  ): Promise<StoryUnitAnalysisResult> {
    // 获取现有分析结果
    const existingResult = await this.getAnalysisResult(storyUnitId);
    
    // 如果存在旧的分析结果，删除它
    if (existingResult) {
      await this.deleteAnalysisResult(existingResult.id);
    }

    // 使用原来的模板或新指定的模板
    const useTemplateId = templateId || existingResult?.templateId || 'seven-step-story';

    // 重新分析
    return await this.analyzeStoryUnit(storyUnitId, useTemplateId, onProgress, onStream);
  }

  /**
   * 获取书籍的所有分析结果
   */
  async getBookAnalysisResults(bookId: string): Promise<StoryUnitAnalysisResult[]> {
    const records = await databaseService.aiAnalysis.query({ book_id: bookId });
    const results: StoryUnitAnalysisResult[] = [];

    for (const record of records) {
      // 查找关联的故事单元
      const storyUnits = await databaseService.storyUnits.query({ ai_analysis_id: record.id });
      const storyUnitId = storyUnits[0]?.id || '';

      const template = getTemplateById(record.template_type);
      const steps: AnalysisResultItem[] = JSON.parse(record.analysis_result || '[]');

      results.push({
        id: record.id,
        storyUnitId,
        templateId: record.template_type,
        templateName: template?.name || record.template_type,
        steps,
        status: record.status,
        errorMessage: record.error_message,
        createTime: record.create_time,
        updateTime: record.update_time
      });
    }

    return results;
  }
}
