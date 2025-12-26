/**
 * 时间线视图
 * 多轨道时间线可视化的主视图组件
 * 
 * Requirements: 3.1, 3.2, 9.1
 */

import { ItemView, WorkspaceLeaf, normalizePath, TFolder } from 'obsidian';
import { StoryUnitService, ChapterInfo } from '../services/StoryUnitService';
import { TrackService } from '../services/TrackService';
import { RelationService } from '../services/RelationService';
import { databaseService } from '../services/DatabaseService';
import { StoryUnitRecord, TrackRecord, TimelineConfigRecord, BookRecord, RelationRecord } from '../types/database';
import { RelationType } from '../types/timeline';
import { NovelCraftSettings, DEFAULT_SETTINGS } from '../types';
import { showSuccess, showError, showWarning, showInfo } from './NotificationUtils';
import { TimelineRenderer, TimelineRenderConfig } from './TimelineRenderer';
import { RelationEditModal, RelationTypeSelector } from './RelationEditModal';

export const TIMELINE_VIEW_TYPE = 'novel-craft-timeline-view';

/**
 * 默认时间线配置
 */
const DEFAULT_TIMELINE_CONFIG: Omit<TimelineConfigRecord, 'id' | 'book_id' | 'create_time' | 'update_time'> = {
  past_event_area: true,
  zoom_level: 1,
  chapter_width: 80,
  track_height: 60,
  track_spacing: 8
};

/**
 * 时间线视图类
 */
export class TimelineView extends ItemView {
  private storyUnitService: StoryUnitService;
  private trackService: TrackService;
  private relationService: RelationService;
  
  // 当前书籍
  private currentBookId: string | null = null;
  private currentBook: BookRecord | null = null;
  
  // 数据
  private units: StoryUnitRecord[] = [];
  private tracks: TrackRecord[] = [];
  private chapters: ChapterInfo[] = [];
  private relations: RelationRecord[] = [];
  private timelineConfig: TimelineConfigRecord | null = null;
  
  // 渲染器
  private renderer: TimelineRenderer | null = null;
  
  // UI 元素
  private toolbarEl: HTMLElement | null = null;
  private timelineContentEl: HTMLElement | null = null;
  private emptyStateEl: HTMLElement | null = null;
  private relationToolbarEl: HTMLElement | null = null;
  private unitListEl: HTMLElement | null = null;
  
  // 关联模式状态
  private relationModeActive: boolean = false;
  private _selectedRelationType: RelationType = RelationType.CAUSAL;
  private relationTypeSelector: RelationTypeSelector | null = null;
  
  // 关联创建状态（用于两步点击创建关联）
  private _relationCreateSourceUnit: StoryUnitRecord | null = null;
  
  // 插件设置（用于获取导出路径）
  private settings: NovelCraftSettings = DEFAULT_SETTINGS;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.storyUnitService = new StoryUnitService(this.app);
    this.trackService = new TrackService();
    this.relationService = new RelationService();
    
