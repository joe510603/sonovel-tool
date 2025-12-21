/**
 * AnalysisView - 分析视图（侧边栏）
 * 
 * 功能：
 * - 作为侧边栏视图，分析时不阻塞文档操作
 * - 模式选择器（快速/标准/深度）
 * - 小说类型选择器
 * - 显示分析进度和实时结果
 * - 支持暂停和终止
 */

import { ItemView, WorkspaceLeaf, Setting, DropdownComponent, TextComponent, TFile } from 'obsidian';
import {
  AnalysisMode,
  NovelType,
  AnalysisConfig,
  AnalysisProgress,
  AnalysisResult,
  ParsedBook,
  NovelCraftSettings,
  TokenUsage,
  AnalysisMetadata,
  IncrementalMode
} from '../types';
import { AnalysisService, AnalysisController, AnalysisStoppedError } from '../services/AnalysisService';
import { ParserFactory } from '../core/ParserFactory';
import { LLMService } from '../services/LLMService';
import { MetadataService } from '../services/MetadataService';
import { CheckpointService, AnalysisCheckpoint } from '../services/CheckpointService';
import { showSuccess, showWarning, handleError, showInfo } from './NotificationUtils';
import { getAllNovelTypes } from '../services/PromptTemplates';
import { TokenTracker, TokenEstimate } from '../services/TokenTracker';

export const ANALYSIS_VIEW_TYPE = 'novel-craft-analysis-view';

/**
 * 分析模式配置
 */
const ANALYSIS_MODES: { value: AnalysisMode; label: string; description: string }[] = [
  { value: 'quick', label: '快速模式', description: '故事梗概、核心人物、主要写作技法' },
  { value: 'standard', label: '标准模式', description: '快速模式 + 情绪曲线、章节结构、伏笔分析' },
  { value: 'deep', label: '深度模式', description: '标准模式 + 逐章拆解、写作复盘' }
];

interface StageResultItem {
  stage: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  message: string;
  result?: string;
  startTime?: number;
  endTime?: number;
  generatedFile?: string;
}

/**
 * 分批分析建议阈值（章节数）
 * Requirements: 1.3.1.1
 */
const BATCH_SUGGESTION_THRESHOLD = 50;

/**
 * 分批建议配置
 */
interface BatchSuggestion {
  shouldBatch: boolean;
  recommendedBatchSize: number;
  totalBatches: number;
  reason: string;
}

export class AnalysisView extends ItemView {
  private settings: NovelCraftSettings;
  private llmService: LLMService;
  private metadataService: MetadataService;
  private checkpointService: CheckpointService;
  private epubPath: string = '';
  private onAnalysisComplete?: (result: AnalysisResult, book: ParsedBook) => void;
  private onTokenUsageUpdate?: (records: import('../types').TokenUsageRecord[]) => void;

  // 状态
  private selectedMode: AnalysisMode;
  private selectedNovelType: NovelType;
  private customTypeName: string = '';
  private customFocus: string[] = [];
  private isAnalyzing = false;
  private stageResults: StageResultItem[] = [];
  private analyzeAllChapters = true;
  private chapterStart = 1;
  private chapterEnd = 50;
  private totalChapters = 0;
  private analysisController: AnalysisController | null = null;
  private currentBook: ParsedBook | null = null;
  private tokenTracker: TokenTracker;
  private sessionTokenUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  private currentMetadata: AnalysisMetadata | null = null;
  private currentCheckpoint: AnalysisCheckpoint | null = null;
  private selectedIncrementalMode: IncrementalMode | null = null;

  // UI 元素
  private mainContent: HTMLElement;
  private welcomeSection: HTMLElement;
  private configSection: HTMLElement;
  private progressSection: HTMLElement;
  private resultsSection: HTMLElement;
  private bookInfoEl: HTMLElement;
  private metadataStatusEl: HTMLElement;
  private checkpointStatusEl: HTMLElement;
  private incrementalModeSection: HTMLElement;
  private chapterRangeSection: HTMLElement;
  private batchSuggestionEl: HTMLElement;
  private startButton: HTMLButtonElement;
  private customTypeContainer: HTMLElement;
  private controlButtons: HTMLElement;
  private pauseButton: HTMLButtonElement;
  private stopButton: HTMLButtonElement;
  private progressStage: HTMLElement;
  private progressFill: HTMLElement;
  private progressText: HTMLElement;
  private tokenEstimateEl: HTMLElement;
  private tokenUsageEl: HTMLElement;

  constructor(
    leaf: WorkspaceLeaf,
    settings: NovelCraftSettings,
    llmService: LLMService,
    onTokenUsageUpdate?: (records: import('../types').TokenUsageRecord[]) => void
  ) {
    super(leaf);
    this.settings = settings;
    this.llmService = llmService;
    this.metadataService = new MetadataService(this.app);
    this.checkpointService = new CheckpointService(this.app);
    this.selectedMode = settings.defaultAnalysisMode;
    this.selectedNovelType = settings.defaultNovelType;
    this.onTokenUsageUpdate = onTokenUsageUpdate;
    this.tokenTracker = new TokenTracker(settings.tokenUsageRecords);
    
    // 设置 Token 使用回调
    this.llmService.setOnTokenUsage((usage, providerId, model) => {
      this.sessionTokenUsage.promptTokens += usage.promptTokens;
      this.sessionTokenUsage.completionTokens += usage.completionTokens;
      this.sessionTokenUsage.totalTokens += usage.totalTokens;
      this.updateTokenUsageDisplay();
    });
  }

  getViewType(): string {
    return ANALYSIS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return '拆书分析';
  }

  getIcon(): string {
    return 'bar-chart-2';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('nc-analysis-view');

    this.mainContent = container.createDiv({ cls: 'nc-analysis-content' });
    
    // 欢迎界面（未选择书籍时显示）
    this.welcomeSection = this.mainContent.createDiv({ cls: 'nc-welcome-section' });
    this.createWelcomeSection();
    
    // 配置区域
    this.configSection = this.mainContent.createDiv({ cls: 'nc-config-section' });
    this.configSection.style.display = 'none';
    
    // 进度区域
    this.progressSection = this.mainContent.createDiv({ cls: 'nc-progress-section' });
    this.progressSection.style.display = 'none';
    
    // 结果区域
    this.resultsSection = this.mainContent.createDiv({ cls: 'nc-results-section' });
    this.resultsSection.style.display = 'none';
  }

  /**
   * 创建欢迎界面
   */
  private createWelcomeSection(): void {
    this.welcomeSection.createEl('div', { 
      text: '📊', 
      cls: 'nc-welcome-icon' 
    });
    this.welcomeSection.createEl('h3', { 
      text: '拆书分析', 
      cls: 'nc-welcome-title' 
    });
    this.welcomeSection.createEl('p', { 
      text: '从主面板选择一本书开始分析', 
      cls: 'nc-welcome-hint' 
    });
  }

