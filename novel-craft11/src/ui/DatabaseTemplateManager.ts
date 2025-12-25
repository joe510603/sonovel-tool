/**
 * DatabaseTemplateManager - 数据库模板管理界面
 * 
 * 支持创建、编辑、导入、导出模板
 * 
 * Requirements: 1.2.1, 1.2.2, 1.2.5
 */

import { App, Modal, Setting } from 'obsidian';
import { BookDatabaseService } from '../services/BookDatabaseService';
import { 
  DatabaseTemplate, 
  FieldDefinition, 
  FieldType,
  BUILTIN_TEMPLATES 
} from '../types/database';
import { showSuccess, showError, showWarning } from './NotificationUtils';

/**
 * 模板管理器配置
 */
export interface DatabaseTemplateManagerConfig {
  /** 书籍路径（可选，用于应用模板） */
  bookPath?: string;
  /** 书籍标题 */
  bookTitle?: string;
}

/**
 * 数据库模板管理器
 */
export class DatabaseTemplateManager extends Modal {
  private config: DatabaseTemplateManagerConfig;
  private bookDatabaseService: BookDatabaseService;
  
  private templates: DatabaseTemplate[] = [];
  private selectedTemplate: DatabaseTemplate | null = null;
  private templatesContainer: HTMLElement;
  private previewContainer: HTMLElement;
  
  private onApply?: (template: DatabaseTemplate) => void;

  constructor(
    app: App,
    config: DatabaseTemplateManagerConfig,
    bookDatabaseService: BookDatabaseService,
    onApply?: (template: DatabaseTemplate) => void
  ) {
    super(app);
    this.config = config;
    this.bookDatabaseService = bookDatabaseService;
    this.onApply = onApply;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nc-template-manager-modal');
    
    // 加载模板
    await this.loadTemplates();
    
    // 标题
    contentEl.createEl('h2', { 
      text: '📋 数据库模板管理',
      cls: 'nc-modal-title'
    });
    
    // 说明
    contentEl.createDiv({ 
      cls: 'nc-template-manager-desc',
      text: '选择或创建数据库模板，模板定义了书籍数据库的字段结构和预设分类。'
    });
    
    // 主体布局
    const mainLayout = contentEl.createDiv({ cls: 'nc-template-manager-layout' });
    
    // 左侧：模板列表
    const leftPanel = mainLayout.createDiv({ cls: 'nc-template-list-panel' });
    leftPanel.createEl('h4', { text: '模板列表' });
    
    // 模板操作按钮
    const listActions = leftPanel.createDiv({ cls: 'nc-template-list-actions' });
    
    const createBtn = listActions.createEl('button', { cls: 'nc-btn nc-btn-small', text: '+ 新建' });
    createBtn.addEventListener('click', () => this.showCreateTemplateDialog());
    
    const importBtn = listActions.createEl('button', { cls: 'nc-btn nc-btn-small', text: '📥 导入' });
    importBtn.addEventListener('click', () => this.importTemplate());
    
    this.templatesContainer = leftPanel.createDiv({ cls: 'nc-templates-list' });
    this.renderTemplateList();
    
    // 右侧：模板预览
    const rightPanel = mainLayout.createDiv({ cls: 'nc-template-preview-panel' });
    rightPanel.createEl('h4', { text: '模板预览' });
    this.previewContainer = rightPanel.createDiv({ cls: 'nc-template-preview' });
    this.renderTemplatePreview();
    
    // 底部操作按钮
    const actions = contentEl.createDiv({ cls: 'nc-modal-actions' });
    
    const cancelBtn = actions.createEl('button', { cls: 'nc-btn', text: '关闭' });
    cancelBtn.addEventListener('click', () => this.close());
    
    if (this.config.bookPath) {
      const applyBtn = actions.createEl('button', { cls: 'nc-btn nc-btn-primary', text: '应用到当前书籍' });
      applyBtn.addEventListener('click', () => this.applyTemplate());
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }

  /**
   * 加载模板列表
   */
  private async loadTemplates(): Promise<void> {
    // 加载内置模板
    this.templates = [...BUILTIN_TEMPLATES];
    
    // 加载用户自定义模板
    try {
      const userTemplates = await this.loadUserTemplates();
      this.templates.push(...userTemplates);
    } catch (error) {
      console.error('加载用户模板失败:', error);
    }
    
    // 默认选中第一个
    if (this.templates.length > 0 && !this.selectedTemplate) {
      this.selectedTemplate = this.templates[0];
    }
  }

  /**
   * 加载用户自定义模板
   */
  private async loadUserTemplates(): Promise<DatabaseTemplate[]> {
    const templatesPath = '.novelcraft/templates.json';
    
    try {
      const exists = await this.app.vault.adapter.exists(templatesPath);
      if (!exists) return [];
      
      const content = await this.app.vault.adapter.read(templatesPath);
      const data = JSON.parse(content);
      return data.templates || [];
    } catch {
      return [];
    }
  }

  /**
   * 保存用户自定义模板
   */
  private async saveUserTemplates(templates: DatabaseTemplate[]): Promise<void> {
    const templatesPath = '.novelcraft/templates.json';
    const folderPath = '.novelcraft';
    
    // 确保文件夹存在
    const folderExists = await this.app.vault.adapter.exists(folderPath);
    if (!folderExists) {
      await this.app.vault.createFolder(folderPath);
    }
    
    const content = JSON.stringify({ templates }, null, 2);
    await this.app.vault.adapter.write(templatesPath, content);
  }

  /**
   * 渲染模板列表
   */
  private renderTemplateList(): void {
    this.templatesContainer.empty();
    
    for (const template of this.templates) {
      const item = this.templatesContainer.createDiv({ 
        cls: `nc-template-item ${this.selectedTemplate?.templateId === template.templateId ? 'active' : ''}`
      });
      
      // 模板图标
      const icon = item.createSpan({ cls: 'nc-template-icon' });
      icon.textContent = template.isBuiltin ? '📦' : '📄';
      
      // 模板信息
      const info = item.createDiv({ cls: 'nc-template-info' });
      info.createDiv({ cls: 'nc-template-name', text: template.name });
      info.createDiv({ cls: 'nc-template-desc', text: template.description });
      
      // 内置标签
      if (template.isBuiltin) {
        item.createSpan({ cls: 'nc-template-badge', text: '内置' });
      }
      
      // 点击选择
      item.addEventListener('click', () => {
        this.selectedTemplate = template;
        this.renderTemplateList();
        this.renderTemplatePreview();
      });
      
      // 操作按钮（仅用户模板）
      if (!template.isBuiltin) {
        const actions = item.createDiv({ cls: 'nc-template-item-actions' });
        
        const editBtn = actions.createEl('button', { cls: 'nc-btn-icon', text: '✏️' });
        editBtn.title = '编辑';
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showEditTemplateDialog(template);
        });
        
        const exportBtn = actions.createEl('button', { cls: 'nc-btn-icon', text: '📤' });
        exportBtn.title = '导出';
        exportBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.exportTemplate(template);
        });
        
