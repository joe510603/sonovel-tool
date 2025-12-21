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
  TokenUsage
} from '../types';
import { AnalysisService, AnalysisController, AnalysisStoppedError } from '../services/AnalysisService';
import { ParserFactory } from '../core/ParserFactory';
import { LLMService } from '../services/LLMService';
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

export class AnalysisView extends ItemView {
  private settings: NovelCraftSettings;
  private llmService: LLMService;
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

  // UI 元素
  private mainContent: HTMLElement;
  private welcomeSection: HTMLElement;
  private configSection: HTMLElement;
  private progressSection: HTMLElement;
  private resultsSection: HTMLElement;
  private bookInfoEl: HTMLElement;
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
    
    // 模式选择
    this.createModeSelector();
    
    // 类型选择
    this.createTypeSelector();
    
    // 章节范围
    this.createChapterRangeSelector();
    
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
    const container = this.configSection.createDiv({ cls: 'nc-range-selector' });
    
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
}
