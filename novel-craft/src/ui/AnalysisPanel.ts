/**
 * AnalysisPanel - 分析面板组件
 * 
 * 功能：
 * - 模式选择器（快速/标准/深度）
 * - 小说类型选择器，支持自定义选项
 * - 显示分析进度和当前步骤
 * - 实时显示 AI 交互结果
 * 
 * 需求: 4.1, 6.1, 6.4
 */

import { App, Modal, Setting, DropdownComponent, TextComponent, TFile } from 'obsidian';
import {
  AnalysisMode,
  NovelType,
  AnalysisConfig,
  AnalysisProgress,
  AnalysisResult,
  ParsedBook,
  NovelCraftSettings
} from '../types';
import { AnalysisService, AnalysisController, AnalysisStoppedError } from '../services/AnalysisService';
import { EpubParser } from '../core/EpubParser';
import { LLMService } from '../services/LLMService';
import { showSuccess, showWarning, handleError, showInfo } from './NotificationUtils';
import { getAllNovelTypes } from '../services/PromptTemplates';

/**
 * 分析模式配置
 */
const ANALYSIS_MODES: { value: AnalysisMode; label: string; description: string }[] = [
  {
    value: 'quick',
    label: '快速模式',
    description: '故事梗概、核心人物、主要写作技法'
  },
  {
    value: 'standard',
    label: '标准模式',
    description: '快速模式 + 情绪曲线、章节结构、伏笔分析'
  },
  {
    value: 'deep',
    label: '深度模式',
    description: '标准模式 + 逐章拆解、写作复盘'
  }
];

/**
 * 阶段结果项
 */
interface StageResultItem {
  stage: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  message: string;
  result?: string;
  startTime?: number;
  endTime?: number;
  generatedFile?: string;
}

export class AnalysisPanel extends Modal {
  private settings: NovelCraftSettings;
  private epubPath: string;
  private llmService: LLMService;
  private onAnalysisComplete?: (result: AnalysisResult, book: ParsedBook) => void;

  // UI 状态
  private selectedMode: AnalysisMode;
  private selectedNovelType: NovelType;
  private customTypeName: string = '';
  private customFocus: string[] = [];
  private isAnalyzing = false;
  private stageResults: StageResultItem[] = [];
  
  // 章节范围设置
  private analyzeAllChapters = true;
  private chapterStart = 1;
  private chapterEnd = 50;
  private totalChapters = 0;

  // UI 元素
  private modeContainer: HTMLElement;
  private typeContainer: HTMLElement;
  private customTypeContainer: HTMLElement;
  private customFocusContainer: HTMLElement;
  private chapterRangeContainer: HTMLElement;
  private progressContainer: HTMLElement;
  private progressBar: HTMLElement;
  private progressFill: HTMLElement;
  private progressText: HTMLElement;
  private progressStage: HTMLElement;
  private startButton: HTMLButtonElement;
  private resultsContainer: HTMLElement;
  private configSection: HTMLElement;
  private bookInfoEl: HTMLElement;
  
  // 控制按钮
  private controlButtonsContainer: HTMLElement;
  private pauseButton: HTMLButtonElement;
  private stopButton: HTMLButtonElement;
  private analysisController: AnalysisController | null = null;

  constructor(
    app: App,
    settings: NovelCraftSettings,
    epubPath: string,
    llmService: LLMService,
    onAnalysisComplete?: (result: AnalysisResult, book: ParsedBook) => void
  ) {
    super(app);
    this.settings = settings;
    this.epubPath = epubPath;
    this.llmService = llmService;
    this.onAnalysisComplete = onAnalysisComplete;

    // 使用默认设置
    this.selectedMode = settings.defaultAnalysisMode;
    this.selectedNovelType = settings.defaultNovelType;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('novel-craft-analysis-panel');
    contentEl.addClass('nc-analysis-expanded');

    // 标题
    const bookName = this.getBookName();
    contentEl.createEl('h2', { text: `📊 拆书分析 - ${bookName}` });

    // 书籍信息（加载后显示）
    this.bookInfoEl = contentEl.createDiv({ cls: 'nc-book-info-section' });
    this.bookInfoEl.createSpan({ text: '正在加载书籍信息...', cls: 'nc-loading-hint' });

    // 配置区域（可折叠）
    this.configSection = contentEl.createDiv({ cls: 'nc-config-section' });
    
    // 模式选择器
    this.createModeSelector(this.configSection);

    // 类型选择器
    this.createTypeSelector(this.configSection);

    // 章节范围选择器
    this.createChapterRangeSelector(this.configSection);

    // 自定义侧重点（仅在自定义类型时显示）
    this.createCustomFocusInput(this.configSection);

    // 开始分析按钮
    this.createStartButton(contentEl);

    // 进度显示区域
    this.createProgressSection(contentEl);

    // 实时结果显示区域
    this.createResultsSection(contentEl);

    // 预加载书籍信息
    this.loadBookInfo();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }

  /**
   * 获取书籍名称
   */
  private getBookName(): string {
    const parts = this.epubPath.split('/');
    const filename = parts[parts.length - 1];
    return filename.replace(/\.epub$/i, '');
  }

  /**
   * 创建模式选择器
   */
  private createModeSelector(container: HTMLElement): void {
    this.modeContainer = container.createDiv({ cls: 'novel-craft-mode-selector' });
    
    const label = this.modeContainer.createDiv({ cls: 'novel-craft-selector-label' });
    label.createSpan({ text: '分析模式' });

    const optionsContainer = this.modeContainer.createDiv({ cls: 'novel-craft-mode-options' });

    for (const mode of ANALYSIS_MODES) {
      const option = optionsContainer.createDiv({ cls: 'novel-craft-mode-option' });
      
      const radio = option.createEl('input', {
        type: 'radio',
        attr: {
          name: 'analysis-mode',
          value: mode.value,
          id: `mode-${mode.value}`
        }
      });
      
      if (mode.value === this.selectedMode) {
        radio.checked = true;
      }

      const labelEl = option.createEl('label', {
        attr: { for: `mode-${mode.value}` }
      });
      labelEl.createSpan({ text: mode.label, cls: 'novel-craft-mode-label' });
      labelEl.createSpan({ text: mode.description, cls: 'novel-craft-mode-desc' });

      radio.addEventListener('change', () => {
        if (radio.checked) {
          this.selectedMode = mode.value;
        }
      });
    }
  }

