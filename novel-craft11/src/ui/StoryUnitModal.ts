/**
 * StoryUnitModal - 故事单元创建和编辑模态框
 * 
 * 功能：
 * 1. 创建新的故事单元
 * 2. 管理多段选区
 * 3. 选择分析模板
 * 4. 触发 AI 分析
 * 5. 多章节选择功能
 * 6. 人物关联从 `_characters.md` 下拉选择
 * 
 * Requirements: 2.2, 5.2
 */

import { App, Modal } from 'obsidian';
import { StoryUnitAnalysisService } from '../services/StoryUnitAnalysisService';
import { GlobalMaterialLibraryService } from '../services/GlobalMaterialLibraryService';
import { BookDatabaseService } from '../services/BookDatabaseService';
import {
  UnifiedMark,
  StoryUnitSelection,
  AnalysisTemplateType,
  ANALYSIS_TEMPLATES,
  getAnalysisTemplateList,
  SEVEN_STEP_TEMPLATE
} from '../types/unified-marking';
import { Character, ChapterFrontmatter, StoryUnit } from '../types/database';
import { showSuccess, showError, showWarning } from './NotificationUtils';

export interface StoryUnitModalConfig {
  bookId: string;
  bookTitle: string;
  /** 书籍文件夹路径 */
  bookPath?: string;
  /** 初始选区（从编辑器选中的内容） */
  initialSelection?: StoryUnitSelection;
  /** 编辑模式：传入已有的故事单元 */
  existingUnit?: UnifiedMark;
}

export class StoryUnitModal extends Modal {
  private config: StoryUnitModalConfig;
  private analysisService: StoryUnitAnalysisService;
  private materialLibrary: GlobalMaterialLibraryService;
  private bookDatabaseService: BookDatabaseService | null = null;
  
  private unitName: string = '';
  private lineType: 'main' | 'sub' | 'independent' | 'custom' = 'main';
  private customLineType: string = '';
  private selectedTemplate: AnalysisTemplateType = 'seven-step';
  private selections: StoryUnitSelection[] = [];
  private note: string = '';
  
  // 多章节选择
  private chapterRangeStart: number = 1;
  private chapterRangeEnd: number = 1;
  private chapters: ChapterFrontmatter[] = [];
  private useChapterRange: boolean = false;
  
  // 人物关联
  private characters: Character[] = [];
  private selectedCharacterIds: string[] = [];
  
  private selectionsContainer: HTMLElement;
  private analysisResultContainer: HTMLElement;
  private chapterRangeContainer: HTMLElement;
  private characterSelectContainer: HTMLElement;
  private isAnalyzing = false;
  private currentStoryUnit: StoryUnit | null = null;
  
  private onSave?: (mark: UnifiedMark) => void;

  constructor(
    app: App,
    config: StoryUnitModalConfig,
    analysisService: StoryUnitAnalysisService,
    materialLibrary: GlobalMaterialLibraryService,
    onSave?: (mark: UnifiedMark) => void,
    bookDatabaseService?: BookDatabaseService
  ) {
    super(app);
    this.config = config;
    this.analysisService = analysisService;
    this.materialLibrary = materialLibrary;
    this.bookDatabaseService = bookDatabaseService || null;
    this.onSave = onSave;
    
    // 初始化选区
    if (config.initialSelection) {
      this.selections = [config.initialSelection];
    }
    
    // 编辑模式
    if (config.existingUnit) {
      this.unitName = config.existingUnit.unitName || '';
      this.lineType = (config.existingUnit.subType as any) || 'main';
      this.selectedTemplate = config.existingUnit.analysisTemplate || 'seven-step';
      this.selections = config.existingUnit.selections || [];
      this.note = config.existingUnit.note || '';
    }
  }

