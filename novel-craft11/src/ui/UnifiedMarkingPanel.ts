/**
 * UnifiedMarkingPanel - 故事单元面板（简化版）
 * 
 * 只保留故事单元功能：
 * - 显示故事单元列表
 * - 查看故事单元详情
 * - 支持从数据库加载
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import { UnifiedMarkingService } from '../services/UnifiedMarkingService';
import { UnifiedMarkRepository } from '../services/UnifiedMarkRepository';
import { LibraryService } from '../services/LibraryService';
import { BookDatabaseService } from '../services/BookDatabaseService';
import { TimelineVisualizationService } from '../services/TimelineVisualizationService';
import { StoryUnit } from '../types/database';
import { showSuccess, showWarning, handleError } from './NotificationUtils';
import { BookSelector } from './BookSelector';

export const UNIFIED_MARKING_PANEL_VIEW_TYPE = 'novelcraft-unified-marking';

export class UnifiedMarkingPanel extends ItemView {
  private markingService: UnifiedMarkingService;
  private repository: UnifiedMarkRepository;
  private libraryService: LibraryService | null = null;
  private bookDatabaseService: BookDatabaseService | null = null;
  private timelineService: TimelineVisualizationService | null = null;
  private bookSelector: BookSelector | null = null;
  
  private currentBookId: string | null = null;
  private currentBookTitle: string = '';
  private currentBookPath: string | null = null;
  private storyUnits: StoryUnit[] = [];

  private mainContent: HTMLElement;
  private welcomeSection: HTMLElement;
  private contentSection: HTMLElement;

  constructor(
    leaf: WorkspaceLeaf,
    markingService: UnifiedMarkingService,
    repository: UnifiedMarkRepository,
    libraryService?: LibraryService,
    bookDatabaseService?: BookDatabaseService,
    timelineService?: TimelineVisualizationService
  ) {
    super(leaf);
    this.markingService = markingService;
    this.repository = repository;
    this.libraryService = libraryService || null;
    this.bookDatabaseService = bookDatabaseService || null;
    this.timelineService = timelineService || null;
  }

  getViewType(): string { return UNIFIED_MARKING_PANEL_VIEW_TYPE; }
  getDisplayText(): string { return '故事单元'; }
  getIcon(): string { return 'file-text'; }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('nc-unified-marking-panel');

    this.mainContent = container.createDiv({ cls: 'nc-marking-content' });
    this.createBookSelector();
    
    this.welcomeSection = this.mainContent.createDiv({ cls: 'nc-welcome-section' });
    this.createWelcomeSection();
    
    this.contentSection = this.mainContent.createDiv({ cls: 'nc-marking-main' });
    this.contentSection.style.display = 'none';
  }

  async onClose(): Promise<void> {
    if (this.bookSelector) this.bookSelector.destroy();
  }

  /**
   * 刷新面板
   */
  async refresh(): Promise<void> {
    if (this.currentBookId) {
      await this.loadStoryUnits();
    }
  }

  private createBookSelector(): void {
    if (!this.libraryService) return;
    if (this.bookSelector) this.bookSelector.destroy();
    
    this.bookSelector = new BookSelector(this.app, this.libraryService);
    this.bookSelector.render(this.mainContent);
    
    const selectorEl = this.mainContent.querySelector('.novelcraft-book-selector');
    if (selectorEl) this.mainContent.insertBefore(selectorEl, this.mainContent.firstChild);
    
    this.bookSelector.setOnSelect((bookId, book) => this.setBook(bookId, book.title, book.folderPath));
  }

  private createWelcomeSection(): void {
    this.welcomeSection.createEl('div', { text: '📖', cls: 'nc-welcome-icon' });
    this.welcomeSection.createEl('h3', { text: '故事单元', cls: 'nc-welcome-title' });
    this.welcomeSection.createEl('p', { text: '选择一本书籍查看故事单元', cls: 'nc-welcome-hint' });
    
    const features = this.welcomeSection.createDiv({ cls: 'nc-welcome-features' });
    features.createEl('p', { text: '📋 查看已创建的故事单元' });
    features.createEl('p', { text: '🔍 查看 AI 分析结果' });
    features.createEl('p', { text: '📊 按章节范围组织' });
  }

  async setBook(bookId: string, bookTitle: string, bookPath?: string): Promise<void> {
    this.currentBookId = bookId;
    this.currentBookTitle = bookTitle;
    this.currentBookPath = bookPath || null;

    this.welcomeSection.style.display = 'none';
    this.contentSection.style.display = 'flex';
    this.contentSection.empty();
    
    await this.createContentSection();
    await this.loadStoryUnits();
  }

  private async createContentSection(): Promise<void> {
    // 标题栏
    const header = this.contentSection.createDiv({ cls: 'nc-marking-header' });
    const titleRow = header.createDiv({ cls: 'nc-marking-title-row' });
    titleRow.createEl('h3', { text: `📖 ${this.currentBookTitle}`, cls: 'nc-marking-title' });

    // 列表容器
    const listContainer = this.contentSection.createDiv({ cls: 'nc-story-unit-list' });
    listContainer.setAttribute('id', 'story-unit-list');
  }

  private async loadStoryUnits(): Promise<void> {
    if (!this.currentBookPath || !this.bookDatabaseService) {
      this.renderEmptyState();
      return;
    }

    try {
      this.storyUnits = await this.bookDatabaseService.getStoryUnits(this.currentBookPath);
      this.renderStoryUnitList();
    } catch (error) {
      console.error('加载故事单元失败:', error);
      this.renderEmptyState();
    }
  }

  private renderEmptyState(): void {
    const listContainer = this.contentSection.querySelector('#story-unit-list');
    if (!listContainer) return;
    
    listContainer.empty();
    const emptyDiv = listContainer.createDiv({ cls: 'nc-empty-hint' });
    emptyDiv.createEl('p', { text: '暂无故事单元' });
    emptyDiv.createEl('p', { text: '打开章节文件，点击工具栏的"故事单元"按钮创建', cls: 'nc-hint-small' });
  }

  private renderStoryUnitList(): void {
    const listContainer = this.contentSection.querySelector('#story-unit-list');
    if (!listContainer) return;
    
    listContainer.empty();

    if (this.storyUnits.length === 0) {
      this.renderEmptyState();
      return;
    }

    // 统计信息
    const statsDiv = listContainer.createDiv({ cls: 'nc-stats-row' });
    statsDiv.createSpan({ text: `共 ${this.storyUnits.length} 个故事单元` });

    // 故事单元列表
    const list = listContainer.createDiv({ cls: 'nc-unit-list' });
    
    for (const unit of this.storyUnits) {
      const item = list.createDiv({ cls: 'nc-unit-item' });
      
      // 标题行
      const titleRow = item.createDiv({ cls: 'nc-unit-title-row' });
      
      // 线类型图标
      const lineIcon = this.getLineTypeIcon(unit.lineType);
      titleRow.createSpan({ text: lineIcon, cls: 'nc-unit-icon' });
      
      // 名称
      titleRow.createSpan({ text: unit.name, cls: 'nc-unit-name' });
      
      // 章节范围
      const chapterRange = titleRow.createSpan({ cls: 'nc-unit-chapters' });
      if (unit.chapterRange.start === unit.chapterRange.end) {
        chapterRange.textContent = `第${unit.chapterRange.start}章`;
      } else {
        chapterRange.textContent = `第${unit.chapterRange.start}-${unit.chapterRange.end}章`;
      }

      // 内容预览
      if (unit.textContent) {
        const preview = item.createDiv({ cls: 'nc-unit-preview' });
        preview.textContent = unit.textContent.slice(0, 100) + (unit.textContent.length > 100 ? '...' : '');
      }

      // AI 分析结果
      if (unit.aiAnalysis) {
        const analysisDiv = item.createDiv({ cls: 'nc-unit-analysis' });
        
        if (unit.aiAnalysis.summary) {
          const summaryDiv = analysisDiv.createDiv({ cls: 'nc-analysis-summary' });
          summaryDiv.createSpan({ text: '📝 ', cls: 'nc-analysis-icon' });
          summaryDiv.createSpan({ text: unit.aiAnalysis.summary.slice(0, 150) + '...' });
        }

        // 7步法分析
        if (unit.aiAnalysis.sevenStep) {
          const sevenStepDiv = analysisDiv.createDiv({ cls: 'nc-seven-step-preview' });
          sevenStepDiv.createSpan({ text: '🔄 7步法分析', cls: 'nc-analysis-label' });
          
          const steps = unit.aiAnalysis.sevenStep;
          const stepCount = [
            steps.step1Advantage,
            steps.step2Villain,
            steps.step3Friction,
            steps.step4Expectation,
            steps.step5Climax,
            steps.step6Shock,
            steps.step7Reward
          ].filter(Boolean).length;
          
          sevenStepDiv.createSpan({ text: ` (${stepCount}/7步)`, cls: 'nc-step-count' });
        }
      }

      // 点击展开详情
      item.addEventListener('click', () => this.showUnitDetail(unit));
    }
  }

  private getLineTypeIcon(lineType: string): string {
    const icons: Record<string, string> = {
      main: '📖',
      sub: '📑',
      independent: '📄',
      custom: '🏷️'
    };
    return icons[lineType] || '📖';
  }

  private showUnitDetail(unit: StoryUnit): void {
    // 创建详情弹窗
    const modal = document.createElement('div');
    modal.className = 'nc-unit-detail-modal';
    
    const overlay = document.createElement('div');
    overlay.className = 'nc-modal-overlay';
    overlay.addEventListener('click', () => modal.remove());
    
    const content = document.createElement('div');
    content.className = 'nc-modal-content';
    
    // 标题
    const header = content.createDiv({ cls: 'nc-detail-header' });
    header.createEl('h3', { text: `${this.getLineTypeIcon(unit.lineType)} ${unit.name}` });
    
    const closeBtn = header.createEl('button', { text: '×', cls: 'nc-close-btn' });
    closeBtn.addEventListener('click', () => modal.remove());

    // 基本信息
    const infoSection = content.createDiv({ cls: 'nc-detail-section' });
    infoSection.createEl('h4', { text: '基本信息' });
    
    const infoList = infoSection.createEl('ul');
    infoList.createEl('li', { text: `章节范围: 第${unit.chapterRange.start}-${unit.chapterRange.end}章` });
    infoList.createEl('li', { text: `故事线: ${this.getLineTypeLabel(unit.lineType)}` });
    infoList.createEl('li', { text: `分析模板: ${unit.analysisTemplate || '7步法'}` });
    infoList.createEl('li', { text: `创建时间: ${new Date(unit.createdAt).toLocaleString()}` });

    // AI 分析结果
    if (unit.aiAnalysis) {
      const analysisSection = content.createDiv({ cls: 'nc-detail-section' });
      analysisSection.createEl('h4', { text: 'AI 分析结果' });

      if (unit.aiAnalysis.summary) {
        const summaryDiv = analysisSection.createDiv({ cls: 'nc-analysis-block' });
        summaryDiv.createEl('h5', { text: '📝 摘要' });
        summaryDiv.createEl('p', { text: unit.aiAnalysis.summary });
      }

      if (unit.aiAnalysis.sevenStep) {
        const sevenStepDiv = analysisSection.createDiv({ cls: 'nc-analysis-block' });
        sevenStepDiv.createEl('h5', { text: '🔄 7步法分析' });
        
        const steps = [
          { key: 'step1Advantage', label: '①主角优势' },
          { key: 'step2Villain', label: '②反派出场' },
          { key: 'step3Friction', label: '③摩擦交集' },
          { key: 'step4Expectation', label: '④拉期待' },
          { key: 'step5Climax', label: '⑤冲突爆发' },
          { key: 'step6Shock', label: '⑥震惊四座' },
          { key: 'step7Reward', label: '⑦收获奖励' }
        ];

        const stepList = sevenStepDiv.createEl('div', { cls: 'nc-seven-step-list' });
        for (const step of steps) {
          const value = (unit.aiAnalysis.sevenStep as any)[step.key];
          if (value) {
            const stepItem = stepList.createDiv({ cls: 'nc-step-item' });
            stepItem.createEl('strong', { text: step.label + ': ' });
            stepItem.createSpan({ text: value });
          }
        }
      }

      if (unit.aiAnalysis.techniques && unit.aiAnalysis.techniques.length > 0) {
        const techDiv = analysisSection.createDiv({ cls: 'nc-analysis-block' });
        techDiv.createEl('h5', { text: '✨ 写作技法' });
        const techList = techDiv.createEl('ul');
        for (const tech of unit.aiAnalysis.techniques) {
          techList.createEl('li', { text: tech });
        }
      }

      if (unit.aiAnalysis.takeaways && unit.aiAnalysis.takeaways.length > 0) {
        const takeawayDiv = analysisSection.createDiv({ cls: 'nc-analysis-block' });
        takeawayDiv.createEl('h5', { text: '💡 可借鉴点' });
        const takeawayList = takeawayDiv.createEl('ul');
        for (const item of unit.aiAnalysis.takeaways) {
          takeawayList.createEl('li', { text: item });
        }
      }
    }

    modal.appendChild(overlay);
    modal.appendChild(content);
    document.body.appendChild(modal);
  }

  private getLineTypeLabel(lineType: string): string {
    const labels: Record<string, string> = {
      main: '主线',
      sub: '支线',
      independent: '独立',
      custom: '自定义'
    };
    return labels[lineType] || lineType;
  }

  // 导出功能
  private async exportToJson(): Promise<void> {
    if (this.storyUnits.length === 0) {
      showWarning('没有可导出的故事单元');
      return;
    }

    const data = {
      bookTitle: this.currentBookTitle,
      exportedAt: new Date().toISOString(),
      storyUnits: this.storyUnits
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.currentBookTitle}-故事单元.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showSuccess('导出成功');
  }
}