  /**
   * 设置要分析的书籍
   */
  async setBook(epubPath: string, onComplete?: (result: AnalysisResult, book: ParsedBook) => void): Promise<void> {
    this.epubPath = epubPath;
    this.onAnalysisComplete = onComplete;
    
    // 重置状态
    this.isAnalyzing = false;
    this.stageResults = [];
    this.analysisController = null;
    this.currentBook = null;
    this.sessionTokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    this.currentMetadata = null;
    this.currentCheckpoint = null;
    this.selectedIncrementalMode = null;
    
    // 隐藏欢迎界面，显示配置
    this.welcomeSection.style.display = 'none';
    this.configSection.style.display = 'block';
    this.progressSection.style.display = 'none';
    this.resultsSection.style.display = 'none';
    
    // 重建配置界面
    this.configSection.empty();
    await this.createConfigSection();
  }

  /**
   * 创建配置界面
   */
  private async createConfigSection(): Promise<void> {
    const bookName = this.getBookName();
    
    // 标题
    this.configSection.createEl('h3', { 
      text: `📊 ${bookName}`, 
      cls: 'nc-section-title' 
    });
    
    // 书籍信息
    this.bookInfoEl = this.configSection.createDiv({ cls: 'nc-book-info-section' });
    this.bookInfoEl.createSpan({ text: '加载中...', cls: 'nc-loading-hint' });
    
    // 分析元数据状态显示区域
    // Requirements: 1.1.1.1, 1.1.1.2, 1.1.1.3, 1.1.1.4
    this.metadataStatusEl = this.configSection.createDiv({ cls: 'nc-metadata-status-section' });
    
    // 断点状态显示区域
    // Requirements: 1.2.2.4
    this.checkpointStatusEl = this.configSection.createDiv({ cls: 'nc-checkpoint-status-section' });
    
    // 增量分析模式选择区域
    // Requirements: 1.1.2.1, 1.1.2.2, 1.1.2.3, 1.1.2.4, 1.1.2.5
    this.incrementalModeSection = this.configSection.createDiv({ cls: 'nc-incremental-mode-section' });
    this.incrementalModeSection.style.display = 'none';
    
    // 模式选择
    this.createModeSelector();
    
    // 类型选择
    this.createTypeSelector();
    
    // 章节范围
    this.chapterRangeSection = this.configSection.createDiv({ cls: 'nc-chapter-range-wrapper' });
    this.createChapterRangeSelector();
    
    // 分批建议区域
    // Requirements: 1.3.1.1, 1.3.1.2
    this.batchSuggestionEl = this.configSection.createDiv({ cls: 'nc-batch-suggestion-section' });
    this.batchSuggestionEl.style.display = 'none';
    
    // Token 预估显示
    this.tokenEstimateEl = this.configSection.createDiv({ cls: 'nc-token-estimate' });
    
    // 按钮区域
    const buttonArea = this.configSection.createDiv({ cls: 'nc-button-area' });
    
    this.startButton = buttonArea.createEl('button', {
      text: '开始分析',
      cls: 'nc-btn nc-btn-primary nc-btn-large'
    });
    this.startButton.addEventListener('click', () => this.startAnalysis());
    
    // 控制按钮
    this.controlButtons = buttonArea.createDiv({ cls: 'nc-control-buttons' });
    this.controlButtons.style.display = 'none';
    
    this.pauseButton = this.controlButtons.createEl('button', {
      text: '⏸️ 暂停',
      cls: 'nc-btn nc-pause-btn'
    });
    this.pauseButton.addEventListener('click', () => this.togglePause());
    
    this.stopButton = this.controlButtons.createEl('button', {
      text: '⏹️ 终止',
      cls: 'nc-btn nc-stop-btn'
    });
    this.stopButton.addEventListener('click', () => this.stopAnalysis());
    
    // 加载书籍信息
    await this.loadBookInfo();
    
    // 加载分析元数据
    await this.loadAnalysisMetadata();
  }

  private getBookName(): string {
    const parts = this.epubPath.split('/');
    const filename = parts[parts.length - 1];
    return filename.replace(/\.epub$/i, '');
  }

  private createModeSelector(): void {
    const container = this.configSection.createDiv({ cls: 'nc-mode-selector' });
    container.createEl('div', { text: '分析模式', cls: 'nc-label' });
    
    const options = container.createDiv({ cls: 'nc-mode-options' });
    
    for (const mode of ANALYSIS_MODES) {
      const option = options.createDiv({ cls: 'nc-mode-option' });
      
      const radio = option.createEl('input', {
        type: 'radio',
        attr: { name: 'analysis-mode', value: mode.value, id: `mode-${mode.value}` }
      });
      
      if (mode.value === this.selectedMode) {
        radio.checked = true;
      }

      const label = option.createEl('label', { attr: { for: `mode-${mode.value}` } });
      label.createSpan({ text: mode.label, cls: 'nc-mode-label' });
      label.createSpan({ text: mode.description, cls: 'nc-mode-desc' });

      radio.addEventListener('change', () => {
        if (radio.checked) {
          this.selectedMode = mode.value;
          this.updateTokenEstimate();
        }
      });
    }
  }

  private createTypeSelector(): void {
    const container = this.configSection.createDiv({ cls: 'nc-type-selector' });
    
    new Setting(container)
      .setName('小说类型')
      .addDropdown((dropdown: DropdownComponent) => {
        for (const type of getAllNovelTypes()) {
          dropdown.addOption(type.value, type.label);
        }
        dropdown.setValue(this.selectedNovelType);
        dropdown.onChange((value: string) => {
          this.selectedNovelType = value as NovelType;
          this.updateCustomTypeVisibility();
        });
      });
    
    // 自定义类型输入
    this.customTypeContainer = container.createDiv({ cls: 'nc-custom-type-input' });
    this.customTypeContainer.style.display = 'none';
    
    new Setting(this.customTypeContainer)
      .setName('自定义类型名称')
      .setDesc('输入小说的具体类型，如：末日、无限流、系统文等')
      .addText((text: TextComponent) => {
        text.setPlaceholder('例如：末日求生');
        text.onChange((value: string) => {
          this.customTypeName = value.trim();
        });
      });
    
    this.updateCustomTypeVisibility();
  }

  private updateCustomTypeVisibility(): void {
    if (this.customTypeContainer) {
      this.customTypeContainer.style.display = 
        this.selectedNovelType === 'custom' ? 'block' : 'none';
    }
  }

