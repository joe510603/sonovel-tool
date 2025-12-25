/**
 * DatabaseFieldManager - 数据库字段管理界面
 * 
 * 支持添加、编辑、删除自定义字段
 * 
 * Requirements: 1.1.1, 1.1.3, 1.1.4
 */

import { App, Modal, Setting } from 'obsidian';
import { BookDatabaseService } from '../services/BookDatabaseService';
import { FieldDefinition, FieldType, BookMeta } from '../types/database';
import { showSuccess, showError, showWarning } from './NotificationUtils';

/**
 * 字段管理器配置
 */
export interface DatabaseFieldManagerConfig {
  /** 书籍路径 */
  bookPath: string;
  /** 书籍标题 */
  bookTitle: string;
  /** 表类型 */
  tableType: 'book' | 'character' | 'story_unit';
}

/**
 * 字段类型配置
 */
const FIELD_TYPE_OPTIONS: { value: FieldType; label: string; icon: string }[] = [
  { value: 'text', label: '文本', icon: '📝' },
  { value: 'number', label: '数字', icon: '🔢' },
  { value: 'date', label: '日期', icon: '📅' },
  { value: 'list', label: '列表', icon: '📋' },
  { value: 'boolean', label: '布尔', icon: '✅' },
  { value: 'select', label: '选择', icon: '🔽' },
];

/**
 * 数据库字段管理器
 */
export class DatabaseFieldManager extends Modal {
  private config: DatabaseFieldManagerConfig;
  private bookDatabaseService: BookDatabaseService;
  
  private customFields: FieldDefinition[] = [];
  private fieldsContainer: HTMLElement;
  
  private onSave?: (fields: FieldDefinition[]) => void;

