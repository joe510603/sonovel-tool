/**
 * AI分析面板
 * 提供故事单元AI分析的UI界面
 * 
 * 功能：
 * - 分析进度显示+流式响应
 * - 分析结果编辑界面
 * - 「未找到相关情节 → 点击编辑」提示
 * - 「重置为AI结果」和「清空内容」操作
 * 
 * Requirements: 2.2, 2.3, 2.4, 2.5
 */

import { App, Modal, Setting, DropdownComponent, TextAreaComponent } from 'obsidian';
import { LLMService } from '../services/LLMService';
import { 
  StoryUnitAnalysisService, 
  StoryUnitAnalysisResult,
  AnalysisResultItem 
} from '../services/StoryUnitAnalysisService';
import { 
  getAllTemplates, 
  getTemplateById,
  AnalysisTemplate 
} from '../services/AnalysisTemplates';
import { StoryUnitRecord } from '../types/database';
import { showSuccess, showError, showWarning } from './NotificationUtils';

/**
 * AI分析面板配置
 */
export interface AIAnalysisPanelConfig {
  /** 故事单元 */
  storyUnit: StoryUnitRecord;
  /** LLM服务 */
  llmService: LLMService;
  /** 分析完成回调 */
  onAnalysisComplete?: (result: StoryUnitAnalysisResult) => void;
  /** 结果更新回调 */
  onResultUpdated?: (result: StoryUnitAnalysisResult) => void;
}

/**
 * AI分析面板
 */
export class AIAnalysisPanel extends Modal {
  private config: AIAnalysisPanelConfig;
  private analysisService: StoryUnitAnalysisService;
  
  // 状态
  private isAnalyzing = false;
  private currentResult: StoryUnitAnalysisResult | null = null;
  private selectedTemplateId = 'seven-step-story';
  private customPrompt = ''; // 自定义提示词
  
  // UI元素
  private progressContainer: HTMLElement | null = null;
  private resultContainer: HTMLElement | null = null;
  private streamOutput: HTMLElement | null = null;