  private createChapterRangeSelector(): void {
    const container = this.chapterRangeSection.createDiv({ cls: 'nc-range-selector' });
    
    const setting = new Setting(container)
      .setName('分析范围')
      .setDesc('选择要分析的章节范围');

    const toggleContainer = setting.controlEl.createDiv({ cls: 'nc-range-toggle' });
    
    const allBtn = toggleContainer.createEl('button', {
      text: '全书',
      cls: 'nc-range-btn nc-range-btn-active'
    });
    
    const customBtn = toggleContainer.createEl('button', {
      text: '自定义',
      cls: 'nc-range-btn'
    });

    const customRange = container.createDiv({ cls: 'nc-custom-range' });
    customRange.style.display = 'none';

    const inputs = customRange.createDiv({ cls: 'nc-range-inputs' });
    
    const startGroup = inputs.createDiv({ cls: 'nc-range-input-group' });
    startGroup.createSpan({ text: '从第' });
    const startInput = startGroup.createEl('input', {
      type: 'number',
      cls: 'nc-range-input',
      attr: { min: '1', value: '1' }
    }) as HTMLInputElement;
    startGroup.createSpan({ text: '章' });

    const endGroup = inputs.createDiv({ cls: 'nc-range-input-group' });
    endGroup.createSpan({ text: '到第' });
    const endInput = endGroup.createEl('input', {
      type: 'number',
      cls: 'nc-range-input',
      attr: { min: '1', value: '50' }
    }) as HTMLInputElement;
    endGroup.createSpan({ text: '章' });

    const quickBtns = customRange.createDiv({ cls: 'nc-quick-range-btns' });
    [10, 30, 50, 100].forEach(n => {
      const btn = quickBtns.createEl('button', { text: `前${n}章`, cls: 'nc-quick-btn' });
      btn.addEventListener('click', () => {
        startInput.value = '1';
        endInput.value = String(Math.min(n, this.totalChapters || n));
        this.chapterStart = 1;
        this.chapterEnd = Math.min(n, this.totalChapters || n);
        this.updateTokenEstimate();
      });
    });

    allBtn.addEventListener('click', () => {
      this.analyzeAllChapters = true;
      allBtn.addClass('nc-range-btn-active');
      customBtn.removeClass('nc-range-btn-active');
      customRange.style.display = 'none';
      this.updateTokenEstimate();
    });

    customBtn.addEventListener('click', () => {
      this.analyzeAllChapters = false;
      customBtn.addClass('nc-range-btn-active');
      allBtn.removeClass('nc-range-btn-active');
      customRange.style.display = 'block';
      this.updateTokenEstimate();
    });

    startInput.addEventListener('change', () => {
      this.chapterStart = Math.max(1, parseInt(startInput.value) || 1);
      startInput.value = String(this.chapterStart);
      this.updateTokenEstimate();
    });

    endInput.addEventListener('change', () => {
      const max = this.totalChapters || 9999;
      this.chapterEnd = Math.min(max, Math.max(this.chapterStart, parseInt(endInput.value) || 50));
      endInput.value = String(this.chapterEnd);
      this.updateTokenEstimate();
    });

    (this as any)._endInput = endInput;
  }

  private async loadBookInfo(): Promise<void> {
    try {
      const file = this.app.vault.getAbstractFileByPath(this.epubPath);
      if (!(file instanceof TFile)) {
        this.bookInfoEl.textContent = '无法加载书籍信息';
        return;
      }

      const fileData = await this.app.vault.readBinary(file);
      const book = await ParserFactory.parseDocument(fileData, file.name);

      this.totalChapters = book.chapters.length;
      this.chapterEnd = Math.min(50, this.totalChapters);
      this.currentBook = book;

      this.bookInfoEl.empty();
      this.bookInfoEl.addClass('nc-book-info-loaded');
      
      const grid = this.bookInfoEl.createDiv({ cls: 'nc-book-info-grid' });
      grid.innerHTML = `
        <div class="nc-info-item"><span class="nc-info-label">书名</span><span class="nc-info-value">${book.metadata.title}</span></div>
        <div class="nc-info-item"><span class="nc-info-label">作者</span><span class="nc-info-value">${book.metadata.author}</span></div>
        <div class="nc-info-item"><span class="nc-info-label">章节</span><span class="nc-info-value">${book.chapters.length} 章</span></div>
        <div class="nc-info-item"><span class="nc-info-label">字数</span><span class="nc-info-value">${(book.totalWordCount / 10000).toFixed(1)} 万字</span></div>
      `;

      const endInput = (this as any)._endInput as HTMLInputElement;
      if (endInput) {
        endInput.max = String(this.totalChapters);
        endInput.value = String(Math.min(50, this.totalChapters));
      }
      
      // 更新 Token 预估
      this.updateTokenEstimate();
    } catch (error) {
      console.error('加载书籍信息失败:', error);
      this.bookInfoEl.textContent = '加载书籍信息失败';
    }
  }

  /**
   * 加载分析元数据并显示状态
   * Requirements: 1.1.1.1, 1.1.1.2, 1.1.1.3, 1.1.1.4
   */
  private async loadAnalysisMetadata(): Promise<void> {
    if (!this.metadataStatusEl || !this.currentBook) return;
    
    this.metadataStatusEl.empty();
    
    try {
      const notesPath = this.settings.notesPath || '拆书笔记';
      const bookTitle = this.currentBook.metadata.title;
      
      // Requirements: 1.1.1.1 - 检查是否存在分析元数据
      this.currentMetadata = await this.metadataService.getMetadata(
        this.epubPath,
        bookTitle,
        notesPath
      );
      
      // Requirements: 1.2.2.4 - 检查是否存在断点
      await this.loadCheckpointStatus();
      
      this.metadataStatusEl.addClass('nc-metadata-status-loaded');
      
      // 创建状态显示区域
      const statusContainer = this.metadataStatusEl.createDiv({ cls: 'nc-metadata-status-container' });
      
      const header = statusContainer.createDiv({ cls: 'nc-metadata-header' });
      header.createSpan({ text: '📋 分析状态', cls: 'nc-metadata-title' });
      
      const content = statusContainer.createDiv({ cls: 'nc-metadata-content' });
      
      if (this.currentMetadata && this.currentMetadata.ranges.length > 0) {
        // Requirements: 1.1.1.2, 1.1.1.3 - 显示已分析章节范围和日期
        const statusText = this.metadataService.formatAnalysisStatus(this.currentMetadata);
        
        // 分割多行状态显示
        const statusLines = statusText.split('\n');
        for (const line of statusLines) {
          const rangeItem = content.createDiv({ cls: 'nc-metadata-range-item' });
          rangeItem.createSpan({ text: '✅ ', cls: 'nc-metadata-icon' });
          rangeItem.createSpan({ text: line, cls: 'nc-metadata-range-text' });
        }
        
        // 显示最后更新时间
        const lastUpdated = new Date(this.currentMetadata.lastUpdated);
        const lastUpdatedStr = `${lastUpdated.getFullYear()}-${String(lastUpdated.getMonth() + 1).padStart(2, '0')}-${String(lastUpdated.getDate()).padStart(2, '0')} ${String(lastUpdated.getHours()).padStart(2, '0')}:${String(lastUpdated.getMinutes()).padStart(2, '0')}`;
        
        const updateInfo = content.createDiv({ cls: 'nc-metadata-update-info' });
        updateInfo.createSpan({ text: `最后更新: ${lastUpdatedStr}`, cls: 'nc-metadata-update-text' });
        
        // Requirements: 1.1.2.1 - 当存在元数据时显示三个选项
        this.createIncrementalModeSelector();
      } else {
        // Requirements: 1.1.1.4 - 显示"尚未分析"状态
        const noAnalysis = content.createDiv({ cls: 'nc-metadata-no-analysis' });
        noAnalysis.createSpan({ text: '📭 ', cls: 'nc-metadata-icon' });
        noAnalysis.createSpan({ text: '尚未分析', cls: 'nc-metadata-no-analysis-text' });
        
        // Requirements: 1.1.2.5 - 无元数据时隐藏增量模式选择
        this.incrementalModeSection.style.display = 'none';
        this.selectedIncrementalMode = null;
      }
    } catch (error) {
      console.error('加载分析元数据失败:', error);
      // 出错时显示"尚未分析"
      const content = this.metadataStatusEl.createDiv({ cls: 'nc-metadata-content' });
      const noAnalysis = content.createDiv({ cls: 'nc-metadata-no-analysis' });
      noAnalysis.createSpan({ text: '📭 ', cls: 'nc-metadata-icon' });
      noAnalysis.createSpan({ text: '尚未分析', cls: 'nc-metadata-no-analysis-text' });
      
      // 无元数据时隐藏增量模式选择
      this.incrementalModeSection.style.display = 'none';
      this.selectedIncrementalMode = null;
    }
  }