  constructor(
    app: App,
    config: DatabaseFieldManagerConfig,
    bookDatabaseService: BookDatabaseService,
    onSave?: (fields: FieldDefinition[]) => void
  ) {
    super(app);
    this.config = config;
    this.bookDatabaseService = bookDatabaseService;
    this.onSave = onSave;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nc-field-manager-modal');
    
    // 加载现有字段
    await this.loadCustomFields();
    
    // 标题
    contentEl.createEl('h2', { 
      text: `📊 ${this.getTableLabel()} 字段管理`,
      cls: 'nc-modal-title'
    });
    
    // 书籍信息
    const bookInfo = contentEl.createDiv({ cls: 'nc-modal-book-info' });
    bookInfo.createSpan({ text: `📖 ${this.config.bookTitle}` });
    
    // 说明
    contentEl.createDiv({ 
      cls: 'nc-field-manager-desc',
      text: '管理自定义字段，这些字段将添加到数据库表中，支持 Dataview 查询。'
    });
    
    // 字段列表
    this.fieldsContainer = contentEl.createDiv({ cls: 'nc-fields-container' });
    this.renderFields();
    
    // 添加字段按钮
    const addBtnContainer = contentEl.createDiv({ cls: 'nc-add-field-container' });
    const addBtn = addBtnContainer.createEl('button', {
      cls: 'nc-btn nc-btn-primary',
      text: '+ 添加字段'
    });
    addBtn.addEventListener('click', () => this.showAddFieldDialog());
    
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
   * 获取表类型标签
   */
  private getTableLabel(): string {
    const labels: Record<string, string> = {
      book: '书籍表',
      character: '人物表',
      story_unit: '故事单元表',
    };
    return labels[this.config.tableType] || this.config.tableType;
  }

  /**
   * 加载现有自定义字段
   */
  private async loadCustomFields(): Promise<void> {
    try {
      const bookMeta = await this.bookDatabaseService.getBookMeta(this.config.bookPath);
      if (bookMeta?.customFields) {
        // 从 customFields 中提取字段定义
        this.customFields = this.extractFieldDefinitions(bookMeta.customFields);
      }
    } catch (error) {
      console.error('加载自定义字段失败:', error);
    }
  }

  /**
   * 从自定义字段对象中提取字段定义
   */
  private extractFieldDefinitions(customFields: Record<string, unknown>): FieldDefinition[] {
    const definitions: FieldDefinition[] = [];
    
    // 检查是否有 _fieldDefinitions 元数据
    const fieldDefs = customFields['_fieldDefinitions'] as FieldDefinition[] | undefined;
    if (fieldDefs && Array.isArray(fieldDefs)) {
      return fieldDefs;
    }
    
    // 否则从现有字段推断
    for (const [key, value] of Object.entries(customFields)) {
      if (key.startsWith('_')) continue; // 跳过元数据字段
      
      definitions.push({
        key,
        label: key,
        type: this.inferFieldType(value),
      });
    }
    
    return definitions;
  }

  /**
   * 推断字段类型
   */
  private inferFieldType(value: unknown): FieldType {
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (Array.isArray(value)) return 'list';
    if (typeof value === 'string') {
      // 检查是否是日期格式
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
    }
    return 'text';
  }

  /**
   * 渲染字段列表
   */
  private renderFields(): void {
    this.fieldsContainer.empty();
    
    if (this.customFields.length === 0) {
      this.fieldsContainer.createDiv({ 
        cls: 'nc-empty-hint',
        text: '暂无自定义字段，点击"添加字段"创建新字段'
      });
      return;
    }
    
    for (let i = 0; i < this.customFields.length; i++) {
      const field = this.customFields[i];
      this.renderFieldItem(field, i);
    }
  }

  /**
   * 渲染单个字段项
   */
  private renderFieldItem(field: FieldDefinition, index: number): void {
    const item = this.fieldsContainer.createDiv({ cls: 'nc-field-item' });
    
    // 字段信息
    const info = item.createDiv({ cls: 'nc-field-info' });
    
    // 类型图标
    const typeConfig = FIELD_TYPE_OPTIONS.find(t => t.value === field.type);
    info.createSpan({ cls: 'nc-field-type-icon', text: typeConfig?.icon || '📝' });
    
    // 字段名称
    const nameContainer = info.createDiv({ cls: 'nc-field-name-container' });
    nameContainer.createSpan({ cls: 'nc-field-label', text: field.label });
    nameContainer.createSpan({ cls: 'nc-field-key', text: `(${field.key})` });
    
    // 字段类型
    info.createSpan({ cls: 'nc-field-type', text: typeConfig?.label || field.type });
    
    // 描述
    if (field.description) {
      info.createDiv({ cls: 'nc-field-desc', text: field.description });
    }
    
    // 操作按钮
    const actions = item.createDiv({ cls: 'nc-field-actions' });
    
    // 编辑按钮
    const editBtn = actions.createEl('button', { cls: 'nc-btn-icon', text: '✏️' });
    editBtn.title = '编辑';
    editBtn.addEventListener('click', () => this.showEditFieldDialog(field, index));
    
    // 删除按钮
    const deleteBtn = actions.createEl('button', { cls: 'nc-btn-icon nc-btn-danger', text: '🗑️' });
    deleteBtn.title = '删除';
    deleteBtn.addEventListener('click', () => this.deleteField(index));
  }

  /**
   * 显示添加字段对话框
   * Requirements: 1.1.1
   */
  private showAddFieldDialog(): void {
    const dialog = new FieldEditDialog(
      this.app,
      null,
      (field) => {
        // 检查字段键是否已存在
        if (this.customFields.some(f => f.key === field.key)) {
          showWarning(`字段键 "${field.key}" 已存在`);
          return;
        }
        
        this.customFields.push(field);
        this.renderFields();
        showSuccess('字段已添加');
      }
    );
    dialog.open();
  }

  /**
   * 显示编辑字段对话框
   * Requirements: 1.1.3
   */
  private showEditFieldDialog(field: FieldDefinition, index: number): void {
    const dialog = new FieldEditDialog(
      this.app,
      field,
      (updatedField) => {
        // 检查字段键是否与其他字段冲突
        const conflict = this.customFields.some((f, i) => i !== index && f.key === updatedField.key);
        if (conflict) {
          showWarning(`字段键 "${updatedField.key}" 已存在`);
          return;
        }
        
        this.customFields[index] = updatedField;
        this.renderFields();
        showSuccess('字段已更新');
      }
    );
    dialog.open();
  }

  /**
   * 删除字段
   * Requirements: 1.1.4
   */
  private deleteField(index: number): void {
    const field = this.customFields[index];
    if (confirm(`确定删除字段 "${field.label}"？`)) {
      this.customFields.splice(index, 1);
      this.renderFields();
      showSuccess('字段已删除');
    }
  }

  /**
   * 保存字段定义
   */
  private async handleSave(): Promise<void> {
    try {
      // 构建自定义字段对象
      const customFields: Record<string, unknown> = {
        _fieldDefinitions: this.customFields,
      };
      
      // 为每个字段设置默认值
      for (const field of this.customFields) {
        customFields[field.key] = field.defaultValue ?? this.getDefaultValueForType(field.type);
      }
      
      // 更新书籍元数据
      await this.bookDatabaseService.updateBookMeta(this.config.bookPath, {
        customFields,
      });
      
      showSuccess('字段定义已保存');
      this.onSave?.(this.customFields);
      this.close();
    } catch (error) {
      showError('保存失败', error instanceof Error ? error.message : '未知错误');
    }
  }

  /**
   * 获取字段类型的默认值
   */
  private getDefaultValueForType(type: FieldType): unknown {
    switch (type) {
      case 'text': return '';
      case 'number': return 0;
      case 'date': return '';
      case 'list': return [];
      case 'boolean': return false;
      case 'select': return '';
      default: return '';
    }
  }
}


/**
 * 字段编辑对话框
 */
class FieldEditDialog extends Modal {
  private field: FieldDefinition | null;
  private onSave: (field: FieldDefinition) => void;
  