  constructor(app: App, config: AIAnalysisPanelConfig) {
    super(app);
    this.config = config;
    this.analysisService = new StoryUnitAnalysisService(app, config.llmService);
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nc-ai-panel');

    // 标题
    const header = contentEl.createDiv({ cls: 'nc-ai-panel-header' });
    header.createEl('h2', { text: '🤖 AI 故事拆解' });
    header.createEl('p', { 
      text: `故事单元: ${this.config.storyUnit.title}`,
      cls: 'nc-ai-panel-subtitle'
    });

    // 加载现有分析结果
    await this.loadExistingResult();

    if (this.currentResult && this.currentResult.status === 'completed') {
      // 显示已有结果
      this.renderResultView(contentEl);
    } else {
      // 显示分析配置界面
      this.renderConfigView(contentEl);
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }

  /**
   * 加载现有分析结果
   */
  private async loadExistingResult(): Promise<void> {
    this.currentResult = await this.analysisService.getAnalysisResult(
      this.config.storyUnit.id
    );
  }

  /**
   * 渲染配置界面
   */
  private renderConfigView(container: HTMLElement): void {
    const configSection = container.createDiv({ cls: 'nc-ai-config' });

    // 模板选择
    new Setting(configSection)
      .setName('分析模板')
      .setDesc('选择用于分析的模板方法')
      .addDropdown((dropdown: DropdownComponent) => {
        const templates = getAllTemplates();
        for (const template of templates) {
          dropdown.addOption(template.id, template.name);
        }
        dropdown.setValue(this.selectedTemplateId);
        dropdown.onChange((value: string) => {
          this.selectedTemplateId = value;
          this.updateTemplateDescription(configSection);
        });
      });

    // 模板描述
    const descContainer = configSection.createDiv({ cls: 'nc-ai-template-desc' });
    descContainer.id = 'template-desc';
    this.updateTemplateDescription(configSection);

    // 自定义提示词
    const customPromptSection = configSection.createDiv({ cls: 'nc-ai-custom-prompt-section' });
    customPromptSection.createEl('label', { 
      text: '📝 自定义提示词（可选）',
      cls: 'nc-ai-custom-prompt-label'
    });
    customPromptSection.createEl('p', { 
      text: '添加额外的分析要求，会附加到每个步骤的提示词中',
      cls: 'nc-ai-custom-prompt-hint'
    });
    
    const customPromptTextarea = customPromptSection.createEl('textarea', {
      cls: 'nc-ai-custom-prompt-input',
      attr: { 
        placeholder: '例如：请特别关注主角的心理变化，分析时多引用原文对话...',
        rows: '3'
      }
    });
    customPromptTextarea.value = this.customPrompt;
    customPromptTextarea.addEventListener('input', () => {
      this.customPrompt = customPromptTextarea.value;
    });

    // 章节范围信息
    const rangeInfo = configSection.createDiv({ cls: 'nc-ai-range-info' });
    rangeInfo.createSpan({ 
      text: `📖 分析范围: 第${this.config.storyUnit.chapter_start}章 - 第${this.config.storyUnit.chapter_end}章` 
    });

    // 进度显示区域
    this.progressContainer = container.createDiv({ cls: 'nc-ai-progress', attr: { style: 'display: none;' } });
    
    // 流式输出区域
    this.streamOutput = this.progressContainer.createDiv({ cls: 'nc-ai-stream-output' });

    // 按钮
    const buttons = container.createDiv({ cls: 'nc-ai-buttons' });
    
    buttons.createEl('button', { text: '取消', cls: 'nc-btn' })
      .addEventListener('click', () => this.close());
    
    const analyzeBtn = buttons.createEl('button', { 
      text: '🚀 开始分析', 
      cls: 'nc-btn nc-btn-primary' 
    });
    analyzeBtn.addEventListener('click', () => this.startAnalysis());
  }

  /**
   * 更新模板描述
   */
  private updateTemplateDescription(container: HTMLElement): void {
    const descEl = container.querySelector('#template-desc');
    if (!descEl) return;

    const template = getTemplateById(this.selectedTemplateId);
    if (template) {
      descEl.empty();
      descEl.createEl('p', { text: template.description });
      
      const stepsList = descEl.createEl('div', { cls: 'nc-ai-steps-preview' });
      stepsList.createEl('strong', { text: '分析步骤: ' });
      stepsList.createSpan({ 
        text: template.steps.map(s => s.name).join(' → ') 
      });
    }
  }

  /**
   * 开始分析
   */
  private async startAnalysis(): Promise<void> {
    if (this.isAnalyzing) return;
    
    this.isAnalyzing = true;
    
    // 显示进度区域
    if (this.progressContainer) {
      this.progressContainer.style.display = 'block';
    }
    if (this.streamOutput) {
      this.streamOutput.empty();
    }

    // 创建进度列表
    const template = getTemplateById(this.selectedTemplateId);
    if (!template) {
      showError('模板不存在');
      this.isAnalyzing = false;
      return;
    }

    const progressList = this.progressContainer?.createDiv({ cls: 'nc-ai-progress-list' });
    const stepElements: Map<string, HTMLElement> = new Map();

    for (const step of template.steps) {
      const stepEl = progressList?.createDiv({ cls: 'nc-ai-progress-step nc-ai-step-pending' });
      stepEl?.createSpan({ text: '⏳', cls: 'nc-ai-step-icon' });
      stepEl?.createSpan({ text: step.name, cls: 'nc-ai-step-name' });
      if (stepEl) {
        stepElements.set(step.name, stepEl);
      }
    }

    // 流式输出区域
    const streamSection = this.progressContainer?.createDiv({ cls: 'nc-ai-stream-section' });
    streamSection?.createEl('h4', { text: '📝 实时输出' });
    const streamContent = streamSection?.createDiv({ cls: 'nc-ai-stream-content' });

    try {
      const result = await this.analysisService.analyzeStoryUnit(
        this.config.storyUnit.id,
        this.selectedTemplateId,
        // 进度回调
        (step, status, message) => {
          const stepEl = stepElements.get(step);
          if (stepEl) {
            stepEl.className = `nc-ai-progress-step nc-ai-step-${status}`;
            const icon = stepEl.querySelector('.nc-ai-step-icon');
            if (icon) {
              icon.textContent = status === 'running' ? '🔄' 
                : status === 'completed' ? '✅' 
                : status === 'error' ? '❌' : '⏳';
            }
          }
        },
        // 流式回调
        (chunk) => {
          if (streamContent) {
            streamContent.textContent += chunk;
            streamContent.scrollTop = streamContent.scrollHeight;
          }
        },
        // 自定义提示词
        this.customPrompt || undefined
      );

      this.currentResult = result;
      showSuccess('分析完成！');
      this.config.onAnalysisComplete?.(result);
      
      // 切换到结果视图
      this.contentEl.empty();
      await this.onOpen();
      
    } catch (error) {
      showError('分析失败', error instanceof Error ? error.message : '未知错误');
    } finally {
      this.isAnalyzing = false;
    }
  }

  /**
   * 渲染结果视图
   */
  private renderResultView(container: HTMLElement): void {
    if (!this.currentResult) return;

    // 工具栏
    const toolbar = container.createDiv({ cls: 'nc-ai-result-toolbar' });
    
    toolbar.createEl('button', { text: '🔄 重新分析', cls: 'nc-btn' })
      .addEventListener('click', () => this.reanalyze());
    
    toolbar.createEl('button', { text: '📋 复制全部', cls: 'nc-btn' })
      .addEventListener('click', () => this.copyAllResults());

    // 模板信息
    const templateInfo = container.createDiv({ cls: 'nc-ai-template-info' });
    templateInfo.createSpan({ text: `📊 使用模板: ${this.currentResult.templateName}` });

    // 结果列表
    this.resultContainer = container.createDiv({ cls: 'nc-ai-result-list' });
    
    for (const step of this.currentResult.steps) {
      this.renderStepResult(this.resultContainer, step);
    }
  }

  /**
   * 渲染单个步骤结果
   */
  private renderStepResult(container: HTMLElement, step: AnalysisResultItem): void {
    const stepSection = container.createDiv({ cls: 'nc-ai-result-step' });
    
    // 步骤标题
    const header = stepSection.createDiv({ cls: 'nc-ai-step-header' });
    header.createEl('h4', { text: step.stepName });
    
    // 编辑状态标记
    if (step.isEdited) {
      header.createSpan({ text: '✏️ 已编辑', cls: 'nc-ai-edited-badge' });
    }

    // 内容区域
    const contentWrapper = stepSection.createDiv({ cls: 'nc-ai-step-content-wrapper' });
    
    // 检查是否为空或未找到
    const isEmpty = !step.content || step.content.includes('未找到相关情节');
    
    if (isEmpty) {
      // 显示提示
      const emptyHint = contentWrapper.createDiv({ cls: 'nc-ai-empty-hint' });
      emptyHint.createSpan({ text: '未找到相关情节 → ' });
      const editLink = emptyHint.createEl('a', { text: '点击编辑', href: '#' });
      editLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.openStepEditor(step);
      });
    } else {
      // 显示内容
      const content = contentWrapper.createDiv({ cls: 'nc-ai-step-content' });
      content.textContent = step.content;
    }