  /**
   * 加载断点状态并显示
   * Requirements: 1.2.2.4
   */
  private async loadCheckpointStatus(): Promise<void> {
    if (!this.checkpointStatusEl || !this.currentBook) return;
    
    this.checkpointStatusEl.empty();
    
    try {
      const notesPath = this.settings.notesPath || '拆书笔记';
      const bookTitle = this.currentBook.metadata.title;
      
      // Requirements: 1.2.2.4 - 检查是否存在断点
      this.currentCheckpoint = await this.checkpointService.getCheckpoint(bookTitle, notesPath);
      
      if (this.currentCheckpoint) {
        this.checkpointStatusEl.addClass('nc-checkpoint-status-loaded');
        
        // 创建断点状态显示区域
        const statusContainer = this.checkpointStatusEl.createDiv({ cls: 'nc-checkpoint-status-container' });
        
        const header = statusContainer.createDiv({ cls: 'nc-checkpoint-header' });
        header.createSpan({ text: '⏸️ 发现未完成的分析', cls: 'nc-checkpoint-title' });
        
        const content = statusContainer.createDiv({ cls: 'nc-checkpoint-content' });
        
        // 显示断点详情
        const checkpointInfo = this.checkpointService.formatCheckpointStatus(this.currentCheckpoint);
        const infoItem = content.createDiv({ cls: 'nc-checkpoint-info-item' });
        infoItem.createSpan({ text: '📍 ', cls: 'nc-checkpoint-icon' });
        infoItem.createSpan({ text: checkpointInfo, cls: 'nc-checkpoint-info-text' });
        
        // 显示已完成的阶段
        if (this.currentCheckpoint.completedStages.length > 0) {
          const stagesItem = content.createDiv({ cls: 'nc-checkpoint-stages-item' });
          stagesItem.createSpan({ text: '✅ 已完成: ', cls: 'nc-checkpoint-stages-label' });
          stagesItem.createSpan({ 
            text: this.currentCheckpoint.completedStages.join(', '), 
            cls: 'nc-checkpoint-stages-text' 
          });
        }
        
        // 显示当前阶段（如果有）
        if (this.currentCheckpoint.currentStage) {
          const currentItem = content.createDiv({ cls: 'nc-checkpoint-current-item' });
          currentItem.createSpan({ text: '🔄 中断于: ', cls: 'nc-checkpoint-current-label' });
          currentItem.createSpan({ 
            text: this.currentCheckpoint.currentStage, 
            cls: 'nc-checkpoint-current-text' 
          });
        }
        
        // 创建"从断点继续"按钮
        // Requirements: 1.2.2.4 - 显示"从断点继续"选项
        const buttonContainer = content.createDiv({ cls: 'nc-checkpoint-button-container' });
        
        const resumeButton = buttonContainer.createEl('button', {
          text: '▶️ 从断点继续',
          cls: 'nc-btn nc-btn-checkpoint-resume'
        });
        resumeButton.addEventListener('click', () => this.resumeFromCheckpoint());
        
        const discardButton = buttonContainer.createEl('button', {
          text: '🗑️ 放弃断点',
          cls: 'nc-btn nc-btn-checkpoint-discard'
        });
        discardButton.addEventListener('click', () => this.discardCheckpoint());
      } else {
        // 没有断点，隐藏断点状态区域
        this.checkpointStatusEl.style.display = 'none';
      }
    } catch (error) {
      console.error('加载断点状态失败:', error);
      this.checkpointStatusEl.style.display = 'none';
    }
  }

  /**
   * 从断点继续分析
   * Requirements: 1.2.2.4, 1.2.2.5
   */
  private async resumeFromCheckpoint(): Promise<void> {
    if (!this.currentCheckpoint || !this.currentBook) {
      showWarning('没有可恢复的断点');
      return;
    }
    
    if (this.isAnalyzing) return;

    if (!this.llmService.getDefaultProvider()) {
      showWarning('请先在设置中配置 LLM 服务');
      return;
    }

    this.isAnalyzing = true;
    this.startButton.disabled = true;
    this.startButton.textContent = '恢复中...';
    this.controlButtons.style.display = 'flex';
    this.pauseButton.textContent = '⏸️ 暂停';
    
    // 显示进度和结果区域
    this.progressSection.style.display = 'block';
    this.resultsSection.style.display = 'block';
    this.createProgressSection();
    this.createResultsSection();
    
    this.analysisController = new AnalysisController();
    this.stageResults = [];

    try {
      this.updateProgress({ stage: '恢复中', progress: 0, message: '正在从断点恢复分析...' });
      this.addStageResult('恢复断点', 'running', '正在恢复...');
      
      const file = this.app.vault.getAbstractFileByPath(this.epubPath);
      if (!(file instanceof TFile)) throw new Error(`文件不存在: ${this.epubPath}`);
      
      const fileData = await this.app.vault.readBinary(file);
      const fullBook = await ParserFactory.parseDocument(fileData, file.name);

      // 使用断点中保存的章节范围
      const startIdx = Math.max(0, this.currentCheckpoint.chapterRange.start - 1);
      const endIdx = Math.min(fullBook.chapters.length, this.currentCheckpoint.chapterRange.end);
      const filteredChapters = fullBook.chapters.slice(startIdx, endIdx);
      const filteredWordCount = filteredChapters.reduce((sum, ch) => sum + ch.wordCount, 0);
      const book: ParsedBook = { ...fullBook, chapters: filteredChapters, totalWordCount: filteredWordCount };

      this.addStageResult('恢复断点', 'completed', `已恢复: ${this.currentCheckpoint.completedStages.length} 个阶段已完成`);

      // 使用断点中保存的配置
      const config = this.currentCheckpoint.config;

      const analysisService = new AnalysisService(this.llmService);
      const outputPath = this.settings.notesPath || '拆书笔记';
      
      const createFile = async (path: string, content: string) => {
        const folderPath = path.substring(0, path.lastIndexOf('/'));
        if (folderPath) {
          const folder = this.app.vault.getAbstractFileByPath(folderPath);
          if (!folder) await this.app.vault.createFolder(folderPath);
        }
        const existingFile = this.app.vault.getAbstractFileByPath(path);
        if (existingFile instanceof TFile) {
          await this.app.vault.modify(existingFile, content);
        } else {
          await this.app.vault.create(path, content);
        }
      };
      
      const onNoteGenerated = (noteType: string, filePath: string) => {
        this.addGeneratedFileInfo(noteType, filePath);
        showInfo(`📝 已生成: ${noteType}`);
      };
      
      // 从断点恢复分析
      const result = await analysisService.resumeFromCheckpoint(
        book, 
        this.currentCheckpoint,
        outputPath,
        (progress) => this.updateProgress(progress),
        (stage, status, message, result) => this.addStageResult(stage, status, message, result),
        onNoteGenerated, 
        createFile, 
        outputPath, 
        this.analysisController
      );

      // 分析完成后删除断点
      await this.checkpointService.deleteCheckpoint(book.metadata.title, outputPath);
      this.currentCheckpoint = null;
      
      // 隐藏断点状态区域
      if (this.checkpointStatusEl) {
        this.checkpointStatusEl.style.display = 'none';
      }

      this.updateProgress({ stage: '完成', progress: 100, message: '分析完成！' });
      showSuccess(`《${book.metadata.title}》分析完成`);

      if (this.onAnalysisComplete) {
        this.onAnalysisComplete(result, book);
      }

      this.startButton.textContent = '分析完成 ✓';
      this.controlButtons.style.display = 'none';

    } catch (error) {
      if (error instanceof AnalysisStoppedError) {
        this.progressStage.textContent = '已终止';
        this.addStageResult('⏹️ 已终止', 'error', '分析已被用户终止');
        showWarning('分析已终止');
      } else {
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        handleError(error, '恢复分析');
        this.progressStage.textContent = '恢复失败';
        this.addStageResult('错误', 'error', errorMessage);
      }
    } finally {
      this.isAnalyzing = false;
      this.startButton.disabled = false;
      this.analysisController = null;
      this.controlButtons.style.display = 'none';
      if (!this.startButton.textContent?.includes('完成')) {
        this.startButton.textContent = '重新分析';
      }
    }
  }