  /**
   * 设置数据库服务
   */
  setBookDatabaseService(service: BookDatabaseService): void {
    this.bookDatabaseService = service;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nc-story-unit-modal');
    
    // 加载章节和人物数据
    await this.loadDatabaseData();
    
    // 标题
    contentEl.createEl('h2', { 
      text: this.config.existingUnit ? '编辑故事单元' : '创建故事单元',
      cls: 'nc-modal-title'
    });
    
    // 书籍信息
    const bookInfo = contentEl.createDiv({ cls: 'nc-modal-book-info' });
    bookInfo.createSpan({ text: `📖 ${this.config.bookTitle}` });
    
    // 表单
    const form = contentEl.createDiv({ cls: 'nc-story-unit-form' });
    
    // 单元名称
    this.createNameInput(form);
    
    // 线类型选择
    this.createLineTypeSelect(form);
    
    // 分析模板选择
    this.createTemplateSelect(form);
    
    // 多章节选择（新增）
    this.createChapterRangeSection(form);
    
    // 选区管理
    this.createSelectionsSection(form);
    
    // 人物关联（新增）
    this.createCharacterSelectSection(form);
    
    // 备注
    this.createNoteInput(form);
    
    // 分析结果区域
    this.analysisResultContainer = contentEl.createDiv({ cls: 'nc-analysis-result-container' });
    
    // 操作按钮
    this.createActionButtons(contentEl);
  }

