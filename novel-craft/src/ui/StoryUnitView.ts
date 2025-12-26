/**
 * 故事单元管理视图（侧边栏）
 * 在右侧固定面板中显示故事单元管理界面
 * 支持内联编辑，点击卡片展开直接编辑
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */

import { App, ItemView, WorkspaceLeaf, Modal, Setting, DropdownComponent, TextComponent } from 'obsidian';
import { StoryUnitService, ChapterInfo, StoryUnitCreateConfig } from '../services/StoryUnitService';
import { TrackService } from '../services/TrackService';
import { databaseService } from '../services/DatabaseService';
import { LLMService } from '../services/LLMService';
import { StoryUnitRecord, TrackRecord, CharacterRecord } from '../types/database';
import { showSuccess, showError, showWarning, showInfo } from './NotificationUtils';
import { 
  StoryUnitAnalysisService, 
  StoryUnitAnalysisResult,
  AnalysisResultItem,
  CharacterRelationItem
} from '../services/StoryUnitAnalysisService';
import { getAllTemplates, getTemplateById, AnalysisTemplate, AnalysisTemplateStep } from '../services/AnalysisTemplates';

export const STORY_UNIT_VIEW_TYPE = 'novel-craft-story-unit-view';

/**
 * 展开卡片的当前标签页
 */
type CardTab = 'info' | 'analysis';

/**
 * 故事单元管理视图
 */
export class StoryUnitView extends ItemView {
  private storyUnitService: StoryUnitService;
  private trackService: TrackService;
  private analysisService: StoryUnitAnalysisService | null = null;
  
  // 当前书籍ID
  private currentBookId: string | null = null;
  
  // LLM服务（用于AI分析）
  private llmService: LLMService | null = null;
  
  // 数据
  private units: StoryUnitRecord[] = [];
  private tracks: TrackRecord[] = [];
  private chapters: ChapterInfo[] = [];
  private characters: CharacterRecord[] = [];
  
  // UI 元素
  private listContainer: HTMLElement | null = null;
  private statsEl: HTMLElement | null = null;
  private emptyStateEl: HTMLElement | null = null;
  