  /**
   * 放弃断点
   */
  private async discardCheckpoint(): Promise<void> {
    if (!this.currentCheckpoint || !this.currentBook) return;
    
    const notesPath = this.settings.notesPath || '拆书笔记';
    const bookTitle = this.currentBook.metadata.title;
    
    try {
      await this.checkpointService.deleteCheckpoint(bookTitle, notesPath);
      this.currentCheckpoint = null;
      
      // 隐藏断点状态区域
      if (this.checkpointStatusEl) {
        this.checkpointStatusEl.empty();
        this.checkpointStatusEl.style.display = 'none';
      }
      
      showInfo('已放弃断点');
    } catch (error) {
      console.error('放弃断点失败:', error);
      handleError(error, '放弃断点');
    }
  }

  /**
   * 创建增量分析模式选择器
   * Requirements: 1.1.2.1, 1.1.2.2, 1.1.2.3, 1.1.2.4, 1.1.2.5
   */
  private createIncrementalModeSelector(): void {
    if (!this.incrementalModeSection || !this.currentMetadata) return;
    
    this.incrementalModeSection.empty();
    this.incrementalModeSection.style.display = 'block';
    
    const container = this.incrementalModeSection.createDiv({ cls: 'nc-incremental-mode-container' });
    
    const header = container.createDiv({ cls: 'nc-incremental-header' });
    header.createSpan({ text: '🔄 分析方式', cls: 'nc-incremental-title' });
    
    const options = container.createDiv({ cls: 'nc-incremental-options' });
    
    // 计算下一个起始章节
    const nextStartChapter = this.metadataService.getNextStartChapter(this.currentMetadata);
    const hasMoreChapters = nextStartChapter <= this.totalChapters;
    
    // 继续分析选项
    // Requirements: 1.1.2.2 - 自动设置起始章节为上次分析结束章节 + 1
    const continueOption = this.createIncrementalOption(
      options,
      'continue',
      '▶️ 继续分析',
      hasMoreChapters 
        ? `从第 ${nextStartChapter} 章继续分析到结尾`
        : '已分析完所有章节',
      !hasMoreChapters
    );
    
    // 追加分析选项
    // Requirements: 1.1.2.3 - 允许用户指定自定义范围
    const appendOption = this.createIncrementalOption(
      options,
      'append',
      '➕ 追加分析',
      '选择特定章节范围进行追加分析',
      false
    );
    
    // 重新分析选项
    // Requirements: 1.1.2.4 - 警告用户现有笔记将被覆盖
    const restartOption = this.createIncrementalOption(
      options,
      'restart',
      '🔄 重新分析',
      '⚠️ 将覆盖现有分析结果',
      false
    );
    
    // 默认选择继续分析（如果有更多章节）
    if (hasMoreChapters) {
      this.selectIncrementalMode('continue');
      continueOption.addClass('nc-incremental-option-active');
    }
  }

  /**
   * 创建单个增量分析选项
   */
  private createIncrementalOption(
    container: HTMLElement,
    mode: IncrementalMode,
    label: string,
    description: string,
    disabled: boolean
  ): HTMLElement {
    const option = container.createDiv({ 
      cls: `nc-incremental-option ${disabled ? 'nc-incremental-option-disabled' : ''}` 
    });
    
    const labelEl = option.createDiv({ cls: 'nc-incremental-option-label' });
    labelEl.textContent = label;
    
    const descEl = option.createDiv({ cls: 'nc-incremental-option-desc' });
    descEl.textContent = description;
    
    if (!disabled) {
      option.addEventListener('click', () => {
        // 移除其他选项的激活状态
        const allOptions = container.querySelectorAll('.nc-incremental-option');
        allOptions.forEach(opt => opt.removeClass('nc-incremental-option-active'));
        
        // 激活当前选项
        option.addClass('nc-incremental-option-active');
        
        // 更新选中的模式
        this.selectIncrementalMode(mode);
      });
    }
    
    return option;
  }

  /**
   * 选择增量分析模式并更新 UI
   * Requirements: 1.1.2.2, 1.1.2.3, 1.1.2.4
   */
  private selectIncrementalMode(mode: IncrementalMode): void {
    this.selectedIncrementalMode = mode;
    
    switch (mode) {
      case 'continue':
        // Requirements: 1.1.2.2 - 自动设置起始章节
        if (this.currentMetadata) {
          const nextStart = this.metadataService.getNextStartChapter(this.currentMetadata);
          this.chapterStart = nextStart;
          this.chapterEnd = this.totalChapters;
          this.analyzeAllChapters = false;
          
          // 更新章节范围显示
          this.updateChapterRangeForContinue(nextStart, this.totalChapters);
        }
        // 隐藏章节范围选择器（继续模式自动设置范围）
        this.chapterRangeSection.style.display = 'none';
        break;
        
      case 'append':
        // Requirements: 1.1.2.3 - 显示自定义范围选择
        this.analyzeAllChapters = false;
        this.chapterRangeSection.style.display = 'block';
        // 重置为默认范围
        this.chapterStart = 1;
        this.chapterEnd = Math.min(50, this.totalChapters);
        this.updateChapterRangeInputs();
        break;
        
      case 'restart':
        // Requirements: 1.1.2.4 - 显示完整范围选择
        this.chapterRangeSection.style.display = 'block';
        // 显示警告
        this.showRestartWarning();
        break;
    }
    
    // 更新 Token 预估
    this.updateTokenEstimate();
    
    // 更新开始按钮文本
    this.updateStartButtonText();
  }

