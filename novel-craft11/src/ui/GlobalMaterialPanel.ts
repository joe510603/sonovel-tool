/**
 * GlobalMaterialPanel - 全局素材库面板
 * 
 * 跨书籍的素材管理界面
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import { GlobalMaterialLibraryService } from '../services/GlobalMaterialLibraryService';
import { GlobalMaterialItem } from '../types/unified-marking';
import { showSuccess, showError, handleError } from './NotificationUtils';

export const GLOBAL_MATERIAL_PANEL_VIEW_TYPE = 'novelcraft-global-material';

interface MaterialFilter {
  type?: GlobalMaterialItem['type'];
  starred?: boolean;
  searchQuery?: string;
  sortBy: 'time' | 'useCount' | 'title';
  sortOrder: 'asc' | 'desc';
}

export class GlobalMaterialPanel extends ItemView {
  private materialLibrary: GlobalMaterialLibraryService;
  private materials: GlobalMaterialItem[] = [];
  private filter: MaterialFilter = { sortBy: 'time', sortOrder: 'desc' };
  private selectedMaterial: GlobalMaterialItem | null = null;

  constructor(leaf: WorkspaceLeaf, materialLibrary: GlobalMaterialLibraryService) {
    super(leaf);
    this.materialLibrary = materialLibrary;
  }

  getViewType(): string { return GLOBAL_MATERIAL_PANEL_VIEW_TYPE; }
  getDisplayText(): string { return '素材库'; }
  getIcon(): string { return 'library'; }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('nc-global-material-panel');

    await this.loadMaterials();
    this.render();
  }

  async onClose(): Promise<void> {}

  private async loadMaterials(): Promise<void> {
    try {
      this.materials = await this.materialLibrary.getAllMaterials();
    } catch (error) {
      handleError(error, '加载素材库');
    }
  }

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();

    // 头部
    this.renderHeader(container);
    
    // 过滤区
    this.renderFilter(container);
    
    // 统计
    this.renderStats(container);
    
    // 素材列表
    this.renderMaterialList(container);
  }

  private renderHeader(container: HTMLElement): void {
    const header = container.createDiv({ cls: 'nc-material-header' });
    
    const titleRow = header.createDiv({ cls: 'nc-material-title-row' });
    titleRow.createEl('h3', { text: '📚 全局素材库' });
    
    const actions = titleRow.createDiv({ cls: 'nc-material-actions' });
    
    // 导出按钮
    const exportBtn = actions.createEl('button', { 
      cls: 'nc-btn nc-btn-small',
      text: '📤 导出'
    });
    exportBtn.addEventListener('click', () => this.exportMaterials());
    
    // 导入按钮
    const importBtn = actions.createEl('button', {
      cls: 'nc-btn nc-btn-small',
      text: '📥 导入'
    });
    importBtn.addEventListener('click', () => this.importMaterials());
  }

  private renderFilter(container: HTMLElement): void {
    const filterSection = container.createDiv({ cls: 'nc-material-filter' });
    
    // 搜索
    const searchRow = filterSection.createDiv({ cls: 'nc-filter-row' });
    const searchInput = searchRow.createEl('input', {
      type: 'text',
      cls: 'nc-search-input',
      attr: { placeholder: '搜索素材...' }
    });
    searchInput.addEventListener('input', () => {
      this.filter.searchQuery = searchInput.value.trim() || undefined;
      this.renderMaterialList(container.querySelector('.nc-material-list-container') as HTMLElement);
    });
    
    // 类型过滤
    const filterRow = filterSection.createDiv({ cls: 'nc-filter-options' });
    
    const typeFilter = filterRow.createDiv({ cls: 'nc-filter-item' });
    typeFilter.createSpan({ text: '类型：' });
    const typeSelect = typeFilter.createEl('select', { cls: 'nc-filter-select' });
    typeSelect.createEl('option', { value: '', text: '全部' });
    typeSelect.createEl('option', { value: 'story-unit', text: '📖 故事单元' });
    typeSelect.createEl('option', { value: 'quote', text: '💬 金句' });
    typeSelect.createEl('option', { value: 'technique', text: '✨ 技法' });
    typeSelect.createEl('option', { value: 'scene', text: '🎬 场景' });
    typeSelect.createEl('option', { value: 'character', text: '👤 人物' });
    typeSelect.createEl('option', { value: 'setting', text: '🌍 设定' });
    typeSelect.addEventListener('change', () => {
      this.filter.type = typeSelect.value as any || undefined;
      this.renderMaterialList(container.querySelector('.nc-material-list-container') as HTMLElement);
    });
    
    // 收藏过滤
    const starFilter = filterRow.createDiv({ cls: 'nc-filter-item' });
    const starCheckbox = starFilter.createEl('input', { type: 'checkbox' });
    starFilter.createSpan({ text: ' 仅收藏' });
    starCheckbox.addEventListener('change', () => {
      this.filter.starred = starCheckbox.checked || undefined;
      this.renderMaterialList(container.querySelector('.nc-material-list-container') as HTMLElement);
    });
    
    // 排序
    const sortFilter = filterRow.createDiv({ cls: 'nc-filter-item' });
    sortFilter.createSpan({ text: '排序：' });
    const sortSelect = sortFilter.createEl('select', { cls: 'nc-filter-select' });
    sortSelect.createEl('option', { value: 'time-desc', text: '最新' });
    sortSelect.createEl('option', { value: 'time-asc', text: '最早' });
    sortSelect.createEl('option', { value: 'useCount-desc', text: '常用' });
    sortSelect.createEl('option', { value: 'title-asc', text: '标题' });
    sortSelect.addEventListener('change', () => {
      const [sortBy, sortOrder] = sortSelect.value.split('-') as [any, any];
      this.filter.sortBy = sortBy;
      this.filter.sortOrder = sortOrder;
      this.renderMaterialList(container.querySelector('.nc-material-list-container') as HTMLElement);
    });
  }

  private renderStats(container: HTMLElement): void {
    const statsRow = container.createDiv({ cls: 'nc-material-stats' });
    
    const total = this.materials.length;
    const starred = this.materials.filter(m => m.starred).length;
    const storyUnits = this.materials.filter(m => m.type === 'story-unit').length;
    
    statsRow.createSpan({ text: `共 ${total} 个素材`, cls: 'nc-stats-total' });
    statsRow.createSpan({ text: `⭐ ${starred}`, cls: 'nc-stats-starred' });
    statsRow.createSpan({ text: `📖 ${storyUnits} 故事单元`, cls: 'nc-stats-type' });
  }

  private renderMaterialList(container: HTMLElement): void {
    let listContainer = container;
    if (!listContainer || !listContainer.classList.contains('nc-material-list-container')) {
      listContainer = this.containerEl.querySelector('.nc-material-list-container') as HTMLElement;
      if (!listContainer) {
        listContainer = (this.containerEl.children[1] as HTMLElement).createDiv({ cls: 'nc-material-list-container' });
      }
    }
    
    listContainer.empty();
    
    const filtered = this.getFilteredMaterials();
    
    if (filtered.length === 0) {
      listContainer.createDiv({ cls: 'nc-empty-hint', text: '暂无素材' });
      return;
    }
    
    const list = listContainer.createDiv({ cls: 'nc-material-list' });
    
    for (const material of filtered) {
      this.renderMaterialItem(list, material);
    }
  }

  private getFilteredMaterials(): GlobalMaterialItem[] {
    let result = [...this.materials];
    
    if (this.filter.type) {
      result = result.filter(m => m.type === this.filter.type);
    }
    
    if (this.filter.starred) {
      result = result.filter(m => m.starred);
    }
    
    if (this.filter.searchQuery) {
      const query = this.filter.searchQuery.toLowerCase();
      result = result.filter(m =>
        m.title.toLowerCase().includes(query) ||
        m.content.toLowerCase().includes(query) ||
        m.summary.toLowerCase().includes(query) ||
        m.tags.some(t => t.toLowerCase().includes(query))
      );
    }
    
    // 排序
    result.sort((a, b) => {
      let cmp = 0;
      if (this.filter.sortBy === 'time') {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (this.filter.sortBy === 'useCount') {
        cmp = a.useCount - b.useCount;
      } else if (this.filter.sortBy === 'title') {
        cmp = a.title.localeCompare(b.title);
      }
      return this.filter.sortOrder === 'desc' ? -cmp : cmp;
    });
    
    return result;
  }

  private renderMaterialItem(container: HTMLElement, material: GlobalMaterialItem): void {
    const item = container.createDiv({ cls: 'nc-material-item' });
    
    // 收藏按钮
    const starBtn = item.createEl('button', {
      cls: `nc-star-btn ${material.starred ? 'starred' : ''}`,
      text: material.starred ? '⭐' : '☆'
    });
    starBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.toggleStar(material);
      starBtn.textContent = material.starred ? '⭐' : '☆';
      starBtn.toggleClass('starred', material.starred);
    });
    
    // 类型图标
    const typeIcon = this.getTypeIcon(material.type);
    item.createSpan({ cls: 'nc-material-type', text: typeIcon });
    
    // 内容区
    const content = item.createDiv({ cls: 'nc-material-content' });
    content.createDiv({ cls: 'nc-material-title', text: material.title });
    content.createDiv({ cls: 'nc-material-summary', text: material.summary.slice(0, 80) + '...' });
    
    // 元信息
    const meta = content.createDiv({ cls: 'nc-material-meta' });
    meta.createSpan({ text: `📖 ${material.sourceBookTitle}` });
    if (material.tags.length > 0) {
      meta.createSpan({ text: `🏷️ ${material.tags.slice(0, 3).join(', ')}` });
    }
    
    // 点击查看详情
    item.addEventListener('click', () => this.showMaterialDetail(material));
  }

  private getTypeIcon(type: GlobalMaterialItem['type']): string {
    const icons: Record<string, string> = {
      'story-unit': '📖',
      'quote': '💬',
      'technique': '✨',
      'scene': '🎬',
      'character': '👤',
      'setting': '🌍',
      'custom': '🏷️'
    };
    return icons[type] || '📄';
  }

  private async toggleStar(material: GlobalMaterialItem): Promise<void> {
    try {
      await this.materialLibrary.toggleStar(material.id);
      material.starred = !material.starred;
    } catch (error) {
      handleError(error, '切换收藏');
    }
  }

  private showMaterialDetail(material: GlobalMaterialItem): void {
    // 创建详情弹窗
    const overlay = document.createElement('div');
    overlay.className = 'nc-material-detail-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    const modal = overlay.createDiv({ cls: 'nc-material-detail-modal' });
    
    // 头部
    const header = modal.createDiv({ cls: 'nc-detail-header' });
    header.createEl('h3', { text: material.title });
    const closeBtn = header.createEl('button', { text: '×', cls: 'nc-detail-close' });
    closeBtn.addEventListener('click', () => overlay.remove());
    
    // 类型和来源
    const info = modal.createDiv({ cls: 'nc-detail-info' });
    info.createSpan({ text: `${this.getTypeIcon(material.type)} ${this.getTypeName(material.type)}` });
    info.createSpan({ text: `📖 来自: ${material.sourceBookTitle}` });
    
    // 内容
    const contentSection = modal.createDiv({ cls: 'nc-detail-content-section' });
    contentSection.createEl('h4', { text: '内容' });
    contentSection.createDiv({ cls: 'nc-detail-content', text: material.content });
    
    // 分析结果
    if (material.analysis) {
      const analysisSection = modal.createDiv({ cls: 'nc-detail-analysis-section' });
      analysisSection.createEl('h4', { text: '分析结果' });
      
      if (material.analysis.summary) {
        analysisSection.createDiv({ text: material.analysis.summary });
      }
      
      if (material.analysis.sevenStep) {
        this.renderSevenStepInDetail(analysisSection, material.analysis.sevenStep);
      }
    }
    
    // 标签
    if (material.tags.length > 0) {
      const tagsSection = modal.createDiv({ cls: 'nc-detail-tags' });
      tagsSection.createEl('h4', { text: '标签' });
      const tagsContainer = tagsSection.createDiv({ cls: 'nc-tags-container' });
      for (const tag of material.tags) {
        tagsContainer.createSpan({ cls: 'nc-tag', text: tag });
      }
    }
    
    // 操作按钮
    const actions = modal.createDiv({ cls: 'nc-detail-actions' });
    
    const copyBtn = actions.createEl('button', { cls: 'nc-btn', text: '📋 复制内容' });
    copyBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(material.content);
      showSuccess('已复制到剪贴板');
      await this.materialLibrary.incrementUseCount(material.id);
    });
    
    const deleteBtn = actions.createEl('button', { cls: 'nc-btn nc-btn-danger', text: '🗑️ 删除' });
    deleteBtn.addEventListener('click', async () => {
      if (confirm('确定删除这个素材？')) {
        await this.materialLibrary.deleteMaterial(material.id);
        this.materials = this.materials.filter(m => m.id !== material.id);
        overlay.remove();
        this.render();
        showSuccess('已删除');
      }
    });
    
    document.body.appendChild(overlay);
  }

  private getTypeName(type: GlobalMaterialItem['type']): string {
    const names: Record<string, string> = {
      'story-unit': '故事单元',
      'quote': '金句',
      'technique': '写作技法',
      'scene': '场景描写',
      'character': '人物设定',
      'setting': '世界设定',
      'custom': '自定义'
    };
    return names[type] || type;
  }

  private renderSevenStepInDetail(container: HTMLElement, sevenStep: any): void {
    const steps = [
      { key: 'step1_advantage', label: '①主角优势' },
      { key: 'step2_villain', label: '②反派出场' },
      { key: 'step3_friction', label: '③摩擦交集' },
      { key: 'step4_expectation', label: '④拉期待' },
      { key: 'step5_climax', label: '⑤冲突爆发' },
      { key: 'step6_shock', label: '⑥震惊四座' },
      { key: 'step7_reward', label: '⑦收获奖励' }
    ];
    
    const grid = container.createDiv({ cls: 'nc-seven-step-detail' });
    
    for (const step of steps) {
      const value = sevenStep[step.key];
      if (!value) continue;
      
      const stepDiv = grid.createDiv({ cls: 'nc-step-item' });
      stepDiv.createEl('strong', { text: step.label + ': ' });
      stepDiv.createSpan({ text: value });
    }
  }

  private async exportMaterials(): Promise<void> {
    try {
      const json = await this.materialLibrary.exportToJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `novelcraft-materials-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showSuccess('导出成功');
    } catch (error) {
      handleError(error, '导出');
    }
  }

  private async importMaterials(): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      
      try {
        const content = await file.text();
        const count = await this.materialLibrary.importFromJson(content);
        await this.loadMaterials();
        this.render();
        showSuccess(`成功导入 ${count} 个素材`);
      } catch (error) {
        handleError(error, '导入');
      }
    });
    input.click();
  }

  async refresh(): Promise<void> {
    await this.loadMaterials();
    this.render();
  }
}