  // 当前展开编辑的单元ID
  private expandedUnitId: string | null = null;
  // 当前展开卡片的标签页
  private currentTab: CardTab = 'info';
  // 分析状态
  private isAnalyzing = false;
  private analysisResults: Map<string, StoryUnitAnalysisResult> = new Map();

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.storyUnitService = new StoryUnitService(this.app);
    this.trackService = new TrackService();
  }

  getViewType(): string {
    return STORY_UNIT_VIEW_TYPE;
  }

  getDisplayText(): string {
    return '故事单元管理';
  }

  getIcon(): string {
    return 'layers';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('nc-su-view');

    // 标题栏
    const header = container.createDiv({ cls: 'nc-su-view-header' });
    header.createEl('h3', { text: '📚 故事单元管理', cls: 'nc-su-view-title' });
    
    // 工具栏
    const toolbar = header.createDiv({ cls: 'nc-su-view-toolbar' });
    
    const addBtn = toolbar.createEl('button', {
      text: '➕ 新建',
      cls: 'nc-btn nc-btn-primary nc-btn-small'
    });
    addBtn.addEventListener('click', () => this.openCreateModal());
    
    const refreshBtn = toolbar.createEl('button', {
      text: '🔄',
      cls: 'nc-btn nc-btn-small',
      attr: { title: '刷新列表' }
    });
    refreshBtn.addEventListener('click', () => this.refresh());

    // 统计信息
    this.statsEl = container.createDiv({ cls: 'nc-su-view-stats' });

    // 空状态提示
    this.emptyStateEl = container.createDiv({ cls: 'nc-su-view-empty' });
    this.emptyStateEl.style.display = 'none';

    // 列表容器
    this.listContainer = container.createDiv({ cls: 'nc-su-view-list' });
    
    // 显示初始状态
    this.showEmptyState('请打开一本书籍的章节文件');
  }

  async onClose(): Promise<void> {
    // 清理
  }

  /**
   * 设置当前书籍
   */
  async setBook(bookId: string): Promise<void> {
    this.currentBookId = bookId;
    await this.loadData();
    this.renderList();
  }

  /**
   * 设置LLM服务（用于AI分析）
   */
  setLLMService(llmService: LLMService): void {
    this.llmService = llmService;
    this.analysisService = new StoryUnitAnalysisService(this.app, llmService);
  }

  /**
   * 清除当前书籍
   */
  clearBook(): void {
    this.currentBookId = null;
    this.units = [];
    this.tracks = [];
    this.chapters = [];
    this.characters = [];
    this.showEmptyState('请打开一本书籍的章节文件');
  }

  /**
   * 加载数据
   */
  private async loadData(): Promise<void> {
    if (!this.currentBookId) return;
    
    this.units = await this.storyUnitService.getStoryUnitsByBook(this.currentBookId);
    this.tracks = await this.trackService.getTracksByBook(this.currentBookId);
    this.chapters = await this.storyUnitService.getBookChapters(this.currentBookId);
    this.characters = await databaseService.characters.query({ book_id: this.currentBookId });
    
    // 如果没有轨道，初始化默认轨道
    if (this.tracks.length === 0) {
      this.tracks = await this.trackService.initializeDefaultTracks(this.currentBookId);
    }
  }

  /**
   * 刷新视图
   */
  async refresh(): Promise<void> {
    if (!this.currentBookId) return;
    await this.loadData();
    this.renderList();
  }

  /**
   * 选中并展开指定的故事单元
   * 用于从时间线等其他视图跳转过来时自动展开对应单元
   */
  async selectUnit(unitId: string): Promise<void> {
    // 确保数据已加载
    if (!this.currentBookId) return;
    
    // 检查单元是否存在
    const unit = this.units.find(u => u.id === unitId);
    if (!unit) {
      // 尝试重新加载数据
      await this.loadData();
    }
    
    // 设置展开状态
    this.expandedUnitId = unitId;
    this.currentTab = 'info';
    
    // 加载分析结果
    await this.loadAnalysisResult(unitId);
    
    // 重新渲染列表
    this.renderList();
    
    // 滚动到对应的卡片
    setTimeout(() => {
      const cardEl = this.listContainer?.querySelector(`[data-unit-id="${unitId}"]`) as HTMLElement;
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
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
    if (this.listContainer) {
      this.listContainer.style.display = 'none';
    }
    if (this.statsEl) {
      this.statsEl.textContent = '';
    }
  }

  /**
   * 隐藏空状态
   */
  private hideEmptyState(): void {
    if (this.emptyStateEl) {
      this.emptyStateEl.style.display = 'none';
    }
    if (this.listContainer) {
      this.listContainer.style.display = 'block';
    }
  }

  /**
   * 渲染列表
   */
  private renderList(): void {
    if (!this.listContainer || !this.currentBookId) return;
    
    this.listContainer.empty();

    // 更新统计
    if (this.statsEl) {
      this.statsEl.textContent = `共 ${this.units.length} 个故事单元`;
    }

    if (this.units.length === 0) {
      this.showEmptyState('暂无故事单元，点击"新建"创建');
      return;
    }

    this.hideEmptyState();

    // 按轨道分组显示
    for (const track of this.tracks) {
      const trackUnits = this.units.filter(u => u.track_id === track.id);
      if (trackUnits.length === 0) continue;

      const trackSection = this.listContainer.createDiv({ cls: 'nc-su-track-section' });
      
      // 轨道标题
      const trackHeader = trackSection.createDiv({ cls: 'nc-su-track-header' });
      const colorDot = trackHeader.createSpan({ cls: 'nc-su-track-color' });
      colorDot.style.backgroundColor = track.color;
      trackHeader.createSpan({ text: `${track.name} (${trackUnits.length})` });

      // 故事单元列表
      const unitList = trackSection.createDiv({ cls: 'nc-su-unit-list' });
      
      for (const unit of trackUnits.sort((a, b) => a.chapter_start - b.chapter_start)) {
        this.renderUnitCard(unitList, unit, track);
      }
    }

    // 未分配轨道的单元
    const unassigned = this.units.filter(u => !this.tracks.find(t => t.id === u.track_id));
    if (unassigned.length > 0) {
      const section = this.listContainer.createDiv({ cls: 'nc-su-track-section' });
      section.createDiv({ cls: 'nc-su-track-header', text: `未分配 (${unassigned.length})` });
      
      const unitList = section.createDiv({ cls: 'nc-su-unit-list' });
      for (const unit of unassigned) {
        this.renderUnitCard(unitList, unit);
      }
    }
  }

  /**
   * 渲染故事单元卡片（支持内联编辑和AI分析）
   */
  private renderUnitCard(container: HTMLElement, unit: StoryUnitRecord, track?: TrackRecord): void {
    const isExpanded = this.expandedUnitId === unit.id;
    const card = container.createDiv({ 
      cls: `nc-su-unit-card ${isExpanded ? 'nc-su-unit-card-expanded' : ''}`
    });
    // 添加 data-unit-id 用于滚动定位
    card.dataset.unitId = unit.id;
    
    // 卡片头部（始终显示）
    const cardHeader = card.createDiv({ cls: 'nc-su-card-header' });
    
    // 左侧信息
    const info = cardHeader.createDiv({ cls: 'nc-su-card-info' });
    info.createSpan({ text: unit.title, cls: 'nc-su-card-title' });
    
    const meta = info.createDiv({ cls: 'nc-su-card-meta' });
    const range = meta.createSpan({ cls: 'nc-su-card-range' });
    range.textContent = unit.chapter_start === unit.chapter_end
      ? `第${unit.chapter_start}章`
      : `第${unit.chapter_start}-${unit.chapter_end}章`;
    
    // 标签
    if (unit.is_past_event) {
      meta.createSpan({ text: '过去', cls: 'nc-su-tag nc-su-tag-past' });
    }
    const charIds: string[] = JSON.parse(unit.character_ids || '[]');
    if (charIds.length > 0) {
      meta.createSpan({ text: `${charIds.length}人`, cls: 'nc-su-tag' });
    }
    // 显示是否有AI分析结果
    if (unit.ai_analysis_id) {
      meta.createSpan({ text: '🤖', cls: 'nc-su-tag nc-su-tag-ai', attr: { title: '已有AI分析' } });
    }
    
    // 右侧操作
    const actions = cardHeader.createDiv({ cls: 'nc-su-card-actions' });
    
    // 展开/收起指示
    const toggleIcon = actions.createSpan({ 
      text: isExpanded ? '▲' : '▼', 
      cls: 'nc-su-toggle-icon' 
    });
    
    // 删除按钮
    const deleteBtn = actions.createEl('button', { text: '🗑️', cls: 'nc-su-action-btn nc-su-action-danger' });
    deleteBtn.title = '删除';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.confirmDelete(unit);
    });
    
    // 点击头部展开/收起
    cardHeader.addEventListener('click', () => {
      if (this.expandedUnitId === unit.id) {
        this.expandedUnitId = null;
        this.currentTab = 'info';
      } else {
        this.expandedUnitId = unit.id;
        this.currentTab = 'info';
        // 加载分析结果
        this.loadAnalysisResult(unit.id);
      }
      this.renderList();
    });
    
    // 展开的编辑区域（带标签页）
    if (isExpanded) {
      this.renderExpandedContent(card, unit, track);
    }
  }

  /**
   * 加载分析结果
   */
  private async loadAnalysisResult(unitId: string): Promise<void> {
    if (!this.analysisService) return;
    
    const result = await this.analysisService.getAnalysisResult(unitId);
    if (result) {
      this.analysisResults.set(unitId, result);
    }
  }

  /**
   * 渲染展开的内容（带标签页）
   */
  private renderExpandedContent(container: HTMLElement, unit: StoryUnitRecord, track?: TrackRecord): void {
    const expandedArea = container.createDiv({ cls: 'nc-su-expanded-area' });
    
    // 标签页头部
    const tabHeader = expandedArea.createDiv({ cls: 'nc-su-tab-header' });
    
    const infoTab = tabHeader.createEl('button', { 
      text: '📝 基本信息', 
      cls: `nc-su-tab-btn ${this.currentTab === 'info' ? 'nc-su-tab-active' : ''}`
    });
    infoTab.addEventListener('click', (e) => {
      e.stopPropagation();
      this.currentTab = 'info';
      this.renderList();
    });
    
    const analysisTab = tabHeader.createEl('button', { 
      text: '🤖 AI分析', 
      cls: `nc-su-tab-btn ${this.currentTab === 'analysis' ? 'nc-su-tab-active' : ''}`
    });
    analysisTab.addEventListener('click', (e) => {
      e.stopPropagation();
      this.currentTab = 'analysis';
      this.renderList();
    });
    
    // 标签页内容
    const tabContent = expandedArea.createDiv({ cls: 'nc-su-tab-content' });
    
    if (this.currentTab === 'info') {
      this.renderInlineEditor(tabContent, unit, track);
    } else {
      this.renderAnalysisTab(tabContent, unit);
    }
  }

  /**
   * 渲染内联编辑器
   */
  private renderInlineEditor(container: HTMLElement, unit: StoryUnitRecord, track?: TrackRecord): void {
    const editor = container.createDiv({ cls: 'nc-su-inline-editor' });
    
    // 获取分析结果（用于显示梗概、情绪、人物关系）
    const analysisResult = this.analysisResults.get(unit.id);
    
    // === AI分析摘要区域（如果有分析结果） ===
    if (analysisResult && analysisResult.status === 'completed') {
      const summarySection = editor.createDiv({ cls: 'nc-su-summary-section' });
      
      // 故事梗概
      if (analysisResult.summary) {
        const summaryRow = summarySection.createDiv({ cls: 'nc-su-summary-row' });
        summaryRow.createSpan({ text: '📖 故事梗概', cls: 'nc-su-summary-label' });
        summaryRow.createDiv({ text: analysisResult.summary, cls: 'nc-su-summary-content' });
      }
      
      // 情绪折线
      if (analysisResult.emotionCurve) {
        const emotionRow = summarySection.createDiv({ cls: 'nc-su-summary-row' });
        emotionRow.createSpan({ text: '📈 情绪折线', cls: 'nc-su-summary-label' });
        emotionRow.createDiv({ text: analysisResult.emotionCurve, cls: 'nc-su-summary-content nc-su-emotion-curve' });
      }
      
      // 人物关系
      if (analysisResult.characterRelations && analysisResult.characterRelations.length > 0) {
        const relationsRow = summarySection.createDiv({ cls: 'nc-su-summary-row' });
        relationsRow.createSpan({ text: '👥 人物关系', cls: 'nc-su-summary-label' });
        
        const relationsContent = relationsRow.createDiv({ cls: 'nc-su-relations-mini' });
        const friends = analysisResult.characterRelations.filter(r => r.relationType === 'friend');
        const neutrals = analysisResult.characterRelations.filter(r => r.relationType === 'neutral');
        const enemies = analysisResult.characterRelations.filter(r => r.relationType === 'enemy');
        
        if (friends.length > 0) {
          const friendSpan = relationsContent.createSpan({ cls: 'nc-su-relation-tag nc-su-relation-friend' });
          friendSpan.textContent = `友方: ${friends.map(f => f.name).join('、')}`;
        }
        if (neutrals.length > 0) {
          const neutralSpan = relationsContent.createSpan({ cls: 'nc-su-relation-tag nc-su-relation-neutral' });
          neutralSpan.textContent = `中立: ${neutrals.map(n => n.name).join('、')}`;
        }
        if (enemies.length > 0) {
          const enemySpan = relationsContent.createSpan({ cls: 'nc-su-relation-tag nc-su-relation-enemy' });
          enemySpan.textContent = `敌方: ${enemies.map(e => e.name).join('、')}`;
        }
      }
      
      // 分隔线
      summarySection.createDiv({ cls: 'nc-su-summary-divider' });
    }
    
    // === 表单数据 ===
    const formData = {
      title: unit.title,
      chapterStart: unit.chapter_start,
      chapterEnd: unit.chapter_end,
      trackId: unit.track_id,
      isPastEvent: unit.is_past_event,
      characterIds: JSON.parse(unit.character_ids || '[]') as string[],
      notes: unit.notes || ''
    };
    
    // 标题输入
    const titleRow = editor.createDiv({ cls: 'nc-su-editor-row' });
    titleRow.createSpan({ text: '标题', cls: 'nc-su-editor-label' });
    const titleInput = titleRow.createEl('input', { 
      type: 'text', 
      cls: 'nc-su-editor-input',
      value: formData.title
    });
    titleInput.addEventListener('input', () => { formData.title = titleInput.value; });
    
    // 轨道选择
    const trackRow = editor.createDiv({ cls: 'nc-su-editor-row' });
    trackRow.createSpan({ text: '轨道', cls: 'nc-su-editor-label' });
    const trackSelect = trackRow.createEl('select', { cls: 'nc-su-editor-select' });
    for (const t of this.tracks) {
      const option = trackSelect.createEl('option', { value: t.id, text: t.name });
      if (t.id === formData.trackId) option.selected = true;
    }
    trackSelect.addEventListener('change', () => { formData.trackId = trackSelect.value; });
    
    // 章节范围
    const chapterRow = editor.createDiv({ cls: 'nc-su-editor-row' });
    chapterRow.createSpan({ text: '章节', cls: 'nc-su-editor-label' });
    const chapterInputs = chapterRow.createDiv({ cls: 'nc-su-editor-chapter-inputs' });
    
    const startInput = chapterInputs.createEl('input', { 
      type: 'number', 
      cls: 'nc-su-editor-input nc-su-editor-input-small',
      value: String(formData.chapterStart)
    });
    startInput.min = '1';
    startInput.addEventListener('input', () => { formData.chapterStart = parseInt(startInput.value) || 1; });
    
    chapterInputs.createSpan({ text: ' - ', cls: 'nc-su-editor-separator' });
    
    const endInput = chapterInputs.createEl('input', { 
      type: 'number', 
      cls: 'nc-su-editor-input nc-su-editor-input-small',
      value: String(formData.chapterEnd)
    });
    endInput.min = '1';
    endInput.addEventListener('input', () => { formData.chapterEnd = parseInt(endInput.value) || 1; });
    
    // 过去事件
    const pastRow = editor.createDiv({ cls: 'nc-su-editor-row' });
    pastRow.createSpan({ text: '过去事件', cls: 'nc-su-editor-label' });
    const pastCheckbox = pastRow.createEl('input', { type: 'checkbox', cls: 'nc-su-editor-checkbox' }) as HTMLInputElement;
    pastCheckbox.checked = formData.isPastEvent;
    pastCheckbox.addEventListener('change', () => { formData.isPastEvent = pastCheckbox.checked; });
    pastRow.createSpan({ text: '回忆/闪回', cls: 'nc-su-editor-hint' });
    
    // 人物选择（如果有人物）
    if (this.characters.length > 0) {
      const charRow = editor.createDiv({ cls: 'nc-su-editor-row nc-su-editor-row-chars' });
      charRow.createSpan({ text: '人物', cls: 'nc-su-editor-label' });
      const charList = charRow.createDiv({ cls: 'nc-su-editor-char-list' });
      
      for (const char of this.characters.slice(0, 8)) { // 最多显示8个
        const charItem = charList.createDiv({ cls: 'nc-su-editor-char-item' });
        const checkbox = charItem.createEl('input', { 
          type: 'checkbox',
          attr: { id: `inline-char-${unit.id}-${char.id}` }
        }) as HTMLInputElement;
        checkbox.checked = formData.characterIds.includes(char.id);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            if (!formData.characterIds.includes(char.id)) {
              formData.characterIds.push(char.id);
            }
          } else {
            const idx = formData.characterIds.indexOf(char.id);
            if (idx > -1) formData.characterIds.splice(idx, 1);
          }
        });
        charItem.createEl('label', { 
          text: char.name, 
          attr: { for: `inline-char-${unit.id}-${char.id}` },
          cls: 'nc-su-editor-char-label'
        });
      }
      
      if (this.characters.length > 8) {
        charList.createSpan({ text: `+${this.characters.length - 8}`, cls: 'nc-su-editor-char-more' });
      }
    }
    
    // 备注输入
    const notesRow = editor.createDiv({ cls: 'nc-su-editor-row nc-su-editor-row-full' });
    notesRow.createSpan({ text: '📝 备注', cls: 'nc-su-editor-label' });
    const notesInput = notesRow.createEl('textarea', { 
      cls: 'nc-su-editor-notes',
      attr: { 
        placeholder: '添加你的阅读笔记、心得体会...',
        rows: '3'
      }
    });
    notesInput.value = formData.notes;
    notesInput.addEventListener('input', () => { formData.notes = notesInput.value; });
    
    // 保存按钮
    const buttonRow = editor.createDiv({ cls: 'nc-su-editor-buttons' });
    const saveBtn = buttonRow.createEl('button', { text: '💾 保存', cls: 'nc-btn nc-btn-primary nc-btn-small' });
    saveBtn.addEventListener('click', async () => {
      if (!formData.title.trim()) {
        showWarning('请输入标题');
        return;
      }
      
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中...';
      
      try {
        await this.storyUnitService.updateStoryUnit(unit.id, {
          title: formData.title.trim(),
          chapterStart: formData.chapterStart,
          chapterEnd: formData.chapterEnd,
          trackId: formData.trackId,
          isPastEvent: formData.isPastEvent,
          characterIds: formData.characterIds,
          notes: formData.notes.trim()
        });
        showSuccess('保存成功');
        this.expandedUnitId = null;
        await this.refresh();
        // 触发事件通知时间线刷新
        this.app.workspace.trigger('novel-craft:story-unit-changed', this.currentBookId);
      } catch (error) {
        showError('保存失败', error instanceof Error ? error.message : '未知错误');
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 保存';
      }
    });
    
    const cancelBtn = buttonRow.createEl('button', { text: '取消', cls: 'nc-btn nc-btn-small' });
    cancelBtn.addEventListener('click', () => {
      this.expandedUnitId = null;
      this.renderList();
    });
  }

  /**
   * 打开创建模态框
   */
  private openCreateModal(): void {
    if (!this.currentBookId) {
      showWarning('请先打开一本书籍的章节文件');
      return;
    }
    
    const modal = new StoryUnitEditModal(this.app, {
      bookId: this.currentBookId,
      tracks: this.tracks,
      chapters: this.chapters,
      characters: this.characters,
      onSave: async (config) => {
        await this.storyUnitService.createStoryUnit(config);
        showSuccess('故事单元创建成功');
        await this.refresh();
        // 触发事件通知时间线刷新
        this.app.workspace.trigger('novel-craft:story-unit-changed', this.currentBookId);
      }
    });
    modal.open();
  }

  /**
   * 确认删除
   */
  private confirmDelete(unit: StoryUnitRecord): void {
    const modal = new ConfirmModal(this.app, {
      title: '删除故事单元',
      message: `确定要删除"${unit.title}"吗？此操作不可撤销。`,
      confirmText: '删除',
      onConfirm: async () => {
        await this.storyUnitService.deleteStoryUnit(unit.id);
        showSuccess('故事单元已删除');
        if (this.expandedUnitId === unit.id) {
          this.expandedUnitId = null;
        }
        await this.refresh();
        // 触发事件通知时间线刷新
        this.app.workspace.trigger('novel-craft:story-unit-changed', this.currentBookId);
      }
    });
    modal.open();
  }

  /**
   * 渲染AI分析标签页
   */
  private renderAnalysisTab(container: HTMLElement, unit: StoryUnitRecord): void {
    const analysisArea = container.createDiv({ cls: 'nc-su-analysis-area' });
    
    // 检查是否有LLM服务
    if (!this.llmService || !this.analysisService) {
      analysisArea.createDiv({ 
        cls: 'nc-su-analysis-hint',
        text: '⚠️ 请先在插件设置中配置 LLM 服务'
      });
      return;
    }
    
    // 如果正在分析中，显示实时分析界面
    if (this.isAnalyzing && this.expandedUnitId === unit.id) {
      this.renderAnalysisConfig(analysisArea, unit);
      return;
    }
    
    // 先从缓存获取
    let existingResult = this.analysisResults.get(unit.id);
    
    // 如果缓存中有完成的结果，直接显示
    if (existingResult && existingResult.status === 'completed') {
      this.renderAnalysisTable(analysisArea, unit, existingResult);
      return;
    }
    
    // 如果有 ai_analysis_id 但缓存中没有，需要从数据库加载
    if (unit.ai_analysis_id && !existingResult) {
      // 显示加载中
      const loadingDiv = analysisArea.createDiv({ cls: 'nc-su-analysis-loading' });
      loadingDiv.textContent = '加载分析结果中...';
      
      // 异步加载并更新UI
      this.loadAndRenderAnalysisResult(analysisArea, unit);
      return;
    }
    
    // 没有分析结果，显示配置界面
    this.renderAnalysisConfig(analysisArea, unit);
  }

  /**
   * 异步加载并渲染分析结果
   */
  private async loadAndRenderAnalysisResult(container: HTMLElement, unit: StoryUnitRecord): Promise<void> {
    try {
      await this.loadAnalysisResult(unit.id);
      const result = this.analysisResults.get(unit.id);
      
      container.empty();
      
      if (result && result.status === 'completed') {
        this.renderAnalysisTable(container, unit, result);
      } else {
        this.renderAnalysisConfig(container, unit);
      }
    } catch (error) {
      container.empty();
      container.createDiv({ 
        cls: 'nc-su-analysis-hint',
        text: '⚠️ 加载分析结果失败，请重试'
      });
    }
  }

  /**
   * 渲染表格形式的分析结果
   */
  private renderAnalysisTable(container: HTMLElement, unit: StoryUnitRecord, result: StoryUnitAnalysisResult): void {
    // 工具栏
    const toolbar = container.createDiv({ cls: 'nc-su-analysis-toolbar' });
    toolbar.createSpan({ text: `📊 ${result.templateName}`, cls: 'nc-su-analysis-template-name' });
    
    const toolbarBtns = toolbar.createDiv({ cls: 'nc-su-analysis-toolbar-btns' });
    
    const reanalyzeBtn = toolbarBtns.createEl('button', { text: '🔄 重新分析', cls: 'nc-btn nc-btn-small' });
    reanalyzeBtn.addEventListener('click', async () => {
      if (this.analysisService) {
        await this.analysisService.deleteAnalysisResult(result.id);
        this.analysisResults.delete(unit.id);
        const updatedUnit = await this.storyUnitService.getStoryUnit(unit.id);
        if (updatedUnit) {
          const idx = this.units.findIndex(u => u.id === unit.id);
          if (idx >= 0) this.units[idx] = updatedUnit;
        }
        this.renderList();
      }
    });
    
    const saveBtn = toolbarBtns.createEl('button', { text: '📄 导出笔记', cls: 'nc-btn nc-btn-small' });
    saveBtn.addEventListener('click', () => this.saveAnalysisToNote(unit, result));
    
    // 表格容器
    const tableContainer = container.createDiv({ cls: 'nc-su-analysis-table-container' });
    const table = tableContainer.createEl('table', { cls: 'nc-su-analysis-table' });
    
    // 表头
    const thead = table.createEl('thead');
    const headerRow = thead.createEl('tr');
    headerRow.createEl('th', { text: '类别', cls: 'nc-su-table-th-category' });
    headerRow.createEl('th', { text: '具体条目', cls: 'nc-su-table-th-item' });
    headerRow.createEl('th', { text: '拆书填写', cls: 'nc-su-table-th-content' });
    
    // 表体
    const tbody = table.createEl('tbody');
    
    // 基础元素分组（按 category 或 stepId 判断）
    const basicSteps = result.steps.filter(s => 
      s.category === 'basic' || 
      ['step1-advantage', 'step2-villain-info', 'step3-friction', 'step4-negative-expect', 'step5-climax', 'step6-shock', 'step7-reward'].includes(s.stepId)
    );
    
    if (basicSteps.length > 0) {
      const groupRow = tbody.createEl('tr', { cls: 'nc-su-table-group-row' });
      groupRow.createEl('td', { 
        text: '基础元素', 
        cls: 'nc-su-table-group-label',
        attr: { rowspan: String(basicSteps.length) }
      });
      
      this.renderTableStepRow(groupRow, unit, result, basicSteps[0], false);
      
      for (let i = 1; i < basicSteps.length; i++) {
        const row = tbody.createEl('tr');
        this.renderTableStepRow(row, unit, result, basicSteps[i], true);
      }
    }
    
    // 附加元素
    const extraSteps = result.steps.filter(s => 
      s.category === 'extra' ||
      ['extra-relations', 'extra-emotion', 'extra-foreshadow'].includes(s.stepId) ||
      s.stepId.startsWith('custom-')
    );
    
    if (extraSteps.length > 0) {
      const groupRow = tbody.createEl('tr', { cls: 'nc-su-table-group-row' });
      groupRow.createEl('td', { 
        text: '附加元素', 
        cls: 'nc-su-table-group-label',
        attr: { rowspan: String(extraSteps.length) }
      });
      
      this.renderTableStepRow(groupRow, unit, result, extraSteps[0], false);
      
      for (let i = 1; i < extraSteps.length; i++) {
        const row = tbody.createEl('tr');
        this.renderTableStepRow(row, unit, result, extraSteps[i], true);
      }
    }
    
    // 添加新行按钮
    const addRowBtn = container.createEl('button', { 
      text: '➕ 添加条目', 
      cls: 'nc-btn nc-btn-small nc-su-add-row-btn'
    });
    addRowBtn.addEventListener('click', () => this.addCustomRow(unit, result));
    
    // 完整分析文档链接（如果有）
    if (result.fullDocPath) {
      const docLinkSection = container.createDiv({ cls: 'nc-su-doc-link-section' });
      docLinkSection.createSpan({ text: '📄 完整分析报告: ', cls: 'nc-su-doc-link-label' });
      const docLink = docLinkSection.createEl('a', { 
        text: result.fullDocPath.split('/').pop() || '查看完整报告',
        cls: 'nc-su-doc-link'
      });
      docLink.addEventListener('click', async (e) => {
        e.preventDefault();
        const file = this.app.vault.getAbstractFileByPath(result.fullDocPath!);
        if (file) {
          await this.app.workspace.openLinkText(result.fullDocPath!, '', true);
        } else {
          showWarning('文档不存在，请重新分析');
        }
      });
    }
  }

  /**
   * 渲染人物关系（保留方法但不再在AI分析标签页调用）
   */
  private renderCharacterRelations(container: HTMLElement, relations: CharacterRelationItem[]): void {
    const section = container.createDiv({ cls: 'nc-su-char-relations' });
    section.createEl('h4', { text: '👥 人物关系', cls: 'nc-su-char-relations-title' });
    
    // 按关系类型分组
    const friends = relations.filter(r => r.relationType === 'friend');
    const neutrals = relations.filter(r => r.relationType === 'neutral');
    const enemies = relations.filter(r => r.relationType === 'enemy');
    
    const groups = [
      { label: '友方', items: friends, cls: 'nc-su-char-friend' },
      { label: '中立', items: neutrals, cls: 'nc-su-char-neutral' },
      { label: '敌方', items: enemies, cls: 'nc-su-char-enemy' }
    ];
    
    const relationsGrid = section.createDiv({ cls: 'nc-su-char-relations-grid' });
    
    for (const group of groups) {
      if (group.items.length === 0) continue;
      
      const groupDiv = relationsGrid.createDiv({ cls: `nc-su-char-group ${group.cls}` });
      groupDiv.createEl('span', { text: group.label, cls: 'nc-su-char-group-label' });
      
      const list = groupDiv.createDiv({ cls: 'nc-su-char-list' });
      for (const char of group.items) {
        const item = list.createDiv({ cls: 'nc-su-char-item' });
        item.createSpan({ text: char.name, cls: 'nc-su-char-name' });
        if (char.identity) {
          item.createSpan({ text: `（${char.identity}）`, cls: 'nc-su-char-identity' });
        }
        if (char.relationDesc) {
          item.setAttribute('title', char.relationDesc);
        }
      }
    }
  }

  /**
   * 渲染表格中的步骤行
   */
  private renderTableStepRow(
    row: HTMLElement, 
    unit: StoryUnitRecord,
    result: StoryUnitAnalysisResult, 
    step: AnalysisResultItem,
    skipCategory: boolean
  ): void {
    // 条目名称
    const itemCell = row.createEl('td', { cls: 'nc-su-table-item' });
    itemCell.createSpan({ text: step.stepName });
    if (step.isEdited) {
      itemCell.createSpan({ text: ' ✏️', cls: 'nc-su-table-edited' });
    }
    
    // 内容（可编辑）
    const contentCell = row.createEl('td', { cls: 'nc-su-table-content' });
    const contentInput = contentCell.createEl('textarea', { 
      cls: 'nc-su-table-input',
      attr: { rows: '2' }
    });
    
    const isEmpty = !step.content || step.content.includes('未找到相关情节');
    contentInput.value = isEmpty ? '' : step.content;
    contentInput.placeholder = '点击填写...';
    
    // 自动保存（失去焦点时）
    contentInput.addEventListener('blur', async () => {
      const newContent = contentInput.value.trim();
      if (newContent !== step.content) {
        if (this.analysisService) {
          await this.analysisService.updateStepContent(result.id, step.stepId, newContent);
          step.content = newContent;
          step.isEdited = true;
          showInfo('已自动保存');
        }
      }
    });
  }

  /**
   * 添加自定义行
   */
  private async addCustomRow(unit: StoryUnitRecord, result: StoryUnitAnalysisResult): Promise<void> {
    const modal = new AddRowModal(this.app, {
      onSave: async (itemName, content) => {
        // 创建新的步骤
        const newStep: AnalysisResultItem = {
          stepId: `custom-${Date.now()}`,
          stepName: itemName,
          content: content,
          isEdited: true,
          originalContent: ''
        };
        
        result.steps.push(newStep);
        
        // 保存到数据库
        if (this.analysisService) {
          // 更新整个分析结果
          const record = await databaseService.aiAnalysis.getById(result.id);
          if (record) {
            await databaseService.aiAnalysis.update(result.id, {
              analysis_result: JSON.stringify(result.steps)
            });
          }
        }
        
        this.renderList();
        showSuccess('条目已添加');
      }
    });
    modal.open();
  }

  /**
   * 渲染分析配置界面（支持实时表格显示）
   */
  private renderAnalysisConfig(container: HTMLElement, unit: StoryUnitRecord): void {
    // 如果正在分析中，显示实时表格
    if (this.isAnalyzing && this.expandedUnitId === unit.id) {
      this.renderLiveAnalysisTable(container, unit);
      return;
    }
    
    // 模板选择
    const templateRow = container.createDiv({ cls: 'nc-su-analysis-row' });
    templateRow.createSpan({ text: '分析模板', cls: 'nc-su-analysis-label' });
    
    const templateSelect = templateRow.createEl('select', { cls: 'nc-su-analysis-select' });
    const templates = getAllTemplates();
    for (const template of templates) {
      templateSelect.createEl('option', { value: template.id, text: template.name });
    }
    
    // 模板描述
    const descArea = container.createDiv({ cls: 'nc-su-analysis-desc' });
    const updateDesc = () => {
      const template = getTemplateById(templateSelect.value);
      if (template) {
        descArea.empty();
        descArea.createEl('p', { text: template.description });
        descArea.createSpan({ 
          text: `分析步骤: ${template.steps.map(s => s.name).join(' → ')}`,
          cls: 'nc-su-analysis-steps'
        });
      }
    };
    updateDesc();
    templateSelect.addEventListener('change', updateDesc);
    
    // 自定义提示词
    const customRow = container.createDiv({ cls: 'nc-su-analysis-row nc-su-analysis-row-full' });
    customRow.createSpan({ text: '自定义提示词（可选）', cls: 'nc-su-analysis-label' });
    const customInput = customRow.createEl('textarea', { 
      cls: 'nc-su-analysis-custom-input',
      attr: { 
        placeholder: '添加额外的分析要求...',
        rows: '2'
      }
    });
    
    // 章节范围
    const rangeInfo = container.createDiv({ cls: 'nc-su-analysis-range' });
    rangeInfo.createSpan({ 
      text: `📖 分析范围: 第${unit.chapter_start}章 - 第${unit.chapter_end}章` 
    });
    
    // 按钮
    const buttonRow = container.createDiv({ cls: 'nc-su-analysis-buttons' });
    const analyzeBtn = buttonRow.createEl('button', { 
      text: '🚀 开始分析', 
      cls: 'nc-btn nc-btn-primary nc-btn-small'
    });
    
    analyzeBtn.addEventListener('click', async () => {
      if (this.isAnalyzing) return;
      
      const template = getTemplateById(templateSelect.value);
      if (!template) {
        showError('模板不存在');
        return;
      }
      
      // 保存分析配置到临时状态
      this.currentAnalysisConfig = {
        templateId: templateSelect.value,
        template: template,
        customPrompt: customInput.value || undefined
      };
      
      this.isAnalyzing = true;
      this.liveAnalysisSteps = new Map();
      
      // 初始化所有步骤为待处理状态
      for (const step of template.steps) {
        this.liveAnalysisSteps.set(step.id, {
          stepId: step.id,
          stepName: step.name,
          content: '',
          status: 'pending',
          category: step.category
        });
      }
      
      // 重新渲染以显示实时表格
      this.renderList();
      
      // 开始分析
      this.startLiveAnalysis(unit);
    });
  }

  // 当前分析配置（临时状态）
  private currentAnalysisConfig: {
    templateId: string;
    template: AnalysisTemplate;
    customPrompt?: string;
  } | null = null;
  
  // 实时分析步骤状态
  private liveAnalysisSteps: Map<string, {
    stepId: string;
    stepName: string;
    content: string;
    status: 'pending' | 'running' | 'completed' | 'error';
    category?: 'basic' | 'extra';
  }> = new Map();

  // 分析开始时间
  private analysisStartTime: number = 0;
  // 分析计时器
  private analysisTimer: number | null = null;
  // 是否取消分析
  private analysisCancelled: boolean = false;

  /**
   * 渲染实时分析表格
   */
  private renderLiveAnalysisTable(container: HTMLElement, unit: StoryUnitRecord): void {
    const template = this.currentAnalysisConfig?.template;
    if (!template) return;
    
    // 计算进度
    const totalSteps = template.steps.length + (template.includeCharacterRelations ? 1 : 0) + 
                       (template.includeSummary ? 1 : 0) + (template.includeEmotionCurve ? 1 : 0) + 1; // +1 for doc generation
    let completedSteps = 0;
    let currentStep = '';
    
    this.liveAnalysisSteps.forEach((step) => {
      if (step.status === 'completed') completedSteps++;
      if (step.status === 'running') currentStep = step.stepName;
    });
    
    // 工具栏
    const toolbar = container.createDiv({ cls: 'nc-su-analysis-toolbar nc-su-analysis-toolbar-live' });
    
    // 左侧：标题和进度
    const toolbarLeft = toolbar.createDiv({ cls: 'nc-su-toolbar-left' });
    toolbarLeft.createSpan({ text: `📊 ${template.name}`, cls: 'nc-su-analysis-template-name' });
    
    // 进度指示
    const progressInfo = toolbarLeft.createDiv({ cls: 'nc-su-progress-info' });
    progressInfo.createSpan({ text: `进度: ${completedSteps}/${totalSteps}`, cls: 'nc-su-progress-text' });
    
    // 耗时显示
    const elapsedTime = Math.floor((Date.now() - this.analysisStartTime) / 1000);
    const minutes = Math.floor(elapsedTime / 60);
    const seconds = elapsedTime % 60;
    const timeStr = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
    progressInfo.createSpan({ text: ` | 耗时: ${timeStr}`, cls: 'nc-su-elapsed-time' });
    
    // 当前步骤
    if (currentStep) {
      progressInfo.createSpan({ text: ` | 当前: ${currentStep}`, cls: 'nc-su-current-step' });
    }
    
    // 右侧：取消按钮
    const toolbarRight = toolbar.createDiv({ cls: 'nc-su-toolbar-right' });
    const cancelBtn = toolbarRight.createEl('button', { 
      text: '❌ 取消分析', 
      cls: 'nc-btn nc-btn-small nc-btn-danger'
    });
    cancelBtn.addEventListener('click', () => {
      this.cancelAnalysis();
    });
    
    // 表格容器
    const tableContainer = container.createDiv({ cls: 'nc-su-analysis-table-container' });
    const table = tableContainer.createEl('table', { cls: 'nc-su-analysis-table nc-su-live-table' });
    
    // 表头
    const thead = table.createEl('thead');
    const headerRow = thead.createEl('tr');
    headerRow.createEl('th', { text: '类别', cls: 'nc-su-table-th-category' });
    headerRow.createEl('th', { text: '具体条目', cls: 'nc-su-table-th-item' });
    headerRow.createEl('th', { text: '拆书填写', cls: 'nc-su-table-th-content' });
    
    // 表体
    const tbody = table.createEl('tbody');
    
    // 基础元素
    const basicSteps = template.steps.filter(s => s.category === 'basic');
    if (basicSteps.length > 0) {
      const groupRow = tbody.createEl('tr', { cls: 'nc-su-table-group-row' });
      groupRow.createEl('td', { 
        text: '基础元素', 
        cls: 'nc-su-table-group-label',
        attr: { rowspan: String(basicSteps.length) }
      });
      
      this.renderLiveTableRow(groupRow, basicSteps[0]);
      
      for (let i = 1; i < basicSteps.length; i++) {
        const row = tbody.createEl('tr');
        this.renderLiveTableRow(row, basicSteps[i]);
      }
    }
    
    // 附加元素
    const extraSteps = template.steps.filter(s => s.category === 'extra');
    if (extraSteps.length > 0) {
      const groupRow = tbody.createEl('tr', { cls: 'nc-su-table-group-row' });
      groupRow.createEl('td', { 
        text: '附加元素', 
        cls: 'nc-su-table-group-label',
        attr: { rowspan: String(extraSteps.length) }
      });
      
      this.renderLiveTableRow(groupRow, extraSteps[0]);
      
      for (let i = 1; i < extraSteps.length; i++) {
        const row = tbody.createEl('tr');
        this.renderLiveTableRow(row, extraSteps[i]);
      }
    }
    
    // 人物关系占位（如果模板包含）
    if (template.includeCharacterRelations) {
      const charSection = container.createDiv({ cls: 'nc-su-char-relations nc-su-char-relations-pending' });
      charSection.createEl('h4', { text: '👥 人物关系 (待分析...)', cls: 'nc-su-char-relations-title' });
    }
  }

  /**
   * 渲染实时表格行
   */
  private renderLiveTableRow(row: HTMLElement, templateStep: AnalysisTemplateStep): void {
    const stepState = this.liveAnalysisSteps.get(templateStep.id);
    const status = stepState?.status || 'pending';
    const content = stepState?.content || '';
    
    // 条目名称 + 状态图标
    const itemCell = row.createEl('td', { cls: 'nc-su-table-item' });
    const statusIcon = status === 'running' ? '🔄' 
      : status === 'completed' ? '✅' 
      : status === 'error' ? '❌' : '⏳';
    itemCell.createSpan({ text: `${statusIcon} ${templateStep.name}`, cls: `nc-su-step-${status}` });
    
    // 内容单元格
    const contentCell = row.createEl('td', { cls: `nc-su-table-content nc-su-content-${status}` });
    
    if (status === 'pending') {
      contentCell.createSpan({ text: '等待分析...', cls: 'nc-su-content-placeholder' });
    } else if (status === 'running') {
      contentCell.createSpan({ text: content || '正在分析...', cls: 'nc-su-content-streaming' });
    } else if (status === 'completed') {
      contentCell.createSpan({ text: content || '未找到相关情节' });
    } else if (status === 'error') {
      contentCell.createSpan({ text: '分析失败', cls: 'nc-su-content-error' });
    }
  }

  /**
   * 开始实时分析
   */
  private async startLiveAnalysis(unit: StoryUnitRecord): Promise<void> {
    if (!this.analysisService || !this.currentAnalysisConfig) return;
    
    const { templateId, template, customPrompt } = this.currentAnalysisConfig;
    
    // 初始化计时器
    this.analysisStartTime = Date.now();
    this.analysisCancelled = false;
    
    // 启动定时刷新（每秒更新耗时显示）
    this.analysisTimer = window.setInterval(() => {
      if (this.isAnalyzing && this.expandedUnitId === unit.id && this.currentTab === 'analysis') {
        this.renderList();
      }
    }, 1000);
    
    try {
      const result = await this.analysisService.analyzeStoryUnit(
        unit.id,
        templateId,
        // 进度回调 - 更新实时状态并刷新UI
        (stepName, status, message, resultContent) => {
          // 检查是否已取消
          if (this.analysisCancelled) return;
          
          // 找到对应的步骤
          const step = template.steps.find(s => s.name === stepName);
          if (step) {
            const stepState = this.liveAnalysisSteps.get(step.id);
            if (stepState) {
              stepState.status = status;
              if (resultContent) {
                stepState.content = resultContent;
              }
            }
          }
          
          // 刷新UI以显示更新
          if (this.expandedUnitId === unit.id && this.currentTab === 'analysis') {
            this.renderList();
          }
        },
        undefined,
        customPrompt
      );
      
      // 分析完成
      if (!this.analysisCancelled) {
        this.analysisResults.set(unit.id, result);
        const elapsedTime = Math.floor((Date.now() - this.analysisStartTime) / 1000);
        const minutes = Math.floor(elapsedTime / 60);
        const seconds = elapsedTime % 60;
        const timeStr = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
        showSuccess(`分析完成！耗时 ${timeStr}`);
      }
      
    } catch (error) {
      if (!this.analysisCancelled) {
        showError('分析失败', error instanceof Error ? error.message : '未知错误');
      }
    } finally {
      // 清理计时器
      if (this.analysisTimer) {
        clearInterval(this.analysisTimer);
        this.analysisTimer = null;
      }
      
      this.isAnalyzing = false;
      this.currentAnalysisConfig = null;
      this.liveAnalysisSteps.clear();
      
      // 刷新数据并重新渲染
      await this.refresh();
      this.expandedUnitId = unit.id;
      this.currentTab = 'analysis';
      this.renderList();
    }
  }

  /**
   * 取消分析
   */
  private cancelAnalysis(): void {
    this.analysisCancelled = true;
    
    // 清理计时器
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
      this.analysisTimer = null;
    }
    
    this.isAnalyzing = false;
    this.currentAnalysisConfig = null;
    this.liveAnalysisSteps.clear();
    
    showInfo('分析已取消');
    this.renderList();
  }

  /**
   * 渲染分析配置界面（旧版进度列表 - 已废弃，保留作为备用）
   */
  private renderAnalysisConfigLegacy(container: HTMLElement, unit: StoryUnitRecord): void {
    // 模板选择
    const templateRow = container.createDiv({ cls: 'nc-su-analysis-row' });
    templateRow.createSpan({ text: '分析模板', cls: 'nc-su-analysis-label' });
    
    const templateSelect = templateRow.createEl('select', { cls: 'nc-su-analysis-select' });
    const templates = getAllTemplates();
    for (const template of templates) {
      templateSelect.createEl('option', { value: template.id, text: template.name });
    }
    
    // 模板描述
    const descArea = container.createDiv({ cls: 'nc-su-analysis-desc' });
    const updateDesc = () => {
      const template = getTemplateById(templateSelect.value);
      if (template) {
        descArea.empty();
        descArea.createEl('p', { text: template.description });
        descArea.createSpan({ 
          text: `分析步骤: ${template.steps.map(s => s.name).join(' → ')}`,
          cls: 'nc-su-analysis-steps'
        });
      }
    };
    updateDesc();
    templateSelect.addEventListener('change', updateDesc);
    
    // 自定义提示词
    const customRow = container.createDiv({ cls: 'nc-su-analysis-row nc-su-analysis-row-full' });
    customRow.createSpan({ text: '自定义提示词（可选）', cls: 'nc-su-analysis-label' });
    const customInput = customRow.createEl('textarea', { 
      cls: 'nc-su-analysis-custom-input',
      attr: { 
        placeholder: '添加额外的分析要求...',
        rows: '2'
      }
    });
    
    // 章节范围
    const rangeInfo = container.createDiv({ cls: 'nc-su-analysis-range' });
    rangeInfo.createSpan({ 
      text: `📖 分析范围: 第${unit.chapter_start}章 - 第${unit.chapter_end}章` 
    });
    
    // 进度显示区域（初始隐藏）
    const progressArea = container.createDiv({ cls: 'nc-su-analysis-progress', attr: { style: 'display: none;' } });
    
    // 按钮
    const buttonRow = container.createDiv({ cls: 'nc-su-analysis-buttons' });
    const analyzeBtn = buttonRow.createEl('button', { 
      text: '🚀 开始分析', 
      cls: 'nc-btn nc-btn-primary nc-btn-small'
    });
    
    analyzeBtn.addEventListener('click', async () => {
      if (this.isAnalyzing) return;
      
      this.isAnalyzing = true;
      analyzeBtn.disabled = true;
      analyzeBtn.textContent = '分析中...';
      progressArea.style.display = 'block';
      progressArea.empty();
      
      const template = getTemplateById(templateSelect.value);
      if (!template) {
        showError('模板不存在');
        this.isAnalyzing = false;
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = '🚀 开始分析';
        return;
      }
      
      // 创建进度列表
      const progressList = progressArea.createDiv({ cls: 'nc-su-progress-list' });
      const stepElements: Map<string, HTMLElement> = new Map();
      
      for (const step of template.steps) {
        const stepEl = progressList.createDiv({ cls: 'nc-su-progress-step nc-su-step-pending' });
        stepEl.createSpan({ text: '⏳', cls: 'nc-su-step-icon' });
        stepEl.createSpan({ text: step.name, cls: 'nc-su-step-name' });
        stepElements.set(step.name, stepEl);
      }
      
      try {
        const result = await this.analysisService!.analyzeStoryUnit(
          unit.id,
          templateSelect.value,
          // 进度回调
          (step, status) => {
            const stepEl = stepElements.get(step);
            if (stepEl) {
              stepEl.className = `nc-su-progress-step nc-su-step-${status}`;
              const icon = stepEl.querySelector('.nc-su-step-icon');
              if (icon) {
                icon.textContent = status === 'running' ? '🔄' 
                  : status === 'completed' ? '✅' 
                  : status === 'error' ? '❌' : '⏳';
              }
            }
          },
          undefined,
          customInput.value || undefined
        );
        
        this.analysisResults.set(unit.id, result);
        showSuccess('分析完成！');
        
        // 刷新显示
        await this.refresh();
        // 保持展开状态和标签页
        this.expandedUnitId = unit.id;
        this.currentTab = 'analysis';
        this.renderList();
        
      } catch (error) {
        showError('分析失败', error instanceof Error ? error.message : '未知错误');
      } finally {
        this.isAnalyzing = false;
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = '🚀 开始分析';
      }
    });
  }

  /**
   * 保存分析结果为笔记
   */
  private async saveAnalysisToNote(unit: StoryUnitRecord, result: StoryUnitAnalysisResult): Promise<void> {
    try {
      // 构建笔记内容（表格格式）
      let content = `# ${unit.title} - AI分析结果\n\n`;
      content += `- 章节范围: 第${unit.chapter_start}章 - 第${unit.chapter_end}章\n`;
      content += `- 分析模板: ${result.templateName}\n`;
      content += `- 分析时间: ${new Date(result.createTime).toLocaleString()}\n\n`;
      content += `---\n\n`;
      
      // 表格格式输出
      content += `## 故事拆解\n\n`;
      content += `| 类别 | 具体条目 | 拆书填写 |\n`;
      content += `|------|---------|----------|\n`;
      
      // 基础元素
      const basicSteps = result.steps.filter(s => 
        s.category === 'basic' ||
        ['step1-advantage', 'step2-villain-info', 'step3-friction', 'step4-negative-expect', 'step5-climax', 'step6-shock', 'step7-reward'].includes(s.stepId)
      );
      
      for (let i = 0; i < basicSteps.length; i++) {
        const step = basicSteps[i];
        const category = i === 0 ? '基础元素' : '';
        const stepContent = (step.content || '').replace(/\n/g, ' ').replace(/\|/g, '\\|');
        content += `| ${category} | ${step.stepName} | ${stepContent} |\n`;
      }
      
      // 附加元素
      const extraSteps = result.steps.filter(s => 
        s.category === 'extra' ||
        ['extra-relations', 'extra-emotion', 'extra-foreshadow'].includes(s.stepId) ||
        s.stepId.startsWith('custom-')
      );
      
      for (let i = 0; i < extraSteps.length; i++) {
        const step = extraSteps[i];
        const category = i === 0 ? '附加元素' : '';
        const stepContent = (step.content || '').replace(/\n/g, ' ').replace(/\|/g, '\\|');
        content += `| ${category} | ${step.stepName} | ${stepContent} |\n`;
      }
      
      // 人物关系
      if (result.characterRelations && result.characterRelations.length > 0) {
        content += `\n## 人物关系\n\n`;
        
        const friends = result.characterRelations.filter(r => r.relationType === 'friend');
        const neutrals = result.characterRelations.filter(r => r.relationType === 'neutral');
        const enemies = result.characterRelations.filter(r => r.relationType === 'enemy');
        
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
      
      // 获取书籍信息
      const book = await databaseService.books.getById(unit.book_id);
      const bookPath = book?.file_path || 'NovelCraft/books';
      
      // 创建笔记文件
      const notePath = `${bookPath}/分析笔记/${unit.title}-AI分析.md`;
      
      // 确保目录存在
      const dirPath = notePath.substring(0, notePath.lastIndexOf('/'));
      const existingFolder = this.app.vault.getAbstractFileByPath(dirPath);
      if (!existingFolder) {
        await this.app.vault.createFolder(dirPath);
      }
      
      // 创建或更新文件
      const existingFile = this.app.vault.getAbstractFileByPath(notePath);
      if (existingFile) {
        await this.app.vault.modify(existingFile as any, content);
      } else {
        await this.app.vault.create(notePath, content);
      }
      
      showSuccess(`笔记已保存到: ${notePath}`);
      
      // 打开笔记
      const file = this.app.vault.getAbstractFileByPath(notePath);
      if (file) {
        await this.app.workspace.openLinkText(notePath, '', true);
      }
    } catch (error) {
      showError('保存笔记失败', error instanceof Error ? error.message : '未知错误');
    }
  }
}