  /**
   * 更新继续模式的章节范围显示
   */
  private updateChapterRangeForContinue(start: number, end: number): void {
    // 在增量模式区域显示将要分析的范围
    const existingInfo = this.incrementalModeSection.querySelector('.nc-continue-range-info');
    if (existingInfo) {
      existingInfo.remove();
    }
    
    const rangeInfo = this.incrementalModeSection.createDiv({ cls: 'nc-continue-range-info' });
    rangeInfo.createSpan({ text: `📖 将分析: 第 ${start} - ${end} 章 (共 ${end - start + 1} 章)`, cls: 'nc-continue-range-text' });
  }

  /**
   * 更新章节范围输入框的值
   */
  private updateChapterRangeInputs(): void {
    const startInput = this.chapterRangeSection.querySelector('input[type="number"]:first-of-type') as HTMLInputElement;
    const endInput = (this as any)._endInput as HTMLInputElement;
    
    if (startInput) {
      startInput.value = String(this.chapterStart);
    }
    if (endInput) {
      endInput.value = String(this.chapterEnd);
    }
  }

  /**
   * 显示重新分析警告
   * Requirements: 1.1.2.4
   */
  private showRestartWarning(): void {
    const existingWarning = this.incrementalModeSection.querySelector('.nc-restart-warning');
    if (existingWarning) {
      return; // 已经显示警告
    }
    
    const warning = this.incrementalModeSection.createDiv({ cls: 'nc-restart-warning' });
    warning.createSpan({ text: '⚠️ ', cls: 'nc-warning-icon' });
    warning.createSpan({ 
      text: '重新分析将覆盖现有的分析笔记，此操作不可撤销。', 
      cls: 'nc-warning-text' 
    });
  }

  /**
   * 更新开始按钮文本
   */
  private updateStartButtonText(): void {
    if (!this.startButton) return;
    
    switch (this.selectedIncrementalMode) {
      case 'continue':
        this.startButton.textContent = '继续分析';
        break;
      case 'append':
        this.startButton.textContent = '追加分析';
        break;
      case 'restart':
        this.startButton.textContent = '重新分析';
        break;
      default:
        this.startButton.textContent = '开始分析';
    }
  }

  private togglePause(): void {
    if (!this.analysisController) return;
    
    const state = this.analysisController.getState();
    if (state === 'running') {
      this.analysisController.pause();
      this.pauseButton.textContent = '▶️ 继续';
      this.progressStage.textContent = '已暂停';
      showInfo('分析已暂停');
    } else if (state === 'paused') {
      this.analysisController.resume();
      this.pauseButton.textContent = '⏸️ 暂停';
      showInfo('分析已恢复');
    }
  }

  private stopAnalysis(): void {
    if (!this.analysisController) return;
    this.analysisController.stop();
    this.progressStage.textContent = '正在终止...';
    showWarning('正在终止分析...');
  }

  private async startAnalysis(): Promise<void> {
    if (this.isAnalyzing) return;

    if (!this.llmService.getDefaultProvider()) {
      showWarning('请先在设置中配置 LLM 服务');
      return;
    }

    this.isAnalyzing = true;
    this.startButton.disabled = true;
    this.startButton.textContent = '分析中...';
    this.controlButtons.style.display = 'flex';
    this.pauseButton.textContent = '⏸️ 暂停';
    
    // 显示进度和结果区域
    this.progressSection.style.display = 'block';
    this.resultsSection.style.display = 'block';
    this.createProgressSection();
    this.createResultsSection();
    
    this.analysisController = new AnalysisController();
    this.stageResults = [];

    let book: ParsedBook | null = null;

    try {
      this.updateProgress({ stage: '解析中', progress: 0, message: '正在解析文档...' });
      this.addStageResult('解析文档', 'running', '正在解析...');
      
      const file = this.app.vault.getAbstractFileByPath(this.epubPath);
      if (!(file instanceof TFile)) throw new Error(`文件不存在: ${this.epubPath}`);
      
      const fileData = await this.app.vault.readBinary(file);
      const fullBook = await ParserFactory.parseDocument(fileData, file.name);

      if (this.analyzeAllChapters) {
        book = fullBook;
      } else {
        const startIdx = Math.max(0, this.chapterStart - 1);
        const endIdx = Math.min(fullBook.chapters.length, this.chapterEnd);
        const filteredChapters = fullBook.chapters.slice(startIdx, endIdx);
        const filteredWordCount = filteredChapters.reduce((sum, ch) => sum + ch.wordCount, 0);
        book = { ...fullBook, chapters: filteredChapters, totalWordCount: filteredWordCount };
      }

      this.addStageResult('解析文档', 'completed', `解析完成: ${book.chapters.length} 章`);

      const config: AnalysisConfig = {
        mode: this.selectedMode,
        novelType: this.selectedNovelType,
        customFocus: this.customFocus.length > 0 ? this.customFocus : undefined,
        customTypeName: this.selectedNovelType === 'custom' ? this.customTypeName : undefined,
        customPrompts: this.settings.customPrompts,
        customTypePrompts: this.settings.customTypePrompts
      };

      const analysisService = new AnalysisService(this.llmService);
      const outputPath = this.settings.notesPath || '拆书笔记';
      
      const createFile = async (path: string, content: string) => {
        const folderPath = path.substring(0, path.lastIndexOf('/'));
        if (folderPath) {
          const folder = this.app.vault.getAbstractFileByPath(folderPath);
          if (!folder) await this.app.vault.createFolder(folderPath);
        }
        const existingFile = this.app.vault.getAbstractFileByPath(path);
        if (existingFile instanceof TFile) {
          await this.app.vault.modify(existingFile, content);
        } else {
          await this.app.vault.create(path, content);
        }
      };
      
      const onNoteGenerated = (noteType: string, filePath: string) => {
        this.addGeneratedFileInfo(noteType, filePath);
        showInfo(`📝 已生成: ${noteType}`);
      };
      
      const result = await analysisService.analyzeWithResults(
        book, config,
        (progress) => this.updateProgress(progress),
        (stage, status, message, result) => this.addStageResult(stage, status, message, result),
        onNoteGenerated, createFile, outputPath, this.analysisController
      );

      this.updateProgress({ stage: '完成', progress: 100, message: '分析完成！' });
      showSuccess(`《${book.metadata.title}》分析完成`);

      if (this.onAnalysisComplete) {
        this.onAnalysisComplete(result, book);
      }

      this.startButton.textContent = '分析完成 ✓';
      this.controlButtons.style.display = 'none';

    } catch (error) {
      if (error instanceof AnalysisStoppedError) {
        this.progressStage.textContent = '已终止';
        this.addStageResult('⏹️ 已终止', 'error', '分析已被用户终止');
        showWarning('分析已终止');
      } else {
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        handleError(error, '分析');
        this.progressStage.textContent = '分析失败';
        this.addStageResult('错误', 'error', errorMessage);
      }
    } finally {
      this.isAnalyzing = false;
      this.startButton.disabled = false;
      this.analysisController = null;
      this.controlButtons.style.display = 'none';
      if (!this.startButton.textContent?.includes('完成')) {
        this.startButton.textContent = '重新分析';
      }
    }
  }