    // 操作按钮
    const actions = stepSection.createDiv({ cls: 'nc-ai-step-actions' });
    
    actions.createEl('button', { text: '✏️ 编辑', cls: 'nc-btn nc-btn-sm' })
      .addEventListener('click', () => this.openStepEditor(step));
    
    if (step.isEdited && step.originalContent) {
      actions.createEl('button', { text: '↩️ 重置为AI结果', cls: 'nc-btn nc-btn-sm' })
        .addEventListener('click', () => this.resetStep(step));
    }
    
    actions.createEl('button', { text: '🗑️ 清空', cls: 'nc-btn nc-btn-sm nc-btn-danger' })
      .addEventListener('click', () => this.clearStep(step));
  }

  /**
   * 打开步骤编辑器
   */
  private openStepEditor(step: AnalysisResultItem): void {
    const modal = new StepEditorModal(this.app, {
      step,
      onSave: async (newContent) => {
        if (!this.currentResult) return;
        
        await this.analysisService.updateStepContent(
          this.currentResult.id,
          step.stepId,
          newContent
        );
        
        // 更新本地状态
        step.content = newContent;
        step.isEdited = true;
        
        // 刷新显示
        this.refreshResultView();
        
        showSuccess('内容已更新');
        this.config.onResultUpdated?.(this.currentResult);
      }
    });
    modal.open();
  }

  /**
   * 重置步骤为AI原始结果
   */
  private async resetStep(step: AnalysisResultItem): Promise<void> {
    if (!this.currentResult) return;
    
    const success = await this.analysisService.resetStepToOriginal(
      this.currentResult.id,
      step.stepId
    );
    
    if (success) {
      step.content = step.originalContent;
      step.isEdited = false;
      this.refreshResultView();
      showSuccess('已重置为AI结果');
      this.config.onResultUpdated?.(this.currentResult);
    }
  }

  /**
   * 清空步骤内容
   */
  private async clearStep(step: AnalysisResultItem): Promise<void> {
    if (!this.currentResult) return;
    
    const success = await this.analysisService.clearStepContent(
      this.currentResult.id,
      step.stepId
    );
    
    if (success) {
      step.content = '';
      step.isEdited = true;
      this.refreshResultView();
      showSuccess('内容已清空');
      this.config.onResultUpdated?.(this.currentResult);
    }
  }

  /**
   * 重新分析
   */
  private async reanalyze(): Promise<void> {
    // 清空当前结果，显示配置界面
    this.currentResult = null;
    this.contentEl.empty();
    await this.onOpen();
  }

  /**
   * 复制全部结果
   */
  private copyAllResults(): void {
    if (!this.currentResult) return;
    
    let text = `# ${this.config.storyUnit.title} - AI分析结果\n\n`;
    text += `模板: ${this.currentResult.templateName}\n\n`;
    
    for (const step of this.currentResult.steps) {
      text += `## ${step.stepName}\n\n`;
      text += step.content || '（无内容）';
      text += '\n\n';
    }
    
    navigator.clipboard.writeText(text);
    showSuccess('已复制到剪贴板');
  }

  /**
   * 刷新结果视图
   */
  private refreshResultView(): void {
    if (!this.resultContainer || !this.currentResult) return;
    
    this.resultContainer.empty();
    for (const step of this.currentResult.steps) {
      this.renderStepResult(this.resultContainer, step);
    }
  }
}