        const deleteBtn = actions.createEl('button', { cls: 'nc-btn-icon nc-btn-danger', text: '🗑️' });
        deleteBtn.title = '删除';
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteTemplate(template);
        });
      } else {
        // 内置模板只能导出
        const actions = item.createDiv({ cls: 'nc-template-item-actions' });
        const exportBtn = actions.createEl('button', { cls: 'nc-btn-icon', text: '📤' });
        exportBtn.title = '导出';
        exportBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.exportTemplate(template);
        });
      }
    }
  }

  /**
   * 渲染模板预览
   */
  private renderTemplatePreview(): void {
    this.previewContainer.empty();
    
    if (!this.selectedTemplate) {
      this.previewContainer.createDiv({ cls: 'nc-empty-hint', text: '请选择一个模板' });
      return;
    }
    
    const template = this.selectedTemplate;
    
    // 模板名称
    this.previewContainer.createEl('h3', { text: template.name });
    this.previewContainer.createDiv({ cls: 'nc-preview-desc', text: template.description });
    
    // 书籍字段
    if (template.bookFields.length > 0) {
      const bookSection = this.previewContainer.createDiv({ cls: 'nc-preview-section' });
      bookSection.createEl('h5', { text: '📖 书籍表字段' });
      this.renderFieldList(bookSection, template.bookFields);
    }
    
    // 人物字段
    if (template.characterFields.length > 0) {
      const charSection = this.previewContainer.createDiv({ cls: 'nc-preview-section' });
      charSection.createEl('h5', { text: '👤 人物表字段' });
      this.renderFieldList(charSection, template.characterFields);
    }
    
    // 故事单元字段
    if (template.storyUnitFields.length > 0) {
      const unitSection = this.previewContainer.createDiv({ cls: 'nc-preview-section' });
      unitSection.createEl('h5', { text: '📖 故事单元表字段' });
      this.renderFieldList(unitSection, template.storyUnitFields);
    }
    
    // 预设分类
    if (template.presetCategories.length > 0) {
      const catSection = this.previewContainer.createDiv({ cls: 'nc-preview-section' });
      catSection.createEl('h5', { text: '🏷️ 预设分类' });
      const catList = catSection.createDiv({ cls: 'nc-tag-list' });
      for (const cat of template.presetCategories) {
        catList.createSpan({ cls: 'nc-tag', text: cat });
      }
    }
    
    // 预设人物标签
    if (template.presetCharacterTags.length > 0) {
      const tagSection = this.previewContainer.createDiv({ cls: 'nc-preview-section' });
      tagSection.createEl('h5', { text: '👥 预设人物标签' });
      const tagList = tagSection.createDiv({ cls: 'nc-tag-list' });
      for (const tag of template.presetCharacterTags) {
        tagList.createSpan({ cls: 'nc-tag', text: tag });
      }
    }
  }

  /**
   * 渲染字段列表
   */
  private renderFieldList(container: HTMLElement, fields: FieldDefinition[]): void {
    const list = container.createEl('ul', { cls: 'nc-field-list' });
    
    for (const field of fields) {
      const item = list.createEl('li');
      item.createSpan({ cls: 'nc-field-label', text: field.label });
      item.createSpan({ cls: 'nc-field-type', text: `(${field.type})` });
      if (field.description) {
        item.createSpan({ cls: 'nc-field-desc', text: ` - ${field.description}` });
      }
    }
  }

  /**
   * 显示创建模板对话框
   * Requirements: 1.2.1
   */
  private showCreateTemplateDialog(): void {
    const dialog = new TemplateEditDialog(
      this.app,
      null,
      async (template) => {
        // 添加到用户模板
        const userTemplates = this.templates.filter(t => !t.isBuiltin);
        userTemplates.push(template);
        await this.saveUserTemplates(userTemplates);
        
        // 刷新列表
        this.templates.push(template);
        this.selectedTemplate = template;
        this.renderTemplateList();
        this.renderTemplatePreview();
        
        showSuccess('模板已创建');
      }
    );
    dialog.open();
  }

  /**
   * 显示编辑模板对话框
   * Requirements: 1.2.2
   */
  private showEditTemplateDialog(template: DatabaseTemplate): void {
    const dialog = new TemplateEditDialog(
      this.app,
      template,
      async (updatedTemplate) => {
        // 更新模板
        const index = this.templates.findIndex(t => t.templateId === template.templateId);
        if (index !== -1) {
          this.templates[index] = updatedTemplate;
        }
        
        // 保存用户模板
        const userTemplates = this.templates.filter(t => !t.isBuiltin);
        await this.saveUserTemplates(userTemplates);
        
        // 刷新
        this.selectedTemplate = updatedTemplate;
        this.renderTemplateList();
        this.renderTemplatePreview();
        
        showSuccess('模板已更新');
      }
    );
    dialog.open();
  }

  /**
   * 删除模板
   */
  private async deleteTemplate(template: DatabaseTemplate): Promise<void> {
    if (template.isBuiltin) {
      showWarning('内置模板不能删除');
      return;
    }
    
    if (!confirm(`确定删除模板 "${template.name}"？`)) {
      return;
    }
    
    // 从列表中移除
    this.templates = this.templates.filter(t => t.templateId !== template.templateId);
    
    // 保存用户模板
    const userTemplates = this.templates.filter(t => !t.isBuiltin);
    await this.saveUserTemplates(userTemplates);
    
    // 刷新
    if (this.selectedTemplate?.templateId === template.templateId) {
      this.selectedTemplate = this.templates[0] || null;
    }
    this.renderTemplateList();
    this.renderTemplatePreview();
    
    showSuccess('模板已删除');
  }

  /**
   * 导出模板
   * Requirements: 1.2.5
   */
  private exportTemplate(template: DatabaseTemplate): void {
    const exportData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      template: {
        ...template,
        isBuiltin: false, // 导出时标记为非内置
      },
    };
    
    const content = JSON.stringify(exportData, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.name}-template.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showSuccess('模板已导出');
  }

  /**
   * 导入模板
   * Requirements: 1.2.5
   */
  private importTemplate(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const content = await file.text();
        const data = JSON.parse(content);
        
        if (!data.template) {
          showError('导入失败', '无效的模板文件');
          return;
        }
        
        const template = data.template as DatabaseTemplate;
        
        // 生成新的 ID
        template.templateId = `user_${Date.now()}`;
        template.isBuiltin = false;
        template.createdAt = new Date().toISOString();
        
        // 检查名称冲突
        if (this.templates.some(t => t.name === template.name)) {
          template.name = `${template.name} (导入)`;
        }
        
        // 添加到用户模板
        const userTemplates = this.templates.filter(t => !t.isBuiltin);
        userTemplates.push(template);
        await this.saveUserTemplates(userTemplates);
        
        // 刷新列表
        this.templates.push(template);
        this.selectedTemplate = template;
        this.renderTemplateList();
        this.renderTemplatePreview();
        
        showSuccess('模板已导入');
      } catch (error) {
        showError('导入失败', error instanceof Error ? error.message : '无效的 JSON 文件');
      }
    });
    
    input.click();
  }

  /**
   * 应用模板到当前书籍
   */
  private async applyTemplate(): Promise<void> {
    if (!this.selectedTemplate || !this.config.bookPath) {
      showWarning('请选择一个模板');
      return;
    }
    
    try {
      // 构建自定义字段
      const customFields: Record<string, unknown> = {
        _templateId: this.selectedTemplate.templateId,
        _templateName: this.selectedTemplate.name,
        _fieldDefinitions: this.selectedTemplate.bookFields,
      };
      
      // 为每个字段设置默认值
      for (const field of this.selectedTemplate.bookFields) {
        customFields[field.key] = field.defaultValue ?? '';
      }
      
      // 更新书籍元数据
      await this.bookDatabaseService.updateBookMeta(this.config.bookPath, {
        customFields,
      });
      
      showSuccess(`已应用模板: ${this.selectedTemplate.name}`);
      this.onApply?.(this.selectedTemplate);
      this.close();
    } catch (error) {
      showError('应用失败', error instanceof Error ? error.message : '未知错误');
    }
  }
}