/**
 * 故事单元编辑模态框（用于新建）
 */
class StoryUnitEditModal extends Modal {
  private config: {
    bookId: string;
    tracks: TrackRecord[];
    chapters: ChapterInfo[];
    characters: CharacterRecord[];
    onSave: (config: StoryUnitCreateConfig) => Promise<void>;
  };
  
  private formData: {
    title: string;
    chapterStart: number;
    chapterEnd: number;
    trackId: string;
    isPastEvent: boolean;
    characterIds: string[];
  };

  constructor(app: App, config: typeof StoryUnitEditModal.prototype.config) {
    super(app);
    this.config = config;
    
    this.formData = {
      title: '',
      chapterStart: 1,
      chapterEnd: 1,
      trackId: config.tracks[0]?.id || '',
      isPastEvent: false,
      characterIds: []
    };
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nc-su-edit-modal');

    contentEl.createEl('h2', { text: '➕ 新建故事单元' });

    const form = contentEl.createDiv({ cls: 'nc-su-form' });

    // 标题
    new Setting(form)
      .setName('标题')
      .addText((text: TextComponent) => {
        text.setPlaceholder('故事单元标题')
          .setValue(this.formData.title)
          .onChange((value: string) => { this.formData.title = value; });
      });

    // 轨道
    new Setting(form)
      .setName('轨道')
      .addDropdown((dropdown: DropdownComponent) => {
        for (const track of this.config.tracks) {
          dropdown.addOption(track.id, track.name);
        }
        dropdown.setValue(this.formData.trackId);
        dropdown.onChange((value: string) => { this.formData.trackId = value; });
      });

    // 章节范围
    new Setting(form)
      .setName('起始章节')
      .addText((text: TextComponent) => {
        text.inputEl.type = 'number';
        text.inputEl.min = '1';
        text.setValue(String(this.formData.chapterStart));
        text.onChange((value: string) => { 
          this.formData.chapterStart = parseInt(value) || 1; 
        });
      });

    new Setting(form)
      .setName('结束章节')
      .addText((text: TextComponent) => {
        text.inputEl.type = 'number';
        text.inputEl.min = '1';
        text.setValue(String(this.formData.chapterEnd));
        text.onChange((value: string) => { 
          this.formData.chapterEnd = parseInt(value) || 1; 
        });
      });

    // 过去事件
    new Setting(form)
      .setName('过去事件')
      .setDesc('标记为回忆、闪回等过去发生的事件')
      .addToggle((toggle) => {
        toggle.setValue(this.formData.isPastEvent)
          .onChange((value: boolean) => { this.formData.isPastEvent = value; });
      });

    // 人物选择
    if (this.config.characters.length > 0) {
      const charSetting = new Setting(form).setName('关联人物');
      const charContainer = charSetting.controlEl.createDiv({ cls: 'nc-su-char-list' });
      
      for (const char of this.config.characters) {
        const item = charContainer.createDiv({ cls: 'nc-su-char-item' });
        const checkbox = item.createEl('input', { 
          type: 'checkbox',
          attr: { id: `char-${char.id}` }
        }) as HTMLInputElement;
        checkbox.checked = this.formData.characterIds.includes(char.id);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            this.formData.characterIds.push(char.id);
          } else {
            const idx = this.formData.characterIds.indexOf(char.id);
            if (idx > -1) this.formData.characterIds.splice(idx, 1);
          }
        });
        item.createEl('label', { text: char.name, attr: { for: `char-${char.id}` } });
      }
    }

    // 按钮
    const buttons = contentEl.createDiv({ cls: 'nc-su-buttons' });
    
    buttons.createEl('button', { text: '取消', cls: 'nc-btn' })
      .addEventListener('click', () => this.close());
    
    buttons.createEl('button', { text: '创建', cls: 'nc-btn nc-btn-primary' })
      .addEventListener('click', () => this.save());
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async save(): Promise<void> {
    if (!this.formData.title.trim()) {
      showWarning('请输入标题');
      return;
    }

    try {
      await this.config.onSave({
        bookId: this.config.bookId,
        title: this.formData.title.trim(),
        chapterStart: this.formData.chapterStart,
        chapterEnd: this.formData.chapterEnd,
        trackId: this.formData.trackId,
        isPastEvent: this.formData.isPastEvent,
        characterIds: this.formData.characterIds
      });
      this.close();
    } catch (error) {
      showError('保存失败', error instanceof Error ? error.message : '未知错误');
    }
  }
}


