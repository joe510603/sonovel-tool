/**
 * CategoryManager - 故事单元分类管理界面
 * 
 * 支持创建、编辑、删除分类
 * 支持层级分类
 * 
 * Requirements: 3.1.1, 3.1.2, 3.1.5
 */

import { App, Modal, Setting } from 'obsidian';
import { BookDatabaseService } from '../services/BookDatabaseService';
import { showSuccess, showError, showWarning } from './NotificationUtils';

/**
 * 分类定义
 */
export interface Category {
  /** 分类 ID */
  id: string;
  /** 分类名称 */
  name: string;
  /** 分类颜色 */
  color: string;
  /** 分类图标 */
  icon: string;
  /** 分类描述 */
  description?: string;
  /** 父分类 ID（用于层级分类） */
  parentId?: string;
  /** 排序顺序 */
  order: number;
  /** 创建时间 */
  createdAt: string;
}

/**
 * 分类管理器配置
 */
export interface CategoryManagerConfig {
  /** 书籍路径 */
  bookPath: string;
  /** 书籍标题 */
  bookTitle: string;
}

/**
 * 预设颜色
 */
const PRESET_COLORS = [
  '#4ECDC4', // 青色
  '#FF6B6B', // 红色
  '#45B7D1', // 蓝色
  '#96CEB4', // 绿色
  '#FFEAA7', // 黄色
  '#DDA0DD', // 紫色
  '#98D8C8', // 薄荷绿
  '#F7DC6F', // 金色
  '#E74C3C', // 深红
  '#3498DB', // 深蓝
];

/**
 * 预设图标
 */
const PRESET_ICONS = [
  '📖', '📑', '📄', '🏷️', '⭐', '🔥', '💡', '🎯', '🎭', '⚔️',
  '💕', '🌟', '🎪', '🏆', '🎁', '🔮', '🌈', '🎨', '🎬', '📚',
];

/**
 * 分类管理器
 */
export class CategoryManager extends Modal {
  private config: CategoryManagerConfig;
  private bookDatabaseService: BookDatabaseService;
  
  private categories: Category[] = [];
  private categoriesContainer: HTMLElement;
  
  private onSave?: (categories: Category[]) => void;

  constructor(
    app: App,
    config: CategoryManagerConfig,
    bookDatabaseService: BookDatabaseService,
    onSave?: (categories: Category[]) => void
  ) {
    super(app);
    this.config = config;
    this.bookDatabaseService = bookDatabaseService;
    this.onSave = onSave;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nc-category-manager-modal');
    
    // 加载分类
    await this.loadCategories();
    
    // 标题
    contentEl.createEl('h2', { 
      text: '🏷️ 故事单元分类管理',
      cls: 'nc-modal-title'
    });
    
    // 书籍信息
    const bookInfo = contentEl.createDiv({ cls: 'nc-modal-book-info' });
    bookInfo.createSpan({ text: `📖 ${this.config.bookTitle}` });
    
    // 说明
    contentEl.createDiv({ 
      cls: 'nc-category-manager-desc',
      text: '管理故事单元的分类，支持创建层级分类结构。'
    });
    
    // 分类列表
    this.categoriesContainer = contentEl.createDiv({ cls: 'nc-categories-container' });
    this.renderCategories();
    
    // 添加分类按钮
    const addBtnContainer = contentEl.createDiv({ cls: 'nc-add-category-container' });
    const addBtn = addBtnContainer.createEl('button', {
      cls: 'nc-btn nc-btn-primary',
      text: '+ 添加分类'
    });
    addBtn.addEventListener('click', () => this.showAddCategoryDialog());
    
    // 操作按钮
    const actions = contentEl.createDiv({ cls: 'nc-modal-actions' });
    
    const cancelBtn = actions.createEl('button', { cls: 'nc-btn', text: '取消' });
    cancelBtn.addEventListener('click', () => this.close());
    
    const saveBtn = actions.createEl('button', { cls: 'nc-btn nc-btn-primary', text: '保存' });
    saveBtn.addEventListener('click', () => this.handleSave());
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }

  /**
   * 加载分类
   */
  private async loadCategories(): Promise<void> {
    try {
      const bookMeta = await this.bookDatabaseService.getBookMeta(this.config.bookPath);
      if (bookMeta?.customFields?.['_categories']) {
        this.categories = bookMeta.customFields['_categories'] as Category[];
      } else {
        // 使用默认分类
        this.categories = this.getDefaultCategories();
      }
    } catch (error) {
      console.error('加载分类失败:', error);
      this.categories = this.getDefaultCategories();
    }
  }

  /**
   * 获取默认分类
   */
  private getDefaultCategories(): Category[] {
    const now = new Date().toISOString();
    return [
      { id: 'main', name: '主线', color: '#4ECDC4', icon: '📖', order: 0, createdAt: now },
      { id: 'sub', name: '支线', color: '#45B7D1', icon: '📑', order: 1, createdAt: now },
      { id: 'independent', name: '独立', color: '#96CEB4', icon: '📄', order: 2, createdAt: now },
    ];
  }

  /**
   * 渲染分类列表
   */
  private renderCategories(): void {
    this.categoriesContainer.empty();
    
    if (this.categories.length === 0) {
      this.categoriesContainer.createDiv({ 
        cls: 'nc-empty-hint',
        text: '暂无分类，点击"添加分类"创建新分类'
      });
      return;
    }
    
    // 构建层级结构
    const rootCategories = this.categories.filter(c => !c.parentId);
    const childrenMap = new Map<string, Category[]>();
    
    for (const cat of this.categories) {
      if (cat.parentId) {
        if (!childrenMap.has(cat.parentId)) {
          childrenMap.set(cat.parentId, []);
        }
        childrenMap.get(cat.parentId)!.push(cat);
      }
    }
    
    // 按顺序排序
    rootCategories.sort((a, b) => a.order - b.order);
    
    // 渲染根分类
    for (const category of rootCategories) {
      this.renderCategoryItem(category, 0, childrenMap);
    }
  }