/**
 * 模板编辑对话框
 */
class TemplateEditDialog extends Modal {
  private template: DatabaseTemplate | null;
  private onSave: (template: DatabaseTemplate) => void;
  
  private name: string = '';
  private description: string = '';
  private bookFields: FieldDefinition[] = [];
  private characterFields: FieldDefinition[] = [];
  private storyUnitFields: FieldDefinition[] = [];
  private presetCategories: string[] = [];
  private presetCharacterTags: string[] = [];

  constructor(
    app: App,
    template: DatabaseTemplate | null,
    onSave: (template: DatabaseTemplate) => void
  ) {
    super(app);
    this.template = template;
    this.onSave = onSave;
    
    if (template) {
      this.name = template.name;
      this.description = template.description;
      this.bookFields = [...template.bookFields];
      this.characterFields = [...template.characterFields];
      this.storyUnitFields = [...template.storyUnitFields];
      this.presetCategories = [...template.presetCategories];
      this.presetCharacterTags = [...template.presetCharacterTags];
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nc-template-edit-dialog');
    
    // 标题
    contentEl.createEl('h3', { 
      text: this.template ? '编辑模板' : '创建模板',
      cls: 'nc-dialog-title'
    });
    
    // 基本信息
    new Setting(contentEl)
      .setName('模板名称')
      .setDesc('模板的显示名称')
      .addText(text => {
        text
          .setPlaceholder('例如: 玄幻小说')
          .setValue(this.name)
          .onChange(value => this.name = value);
      });
    
    new Setting(contentEl)
      .setName('模板描述')
      .setDesc('模板的简要说明')
      .addText(text => {
        text
          .setPlaceholder('适用于...')
          .setValue(this.description)
          .onChange(value => this.description = value);
      });
    
    // 预设分类
    new Setting(contentEl)
      .setName('预设故事单元分类')
      .setDesc('每行一个分类')
      .addTextArea(textarea => {
        textarea
          .setPlaceholder('主线\n支线\n日常')
          .setValue(this.presetCategories.join('\n'))
          .onChange(value => {
            this.presetCategories = value.split('\n').filter(s => s.trim());
          });
      });
    
    // 预设人物标签
    new Setting(contentEl)
      .setName('预设人物标签')
      .setDesc('每行一个标签')
      .addTextArea(textarea => {
        textarea
          .setPlaceholder('主角\n女主\n反派')
          .setValue(this.presetCharacterTags.join('\n'))
          .onChange(value => {
            this.presetCharacterTags = value.split('\n').filter(s => s.trim());
          });
      });
    
    // 提示
    contentEl.createDiv({ 
      cls: 'nc-template-edit-hint',
      text: '提示: 字段定义可以在创建模板后通过字段管理界面添加。'
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
   * 保存模板
   */
  private handleSave(): void {
    // 验证
    if (!this.name.trim()) {
      showWarning('请输入模板名称');
      return;
    }
    
    const template: DatabaseTemplate = {
      templateId: this.template?.templateId || `user_${Date.now()}`,
      name: this.name,
      description: this.description,
      bookFields: this.bookFields,
      characterFields: this.characterFields,
      storyUnitFields: this.storyUnitFields,
      presetCategories: this.presetCategories,
      presetCharacterTags: this.presetCharacterTags,
      isBuiltin: false,
      createdAt: this.template?.createdAt || new Date().toISOString(),
    };
    
    this.onSave(template);
    this.close();
  }
}