/**
 * 确认对话框
 */
class ConfirmModal extends Modal {
  private config: {
    title: string;
    message: string;
    confirmText?: string;
    onConfirm: () => Promise<void>;
  };

  constructor(app: App, config: typeof ConfirmModal.prototype.config) {
    super(app);
    this.config = config;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nc-confirm-modal');

    contentEl.createEl('h3', { text: this.config.title });
    contentEl.createEl('p', { text: this.config.message });

    const buttons = contentEl.createDiv({ cls: 'nc-su-buttons' });
    
    buttons.createEl('button', { text: '取消', cls: 'nc-btn' })
      .addEventListener('click', () => this.close());
    
    buttons.createEl('button', { 
      text: this.config.confirmText || '确认', 
      cls: 'nc-btn nc-btn-danger' 
    }).addEventListener('click', async () => {
      await this.config.onConfirm();
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}


/**
 * 步骤内容编辑器模态框
 */
class StepEditorModal extends Modal {
  private config: {
    stepName: string;
    content: string;
    onSave: (content: string) => Promise<void>;
  };
  
  private editedContent: string;

  constructor(app: App, config: typeof StepEditorModal.prototype.config) {
    super(app);
    this.config = config;
    this.editedContent = config.content;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nc-step-editor-modal');

    contentEl.createEl('h3', { text: `编辑: ${this.config.stepName}` });

    const textarea = contentEl.createEl('textarea', { cls: 'nc-step-editor-textarea' });
    textarea.value = this.editedContent;
    textarea.rows = 12;
    textarea.addEventListener('input', () => {
      this.editedContent = textarea.value;
    });

    const buttons = contentEl.createDiv({ cls: 'nc-su-buttons' });
    
    buttons.createEl('button', { text: '取消', cls: 'nc-btn' })
      .addEventListener('click', () => this.close());
    
    buttons.createEl('button', { text: '保存', cls: 'nc-btn nc-btn-primary' })
      .addEventListener('click', async () => {
        await this.config.onSave(this.editedContent);
        this.close();
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}


/**
 * 添加自定义行模态框
 */
class AddRowModal extends Modal {
  private config: {
    onSave: (itemName: string, content: string) => Promise<void>;
  };
  
  private itemName: string = '';
  private content: string = '';

  constructor(app: App, config: typeof AddRowModal.prototype.config) {
    super(app);
    this.config = config;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nc-add-row-modal');

    contentEl.createEl('h3', { text: '➕ 添加自定义条目' });

    // 条目名称
    const nameRow = contentEl.createDiv({ cls: 'nc-add-row-field' });
    nameRow.createEl('label', { text: '条目名称' });
    const nameInput = nameRow.createEl('input', { 
      type: 'text',
      cls: 'nc-add-row-input',
      attr: { placeholder: '例如：人脉关系网、情绪折线、伏笔线索...' }
    });
    nameInput.addEventListener('input', () => {
      this.itemName = nameInput.value;
    });

    // 内容
    const contentRow = contentEl.createDiv({ cls: 'nc-add-row-field' });
    contentRow.createEl('label', { text: '内容' });
    const contentInput = contentRow.createEl('textarea', { 
      cls: 'nc-add-row-textarea',
      attr: { 
        placeholder: '填写分析内容...',
        rows: '4'
      }
    });
    contentInput.addEventListener('input', () => {
      this.content = contentInput.value;
    });

    // 按钮
    const buttons = contentEl.createDiv({ cls: 'nc-su-buttons' });
    
    buttons.createEl('button', { text: '取消', cls: 'nc-btn' })
      .addEventListener('click', () => this.close());
    
    const saveBtn = buttons.createEl('button', { text: '添加', cls: 'nc-btn nc-btn-primary' });
    saveBtn.addEventListener('click', async () => {
      if (!this.itemName.trim()) {
        return;
      }
      await this.config.onSave(this.itemName.trim(), this.content.trim());
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