  private createProgressSection(): void {
    this.progressSection.empty();
    
    this.progressStage = this.progressSection.createDiv({ cls: 'nc-progress-stage', text: '准备中...' });
    
    const bar = this.progressSection.createDiv({ cls: 'nc-progress-bar' });
    this.progressFill = bar.createDiv({ cls: 'nc-progress-fill' });
    this.progressFill.style.width = '0%';
    
    this.progressText = this.progressSection.createDiv({ cls: 'nc-progress-text' });
    
    // Token 使用显示
    this.tokenUsageEl = this.progressSection.createDiv({ cls: 'nc-token-usage' });
    this.tokenUsageEl.style.display = 'none';
  }

  private createResultsSection(): void {
    this.resultsSection.empty();
    const header = this.resultsSection.createDiv({ cls: 'nc-results-header' });
    header.createSpan({ text: '📋 分析结果', cls: 'nc-results-title' });
  }

  private updateProgress(progress: AnalysisProgress): void {
    if (this.progressStage) this.progressStage.textContent = progress.stage;
    if (this.progressFill) this.progressFill.style.width = `${Math.min(100, Math.max(0, progress.progress))}%`;
    if (this.progressText) this.progressText.textContent = progress.message;
  }

  private addStageResult(stage: string, status: 'pending' | 'running' | 'completed' | 'error', message: string, result?: string): void {
    const existingIndex = this.stageResults.findIndex(r => r.stage === stage);
    
    if (existingIndex >= 0) {
      this.stageResults[existingIndex].status = status;
      this.stageResults[existingIndex].message = message;
      if (result) this.stageResults[existingIndex].result = result;
      if (status === 'completed' || status === 'error') {
        this.stageResults[existingIndex].endTime = Date.now();
      }
    } else {
      this.stageResults.push({ stage, status, message, result, startTime: Date.now() });
    }

    this.renderResults();
  }

  private addGeneratedFileInfo(noteType: string, filePath: string): void {
    const existingIndex = this.stageResults.findIndex(r => r.stage === `📝 ${noteType}`);
    
    if (existingIndex >= 0) {
      this.stageResults[existingIndex].message = `已生成: ${filePath}`;
      this.stageResults[existingIndex].generatedFile = filePath;
    } else {
      this.stageResults.push({
        stage: `📝 ${noteType}`,
        status: 'completed',
        message: `已生成: ${filePath}`,
        generatedFile: filePath,
        startTime: Date.now(),
        endTime: Date.now()
      });
    }
    
    this.renderResults();
  }

  private renderResults(): void {
    const existingItems = this.resultsSection.querySelectorAll('.nc-result-item');
    existingItems.forEach(item => item.remove());

    for (const item of this.stageResults) {
      const resultItem = this.resultsSection.createDiv({ cls: `nc-result-item nc-result-${item.status}` });
      
      const header = resultItem.createDiv({ cls: 'nc-result-item-header' });
      const icon = item.status === 'running' ? '🔄' : item.status === 'completed' ? '✅' : item.status === 'error' ? '❌' : '⏸️';
      header.createSpan({ text: icon, cls: 'nc-result-status-icon' });
      header.createSpan({ text: item.stage, cls: 'nc-result-stage-name' });
      
      if (item.startTime && item.endTime) {
        const duration = ((item.endTime - item.startTime) / 1000).toFixed(1);
        header.createSpan({ text: `${duration}s`, cls: 'nc-result-duration' });
      }

      const messageEl = resultItem.createDiv({ cls: 'nc-result-message' });
      messageEl.textContent = item.message;

      if (item.generatedFile) {
        const openBtn = resultItem.createEl('button', { text: '📂 打开', cls: 'nc-result-toggle nc-open-file-btn' });
        openBtn.addEventListener('click', async () => {
          const file = this.app.vault.getAbstractFileByPath(item.generatedFile!);
          if (file instanceof TFile) {
            await this.app.workspace.getLeaf().openFile(file);
          }
        });
      }
    }

    this.resultsSection.scrollTop = this.resultsSection.scrollHeight;
  }

  async onClose(): Promise<void> {
    if (this.analysisController) {
      this.analysisController.stop();
    }
  }

  /**
   * 更新 Token 预估显示
   */
  private updateTokenEstimate(): void {
    if (!this.tokenEstimateEl || !this.currentBook) return;
    
    this.tokenEstimateEl.empty();
    
    const chapterRange = this.analyzeAllChapters 
      ? undefined 
      : { start: this.chapterStart, end: this.chapterEnd };
    
    const estimate = TokenTracker.estimateAnalysis(this.currentBook, this.selectedMode, chapterRange);
    
    this.tokenEstimateEl.addClass('nc-token-estimate-loaded');
    
    const header = this.tokenEstimateEl.createDiv({ cls: 'nc-token-header' });
    header.createSpan({ text: '📊 Token 预估', cls: 'nc-token-title' });
    
    const confidenceClass = `nc-confidence-${estimate.confidence}`;
    header.createSpan({ 
      text: estimate.confidence === 'high' ? '高置信度' : estimate.confidence === 'medium' ? '中置信度' : '低置信度',
      cls: `nc-token-confidence ${confidenceClass}`
    });
    
    const stats = this.tokenEstimateEl.createDiv({ cls: 'nc-token-stats' });
    stats.innerHTML = `
      <div class="nc-token-stat">
        <span class="nc-token-label">输入</span>
        <span class="nc-token-value">${TokenTracker.formatTokenCount(estimate.promptTokens)}</span>
      </div>
      <div class="nc-token-stat">
        <span class="nc-token-label">输出</span>
        <span class="nc-token-value">${TokenTracker.formatTokenCount(estimate.completionTokens)}</span>
      </div>
      <div class="nc-token-stat nc-token-total">
        <span class="nc-token-label">总计</span>
        <span class="nc-token-value">${TokenTracker.formatTokenCount(estimate.totalTokens)}</span>
      </div>
    `;
    
    const note = this.tokenEstimateEl.createDiv({ cls: 'nc-token-note' });
    note.textContent = estimate.note;
    
    // 展开/折叠详情
    const toggleBtn = this.tokenEstimateEl.createEl('button', {
      text: '查看详情 ▼',
      cls: 'nc-token-toggle'
    });
    
    const details = this.tokenEstimateEl.createDiv({ cls: 'nc-token-details' });
    details.style.display = 'none';
    
    for (const item of estimate.breakdown) {
      const row = details.createDiv({ cls: 'nc-token-detail-row' });
      row.innerHTML = `
        <span class="nc-detail-stage">${item.stage}</span>
        <span class="nc-detail-tokens">输入 ${TokenTracker.formatTokenCount(item.promptTokens)} / 输出 ${TokenTracker.formatTokenCount(item.completionTokens)}</span>
      `;
    }
    
    toggleBtn.addEventListener('click', () => {
      const isHidden = details.style.display === 'none';
      details.style.display = isHidden ? 'block' : 'none';
      toggleBtn.textContent = isHidden ? '收起详情 ▲' : '查看详情 ▼';
    });

    // 更新分批建议
    // Requirements: 1.3.1.1, 1.3.1.2
    this.updateBatchSuggestion();
  }