/**
 * 步骤内容编辑器模态框
 */
class StepEditorModal extends Modal {
  private config: {
    step: AnalysisResultItem;
    onSave: (content: string) => Promise<void>;
  };
  
  private content: string;
  private textArea: TextAreaComponent | null = null;

  constructor(app: App, config: typeof StepEditorModal.prototype.config) {
    super(app);
    this.config = config;
    this.content = config.step.content;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nc-step-editor');

    contentEl.createEl('h3', { text: `编辑: ${this.config.step.stepName}` });

    // 编辑区域
    const editorContainer = contentEl.createDiv({ cls: 'nc-step-editor-container' });
    
    new Setting(editorContainer)
      .addTextArea((textArea: TextAreaComponent) => {
        this.textArea = textArea;
        textArea.setValue(this.content);
        textArea.inputEl.rows = 15;
        textArea.inputEl.style.width = '100%';
        textArea.inputEl.style.minHeight = '300px';
        textArea.onChange((value: string) => {
          this.content = value;
        });
      });

    // 提示信息
    if (this.config.step.isEdited) {
      const hint = contentEl.createDiv({ cls: 'nc-step-editor-hint' });
      hint.createSpan({ text: '💡 此内容已被手动编辑' });
    }

    // 按钮
    const buttons = contentEl.createDiv({ cls: 'nc-step-editor-buttons' });
    
    buttons.createEl('button', { text: '取消', cls: 'nc-btn' })
      .addEventListener('click', () => this.close());
    
    buttons.createEl('button', { text: '保存', cls: 'nc-btn nc-btn-primary' })
      .addEventListener('click', () => this.save());
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async save(): Promise<void> {
    try {
      await this.config.onSave(this.content);
      this.close();
    } catch (error) {
      showError('保存失败', error instanceof Error ? error.message : '未知错误');
    }
  }
}


/**
 * 模板选择器模态框
 * 用于快速选择分析模板
 */
export class TemplatePickerModal extends Modal {
  private onSelect: (templateId: string) => void;