    // 从插件实例获取设置
    this.loadSettings();
  }
  
  /**
   * 加载插件设置
   */
  private loadSettings(): void {
    // 通过 app.plugins 获取插件实例的设置
    const plugin = (this.app as any).plugins?.plugins?.['novel-craft'];
    if (plugin?.settings) {
      this.settings = plugin.settings;
    }
  }

  getViewType(): string {
    return TIMELINE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return '故事时间线';
  }

  getIcon(): string {
    return 'git-branch';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('nc-timeline-view');

    // 工具栏
    this.toolbarEl = container.createDiv({ cls: 'nc-timeline-toolbar' });
    this.renderToolbar();

    // 主体区域（左侧列表 + 右侧时间线）
    const mainArea = container.createDiv({ cls: 'nc-timeline-main-area' });
    
    // 左侧故事单元列表
    this.unitListEl = mainArea.createDiv({ cls: 'nc-timeline-unit-list' });
    
    // 右侧内容区域
    this.timelineContentEl = mainArea.createDiv({ cls: 'nc-timeline-content' });
    
    // 空状态提示
    this.emptyStateEl = container.createDiv({ cls: 'nc-timeline-empty' });
    this.showEmptyState('请打开一本书籍以查看时间线');
    
    // 监听故事单元变化事件，自动刷新时间线
    // @ts-ignore - 自定义事件类型
    const eventRef = this.app.workspace.on('novel-craft:story-unit-changed', (bookId: string) => {
      if (bookId === this.currentBookId) {
        this.refresh();
      }
    });
    this.register(() => this.app.workspace.offref(eventRef));
  }

  async onClose(): Promise<void> {
    if (this.renderer) {
      this.renderer.destroy();
      this.renderer = null;
    }
    if (this.relationTypeSelector) {
      this.relationTypeSelector.destroy();
      this.relationTypeSelector = null;
    }
  }

  /**
   * 设置当前书籍
   */
  async setBook(bookId: string): Promise<void> {
    this.currentBookId = bookId;
    await this.loadData();
    this.renderTimeline();
  }

  /**
   * 清除当前书籍
   */
  clearBook(): void {
    this.currentBookId = null;
    this.currentBook = null;
    this.units = [];
    this.tracks = [];
    this.chapters = [];
    this.timelineConfig = null;
    
    if (this.renderer) {
      this.renderer.destroy();
      this.renderer = null;
    }
    
    this.showEmptyState('请打开一本书籍以查看时间线');
    this.renderToolbar();
  }

  /**
   * 刷新视图
   */
  async refresh(): Promise<void> {
    if (!this.currentBookId) return;
    await this.loadData();
    this.renderTimeline();
  }

  /**
   * 加载数据
   */
  private async loadData(): Promise<void> {
    if (!this.currentBookId) return;
    
    try {
      // 加载书籍信息
      this.currentBook = await databaseService.books.getById(this.currentBookId);
      
      // 加载故事单元
      this.units = await this.storyUnitService.getStoryUnitsByBook(this.currentBookId);
      
      // 加载轨道
      this.tracks = await this.trackService.getTracksByBook(this.currentBookId);
      
      // 如果没有轨道，初始化默认轨道
      if (this.tracks.length === 0) {
        this.tracks = await this.trackService.initializeDefaultTracks(this.currentBookId);
      }
      
      // 加载章节信息
      this.chapters = await this.storyUnitService.getBookChapters(this.currentBookId);
      
      // 加载关联关系
      this.relations = await this.relationService.getRelationsByBook(this.currentBookId);
      
      // 调试日志
      console.log('NovelCraft [TimelineView] loadData:', {
        bookId: this.currentBookId,
        unitsCount: this.units.length,
        tracksCount: this.tracks.length,
        chaptersCount: this.chapters.length,
        units: this.units.map(u => ({ id: u.id, title: u.title, track_id: u.track_id })),
        tracks: this.tracks.map(t => ({ id: t.id, name: t.name, type: t.type }))
      });
      
      // 加载或创建时间线配置
      const configs = await databaseService.timelineConfigs.query({ book_id: this.currentBookId });
      if (configs.length > 0) {
        this.timelineConfig = configs[0];
      } else {
        // 创建默认配置
        const configId = await databaseService.timelineConfigs.create({
          book_id: this.currentBookId,
          ...DEFAULT_TIMELINE_CONFIG
        });
        this.timelineConfig = await databaseService.timelineConfigs.getById(configId);
      }
    } catch (error) {
      console.error('NovelCraft [TimelineView] loadData error:', error);
      showError('加载时间线数据失败', error instanceof Error ? error.message : '未知错误');
    }
  }

  /**
   * 渲染工具栏
   */
  private renderToolbar(): void {
    if (!this.toolbarEl) return;
    this.toolbarEl.empty();

    // 左侧：书名
    const leftSection = this.toolbarEl.createDiv({ cls: 'nc-timeline-toolbar-left' });
    
    if (this.currentBook) {
      const titleEl = leftSection.createEl('input', {
        type: 'text',
        cls: 'nc-timeline-title-input',
        value: this.currentBook.title
      });
      titleEl.addEventListener('blur', async () => {
        if (this.currentBook && titleEl.value.trim() !== this.currentBook.title) {
          await databaseService.books.update(this.currentBook.id, { title: titleEl.value.trim() });
          this.currentBook.title = titleEl.value.trim();
          showInfo('书名已更新');
        }
      });
      titleEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          titleEl.blur();
        }
      });
    } else {
      leftSection.createSpan({ text: '📚 故事时间线', cls: 'nc-timeline-title' });
    }

    // 右侧：工具按钮
    const rightSection = this.toolbarEl.createDiv({ cls: 'nc-timeline-toolbar-right' });

    // 缩放控制
    const zoomGroup = rightSection.createDiv({ cls: 'nc-timeline-zoom-group' });
    
    const zoomOutBtn = zoomGroup.createEl('button', {
      text: '−',
      cls: 'nc-btn nc-btn-small nc-timeline-zoom-btn',
      attr: { title: '缩小 (Shift+点击 快速缩小)' }
    });
    zoomOutBtn.addEventListener('click', (e) => {
      // Shift 键快速缩放
      const delta = e.shiftKey ? -0.2 : -0.1;
      this.handleZoom(delta);
    });
    
    const zoomLabel = zoomGroup.createSpan({ 
      cls: 'nc-timeline-zoom-label',
      text: `${Math.round((this.timelineConfig?.zoom_level || 1) * 100)}%`
    });
    // 点击缩放标签可以输入精确值
    zoomLabel.addEventListener('click', () => this.showZoomInput());
    zoomLabel.title = '点击输入精确缩放值';
    
    const zoomInBtn = zoomGroup.createEl('button', {
      text: '+',
      cls: 'nc-btn nc-btn-small nc-timeline-zoom-btn',
      attr: { title: '放大 (Shift+点击 快速放大)' }
    });
    zoomInBtn.addEventListener('click', (e) => {
      const delta = e.shiftKey ? 0.2 : 0.1;
      this.handleZoom(delta);
    });

    // 轨道高度控制
    const trackHeightGroup = rightSection.createDiv({ cls: 'nc-timeline-height-group' });
    trackHeightGroup.createSpan({ text: '高度:', cls: 'nc-timeline-height-label' });
    
    const heightSelect = trackHeightGroup.createEl('select', {
      cls: 'nc-timeline-height-select'
    });
    const heightOptions = [
      { value: '40', label: '紧凑' },
      { value: '60', label: '标准' },
      { value: '80', label: '舒适' },
      { value: '100', label: '宽松' }
    ];
    for (const opt of heightOptions) {
      const option = heightSelect.createEl('option', { value: opt.value, text: opt.label });
      if (parseInt(opt.value) === (this.timelineConfig?.track_height || 60)) {
        option.selected = true;
      }
    }
    heightSelect.addEventListener('change', () => this.handleTrackHeightChange(parseInt(heightSelect.value)));

    // 新增轨道按钮
    const addTrackBtn = rightSection.createEl('button', {
      text: '➕ 轨道',
      cls: 'nc-btn nc-btn-small',
      attr: { title: '新增支线轨道' }
    });
    addTrackBtn.addEventListener('click', () => this.handleAddTrack());

    // 关联模式切换按钮
    const relationModeBtn = rightSection.createEl('button', {
      text: '🔗 关联',
      cls: `nc-btn nc-btn-small ${this.relationModeActive ? 'nc-btn-active' : ''}`,
      attr: { title: '切换关联模式 (Alt+拖拽创建关联)' }
    });
    relationModeBtn.addEventListener('click', () => this.handleToggleRelationMode());

    // 导出按钮
    const exportBtn = rightSection.createEl('button', {
      text: '📤 导出',
      cls: 'nc-btn nc-btn-small',
      attr: { title: '导出时间线' }
    });
    exportBtn.addEventListener('click', () => this.handleExport());

    // 刷新按钮
    const refreshBtn = rightSection.createEl('button', {
      text: '🔄',
      cls: 'nc-btn nc-btn-small',
      attr: { title: '刷新' }
    });
    refreshBtn.addEventListener('click', () => this.refresh());
    
    // 关联类型选择器（仅在关联模式激活时显示）
    this.renderRelationToolbar();
  }

  /**
   * 渲染关联工具栏（关联类型选择器）
   */
  private renderRelationToolbar(): void {
    // 移除旧的关联工具栏
    if (this.relationToolbarEl) {
      this.relationToolbarEl.remove();
      this.relationToolbarEl = null;
    }
    
    // 销毁旧的类型选择器
    if (this.relationTypeSelector) {
      this.relationTypeSelector.destroy();
      this.relationTypeSelector = null;
    }
    
    // 仅在关联模式激活时显示
    if (!this.relationModeActive || !this.toolbarEl) return;
    
    // 创建关联工具栏
    this.relationToolbarEl = this.toolbarEl.createDiv({ cls: 'nc-relation-toolbar' });
    
    // 提示文字
    this.relationToolbarEl.createSpan({ 
      cls: 'nc-relation-toolbar-hint',
      text: '选择关联类型，然后点击源单元再点击目标单元创建关联：'
    });
    
    // 关联类型选择器
    this.relationTypeSelector = new RelationTypeSelector(
      this.relationToolbarEl,
      (type: RelationType) => {
        this._selectedRelationType = type;
      }
    );
  }

  /**
   * 渲染时间线
   */
  private renderTimeline(): void {
    if (!this.timelineContentEl || !this.currentBookId) return;

    // 更新工具栏
    this.renderToolbar();

    // 检查是否有数据
    if (this.units.length === 0) {
      this.showEmptyState('暂无故事单元，请先创建故事单元');
      return;
    }

    this.hideEmptyState();
    this.timelineContentEl.empty();
    
    // 渲染故事单元列表
    this.renderUnitList();

    // 创建渲染器配置
    const renderConfig: TimelineRenderConfig = {
      bookId: this.currentBookId,
      bookTitle: this.currentBook?.title, // 传递书名用于导出文件命名
      units: this.units,
      tracks: this.tracks,
      chapters: this.chapters,
      config: this.timelineConfig!,
      relations: this.relations,
      relationService: this.relationService,
      onUnitClick: (unit: StoryUnitRecord) => this.handleUnitClick(unit),
      onUnitDragEnd: (unit: StoryUnitRecord, newPosition: { start: number; trackId: string }) => this.handleUnitDragEnd(unit, newPosition),
      onTrackReorder: (trackIds: string[]) => this.handleTrackReorder(trackIds),
      onTrackEdit: (track: TrackRecord) => this.handleTrackEdit(track),
      onTrackDelete: (trackId: string) => this.handleTrackDelete(trackId),
      onTrackColorChange: (trackId: string, color: string) => this.handleTrackColorChange(trackId, color),
      onRelationClick: (relation: RelationRecord) => this.handleRelationClick(relation),
      onRelationCreate: (sourceUnitId: string, targetUnitId: string) => this.handleRelationCreate(sourceUnitId, targetUnitId)
    };

    // 创建或更新渲染器
    if (this.renderer) {
      this.renderer.update(renderConfig);
    } else {
      this.renderer = new TimelineRenderer(this.timelineContentEl, renderConfig);
    }
    
    // 自动滚动到第一个故事单元
    this.scrollToFirstUnit();
  }

  /**
   * 渲染故事单元列表
   */
  private renderUnitList(): void {
    if (!this.unitListEl) return;
    this.unitListEl.empty();
    
    // 列表标题
    const headerEl = this.unitListEl.createDiv({ cls: 'nc-timeline-unit-list-header' });
    headerEl.createSpan({ text: '📋 故事单元', cls: 'nc-timeline-unit-list-title' });
    headerEl.createSpan({ text: `(${this.units.length})`, cls: 'nc-timeline-unit-list-count' });
    
    // 列表内容
    const listContent = this.unitListEl.createDiv({ cls: 'nc-timeline-unit-list-content' });
    
    // 按章节顺序排序
    const sortedUnits = [...this.units].sort((a, b) => a.chapter_start - b.chapter_start);
    
    for (const unit of sortedUnits) {
      const track = this.tracks.find(t => t.id === unit.track_id);
      
      const itemEl = listContent.createDiv({ cls: 'nc-timeline-unit-list-item' });
      itemEl.dataset.unitId = unit.id;
      
      // 颜色指示器
      const colorDot = itemEl.createSpan({ cls: 'nc-timeline-unit-list-color' });
      colorDot.style.backgroundColor = track?.color || '#666';
      
      // 单元信息
      const infoEl = itemEl.createDiv({ cls: 'nc-timeline-unit-list-info' });
      infoEl.createDiv({ cls: 'nc-timeline-unit-list-name', text: unit.title });
      infoEl.createDiv({ 
        cls: 'nc-timeline-unit-list-range', 
        text: `第${unit.chapter_start}-${unit.chapter_end}章` 
      });
      
      // 点击跳转
      itemEl.addEventListener('click', () => {
        this.scrollToUnit(unit);
        // 高亮选中项
        listContent.querySelectorAll('.nc-timeline-unit-list-item').forEach(el => {
          el.classList.remove('nc-timeline-unit-list-item-active');
        });
        itemEl.classList.add('nc-timeline-unit-list-item-active');
      });
    }
  }

  /**
   * 滚动到第一个故事单元
   */
  private scrollToFirstUnit(): void {
    if (this.units.length === 0) return;
    
    // 找到最早的故事单元
    const firstUnit = [...this.units].sort((a, b) => a.chapter_start - b.chapter_start)[0];
    if (firstUnit) {
      // 延迟执行，确保渲染完成
      setTimeout(() => {
        this.scrollToUnit(firstUnit);
      }, 100);
    }
  }

  /**
   * 滚动到指定故事单元
   */
  private scrollToUnit(unit: StoryUnitRecord): void {
    if (!this.renderer || !this.timelineContentEl) return;
    
    const chapterWidth = (this.timelineConfig?.chapter_width || 80) * (this.timelineConfig?.zoom_level || 1);
    const targetX = (unit.time_position_start - 1) * chapterWidth;
    
    // 滚动到目标位置，留出一些边距
    const containerWidth = this.timelineContentEl.clientWidth;
    const scrollTarget = Math.max(0, targetX - containerWidth / 4);
    
    // 找到滚动容器
    const scrollContainer = this.timelineContentEl.querySelector('.nc-timeline');
    if (scrollContainer) {
      scrollContainer.scrollTo({
        left: scrollTarget,
        behavior: 'smooth'
      });
    }
    
    // 高亮目标单元
    this.highlightUnit(unit.id);
  }

  /**
   * 高亮指定故事单元
   */
  private highlightUnit(unitId: string): void {
    // 移除之前的高亮
    this.timelineContentEl?.querySelectorAll('.nc-timeline-unit-highlight').forEach(el => {
      el.classList.remove('nc-timeline-unit-highlight');
    });
    
    // 添加新的高亮
    const unitEl = this.timelineContentEl?.querySelector(`[data-unit-id="${unitId}"]`);
    if (unitEl) {
      unitEl.classList.add('nc-timeline-unit-highlight');
      // 3秒后移除高亮
      setTimeout(() => {
        unitEl.classList.remove('nc-timeline-unit-highlight');
      }, 3000);
    }
  }

  /**
   * 显示空状态
   */
  private showEmptyState(message: string): void {
    if (this.emptyStateEl) {
      this.emptyStateEl.empty();
      this.emptyStateEl.createSpan({ text: message });
      this.emptyStateEl.style.display = 'flex';
    }
    if (this.timelineContentEl) {
      this.timelineContentEl.style.display = 'none';
    }
  }

  /**
   * 隐藏空状态
   */
  private hideEmptyState(): void {
    if (this.emptyStateEl) {
      this.emptyStateEl.style.display = 'none';
    }
    if (this.timelineContentEl) {
      this.timelineContentEl.style.display = 'block';
    }
  }

  /**
   * 处理缩放
   * 支持更大的缩放范围：0.05 - 3.0 (5% - 300%)
   */
  private async handleZoom(delta: number): Promise<void> {
    if (!this.timelineConfig) return;
    
    // 最小缩放0.05（5%），最大缩放3.0（300%）
    const newZoom = Math.max(0.05, Math.min(3, this.timelineConfig.zoom_level + delta));
    await databaseService.timelineConfigs.update(this.timelineConfig.id, { zoom_level: newZoom });
    this.timelineConfig.zoom_level = newZoom;
    
    this.renderToolbar();
    if (this.renderer) {
      this.renderer.setZoom(newZoom);
    }
  }

  /**
   * 显示缩放输入框
   */
  private showZoomInput(): void {
    const currentZoom = Math.round((this.timelineConfig?.zoom_level || 1) * 100);
    const input = prompt('请输入缩放比例 (5-300):', String(currentZoom));
    if (input) {
      const value = parseInt(input);
      if (!isNaN(value) && value >= 5 && value <= 300) {
        const newZoom = value / 100;
        this.handleZoom(newZoom - (this.timelineConfig?.zoom_level || 1));
      } else {
        showWarning('请输入 5-300 之间的数字');
      }
    }
  }

  /**
   * 处理轨道高度变化
   */
  private async handleTrackHeightChange(height: number): Promise<void> {
    if (!this.timelineConfig) return;
    
    await databaseService.timelineConfigs.update(this.timelineConfig.id, { track_height: height });
    this.timelineConfig.track_height = height;
    
    // 重新渲染时间线
    this.renderTimeline();
    showInfo(`轨道高度已调整为 ${height}px`);
  }

  /**
   * 处理新增轨道
   */
  private async handleAddTrack(): Promise<void> {
    if (!this.currentBookId) return;
    
    try {
      await this.trackService.addSideTrack(this.currentBookId);
      await this.loadData();
      this.renderTimeline();
      showSuccess('已添加新轨道');
    } catch (error) {
      showError('添加轨道失败', error instanceof Error ? error.message : '未知错误');
    }
  }

  /**
   * 处理关联模式切换
   */
  private handleToggleRelationMode(): void {
    this.relationModeActive = !this.relationModeActive;
    
    // 切换渲染器的关联模式
    if (this.renderer) {
      this.renderer.toggleRelationMode();
    }
    
    // 退出关联模式时清除创建状态
    if (!this.relationModeActive) {
      this._relationCreateSourceUnit = null;
    }
    
    // 更新工具栏显示
    this.renderToolbar();
    
    // 显示提示
    if (this.relationModeActive) {
      showInfo('已进入关联模式，点击源单元再点击目标单元创建关联');
    } else {
      showInfo('已退出关联模式');
    }
  }

  /**
   * 处理导出
   * 将时间线导出为图片并保存到 Vault 中的指定路径
   */
  private async handleExport(): Promise<void> {
    if (!this.renderer) return;
    
    try {
      // 刷新设置
      this.loadSettings();
      
      const format = await this.showExportDialog();
      if (format) {
        // 获取导出数据
        const result = await this.renderer.export(format);
        if (!result) {
          showError('导出失败', '无法生成导出数据');
          return;
        }
        
        // 获取导出路径
        const exportPath = this.settings.timelineExportPath || 'NovelCraft/attachments';
        const fullPath = normalizePath(`${exportPath}/${result.filename}`);
        
        // 确保目录存在
        await this.ensureDirectoryExists(exportPath);
        
        // 将 Blob 转换为 ArrayBuffer
        const arrayBuffer = await result.blob.arrayBuffer();
        
        // 检查文件是否已存在
        const existingFile = this.app.vault.getAbstractFileByPath(fullPath);
        if (existingFile) {
          // 覆盖已存在的文件
          await this.app.vault.modifyBinary(existingFile as any, arrayBuffer);
        } else {
          // 创建新文件
          await this.app.vault.createBinary(fullPath, arrayBuffer);
        }
        
        showSuccess(`时间线已导出到: ${fullPath}`);
      }
    } catch (error) {
      console.error('NovelCraft [TimelineView] 导出失败:', error);
      showError('导出失败', error instanceof Error ? error.message : '未知错误');
    }
  }
  
  /**
   * 确保目录存在
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    const normalizedPath = normalizePath(dirPath);
    const parts = normalizedPath.split('/').filter(p => p);
    let currentPath = '';
    
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const folder = this.app.vault.getAbstractFileByPath(currentPath);
      
      if (!folder) {
        await this.app.vault.createFolder(currentPath);
      } else if (!(folder instanceof TFolder)) {
        throw new Error(`路径 "${currentPath}" 已存在但不是文件夹`);
      }
    }
  }

  /**
   * 显示导出对话框
   * 美化的导出选项弹窗，显示导出路径信息
   */
  private showExportDialog(): Promise<'svg' | 'png' | null> {
    // 刷新设置获取最新导出路径
    this.loadSettings();
    const exportPath = this.settings.timelineExportPath || 'NovelCraft/attachments';
    
    return new Promise((resolve) => {
      // 创建导出选择弹窗
      const modal = document.createElement('div');
      modal.className = 'nc-export-modal-overlay';
      modal.innerHTML = `
        <div class="nc-export-modal nc-export-modal-enhanced">
          <div class="nc-export-modal-header">
            <span class="nc-export-modal-icon">📤</span>
            <span class="nc-export-modal-title">导出时间线</span>
          </div>
          <div class="nc-export-modal-path">
            <span class="nc-export-path-label">📁 保存位置:</span>
            <span class="nc-export-path-value">${exportPath}</span>
            <span class="nc-export-path-hint">可在插件设置中修改</span>
          </div>
          <div class="nc-export-modal-content">
            <button class="nc-btn nc-export-option nc-export-option-enhanced" data-format="svg">
              <div class="nc-export-option-icon">📄</div>
              <div class="nc-export-option-info">
                <span class="nc-export-label">SVG 矢量图</span>
                <span class="nc-export-desc">可无损缩放，适合编辑和打印</span>
              </div>
              <div class="nc-export-option-badge">推荐</div>
            </button>
            <button class="nc-btn nc-export-option nc-export-option-enhanced" data-format="png">
              <div class="nc-export-option-icon">🖼️</div>
              <div class="nc-export-option-info">
                <span class="nc-export-label">PNG 位图</span>
                <span class="nc-export-desc">兼容性好，适合分享和预览</span>
              </div>
            </button>
          </div>
          <div class="nc-export-modal-footer">
            <button class="nc-btn nc-export-cancel">取消</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      // 绑定事件
      const svgBtn = modal.querySelector('[data-format="svg"]');
      const pngBtn = modal.querySelector('[data-format="png"]');
      const cancelBtn = modal.querySelector('.nc-export-cancel');
      const overlay = modal;
      
      const cleanup = () => {
        modal.remove();
      };
      
      svgBtn?.addEventListener('click', () => {
        cleanup();
        resolve('svg');
      });
      
      pngBtn?.addEventListener('click', () => {
        cleanup();
        resolve('png');
      });
      
      cancelBtn?.addEventListener('click', () => {
        cleanup();
        resolve(null);
      });
      
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve(null);
        }
      });
    });
  }

  /**
   * 处理故事单元点击
   * 打开右侧故事单元管理面板，并显示点击的故事单元信息
   */
  private handleUnitClick(unit: StoryUnitRecord): void {
    // 打开故事单元管理面板并选中该单元
    this.openStoryUnitPanel(unit.id);
    
    // 触发事件，让其他组件响应
    this.app.workspace.trigger('novel-craft:story-unit-selected', unit);
  }

  /**
   * 打开故事单元管理面板并选中指定单元
   */
  private async openStoryUnitPanel(unitId: string): Promise<void> {
    if (!this.currentBookId) return;
    
    const { workspace } = this.app;
    
    // 动态导入 StoryUnitView 类型
    const { STORY_UNIT_VIEW_TYPE } = await import('./StoryUnitView');
    
    // 查找或创建故事单元视图
    let leaf = workspace.getLeavesOfType(STORY_UNIT_VIEW_TYPE)[0];
    
    if (!leaf) {
      // 在右侧创建新的叶子
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({
          type: STORY_UNIT_VIEW_TYPE,
          active: true
        });
        leaf = rightLeaf;
      }
    }
    
    if (leaf) {
      workspace.revealLeaf(leaf);
      
      // 设置当前书籍并选中单元
      const view = leaf.view as any;
      if (view && typeof view.setBook === 'function') {
        // 从插件实例获取 LLM 服务并设置（通过 workspace 事件触发）
        // 触发事件让 main.ts 设置 LLM 服务
        this.app.workspace.trigger('novel-craft:request-llm-service', view);
        
        await view.setBook(this.currentBookId);
        
        // 选中并展开指定的故事单元
        if (typeof view.selectUnit === 'function') {
          await view.selectUnit(unitId);
        }
      }
    }
  }

  /**
   * 处理故事单元拖拽结束
   * 实时更新视图，无需手动刷新
   */
  private async handleUnitDragEnd(
    unit: StoryUnitRecord, 
    newPosition: { start: number; trackId: string }
  ): Promise<void> {
    try {
      // 检查是否超出章节范围
      const duration = unit.chapter_end - unit.chapter_start + 1;
      const maxChapter = this.chapters.length;
      
      if (newPosition.start + duration - 1 > maxChapter) {
        showWarning(`故事单元超出章节范围（最大第${maxChapter}章）`);
        this.renderTimeline();
        return;
      }
      
      // 更新数据库
      await this.storyUnitService.updateStoryUnit(unit.id, {
        timePositionStart: newPosition.start,
        trackId: newPosition.trackId
      });
      
      // 更新本地数据
      const idx = this.units.findIndex(u => u.id === unit.id);
      if (idx >= 0) {
        this.units[idx].time_position_start = newPosition.start;
        this.units[idx].track_id = newPosition.trackId;
      }
      
      // 实时重新渲染时间线
      this.renderTimeline();
      
      showInfo('位置已更新');
    } catch (error) {
      showError('更新位置失败', error instanceof Error ? error.message : '未知错误');
      this.renderTimeline();
    }
  }

  /**
   * 处理轨道重排序
   */
  private async handleTrackReorder(trackIds: string[]): Promise<void> {
    try {
      await this.trackService.reorderTracks(this.currentBookId!, trackIds);
      await this.loadData();
      showInfo('轨道顺序已更新');
    } catch (error) {
      showError('更新轨道顺序失败', error instanceof Error ? error.message : '未知错误');
    }
  }

  /**
   * 处理轨道编辑
   */
  private async handleTrackEdit(track: TrackRecord): Promise<void> {
    const newName = prompt('请输入轨道名称:', track.name);
    if (newName && newName.trim() !== track.name) {
      try {
        await this.trackService.updateTrack(track.id, { name: newName.trim() });
        await this.loadData();
        this.renderTimeline();
        showSuccess('轨道名称已更新');
      } catch (error) {
        showError('更新轨道失败', error instanceof Error ? error.message : '未知错误');
      }
    }
  }

  /**
   * 处理轨道删除
   */
  private async handleTrackDelete(trackId: string): Promise<void> {
    const track = this.tracks.find(t => t.id === trackId);
    if (!track) return;
    
    const trackUnits = this.units.filter(u => u.track_id === trackId);
    if (trackUnits.length > 0) {
      showWarning(`无法删除轨道：该轨道包含 ${trackUnits.length} 个故事单元`);
      return;
    }
    
    const confirmed = confirm(`确定要删除轨道"${track.name}"吗？`);
    if (confirmed) {
      try {
        await this.trackService.deleteTrack(trackId);
        await this.loadData();
        this.renderTimeline();
        showSuccess('轨道已删除');
      } catch (error) {
        showError('删除轨道失败', error instanceof Error ? error.message : '未知错误');
      }
    }
  }

  /**
   * 处理轨道颜色修改
   */
  private async handleTrackColorChange(trackId: string, color: string): Promise<void> {
    try {
      await this.trackService.updateTrack(trackId, { color });
      
      const idx = this.tracks.findIndex(t => t.id === trackId);
      if (idx >= 0) {
        this.tracks[idx].color = color;
      }
      
      this.renderTimeline();
      showInfo('轨道颜色已更新');
    } catch (error) {
      showError('更新轨道颜色失败', error instanceof Error ? error.message : '未知错误');
    }
  }

  /**
   * 处理关联关系点击（编辑/删除）
   */
  private handleRelationClick(relation: RelationRecord): void {
    // 查找源和目标故事单元
    const sourceUnit = this.units.find(u => u.id === relation.source_unit_id);
    const targetUnit = this.units.find(u => u.id === relation.target_unit_id);
    
    if (!sourceUnit || !targetUnit) {
      showError('无法找到关联的故事单元');
      return;
    }
    
    // 打开编辑模态框
    const modal = new RelationEditModal(this.app, {
      relationService: this.relationService,
      sourceUnit,
      targetUnit,
      existingRelation: relation,
      onSave: async (updatedRelation: RelationRecord) => {
        // 更新本地数据
        const idx = this.relations.findIndex(r => r.id === updatedRelation.id);
        if (idx >= 0) {
          this.relations[idx] = updatedRelation;
        }
        // 刷新关联线
        if (this.renderer) {
          this.renderer.refreshRelationLines();
        }
      },
      onDelete: async (relationId: string) => {
        // 从本地数据中移除
        this.relations = this.relations.filter(r => r.id !== relationId);
        // 移除关联线
        if (this.renderer) {
          this.renderer.removeRelationLine(relationId);
        }
      }
    });
    modal.open();
  }

  /**
   * 处理关联关系创建
   */
  private async handleRelationCreate(sourceUnitId: string, targetUnitId: string): Promise<void> {
    // 查找源和目标故事单元
    const sourceUnit = this.units.find(u => u.id === sourceUnitId);
    const targetUnit = this.units.find(u => u.id === targetUnitId);
    
    if (!sourceUnit || !targetUnit) {
      showError('无法找到故事单元');
      return;
    }
    
    // 打开创建模态框
    const modal = new RelationEditModal(this.app, {
      relationService: this.relationService,
      sourceUnit,
      targetUnit,
      onSave: async (newRelation: RelationRecord) => {
        // 添加到本地数据
        this.relations.push(newRelation);
        // 添加关联线
        if (this.renderer) {
          this.renderer.addRelationLine(newRelation);
        }
      }
    });
    modal.open();
  }
}