  /**
   * 创建类型选择器
   */
  private createTypeSelector(container: HTMLElement): void {
    this.typeContainer = container.createDiv({ cls: 'novel-craft-type-selector' });

    new Setting(this.typeContainer)
      .setName('小说类型')
      .setDesc('选择小说类型以获得针对性分析')
      .addDropdown((dropdown: DropdownComponent) => {
        for (const type of getAllNovelTypes()) {
          dropdown.addOption(type.value, type.label);
        }
        dropdown.setValue(this.selectedNovelType);
        dropdown.onChange((value: string) => {
          this.selectedNovelType = value as NovelType;
          this.updateCustomTypeVisibility();
          this.updateCustomFocusVisibility();
        });
      });

    // 自定义类型名称输入
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

  /**
   * 更新自定义类型输入的可见性
   */
  private updateCustomTypeVisibility(): void {
    if (this.customTypeContainer) {
      this.customTypeContainer.style.display = 
        this.selectedNovelType === 'custom' ? 'block' : 'none';
    }
  }

  /**
   * 创建自定义侧重点输入
   */
  private createCustomFocusInput(container: HTMLElement): void {
    this.customFocusContainer = container.createDiv({ cls: 'novel-craft-custom-focus' });

    new Setting(this.customFocusContainer)
      .setName('自定义分析侧重点')
      .setDesc('输入您希望重点分析的方面，用逗号分隔')
      .addText((text: TextComponent) => {
        text.setPlaceholder('例如：节奏控制, 对话设计, 场景描写');
        text.onChange((value: string) => {
          this.customFocus = value
            .split(/[,，]/)
            .map(s => s.trim())
            .filter(s => s.length > 0);
        });
      });

    this.updateCustomFocusVisibility();
  }

  /**
   * 更新自定义侧重点输入的可见性
   */
  private updateCustomFocusVisibility(): void {
    if (this.customFocusContainer) {
      this.customFocusContainer.style.display = 
        this.selectedNovelType === 'custom' ? 'block' : 'none';
    }
  }

  /**
   * 创建章节范围选择器
   */
  private createChapterRangeSelector(container: HTMLElement): void {
    this.chapterRangeContainer = container.createDiv({ cls: 'nc-chapter-range-selector' });

    // 分析范围选择
    const rangeTypeSetting = new Setting(this.chapterRangeContainer)
      .setName('分析范围')
      .setDesc('选择要分析的章节范围，可节省 Token 消耗');

    // 全书 / 自定义范围 切换
    const toggleContainer = rangeTypeSetting.controlEl.createDiv({ cls: 'nc-range-toggle' });
    
    const allBtn = toggleContainer.createEl('button', {
      text: '全书',
      cls: 'nc-range-btn nc-range-btn-active'
    });
    
    const customBtn = toggleContainer.createEl('button', {
      text: '自定义',
      cls: 'nc-range-btn'
    });

    // 自定义范围输入区域
    const customRangeContainer = this.chapterRangeContainer.createDiv({ cls: 'nc-custom-range' });
    customRangeContainer.style.display = 'none';

    const rangeInputs = customRangeContainer.createDiv({ cls: 'nc-range-inputs' });
    
    // 起始章节
    const startGroup = rangeInputs.createDiv({ cls: 'nc-range-input-group' });
    startGroup.createSpan({ text: '从第' });
    const startInput = startGroup.createEl('input', {
      type: 'number',
      cls: 'nc-range-input',
      attr: { min: '1', value: '1' }
    }) as HTMLInputElement;
    startGroup.createSpan({ text: '章' });

    // 结束章节
    const endGroup = rangeInputs.createDiv({ cls: 'nc-range-input-group' });
    endGroup.createSpan({ text: '到第' });
    const endInput = endGroup.createEl('input', {
      type: 'number',
      cls: 'nc-range-input',
      attr: { min: '1', value: '50' }
    }) as HTMLInputElement;
    endGroup.createSpan({ text: '章' });

    // 快捷按钮
    const quickBtns = customRangeContainer.createDiv({ cls: 'nc-quick-range-btns' });
    const quickRanges = [
      { label: '前10章', start: 1, end: 10 },
      { label: '前30章', start: 1, end: 30 },
      { label: '前50章', start: 1, end: 50 },
      { label: '前100章', start: 1, end: 100 }
    ];

    for (const range of quickRanges) {
      const btn = quickBtns.createEl('button', {
        text: range.label,
        cls: 'nc-quick-btn'
      });
      btn.addEventListener('click', () => {
        startInput.value = String(range.start);
        endInput.value = String(Math.min(range.end, this.totalChapters || range.end));
        this.chapterStart = range.start;
        this.chapterEnd = Math.min(range.end, this.totalChapters || range.end);
        this.updateRangeInfo();
      });
    }

    // 范围信息显示
    const rangeInfo = customRangeContainer.createDiv({ cls: 'nc-range-info' });

    // 事件绑定
    allBtn.addEventListener('click', () => {
      this.analyzeAllChapters = true;
      allBtn.addClass('nc-range-btn-active');
      customBtn.removeClass('nc-range-btn-active');
      customRangeContainer.style.display = 'none';
    });

    customBtn.addEventListener('click', () => {
      this.analyzeAllChapters = false;
      customBtn.addClass('nc-range-btn-active');
      allBtn.removeClass('nc-range-btn-active');
      customRangeContainer.style.display = 'block';
      this.updateRangeInfo();
    });

    startInput.addEventListener('change', () => {
      this.chapterStart = Math.max(1, parseInt(startInput.value) || 1);
      startInput.value = String(this.chapterStart);
      this.updateRangeInfo();
    });

    endInput.addEventListener('change', () => {
      const max = this.totalChapters || 9999;
      this.chapterEnd = Math.min(max, Math.max(this.chapterStart, parseInt(endInput.value) || 50));
      endInput.value = String(this.chapterEnd);
      this.updateRangeInfo();
    });

    // 保存引用以便更新
    (this as any)._rangeInfo = rangeInfo;
    (this as any)._endInput = endInput;
  }

  /**
   * 更新范围信息显示
   */
  private updateRangeInfo(): void {
    const rangeInfo = (this as any)._rangeInfo as HTMLElement;
    if (!rangeInfo) return;

    const count = this.chapterEnd - this.chapterStart + 1;
    rangeInfo.textContent = `将分析 ${count} 章内容`;
    
    if (this.totalChapters > 0) {
      const percent = ((count / this.totalChapters) * 100).toFixed(1);
      rangeInfo.textContent += ` (约 ${percent}% 的内容)`;
    }
  }

  /**
   * 预加载书籍信息
   */
  private async loadBookInfo(): Promise<void> {
    try {
      const file = this.app.vault.getAbstractFileByPath(this.epubPath);
      if (!(file instanceof TFile)) {
        this.bookInfoEl.textContent = '无法加载书籍信息';
        return;
      }

      const fileData = await this.app.vault.readBinary(file);
      const parser = new EpubParser();
      const book = await parser.parse(fileData);

      this.totalChapters = book.chapters.length;
      this.chapterEnd = Math.min(50, this.totalChapters);

      // 更新书籍信息显示
      this.bookInfoEl.empty();
      this.bookInfoEl.addClass('nc-book-info-loaded');
      
      const infoGrid = this.bookInfoEl.createDiv({ cls: 'nc-book-info-grid' });
      
      infoGrid.createDiv({ cls: 'nc-info-item' }).innerHTML = 
        `<span class="nc-info-label">书名</span><span class="nc-info-value">${book.metadata.title}</span>`;
      infoGrid.createDiv({ cls: 'nc-info-item' }).innerHTML = 
        `<span class="nc-info-label">作者</span><span class="nc-info-value">${book.metadata.author}</span>`;
      infoGrid.createDiv({ cls: 'nc-info-item' }).innerHTML = 
        `<span class="nc-info-label">章节</span><span class="nc-info-value">${book.chapters.length} 章</span>`;
      infoGrid.createDiv({ cls: 'nc-info-item' }).innerHTML = 
        `<span class="nc-info-label">字数</span><span class="nc-info-value">${(book.totalWordCount / 10000).toFixed(1)} 万字</span>`;

      // 更新结束章节输入框的最大值
      const endInput = (this as any)._endInput as HTMLInputElement;
      if (endInput) {
        endInput.max = String(this.totalChapters);
        endInput.value = String(Math.min(50, this.totalChapters));
        this.chapterEnd = Math.min(50, this.totalChapters);
      }

    } catch (error) {
      console.error('加载书籍信息失败:', error);
      this.bookInfoEl.textContent = '加载书籍信息失败';
    }
  }

  /**
   * 创建开始分析按钮
   */
  private createStartButton(container: HTMLElement): void {
    const buttonContainer = container.createDiv({ cls: 'novel-craft-start-container' });
    
    this.startButton = buttonContainer.createEl('button', {
      text: '开始分析',
      cls: 'novel-craft-start-button mod-cta'
    });

    this.startButton.addEventListener('click', () => this.startAnalysis());
    
    // 控制按钮容器（初始隐藏）
    this.controlButtonsContainer = buttonContainer.createDiv({ cls: 'nc-control-buttons' });
    this.controlButtonsContainer.style.display = 'none';
    
    // 暂停/继续按钮
    this.pauseButton = this.controlButtonsContainer.createEl('button', {
      text: '⏸️ 暂停',
      cls: 'nc-control-btn nc-pause-btn'
    });
    this.pauseButton.addEventListener('click', () => this.togglePause());
    
    // 终止按钮
    this.stopButton = this.controlButtonsContainer.createEl('button', {
      text: '⏹️ 终止',
      cls: 'nc-control-btn nc-stop-btn'
    });
    this.stopButton.addEventListener('click', () => this.stopAnalysis());
  }

  /**
   * 切换暂停状态
   */
  private togglePause(): void {
    if (!this.analysisController) return;
    
    const state = this.analysisController.getState();
    if (state === 'running') {
      this.analysisController.pause();
      this.pauseButton.textContent = '▶️ 继续';
      this.pauseButton.removeClass('nc-pause-btn');
      this.pauseButton.addClass('nc-resume-btn');
      this.progressStage.textContent = '已暂停';
      showInfo('分析已暂停，点击继续按钮恢复');
    } else if (state === 'paused') {
      this.analysisController.resume();
      this.pauseButton.textContent = '⏸️ 暂停';
      this.pauseButton.removeClass('nc-resume-btn');
      this.pauseButton.addClass('nc-pause-btn');
      showInfo('分析已恢复');
    }
  }

  /**
   * 终止分析
   */
  private stopAnalysis(): void {
    if (!this.analysisController) return;
    
    this.analysisController.stop();
    this.progressStage.textContent = '正在终止...';
    showWarning('正在终止分析，请稍候...');
  }

  /**
   * 创建进度显示区域
   */
  private createProgressSection(container: HTMLElement): void {
    this.progressContainer = container.createDiv({ cls: 'novel-craft-progress-section' });
    this.progressContainer.style.display = 'none';

    // 当前阶段
    this.progressStage = this.progressContainer.createDiv({ 
      cls: 'novel-craft-progress-stage',
      text: '准备中...'
    });

    // 进度条
    this.progressBar = this.progressContainer.createDiv({ cls: 'novel-craft-progress-bar' });
    this.progressFill = this.progressBar.createDiv({ cls: 'novel-craft-progress-fill' });
    this.progressFill.style.width = '0%';

    // 进度文本
    this.progressText = this.progressContainer.createDiv({
      cls: 'novel-craft-progress-text',
      text: ''
    });
  }

  /**
   * 创建实时结果显示区域
   */
  private createResultsSection(container: HTMLElement): void {
    this.resultsContainer = container.createDiv({ cls: 'nc-results-section' });
    this.resultsContainer.style.display = 'none';

    const header = this.resultsContainer.createDiv({ cls: 'nc-results-header' });
    header.createSpan({ text: '📋 分析结果', cls: 'nc-results-title' });
  }

  /**
   * 添加阶段结果
   */
  private addStageResult(stage: string, status: 'pending' | 'running' | 'completed' | 'error', message: string, result?: string): void {
    // 查找是否已存在该阶段
    const existingIndex = this.stageResults.findIndex(r => r.stage === stage);
    
    if (existingIndex >= 0) {
      // 更新现有阶段
      this.stageResults[existingIndex].status = status;
      this.stageResults[existingIndex].message = message;
      if (result) {
        this.stageResults[existingIndex].result = result;
      }
      if (status === 'completed' || status === 'error') {
        this.stageResults[existingIndex].endTime = Date.now();
      }
    } else {
      // 添加新阶段
      this.stageResults.push({
        stage,
        status,
        message,
        result,
        startTime: Date.now()
      });
    }

    this.renderResults();
  }

  /**
   * 渲染结果列表
   */
  private renderResults(): void {
    // 清空现有内容（保留标题）
    const existingItems = this.resultsContainer.querySelectorAll('.nc-result-item');
    existingItems.forEach(item => item.remove());

    for (const item of this.stageResults) {
      const resultItem = this.resultsContainer.createDiv({ cls: `nc-result-item nc-result-${item.status}` });
      
      // 状态图标和标题
      const header = resultItem.createDiv({ cls: 'nc-result-item-header' });
      
      const statusIcon = this.getStatusIcon(item.status);
      header.createSpan({ text: statusIcon, cls: 'nc-result-status-icon' });
      header.createSpan({ text: item.stage, cls: 'nc-result-stage-name' });
      
      // 耗时
      if (item.startTime && item.endTime) {
        const duration = ((item.endTime - item.startTime) / 1000).toFixed(1);
        header.createSpan({ text: `${duration}s`, cls: 'nc-result-duration' });
      } else if (item.status === 'running') {
        header.createSpan({ text: '⏳', cls: 'nc-result-duration nc-running' });
      }

      // 消息
      const messageEl = resultItem.createDiv({ cls: 'nc-result-message' });
      messageEl.textContent = item.message;

      // 如果有生成的文件，添加打开链接
      if (item.generatedFile) {
        const openLink = resultItem.createEl('button', {
          text: '📂 打开文件',
          cls: 'nc-result-toggle nc-open-file-btn'
        });
        openLink.addEventListener('click', async () => {
          const file = this.app.vault.getAbstractFileByPath(item.generatedFile!);
          if (file instanceof TFile) {
            await this.app.workspace.getLeaf().openFile(file);
          }
        });
      }

      // 结果预览（可折叠）
      if (item.result && item.status === 'completed' && !item.generatedFile) {
        const toggleBtn = resultItem.createEl('button', { 
          text: '查看详情 ▼', 
          cls: 'nc-result-toggle' 
        });
        
        const resultContent = resultItem.createDiv({ cls: 'nc-result-content' });
        resultContent.style.display = 'none';
        
        // 格式化显示结果
        const preview = this.formatResultPreview(item.result);
        resultContent.innerHTML = preview;

        toggleBtn.addEventListener('click', () => {
          const isHidden = resultContent.style.display === 'none';
          resultContent.style.display = isHidden ? 'block' : 'none';
          toggleBtn.textContent = isHidden ? '收起详情 ▲' : '查看详情 ▼';
        });
      }
    }

    // 滚动到底部
    this.resultsContainer.scrollTop = this.resultsContainer.scrollHeight;
  }

  /**
   * 获取状态图标
   */
  private getStatusIcon(status: string): string {
    switch (status) {
      case 'pending': return '⏸️';
      case 'running': return '🔄';
      case 'completed': return '✅';
      case 'error': return '❌';
      default: return '❓';
    }
  }

  /**
   * 格式化结果预览
   */
  private formatResultPreview(result: string): string {
    // 尝试解析 JSON
    try {
      const parsed = JSON.parse(result);
      return `<pre class="nc-result-json">${JSON.stringify(parsed, null, 2)}</pre>`;
    } catch {
      // 不是 JSON，作为普通文本处理
      // 截取前 500 字符
      const truncated = result.length > 500 ? result.substring(0, 500) + '...' : result;
      return `<div class="nc-result-text">${this.escapeHtml(truncated)}</div>`;
    }
  }

  /**
   * HTML 转义
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 开始分析
   */
  private async startAnalysis(): Promise<void> {
    if (this.isAnalyzing) {
      return;
    }

    // 检查 LLM 配置
    if (!this.llmService.getDefaultProvider()) {
      showWarning('请先在设置中配置 LLM 服务');
      return;
    }

    this.isAnalyzing = true;
    this.startButton.disabled = true;
    this.startButton.textContent = '分析中...';
    this.progressContainer.style.display = 'block';
    this.resultsContainer.style.display = 'block';
    
    // 显示控制按钮
    this.controlButtonsContainer.style.display = 'flex';
    this.pauseButton.textContent = '⏸️ 暂停';
    this.pauseButton.removeClass('nc-resume-btn');
    this.pauseButton.addClass('nc-pause-btn');
    
    // 创建分析控制器
    this.analysisController = new AnalysisController((state) => {
      // 状态变化回调
      if (state === 'paused') {
        this.addStageResult('⏸️ 已暂停', 'pending', '等待用户继续...');
      }
    });
    
    // 折叠配置区域
    this.configSection.style.display = 'none';
    
    // 清空之前的结果
    this.stageResults = [];
    this.renderResults();

    let book: ParsedBook | null = null;

    try {
      // 解析 epub 文件
      this.updateProgress({ stage: '解析中', progress: 0, message: '正在解析 epub 文件...' });
      this.addStageResult('解析 EPUB', 'running', '正在解析 epub 文件...');
      
      // 读取 epub 文件
      const file = this.app.vault.getAbstractFileByPath(this.epubPath);
      if (!(file instanceof TFile)) {
        throw new Error(`文件不存在: ${this.epubPath}`);
      }
      const fileData = await this.app.vault.readBinary(file);
      
      const parser = new EpubParser();
      const fullBook = await parser.parse(fileData);

      // 根据章节范围过滤
      if (this.analyzeAllChapters) {
        book = fullBook;
      } else {
        // 过滤章节范围
        const startIdx = Math.max(0, this.chapterStart - 1);
        const endIdx = Math.min(fullBook.chapters.length, this.chapterEnd);
        const filteredChapters = fullBook.chapters.slice(startIdx, endIdx);
        
        // 重新计算字数
        const filteredWordCount = filteredChapters.reduce((sum, ch) => sum + ch.wordCount, 0);
        
        book = {
          ...fullBook,
          chapters: filteredChapters,
          totalWordCount: filteredWordCount
        };
      }

      const rangeText = this.analyzeAllChapters 
        ? `全部 ${book.chapters.length} 章` 
        : `第 ${this.chapterStart}-${this.chapterEnd} 章 (共 ${book.chapters.length} 章)`;

      this.addStageResult('解析 EPUB', 'completed', 
        `解析完成: ${rangeText}, ${book.totalWordCount} 字`,
        JSON.stringify({ 
          title: book.metadata.title, 
          author: book.metadata.author,
          chapters: book.chapters.length,
          wordCount: book.totalWordCount,
          range: this.analyzeAllChapters ? 'all' : `${this.chapterStart}-${this.chapterEnd}`
        })
      );

      // 创建分析配置
      const config: AnalysisConfig = {
        mode: this.selectedMode,
        novelType: this.selectedNovelType,
        customFocus: this.customFocus.length > 0 ? this.customFocus : undefined,
        customTypeName: this.selectedNovelType === 'custom' ? this.customTypeName : undefined,
        customPrompts: this.settings.customPrompts,
        customTypePrompts: this.settings.customTypePrompts
      };

      // 创建分析服务并开始分析
      const analysisService = new AnalysisService(this.llmService);
      
      // 获取输出路径（使用设置中的路径或默认路径）
      const outputPath = this.settings.notesPath || '拆书笔记';
      
      // 文件创建函数
      const createFile = async (path: string, content: string) => {
        // 确保父文件夹存在
        const folderPath = path.substring(0, path.lastIndexOf('/'));
        if (folderPath) {
          const folder = this.app.vault.getAbstractFileByPath(folderPath);
          if (!folder) {
            await this.app.vault.createFolder(folderPath);
          }
        }
        
        // 创建或更新文件
        const existingFile = this.app.vault.getAbstractFileByPath(path);
        if (existingFile instanceof TFile) {
          await this.app.vault.modify(existingFile, content);
        } else {
          await this.app.vault.create(path, content);
        }
      };
      
      // 笔记生成回调
      const onNoteGenerated = (noteType: string, filePath: string) => {
        // 更新对应阶段的生成文件信息
        this.addGeneratedFileInfo(noteType, filePath);
        showInfo(`📝 已生成: ${noteType}`);
      };
      
      // 使用增强的进度回调，支持增量笔记生成和控制器
      const result = await analysisService.analyzeWithResults(
        book,
        config,
        (progress) => this.updateProgress(progress),
        (stage, status, message, result) => this.addStageResult(stage, status, message, result),
        onNoteGenerated,
        createFile,
        outputPath,
        this.analysisController
      );

      // 分析完成
      this.updateProgress({ stage: '完成', progress: 100, message: '分析完成！' });
      showSuccess(`《${book.metadata.title}》分析完成，笔记已生成到 ${outputPath}/${this.sanitizeFileName(book.metadata.title)}`);

      // 回调
      if (this.onAnalysisComplete) {
        this.onAnalysisComplete(result, book);
      }

      // 显示完成按钮
      this.startButton.textContent = '分析完成 ✓';
      this.controlButtonsContainer.style.display = 'none';
      
      // 添加打开文件夹按钮
      const openFolderBtn = this.startButton.parentElement?.createEl('button', {
        text: '打开笔记文件夹',
        cls: 'novel-craft-start-button'
      });
      openFolderBtn?.addEventListener('click', async () => {
        const folderPath = `${outputPath}/${this.sanitizeFileName(book!.metadata.title)}`;
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (folder) {
          // 尝试在文件浏览器中显示
          (this.app as any).internalPlugins?.plugins?.['file-explorer']?.instance?.revealInFolder?.(folder);
        }
      });

    } catch (error) {
      // 检查是否是用户终止
      if (error instanceof AnalysisStoppedError) {
        this.progressStage.textContent = '已终止';
        this.progressText.textContent = '分析已被用户终止';
        this.addStageResult('⏹️ 已终止', 'error', '分析已被用户终止');
        showWarning('分析已终止');
      } else {
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        handleError(error, '分析');
        
        this.progressStage.textContent = '分析失败';
        this.progressText.textContent = errorMessage;
        this.progressText.addClass('novel-craft-error-text');
        
        this.addStageResult('错误', 'error', errorMessage);
      }
    } finally {
      this.isAnalyzing = false;
      this.startButton.disabled = false;
      this.analysisController = null;
      this.controlButtonsContainer.style.display = 'none';
      
      if (!this.startButton.textContent?.includes('完成')) {
        this.startButton.textContent = '重新分析';
      }
      // 显示配置区域
      this.configSection.style.display = 'block';
    }
  }

  /**
   * 添加生成文件信息到结果
   */
  private addGeneratedFileInfo(noteType: string, filePath: string): void {
    // 添加一个新的结果项显示生成的文件
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
   * 更新进度显示
   */
  private updateProgress(progress: AnalysisProgress): void {
    this.progressStage.textContent = progress.stage;
    this.progressFill.style.width = `${Math.min(100, Math.max(0, progress.progress))}%`;
    this.progressText.textContent = progress.message;
  }

  /**
   * 获取当前配置
   */
  getConfig(): AnalysisConfig {
    return {
      mode: this.selectedMode,
      novelType: this.selectedNovelType,
      customFocus: this.customFocus.length > 0 ? this.customFocus : undefined
    };
  }
}