  /**
   * 渲染单个分类项
   */
  private renderCategoryItem(
    category: Category, 
    level: number, 
    childrenMap: Map<string, Category[]>
  ): void {
    const item = this.categoriesContainer.createDiv({ 
      cls: 'nc-category-item',
      attr: { 'data-level': String(level) }
    });
    item.style.paddingLeft = `${level * 24 + 12}px`;
    
    // 颜色指示器
    const colorIndicator = item.createDiv({ cls: 'nc-category-color' });
    colorIndicator.style.backgroundColor = category.color;
    
    // 图标
    item.createSpan({ cls: 'nc-category-icon', text: category.icon });
    
    // 名称
    const nameContainer = item.createDiv({ cls: 'nc-category-name-container' });
    nameContainer.createSpan({ cls: 'nc-category-name', text: category.name });
    
    if (category.description) {
      nameContainer.createSpan({ cls: 'nc-category-desc', text: category.description });
    }
    
    // 操作按钮
    const actions = item.createDiv({ cls: 'nc-category-actions' });
    
    // 添加子分类按钮
    const addChildBtn = actions.createEl('button', { cls: 'nc-btn-icon', text: '➕' });
    addChildBtn.title = '添加子分类';
    addChildBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showAddCategoryDialog(category.id);
    });
    
    // 编辑按钮
    const editBtn = actions.createEl('button', { cls: 'nc-btn-icon', text: '✏️' });
    editBtn.title = '编辑';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showEditCategoryDialog(category);
    });
    
    // 删除按钮
    const deleteBtn = actions.createEl('button', { cls: 'nc-btn-icon nc-btn-danger', text: '🗑️' });
    deleteBtn.title = '删除';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteCategory(category);
    });
    
    // 渲染子分类
    const children = childrenMap.get(category.id) || [];
    children.sort((a, b) => a.order - b.order);
    
    for (const child of children) {
      this.renderCategoryItem(child, level + 1, childrenMap);
    }
  }

  /**
   * 显示添加分类对话框
   * Requirements: 3.1.1
   */
  private showAddCategoryDialog(parentId?: string): void {
    const dialog = new CategoryEditDialog(
      this.app,
      null,
      parentId,
      this.categories,
      (category) => {
        // 检查名称是否已存在
        if (this.categories.some(c => c.name === category.name)) {
          showWarning(`分类 "${category.name}" 已存在`);
          return;
        }
        
        this.categories.push(category);
        this.renderCategories();
        showSuccess('分类已添加');
      }
    );
    dialog.open();
  }

  /**
   * 显示编辑分类对话框
   * Requirements: 3.1.2
   */
  private showEditCategoryDialog(category: Category): void {
    const dialog = new CategoryEditDialog(
      this.app,
      category,
      category.parentId,
      this.categories,
      (updatedCategory) => {
        // 检查名称是否与其他分类冲突
        const conflict = this.categories.some(
          c => c.id !== category.id && c.name === updatedCategory.name
        );
        if (conflict) {
          showWarning(`分类 "${updatedCategory.name}" 已存在`);
          return;
        }
        
        const index = this.categories.findIndex(c => c.id === category.id);
        if (index !== -1) {
          this.categories[index] = updatedCategory;
        }
        
        this.renderCategories();
        showSuccess('分类已更新');
      }
    );
    dialog.open();
  }

  /**
   * 删除分类
   */
  private deleteCategory(category: Category): void {
    // 检查是否有子分类
    const hasChildren = this.categories.some(c => c.parentId === category.id);
    if (hasChildren) {
      showWarning('请先删除子分类');
      return;
    }
    
    if (!confirm(`确定删除分类 "${category.name}"？`)) {
      return;
    }
    
    this.categories = this.categories.filter(c => c.id !== category.id);
    this.renderCategories();
    showSuccess('分类已删除');
  }

  /**
   * 保存分类
   */
  private async handleSave(): Promise<void> {
    try {
      // 获取现有的自定义字段
      const bookMeta = await this.bookDatabaseService.getBookMeta(this.config.bookPath);
      const customFields = bookMeta?.customFields || {};
      
      // 更新分类
      customFields['_categories'] = this.categories;
      
      // 保存
      await this.bookDatabaseService.updateBookMeta(this.config.bookPath, {
        customFields,
      });
      
      showSuccess('分类已保存');
      this.onSave?.(this.categories);
      this.close();
    } catch (error) {
      showError('保存失败', error instanceof Error ? error.message : '未知错误');
    }
  }
}


/**
 * 分类编辑对话框
 */
class CategoryEditDialog extends Modal {
  private category: Category | null;
  private parentId: string | undefined;
  private allCategories: Category[];
  private onSave: (category: Category) => void;
  
  private name: string = '';
  private color: string = PRESET_COLORS[0];
  private icon: string = PRESET_ICONS[0];
  private description: string = '';
  private selectedParentId: string | undefined;