  /**
   * 加载数据库数据（章节和人物）
   * Requirements: 2.2, 5.2
   */
  private async loadDatabaseData(): Promise<void> {
    if (!this.bookDatabaseService || !this.config.bookPath) {
      return;
    }
    
    try {
      // 加载章节列表
      this.chapters = await this.bookDatabaseService.getChapters(this.config.bookPath);
      if (this.chapters.length > 0) {
        this.chapterRangeEnd = this.chapters.length;
      }
      
      // 加载人物列表
      this.characters = await this.bookDatabaseService.getCharacters(this.config.bookPath);
    } catch (error) {
      console.error('加载数据库数据失败:', error);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }

  private createNameInput(container: HTMLElement): void {
    const row = container.createDiv({ cls: 'nc-form-row' });
    row.createEl('label', { text: '单元名称', cls: 'nc-form-label' });
    const input = row.createEl('input', {
      type: 'text',
      cls: 'nc-form-input',
      attr: { placeholder: '例如：主角首次展示实力' }
    });
    input.value = this.unitName;
    input.addEventListener('input', () => this.unitName = input.value);
  }

  private createLineTypeSelect(container: HTMLElement): void {
    const row = container.createDiv({ cls: 'nc-form-row' });
    row.createEl('label', { text: '故事线类型', cls: 'nc-form-label' });
    
    const selectRow = row.createDiv({ cls: 'nc-line-type-row' });
    
    const types = [
      { value: 'main', label: '📖 主线', desc: '主要故事线' },
      { value: 'sub', label: '📑 支线', desc: '次要故事线' },
      { value: 'independent', label: '📄 独立', desc: '独立小故事' },
      { value: 'custom', label: '🏷️ 自定义', desc: '自定义类型' }
    ];
    
    for (const type of types) {
      const btn = selectRow.createEl('button', {
        cls: `nc-line-type-btn ${this.lineType === type.value ? 'active' : ''}`,
        attr: { title: type.desc }
      });
      btn.textContent = type.label;
      btn.addEventListener('click', () => {
        this.lineType = type.value as any;
        selectRow.querySelectorAll('.nc-line-type-btn').forEach(b => b.removeClass('active'));
        btn.addClass('active');
        
        // 显示/隐藏自定义输入
        const customInput = row.querySelector('.nc-custom-line-input') as HTMLInputElement;
        if (customInput) {
          customInput.style.display = type.value === 'custom' ? 'block' : 'none';
        }
      });
    }
    
    // 自定义类型输入
    const customInput = row.createEl('input', {
      type: 'text',
      cls: 'nc-form-input nc-custom-line-input',
      attr: { placeholder: '输入自定义类型名称' }
    });
    customInput.style.display = this.lineType === 'custom' ? 'block' : 'none';
    customInput.value = this.customLineType;
    customInput.addEventListener('input', () => this.customLineType = customInput.value);
  }

  private createTemplateSelect(container: HTMLElement): void {
    const row = container.createDiv({ cls: 'nc-form-row' });
    row.createEl('label', { text: '分析模板', cls: 'nc-form-label' });
    
    const templates = getAnalysisTemplateList();
    const templateGrid = row.createDiv({ cls: 'nc-template-grid' });
    
    for (const template of templates) {
      if (template.id === 'custom') continue; // 暂时跳过自定义
      
      const card = templateGrid.createDiv({
        cls: `nc-template-card ${this.selectedTemplate === template.id ? 'active' : ''}`
      });
      
      card.createDiv({ cls: 'nc-template-icon', text: template.icon });
      card.createDiv({ cls: 'nc-template-name', text: template.name });
      card.createDiv({ cls: 'nc-template-desc', text: template.description });
      
      card.addEventListener('click', () => {
        this.selectedTemplate = template.id;
        templateGrid.querySelectorAll('.nc-template-card').forEach(c => c.removeClass('active'));
        card.addClass('active');
        this.showTemplatePreview();
      });
    }
    
    // 模板预览
    const preview = row.createDiv({ cls: 'nc-template-preview' });
    this.showTemplatePreview(preview);
  }

  private showTemplatePreview(container?: HTMLElement): void {
    const preview = container || this.contentEl.querySelector('.nc-template-preview');
    if (!preview) return;
    
    preview.empty();
    
    const template = ANALYSIS_TEMPLATES[this.selectedTemplate];
    if (!template || !template.fields.length) return;
    
    preview.createEl('h4', { text: `${template.icon} ${template.name} 分析维度` });
    const list = preview.createEl('ul', { cls: 'nc-template-fields' });
    
    for (const field of template.fields) {
      const li = list.createEl('li');
      li.createSpan({ text: field.label, cls: 'nc-field-label' });
      li.createSpan({ text: ` - ${field.description}`, cls: 'nc-field-desc' });
    }
  }

  /**
   * 创建多章节选择区域
   * Requirements: 2.2
   */
  private createChapterRangeSection(container: HTMLElement): void {
    const section = container.createDiv({ cls: 'nc-form-row nc-chapter-range-section' });
    section.createEl('label', { text: '章节范围', cls: 'nc-form-label' });
    
    // 切换开关
    const toggleRow = section.createDiv({ cls: 'nc-toggle-row' });
    const toggleLabel = toggleRow.createEl('label', { cls: 'nc-toggle-label' });
    const toggleInput = toggleLabel.createEl('input', { 
      type: 'checkbox',
      cls: 'nc-toggle-input'
    });
    toggleInput.checked = this.useChapterRange;
    toggleLabel.createSpan({ text: '使用章节范围选择（替代手动选区）' });
    
    toggleInput.addEventListener('change', () => {
      this.useChapterRange = toggleInput.checked;
      this.updateChapterRangeVisibility();
    });
    
    // 章节范围选择器
    this.chapterRangeContainer = section.createDiv({ cls: 'nc-chapter-range-inputs' });
    this.chapterRangeContainer.style.display = this.useChapterRange ? 'flex' : 'none';
    
    if (this.chapters.length === 0) {
      this.chapterRangeContainer.createDiv({ 
        cls: 'nc-empty-hint', 
        text: '暂无章节数据，请先初始化书籍数据库' 
      });
      return;
    }
    
    // 起始章节
    const startGroup = this.chapterRangeContainer.createDiv({ cls: 'nc-range-group' });
    startGroup.createSpan({ text: '从第', cls: 'nc-range-label' });
    const startSelect = startGroup.createEl('select', { cls: 'nc-range-select' });
    
    for (const chapter of this.chapters) {
      startSelect.createEl('option', {
        value: String(chapter.chapterNum),
        text: `${chapter.chapterNum} - ${chapter.title}`
      });
    }
    startSelect.value = String(this.chapterRangeStart);
    startSelect.addEventListener('change', () => {
      this.chapterRangeStart = parseInt(startSelect.value, 10);
      // 确保结束章节不小于起始章节
      if (this.chapterRangeEnd < this.chapterRangeStart) {
        this.chapterRangeEnd = this.chapterRangeStart;
        endSelect.value = String(this.chapterRangeEnd);
      }
    });
    
    startGroup.createSpan({ text: '章', cls: 'nc-range-label' });
    
    // 结束章节
    const endGroup = this.chapterRangeContainer.createDiv({ cls: 'nc-range-group' });
    endGroup.createSpan({ text: '到第', cls: 'nc-range-label' });
    const endSelect = endGroup.createEl('select', { cls: 'nc-range-select' });
    
    for (const chapter of this.chapters) {
      endSelect.createEl('option', {
        value: String(chapter.chapterNum),
        text: `${chapter.chapterNum} - ${chapter.title}`
      });
    }
    endSelect.value = String(this.chapterRangeEnd);
    endSelect.addEventListener('change', () => {
      this.chapterRangeEnd = parseInt(endSelect.value, 10);
      // 确保起始章节不大于结束章节
      if (this.chapterRangeStart > this.chapterRangeEnd) {
        this.chapterRangeStart = this.chapterRangeEnd;
        startSelect.value = String(this.chapterRangeStart);
      }
    });
    
    endGroup.createSpan({ text: '章', cls: 'nc-range-label' });
    
    // 预览按钮
    const previewBtn = this.chapterRangeContainer.createEl('button', {
      cls: 'nc-btn nc-btn-small',
      text: '预览内容'
    });
    previewBtn.addEventListener('click', () => this.previewChapterRange());
  }

  /**
   * 更新章节范围区域可见性
   */
  private updateChapterRangeVisibility(): void {
    if (this.chapterRangeContainer) {
      this.chapterRangeContainer.style.display = this.useChapterRange ? 'flex' : 'none';
    }
    
    // 同时更新选区区域的提示
    if (this.selectionsContainer) {
      const hint = this.selectionsContainer.querySelector('.nc-empty-hint');
      if (hint && this.useChapterRange) {
        hint.textContent = '已启用章节范围选择，将自动提取指定章节的内容';
      }
    }
  }

  /**
   * 预览章节范围内容
   */
  private async previewChapterRange(): Promise<void> {
    if (!this.bookDatabaseService || !this.config.bookPath) {
      showWarning('数据库服务未初始化');
      return;
    }
    
    try {
      const content = await this.bookDatabaseService.getChapterContent(
        this.config.bookPath,
        this.chapterRangeStart,
        this.chapterRangeEnd
      );
      
      // 显示预览
      const previewText = content.slice(0, 500) + (content.length > 500 ? '...' : '');
      showSuccess(`章节 ${this.chapterRangeStart}-${this.chapterRangeEnd} 共 ${content.length} 字`);
      
      // 更新选区显示
      if (this.selectionsContainer) {
        this.selectionsContainer.empty();
        const previewDiv = this.selectionsContainer.createDiv({ cls: 'nc-chapter-preview' });
        previewDiv.createEl('h5', { text: `📖 第${this.chapterRangeStart}-${this.chapterRangeEnd}章内容预览` });
        previewDiv.createDiv({ cls: 'nc-preview-text', text: previewText });
        previewDiv.createDiv({ cls: 'nc-preview-stats', text: `共 ${content.length} 字` });
      }
    } catch (error) {
      showError('预览失败', error instanceof Error ? error.message : '未知错误');
    }
  }

  /**
   * 创建人物关联选择区域
   * Requirements: 5.2
   */
  private createCharacterSelectSection(container: HTMLElement): void {
    const section = container.createDiv({ cls: 'nc-form-row nc-character-select-section' });
    section.createEl('label', { text: '关联人物', cls: 'nc-form-label' });
    
    this.characterSelectContainer = section.createDiv({ cls: 'nc-character-select-container' });
    
    if (this.characters.length === 0) {
      this.characterSelectContainer.createDiv({ 
        cls: 'nc-empty-hint', 
        text: '暂无人物数据，可在分析后自动关联' 
      });
      return;
    }
    
    // 人物多选列表
    const charList = this.characterSelectContainer.createDiv({ cls: 'nc-character-list' });
    
    for (const char of this.characters) {
      const charItem = charList.createDiv({ cls: 'nc-character-item' });
      
      const checkbox = charItem.createEl('input', {
        type: 'checkbox',
        cls: 'nc-character-checkbox',
        attr: { 'data-character-id': char.characterId }
      });
      checkbox.checked = this.selectedCharacterIds.includes(char.characterId);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          if (!this.selectedCharacterIds.includes(char.characterId)) {
            this.selectedCharacterIds.push(char.characterId);
          }
        } else {
          this.selectedCharacterIds = this.selectedCharacterIds.filter(id => id !== char.characterId);
        }
        this.updateSelectedCharactersDisplay();
      });
      