  constructor(app: App, onSelect: (templateId: string) => void) {
    super(app);
    this.onSelect = onSelect;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nc-template-picker');

    contentEl.createEl('h2', { text: '📋 选择分析模板' });

    const templates = getAllTemplates();
    const list = contentEl.createDiv({ cls: 'nc-template-list' });

    for (const template of templates) {
      const item = list.createDiv({ cls: 'nc-template-item' });
      
      const header = item.createDiv({ cls: 'nc-template-item-header' });
      header.createEl('h4', { text: template.name });
      if (template.isBuiltin) {
        header.createSpan({ text: '内置', cls: 'nc-template-badge' });
      }
      
      item.createEl('p', { text: template.description, cls: 'nc-template-desc' });
      
      const steps = item.createDiv({ cls: 'nc-template-steps' });
      steps.createSpan({ text: `${template.steps.length} 个分析步骤` });
      
      item.addEventListener('click', () => {
        this.onSelect(template.id);
        this.close();
      });
    }

    // 取消按钮
    const buttons = contentEl.createDiv({ cls: 'nc-template-buttons' });
    buttons.createEl('button', { text: '取消', cls: 'nc-btn' })
      .addEventListener('click', () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}


/**
 * 分析结果预览面板
 * 用于在故事单元列表中快速预览分析结果
 */
export class AnalysisPreviewPanel {
  private container: HTMLElement;
  private result: StoryUnitAnalysisResult | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /**
   * 显示分析结果预览
   */
  show(result: StoryUnitAnalysisResult): void {
    this.result = result;
    this.render();
  }

  /**
   * 清空预览
   */
  clear(): void {
    this.result = null;
    this.container.empty();
  }

  /**
   * 渲染预览内容
   */
  private render(): void {
    this.container.empty();
    
    if (!this.result) {
      this.container.createDiv({ cls: 'nc-preview-empty', text: '暂无分析结果' });
      return;
    }

    // 标题
    const header = this.container.createDiv({ cls: 'nc-preview-header' });
    header.createEl('h4', { text: this.result.templateName });
    
    // 状态
    const statusBadge = header.createSpan({ cls: `nc-preview-status nc-status-${this.result.status}` });
    statusBadge.textContent = this.getStatusText(this.result.status);

    // 步骤摘要
    const summary = this.container.createDiv({ cls: 'nc-preview-summary' });
    
    for (const step of this.result.steps) {
      const stepItem = summary.createDiv({ cls: 'nc-preview-step' });
      
      const stepHeader = stepItem.createDiv({ cls: 'nc-preview-step-header' });
      stepHeader.createSpan({ text: step.stepName });
      
      if (step.isEdited) {
        stepHeader.createSpan({ text: '✏️', cls: 'nc-preview-edited' });
      }
      
      // 内容预览（截取前100字符）
      const preview = step.content?.substring(0, 100) || '（无内容）';
      stepItem.createDiv({ 
        cls: 'nc-preview-step-content',
        text: preview + (step.content && step.content.length > 100 ? '...' : '')
      });
    }
  }

  /**
   * 获取状态文本
   */
  private getStatusText(status: string): string {
    const statusMap: Record<string, string> = {
      pending: '待分析',
      analyzing: '分析中',
      completed: '已完成',
      failed: '失败'
    };
    return statusMap[status] || status;
  }
}

export { StepEditorModal };