  constructor(
    app: App,
    category: Category | null,
    parentId: string | undefined,
    allCategories: Category[],
    onSave: (category: Category) => void
  ) {
    super(app);
    this.category = category;
    this.parentId = parentId;
    this.allCategories = allCategories;
    this.onSave = onSave;
    
    if (category) {
      this.name = category.name;
      this.color = category.color;
      this.icon = category.icon;
      this.description = category.description || '';
      this.selectedParentId = category.parentId;
    } else {
      this.selectedParentId = parentId;
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nc-category-edit-dialog');
    
    // 标题
    contentEl.createEl('h3', { 
      text: this.category ? '编辑分类' : '添加分类',
      cls: 'nc-dialog-title'
    });
    
    // 分类名称
    new Setting(contentEl)
      .setName('分类名称')
      .setDesc('分类的显示名称')
      .addText(text => {
        text
          .setPlaceholder('例如: 主线')
          .setValue(this.name)
          .onChange(value => this.name = value);
      });
    
    // 父分类（层级分类）
    const parentOptions = this.getParentOptions();
    if (parentOptions.length > 0) {
      new Setting(contentEl)
        .setName('父分类')
        .setDesc('选择父分类以创建层级结构')
        .addDropdown(dropdown => {
          dropdown.addOption('', '无（顶级分类）');
          for (const option of parentOptions) {
            dropdown.addOption(option.id, option.name);
          }
          dropdown
            .setValue(this.selectedParentId || '')
            .onChange(value => this.selectedParentId = value || undefined);
        });
    }
    
    // 颜色选择
    const colorSetting = new Setting(contentEl)
      .setName('颜色')
      .setDesc('选择分类的颜色');
    
    const colorContainer = colorSetting.controlEl.createDiv({ cls: 'nc-color-picker' });
    for (const color of PRESET_COLORS) {
      const colorBtn = colorContainer.createDiv({ 
        cls: `nc-color-option ${this.color === color ? 'active' : ''}`
      });
      colorBtn.style.backgroundColor = color;
      colorBtn.addEventListener('click', () => {
        this.color = color;
        colorContainer.querySelectorAll('.nc-color-option').forEach(el => el.removeClass('active'));
        colorBtn.addClass('active');
      });
    }
    
    // 图标选择
    const iconSetting = new Setting(contentEl)
      .setName('图标')
      .setDesc('选择分类的图标');
    
    const iconContainer = iconSetting.controlEl.createDiv({ cls: 'nc-icon-picker' });
    for (const icon of PRESET_ICONS) {
      const iconBtn = iconContainer.createDiv({ 
        cls: `nc-icon-option ${this.icon === icon ? 'active' : ''}`,
        text: icon
      });
      iconBtn.addEventListener('click', () => {
        this.icon = icon;
        iconContainer.querySelectorAll('.nc-icon-option').forEach(el => el.removeClass('active'));
        iconBtn.addClass('active');
      });
    }
    
    // 描述
    new Setting(contentEl)
      .setName('描述')
      .setDesc('分类的说明文字（可选）')
      .addText(text => {
        text
          .setPlaceholder('分类描述...')
          .setValue(this.description)
          .onChange(value => this.description = value);
      });
    
    // 操作按钮
    const actions = contentEl.createDiv({ cls: 'nc-dialog-actions' });
    
    const cancelBtn = actions.createEl('button', { cls: 'nc-btn', text: '取消' });
    cancelBtn.addEventListener('click', () => this.close());
    
    const saveBtn = actions.createEl('button', { cls: 'nc-btn nc-btn-primary', text: '保存' });
    saveBtn.addEventListener('click', () => this.handleSave());
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }

  /**
   * 获取可选的父分类
   */
  private getParentOptions(): Category[] {
    // 排除自己和自己的子分类
    if (!this.category) {
      return this.allCategories.filter(c => !c.parentId); // 只显示顶级分类
    }
    
    const excludeIds = new Set<string>([this.category.id]);
    
    // 递归获取所有子分类 ID
    const getChildIds = (parentId: string): void => {
      for (const cat of this.allCategories) {
        if (cat.parentId === parentId) {
          excludeIds.add(cat.id);
          getChildIds(cat.id);
        }
      }
    };
    getChildIds(this.category.id);
    
    return this.allCategories.filter(c => !excludeIds.has(c.id) && !c.parentId);
  }

  /**
   * 保存分类
   */
  private handleSave(): void {
    // 验证
    if (!this.name.trim()) {
      showWarning('请输入分类名称');
      return;
    }
    
    // 计算排序顺序
    const siblingCategories = this.allCategories.filter(
      c => c.parentId === this.selectedParentId && c.id !== this.category?.id
    );
    const maxOrder = siblingCategories.length > 0 
      ? Math.max(...siblingCategories.map(c => c.order)) 
      : -1;
    
    const category: Category = {
      id: this.category?.id || `cat_${Date.now()}`,
      name: this.name,
      color: this.color,
      icon: this.icon,
      description: this.description || undefined,
      parentId: this.selectedParentId,
      order: this.category?.order ?? (maxOrder + 1),
      createdAt: this.category?.createdAt || new Date().toISOString(),
    };
    
    this.onSave(category);
    this.close();
  }
}