  private key: string = '';
  private label: string = '';
  private type: FieldType = 'text';
  private description: string = '';
  private defaultValue: unknown = '';
  private options: string[] = [];

  constructor(
    app: App,
    field: FieldDefinition | null,
    onSave: (field: FieldDefinition) => void
  ) {
    super(app);
    this.field = field;
    this.onSave = onSave;
    
    if (field) {
      this.key = field.key;
      this.label = field.label;
      this.type = field.type;
      this.description = field.description || '';
      this.defaultValue = field.defaultValue;
      this.options = field.options || [];
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nc-field-edit-dialog');
    
    // 标题
    contentEl.createEl('h3', { 
      text: this.field ? '编辑字段' : '添加字段',
      cls: 'nc-dialog-title'
    });
    
    // 字段键
    new Setting(contentEl)
      .setName('字段键')
      .setDesc('用于存储和查询的唯一标识（英文，无空格）')
      .addText(text => {
        text
          .setPlaceholder('例如: custom_field')
          .setValue(this.key)
          .onChange(value => {
            // 自动转换为合法的键名
            this.key = value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
          });
      });
    
    // 字段标签
    new Setting(contentEl)
      .setName('显示名称')
      .setDesc('在界面上显示的名称')
      .addText(text => {
        text
          .setPlaceholder('例如: 自定义字段')
          .setValue(this.label)
          .onChange(value => this.label = value);
      });
    
    // 字段类型
    new Setting(contentEl)
      .setName('字段类型')
      .setDesc('选择字段的数据类型')
      .addDropdown(dropdown => {
        for (const option of FIELD_TYPE_OPTIONS) {
          dropdown.addOption(option.value, `${option.icon} ${option.label}`);
        }
        dropdown
          .setValue(this.type)
          .onChange(value => {
            this.type = value as FieldType;
            this.updateOptionsVisibility();
          });
      });
    
    // 选项（仅 select 类型）
    const optionsContainer = contentEl.createDiv({ cls: 'nc-field-options-container' });
    optionsContainer.style.display = this.type === 'select' ? 'block' : 'none';
    
    new Setting(optionsContainer)
      .setName('选项列表')
      .setDesc('每行一个选项')
      .addTextArea(textarea => {
        textarea
          .setPlaceholder('选项1\n选项2\n选项3')
          .setValue(this.options.join('\n'))
          .onChange(value => {
            this.options = value.split('\n').filter(s => s.trim());
          });
      });
    
    // 描述
    new Setting(contentEl)
      .setName('描述')
      .setDesc('字段的说明文字（可选）')
      .addText(text => {
        text
          .setPlaceholder('字段描述...')
          .setValue(this.description)
          .onChange(value => this.description = value);
      });
    
    // 默认值
    new Setting(contentEl)
      .setName('默认值')
      .setDesc('新建记录时的默认值（可选）')
      .addText(text => {
        text
          .setPlaceholder('默认值')
          .setValue(String(this.defaultValue || ''))
          .onChange(value => this.defaultValue = value);
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
   * 更新选项区域可见性
   */
  private updateOptionsVisibility(): void {
    const optionsContainer = this.contentEl.querySelector('.nc-field-options-container') as HTMLElement;
    if (optionsContainer) {
      optionsContainer.style.display = this.type === 'select' ? 'block' : 'none';
    }
  }

  /**
   * 保存字段
   */
  private handleSave(): void {
    // 验证
    if (!this.key.trim()) {
      showWarning('请输入字段键');
      return;
    }
    
    if (!this.label.trim()) {
      showWarning('请输入显示名称');
      return;
    }
    
    if (this.type === 'select' && this.options.length === 0) {
      showWarning('选择类型字段需要至少一个选项');
      return;
    }
    
    const field: FieldDefinition = {
      key: this.key,
      label: this.label,
      type: this.type,
      description: this.description || undefined,
      defaultValue: this.defaultValue || undefined,
      options: this.type === 'select' ? this.options : undefined,
    };
    
    this.onSave(field);
    this.close();
  }
}