      const label = charItem.createEl('label', { cls: 'nc-character-label' });
      label.createSpan({ text: this.getRoleIcon(char.role), cls: 'nc-character-role-icon' });
      label.createSpan({ text: char.name, cls: 'nc-character-name' });
      
      if (char.tags && char.tags.length > 0) {
        const tags = label.createSpan({ cls: 'nc-character-tags' });
        tags.textContent = char.tags.slice(0, 2).join(', ');
      }
    }
    
    // 已选人物显示
    const selectedDisplay = this.characterSelectContainer.createDiv({ cls: 'nc-selected-characters' });
    this.updateSelectedCharactersDisplay(selectedDisplay);
  }

  /**
   * 获取角色图标
   */
  private getRoleIcon(role: string): string {
    const icons: Record<string, string> = {
      protagonist: '🌟',
      antagonist: '😈',
      supporting: '👥',
      minor: '👤',
    };
    return icons[role] || '👤';
  }

  /**
   * 更新已选人物显示
   */
  private updateSelectedCharactersDisplay(container?: HTMLElement): void {
    const display = container || this.characterSelectContainer?.querySelector('.nc-selected-characters');
    if (!display) return;
    
    display.empty();
    
    if (this.selectedCharacterIds.length === 0) {
      display.createSpan({ text: '未选择人物', cls: 'nc-no-selection' });
      return;
    }
    
    display.createSpan({ text: '已选: ', cls: 'nc-selected-label' });
    
    for (const charId of this.selectedCharacterIds) {
      const char = this.characters.find(c => c.characterId === charId);
      if (char) {
        const tag = display.createSpan({ cls: 'nc-selected-tag' });
        tag.textContent = char.name;
        
        const removeBtn = tag.createSpan({ cls: 'nc-remove-tag', text: '×' });
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectedCharacterIds = this.selectedCharacterIds.filter(id => id !== charId);
          // 更新复选框状态
          const checkbox = this.characterSelectContainer?.querySelector(
            `input[data-character-id="${charId}"]`
          ) as HTMLInputElement;
          if (checkbox) checkbox.checked = false;
          this.updateSelectedCharactersDisplay();
        });
      }
    }
  }

  private createSelectionsSection(container: HTMLElement): void {
    const section = container.createDiv({ cls: 'nc-selections-section' });
    
    const header = section.createDiv({ cls: 'nc-section-header' });
    header.createEl('label', { text: `选区内容 (${this.selections.length})`, cls: 'nc-form-label' });
    
    const addBtn = header.createEl('button', { cls: 'nc-btn nc-btn-small', text: '+ 添加选区' });
    addBtn.addEventListener('click', () => this.showAddSelectionHint());
    
    this.selectionsContainer = section.createDiv({ cls: 'nc-selections-list' });
    this.renderSelections();
  }

  private renderSelections(): void {
    this.selectionsContainer.empty();
    
    if (this.selections.length === 0) {
      this.selectionsContainer.createDiv({ 
        cls: 'nc-empty-hint',
        text: '暂无选区，请在章节中选中文本后点击"添加选区"'
      });
      return;
    }
    
    for (let i = 0; i < this.selections.length; i++) {
      const sel = this.selections[i];
      const item = this.selectionsContainer.createDiv({ cls: 'nc-selection-item' });
      
      // 拖拽手柄
      const handle = item.createSpan({ cls: 'nc-selection-handle', text: '⋮⋮' });
      
      // 章节信息
      const info = item.createDiv({ cls: 'nc-selection-info' });
      info.createSpan({ 
        cls: 'nc-selection-chapter',
        text: `第${sel.chapterIndex + 1}章${sel.chapterTitle ? ` - ${sel.chapterTitle}` : ''}`
      });
      
      // 内容预览
      const preview = info.createDiv({ cls: 'nc-selection-preview' });
      const text = sel.range.textSnapshot || '';
      preview.textContent = text.slice(0, 100) + (text.length > 100 ? '...' : '');
      
      // 字数
      info.createSpan({ cls: 'nc-selection-count', text: `${text.length} 字` });
      
      // 删除按钮
      const deleteBtn = item.createEl('button', { cls: 'nc-btn-icon nc-btn-danger', text: '×' });
      deleteBtn.addEventListener('click', () => {
        this.selections.splice(i, 1);
        this.renderSelections();
        this.updateSelectionCount();
      });
    }
  }

  private updateSelectionCount(): void {
    const label = this.contentEl.querySelector('.nc-selections-section .nc-form-label');
    if (label) {
      label.textContent = `选区内容 (${this.selections.length})`;
    }
  }

  private showAddSelectionHint(): void {
    showWarning('请在章节文档中选中文本，然后使用工具栏的"添加到故事单元"按钮');
  }

  /**
   * 外部调用：添加选区
   */
  addSelection(selection: StoryUnitSelection): void {
    selection.order = this.selections.length;
    this.selections.push(selection);
    this.renderSelections();
    this.updateSelectionCount();
    showSuccess(`已添加选区：${selection.range.textSnapshot.slice(0, 20)}...`);
  }

  private createNoteInput(container: HTMLElement): void {
    const row = container.createDiv({ cls: 'nc-form-row' });
    row.createEl('label', { text: '备注', cls: 'nc-form-label' });
    const textarea = row.createEl('textarea', {
      cls: 'nc-form-textarea',
      attr: { placeholder: '添加备注说明...' }
    });
    textarea.value = this.note;
    textarea.addEventListener('input', () => this.note = textarea.value);
  }

  private createActionButtons(container: HTMLElement): void {
    const actions = container.createDiv({ cls: 'nc-modal-actions' });
    
    // 取消按钮
    const cancelBtn = actions.createEl('button', { cls: 'nc-btn', text: '取消' });
    cancelBtn.addEventListener('click', () => this.close());
    
    // 保存按钮
    const saveBtn = actions.createEl('button', { cls: 'nc-btn nc-btn-primary', text: '保存' });
    saveBtn.addEventListener('click', () => this.handleSave());
    
    // 分析按钮
    const analyzeBtn = actions.createEl('button', { 
      cls: 'nc-btn nc-btn-accent', 
      text: '🤖 AI 分析'
    });
    analyzeBtn.addEventListener('click', () => this.handleAnalyze());
  }

  private async handleSave(): Promise<void> {
    if (!this.unitName.trim()) {
      showWarning('请输入单元名称');
      return;
    }
    
    // 如果使用章节范围，不需要手动选区
    if (!this.useChapterRange && this.selections.length === 0) {
      showWarning('请至少添加一个选区或启用章节范围选择');
      return;
    }
    
    try {
      const mark = await this.analysisService.createStoryUnit({
        bookId: this.config.bookId,
        unitName: this.unitName,
        selections: this.useChapterRange ? [] : this.selections,
        lineType: this.lineType,
        customLineType: this.lineType === 'custom' ? this.customLineType : undefined,
        analysisTemplate: this.selectedTemplate,
        note: this.note,
        // 新增：章节范围
        chapterRange: this.useChapterRange ? {
          start: this.chapterRangeStart,
          end: this.chapterRangeEnd
        } : undefined,
        // 新增：关联人物
        relatedCharacterIds: this.selectedCharacterIds.length > 0 ? this.selectedCharacterIds : undefined
      });
      
      showSuccess('故事单元已保存');
      this.onSave?.(mark);
      this.close();
    } catch (error) {
      showError('保存失败', error instanceof Error ? error.message : '未知错误');
    }
  }

  private async handleAnalyze(): Promise<void> {
    // 如果使用章节范围，不需要手动选区
    if (!this.useChapterRange && this.selections.length === 0) {
      showWarning('请至少添加一个选区或启用章节范围选择');
      return;
    }
    
    if (this.isAnalyzing) return;
    
    this.isAnalyzing = true;
    this.showAnalyzing();
    
    try {
      let markId: string;
      
      // 检查是否已有故事单元，如果有则使用现有的，否则创建新的
      if (this.currentStoryUnit) {
        markId = this.currentStoryUnit.unitId;
      } else {
        // 创建新的故事单元
        const mark = await this.analysisService.createStoryUnit({
          bookId: this.config.bookId,
          unitName: this.unitName || '未命名故事单元',
          selections: this.useChapterRange ? [] : this.selections,
          lineType: this.lineType,
          customLineType: this.lineType === 'custom' ? this.customLineType : undefined,
          analysisTemplate: this.selectedTemplate,
          note: this.note,
          // 新增：章节范围
          chapterRange: this.useChapterRange ? {
            start: this.chapterRangeStart,
            end: this.chapterRangeEnd
          } : undefined,
          // 新增：关联人物
          relatedCharacterIds: this.selectedCharacterIds.length > 0 ? this.selectedCharacterIds : undefined
        });
        markId = mark.id;
        
        // 更新当前故事单元引用
        this.currentStoryUnit = {
          unitId: markId,
          bookId: this.config.bookId,
          name: this.unitName || '未命名故事单元',
          chapterRange: this.useChapterRange ? {
            start: this.chapterRangeStart,
            end: this.chapterRangeEnd
          } : { start: 1, end: 1 },
          preciseRange: {
            start: { chapterIndex: 0, lineNumber: 1, characterOffset: 0 },
            end: { chapterIndex: 0, lineNumber: 1, characterOffset: 0 }
          },
          relatedCharacters: this.selectedCharacterIds.length > 0 ? this.selectedCharacterIds : [],
          lineType: this.lineType,
          customLineType: this.lineType === 'custom' ? this.customLineType : undefined,
          analysisTemplate: this.selectedTemplate,
          source: 'manual',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }
      
      // 执行分析
      const response = await this.analysisService.analyzeStoryUnit(
        this.config.bookId,
        markId,
        this.selectedTemplate
      );
      
      if (response.success && response.result) {
        this.showAnalysisResult(response.result);
        showSuccess('分析完成');
      } else {
        showError('分析失败', response.error || '未知错误');
        this.hideAnalyzing();
      }
    } catch (error) {
      console.error('AI 分析失败:', error);
      showError('分析失败', error instanceof Error ? error.message : '未知错误');
      this.hideAnalyzing();
    } finally {
      this.isAnalyzing = false;
    }
  }

  private showAnalyzing(): void {
    this.analysisResultContainer.empty();
    this.analysisResultContainer.addClass('nc-analyzing');
    
    const loading = this.analysisResultContainer.createDiv({ cls: 'nc-loading' });
    loading.createDiv({ cls: 'nc-loading-spinner' });
    loading.createDiv({ cls: 'nc-loading-text', text: '正在分析中...' });
  }

  private hideAnalyzing(): void {
    this.analysisResultContainer.removeClass('nc-analyzing');
    this.analysisResultContainer.empty();
  }

  private showAnalysisResult(result: any): void {
    this.analysisResultContainer.empty();
    this.analysisResultContainer.removeClass('nc-analyzing');
    this.analysisResultContainer.addClass('nc-has-result');
    
    // 摘要
    if (result.summary) {
      const summarySection = this.analysisResultContainer.createDiv({ cls: 'nc-result-section' });
      summarySection.createEl('h4', { text: '📝 摘要' });
      summarySection.createDiv({ cls: 'nc-result-content', text: result.summary });
    }
    
    // 7步法结果
    if (result.sevenStep) {
      this.renderSevenStepResult(result.sevenStep);
    }
    
    // 三幕式结果
    if (result.threeAct) {
      this.renderThreeActResult(result.threeAct);
    }
    
    // 冲突-解决结果
    if (result.conflictResolution) {
      this.renderConflictResolutionResult(result.conflictResolution);
    }
    
    // 写作技法
    if (result.techniques && result.techniques.length > 0) {
      const techSection = this.analysisResultContainer.createDiv({ cls: 'nc-result-section' });
      techSection.createEl('h4', { text: '✨ 写作技法' });
      const list = techSection.createEl('ul');
      for (const tech of result.techniques) {
        list.createEl('li', { text: tech });
      }
    }
    
    // 可借鉴点
    if (result.takeaways && result.takeaways.length > 0) {
      const takeawaySection = this.analysisResultContainer.createDiv({ cls: 'nc-result-section' });
      takeawaySection.createEl('h4', { text: '💡 可借鉴点' });
      const list = takeawaySection.createEl('ul');
      for (const item of result.takeaways) {
        list.createEl('li', { text: item });
      }
    }
    
    // 添加到素材库按钮
    const addToLibraryBtn = this.analysisResultContainer.createEl('button', {
      cls: 'nc-btn nc-btn-accent nc-add-to-library',
      text: '📚 添加到素材库'
    });
    addToLibraryBtn.addEventListener('click', () => this.addToMaterialLibrary());
  }

  private renderSevenStepResult(sevenStep: any): void {
    const section = this.analysisResultContainer.createDiv({ cls: 'nc-result-section nc-seven-step' });
    section.createEl('h4', { text: '🔄 7步法分析' });
    
    const steps = [
      { key: 'step1_advantage', label: '①主角优势', icon: '💪' },
      { key: 'step2_villain', label: '②反派出场', icon: '😈' },
      { key: 'step3_friction', label: '③摩擦交集', icon: '⚡' },
      { key: 'step4_expectation', label: '④拉期待', icon: '👀' },
      { key: 'step5_climax', label: '⑤冲突爆发', icon: '💥' },
      { key: 'step6_shock', label: '⑥震惊四座', icon: '😱' },
      { key: 'step7_reward', label: '⑦收获奖励', icon: '🎁' }
    ];
    
    const grid = section.createDiv({ cls: 'nc-seven-step-grid' });
    
    for (const step of steps) {
      const value = sevenStep[step.key];
      if (!value) continue;
      
      const card = grid.createDiv({ cls: 'nc-step-card' });
      card.createDiv({ cls: 'nc-step-header', text: `${step.icon} ${step.label}` });
      card.createDiv({ cls: 'nc-step-content', text: value });
    }
  }

  private renderThreeActResult(threeAct: any): void {
    const section = this.analysisResultContainer.createDiv({ cls: 'nc-result-section' });
    section.createEl('h4', { text: '🎭 三幕式分析' });
    
    const acts = [
      { key: 'act1_setup', label: '第一幕：建置', fields: ['introduction', 'incitingIncident'] },
      { key: 'act2_confrontation', label: '第二幕：对抗', fields: ['risingAction', 'midpoint', 'complications'] },
      { key: 'act3_resolution', label: '第三幕：解决', fields: ['climax', 'fallingAction', 'denouement'] }
    ];
    
    for (const act of acts) {
      const actData = threeAct[act.key];
      if (!actData) continue;
      
      const actDiv = section.createDiv({ cls: 'nc-act-section' });
      actDiv.createEl('h5', { text: act.label });
      
      for (const field of act.fields) {
        if (actData[field]) {
          const fieldDiv = actDiv.createDiv({ cls: 'nc-act-field' });
          fieldDiv.createSpan({ cls: 'nc-field-name', text: field + ': ' });
          fieldDiv.createSpan({ text: actData[field] });
        }
      }
    }
  }

  private renderConflictResolutionResult(cr: any): void {
    const section = this.analysisResultContainer.createDiv({ cls: 'nc-result-section' });
    section.createEl('h4', { text: '⚔️ 冲突-解决分析' });
    
    const fields = [
      { key: 'conflictSetup', label: '冲突设置' },
      { key: 'escalation', label: '冲突升级' },
      { key: 'climax', label: '高潮对决' },
      { key: 'resolution', label: '解决方案' },
      { key: 'aftermath', label: '后续影响' }
    ];
    
    for (const field of fields) {
      if (cr[field.key]) {
        const fieldDiv = section.createDiv({ cls: 'nc-cr-field' });
        fieldDiv.createEl('strong', { text: field.label + ': ' });
        fieldDiv.createSpan({ text: cr[field.key] });
      }
    }
  }

  private async addToMaterialLibrary(): Promise<void> {
    try {
      // 获取合并的内容
      const content = this.selections
        .sort((a, b) => a.order - b.order)
        .map(s => s.range.textSnapshot)
        .join('\n\n');
      
      await this.materialLibrary.addMaterial({
        title: this.unitName || '未命名故事单元',
        type: 'story-unit',
        sourceBookId: this.config.bookId,
        sourceBookTitle: this.config.bookTitle,
        markId: '', // 需要实际的 markId
        content: content,
        summary: content.slice(0, 200),
        tags: [this.lineType]
      });
      
      showSuccess('已添加到素材库');
    } catch (error) {
      showError('添加失败', error instanceof Error ? error.message : '未知错误');
    }
  }
}