  /**
   * 更新实际 Token 使用显示
   */
  private updateTokenUsageDisplay(): void {
    if (!this.tokenUsageEl) return;
    
    this.tokenUsageEl.empty();
    
    if (this.sessionTokenUsage.totalTokens === 0) {
      this.tokenUsageEl.style.display = 'none';
      return;
    }
    
    this.tokenUsageEl.style.display = 'block';
    
    const header = this.tokenUsageEl.createDiv({ cls: 'nc-usage-header' });
    header.createSpan({ text: '💰 实际消耗', cls: 'nc-usage-title' });
    
    const stats = this.tokenUsageEl.createDiv({ cls: 'nc-token-stats' });
    stats.innerHTML = `
      <div class="nc-token-stat">
        <span class="nc-token-label">输入</span>
        <span class="nc-token-value">${TokenTracker.formatTokenCount(this.sessionTokenUsage.promptTokens)}</span>
      </div>
      <div class="nc-token-stat">
        <span class="nc-token-label">输出</span>
        <span class="nc-token-value">${TokenTracker.formatTokenCount(this.sessionTokenUsage.completionTokens)}</span>
      </div>
      <div class="nc-token-stat nc-token-total">
        <span class="nc-token-label">总计</span>
        <span class="nc-token-value">${TokenTracker.formatTokenCount(this.sessionTokenUsage.totalTokens)}</span>
      </div>
    `;
  }

  /**
   * 计算分批建议
   * Requirements: 1.3.1.1, 1.3.1.2
   * 
   * @param chapterCount 要分析的章节数
   * @param totalWordCount 要分析的总字数
   * @returns 分批建议
   */
  public calculateBatchSuggestion(chapterCount: number, totalWordCount: number): BatchSuggestion {
    // Requirements: 1.3.1.1 - 当章节数 > 50 时显示建议
    if (chapterCount <= BATCH_SUGGESTION_THRESHOLD) {
      return {
        shouldBatch: false,
        recommendedBatchSize: chapterCount,
        totalBatches: 1,
        reason: '章节数量适中，无需分批'
      };
    }

    // Requirements: 1.3.1.2 - 根据字数计算推荐批次大小
    // 计算平均每章字数
    const avgWordsPerChapter = totalWordCount / chapterCount;
    
    // 基于字数的批次大小计算策略：
    // - 平均每章 < 3000 字：每批 50 章（短章节）
    // - 平均每章 3000-6000 字：每批 30 章（中等章节）
    // - 平均每章 6000-10000 字：每批 20 章（长章节）
    // - 平均每章 > 10000 字：每批 10 章（超长章节）
    let recommendedBatchSize: number;
    let reason: string;

    if (avgWordsPerChapter < 3000) {
      recommendedBatchSize = 50;
      reason = `平均每章 ${Math.round(avgWordsPerChapter)} 字（短章节），建议每批 50 章`;
    } else if (avgWordsPerChapter < 6000) {
      recommendedBatchSize = 30;
      reason = `平均每章 ${Math.round(avgWordsPerChapter)} 字（中等章节），建议每批 30 章`;
    } else if (avgWordsPerChapter < 10000) {
      recommendedBatchSize = 20;
      reason = `平均每章 ${Math.round(avgWordsPerChapter)} 字（长章节），建议每批 20 章`;
    } else {
      recommendedBatchSize = 10;
      reason = `平均每章 ${Math.round(avgWordsPerChapter)} 字（超长章节），建议每批 10 章`;
    }

    // 计算总批次数
    const totalBatches = Math.ceil(chapterCount / recommendedBatchSize);

    return {
      shouldBatch: true,
      recommendedBatchSize,
      totalBatches,
      reason
    };
  }

  /**
   * 更新分批建议显示
   * Requirements: 1.3.1.1, 1.3.1.2
   */
  private updateBatchSuggestion(): void {
    if (!this.batchSuggestionEl || !this.currentBook) return;

    this.batchSuggestionEl.empty();

    // 计算要分析的章节数和字数
    let chapterCount: number;
    let totalWordCount: number;

    if (this.analyzeAllChapters) {
      chapterCount = this.currentBook.chapters.length;
      totalWordCount = this.currentBook.totalWordCount;
    } else {
      const startIdx = Math.max(0, this.chapterStart - 1);
      const endIdx = Math.min(this.currentBook.chapters.length, this.chapterEnd);
      const selectedChapters = this.currentBook.chapters.slice(startIdx, endIdx);
      chapterCount = selectedChapters.length;
      totalWordCount = selectedChapters.reduce((sum, ch) => sum + ch.wordCount, 0);
    }

    // 计算分批建议
    const suggestion = this.calculateBatchSuggestion(chapterCount, totalWordCount);

    // Requirements: 1.3.1.1 - 当章节数 > 50 时显示建议
    if (!suggestion.shouldBatch) {
      this.batchSuggestionEl.style.display = 'none';
      return;
    }

    this.batchSuggestionEl.style.display = 'block';
    this.batchSuggestionEl.addClass('nc-batch-suggestion-loaded');

    // 创建建议容器
    const container = this.batchSuggestionEl.createDiv({ cls: 'nc-batch-suggestion-container' });

    // 标题
    const header = container.createDiv({ cls: 'nc-batch-suggestion-header' });
    header.createSpan({ text: '📦 分批分析建议', cls: 'nc-batch-suggestion-title' });

    // 内容
    const content = container.createDiv({ cls: 'nc-batch-suggestion-content' });

    // 警告信息
    const warning = content.createDiv({ cls: 'nc-batch-suggestion-warning' });
    warning.createSpan({ text: '⚠️ ', cls: 'nc-batch-warning-icon' });
    warning.createSpan({ 
      text: `您选择了 ${chapterCount} 章进行分析，超过建议的 ${BATCH_SUGGESTION_THRESHOLD} 章阈值。`,
      cls: 'nc-batch-warning-text'
    });

    // 建议详情
    const details = content.createDiv({ cls: 'nc-batch-suggestion-details' });
    
    const reasonItem = details.createDiv({ cls: 'nc-batch-detail-item' });
    reasonItem.createSpan({ text: '💡 ', cls: 'nc-batch-detail-icon' });
    reasonItem.createSpan({ text: suggestion.reason, cls: 'nc-batch-detail-text' });

    const batchInfo = details.createDiv({ cls: 'nc-batch-detail-item' });
    batchInfo.createSpan({ text: '📊 ', cls: 'nc-batch-detail-icon' });
    batchInfo.createSpan({ 
      text: `推荐分 ${suggestion.totalBatches} 批完成，每批约 ${suggestion.recommendedBatchSize} 章`,
      cls: 'nc-batch-detail-text'
    });

    // 提示信息
    const tip = content.createDiv({ cls: 'nc-batch-suggestion-tip' });
    tip.createSpan({ 
      text: '分批分析可以避免超时问题，每批完成后会自动保存结果。',
      cls: 'nc-batch-tip-text'
    });
  }
}
