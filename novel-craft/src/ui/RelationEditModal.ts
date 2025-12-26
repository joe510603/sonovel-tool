/**
 * 关联关系编辑模态框
 * 用于创建和编辑故事单元之间的关联关系
 * 
 * Requirements: 4.1, 4.2, 4.4, 4.5
 */

import { App, Modal } from 'obsidian';
import { RelationRecord, StoryUnitRecord } from '../types/database';
import { RelationType } from '../types/timeline';
import { 
  RelationService, 
  RelationCreateConfig, 
  RelationUpdateConfig
} from '../services/RelationService';
import { showSuccess, showError } from './NotificationUtils';

/**
 * 关联类型配置
 */
interface RelationTypeConfig {
  type: RelationType;
  name: string;
  color: string;
  description: string;
}

/**
 * 预设关联类型配置
 */
const RELATION_TYPES: RelationTypeConfig[] = [
  {
    type: RelationType.CAUSAL,
    name: '因果关系',
    color: '#e74c3c',
    description: 'A事件导致B事件发生'
  },
  {
    type: RelationType.FORESHADOW,
    name: '铺垫关系',
    color: '#9b59b6',
    description: 'A事件为B事件做铺垫'
  },
  {
    type: RelationType.CONTRAST,
    name: '对比关系',
    color: '#f39c12',
    description: 'A事件与B事件形成对比'
  },
  {
    type: RelationType.PARALLEL,
    name: '并行关系',
    color: '#3498db',
    description: 'A事件与B事件同时发生'
  },
  {
    type: RelationType.INCLUDE,
    name: '包含关系',
    color: '#27ae60',
    description: 'A事件包含B事件'
  },
  {
    type: RelationType.CUSTOM,
    name: '自定义',
    color: '#7f8c8d',
    description: '自定义关联类型'
  }
];

/**
 * 关联编辑模态框配置
 */
export interface RelationEditModalConfig {
  /** 关联关系服务 */
  relationService: RelationService;
  /** 源故事单元 */
  sourceUnit: StoryUnitRecord;
  /** 目标故事单元 */
  targetUnit: StoryUnitRecord;
  /** 现有关联关系（编辑模式） */
  existingRelation?: RelationRecord;
  /** 保存回调 */
  onSave?: (relation: RelationRecord) => void;
  /** 删除回调 */
  onDelete?: (relationId: string) => void;
}

/**
 * 关联关系编辑模态框
 */
export class RelationEditModal extends Modal {
  private config: RelationEditModalConfig;
  
  // 表单状态
  private selectedType: RelationType;
  private customLabel: string = '';
  private description: string = '';
  private lineColor: string;
  
  // UI 元素
  private typeButtonsEl: HTMLElement | null = null;
  private customLabelEl: HTMLInputElement | null = null;
  private customLabelContainer: HTMLElement | null = null;

  constructor(app: App, config: RelationEditModalConfig) {
    super(app);
    this.config = config;
    
    // 初始化表单状态
    if (config.existingRelation) {
      this.selectedType = config.existingRelation.relation_type as RelationType;
      this.customLabel = config.existingRelation.custom_label || '';
      this.description = config.existingRelation.description || '';
      this.lineColor = config.existingRelation.line_color;
    } else {
      this.selectedType = RelationType.CAUSAL;
      this.lineColor = RELATION_TYPES[0].color;
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nc-relation-edit-modal');
    
    // 标题
    const headerEl = contentEl.createDiv({ cls: 'nc-relation-edit-header' });
    headerEl.createSpan({ cls: 'nc-relation-edit-icon', text: '🔗' });
    headerEl.createEl('h3', { 
      cls: 'nc-relation-edit-title',
      text: this.config.existingRelation ? '编辑关联关系' : '创建关联关系'
    });
    
    // 显示源和目标单元信息
    this.renderUnitInfo(contentEl);
    
    // 关联类型选择
    this.renderTypeSelector(contentEl);
    
    // 自定义标签（仅自定义类型显示）
    this.renderCustomLabel(contentEl);
    
    // 描述输入
    this.renderDescription(contentEl);
    
    // 操作按钮
    this.renderFooter(contentEl);
  }

  /**
   * 渲染单元信息
   */
  private renderUnitInfo(container: HTMLElement): void {
    const infoEl = container.createDiv({ cls: 'nc-relation-edit-section' });
    
    const sourceInfo = infoEl.createDiv({ cls: 'nc-relation-unit-info' });
    sourceInfo.createSpan({ cls: 'nc-relation-unit-label', text: '源单元: ' });
    sourceInfo.createSpan({ 
      cls: 'nc-relation-unit-name', 
      text: `${this.config.sourceUnit.title} (第${this.config.sourceUnit.chapter_start}-${this.config.sourceUnit.chapter_end}章)`
    });
    
    const arrowEl = infoEl.createDiv({ cls: 'nc-relation-arrow', text: '↓' });
    
    const targetInfo = infoEl.createDiv({ cls: 'nc-relation-unit-info' });
    targetInfo.createSpan({ cls: 'nc-relation-unit-label', text: '目标单元: ' });
    targetInfo.createSpan({ 
      cls: 'nc-relation-unit-name', 
      text: `${this.config.targetUnit.title} (第${this.config.targetUnit.chapter_start}-${this.config.targetUnit.chapter_end}章)`
    });
  }

  /**
   * 渲染类型选择器
   */
  private renderTypeSelector(container: HTMLElement): void {
    const sectionEl = container.createDiv({ cls: 'nc-relation-edit-section' });
    sectionEl.createDiv({ cls: 'nc-relation-edit-label', text: '关联类型' });
    
    this.typeButtonsEl = sectionEl.createDiv({ cls: 'nc-relation-edit-types' });
    
    for (const typeConfig of RELATION_TYPES) {
      const optionEl = this.typeButtonsEl.createDiv({ 
        cls: `nc-relation-edit-type-option ${this.selectedType === typeConfig.type ? 'selected' : ''}`
      });
      optionEl.dataset.type = typeConfig.type;
      
      const colorEl = optionEl.createSpan({ cls: 'nc-relation-edit-type-color' });
      colorEl.style.backgroundColor = typeConfig.color;
      
      const nameEl = optionEl.createSpan({ cls: 'nc-relation-edit-type-name', text: typeConfig.name });
      
      optionEl.title = typeConfig.description;
      
      optionEl.addEventListener('click', () => {
        this.selectType(typeConfig.type, typeConfig.color);
      });
    }
  }

  /**
   * 选择关联类型
   */
  private selectType(type: RelationType, color: string): void {
    this.selectedType = type;
    this.lineColor = color;
    
    // 更新UI
    if (this.typeButtonsEl) {
      this.typeButtonsEl.querySelectorAll('.nc-relation-edit-type-option').forEach(el => {
        const htmlEl = el as HTMLElement;
        htmlEl.classList.toggle('selected', htmlEl.dataset.type === type);
      });
    }
    
    // 显示/隐藏自定义标签输入
    if (this.customLabelContainer) {
      this.customLabelContainer.style.display = type === RelationType.CUSTOM ? 'block' : 'none';
    }
  }

  /**
   * 渲染自定义标签输入
   */
  private renderCustomLabel(container: HTMLElement): void {
    this.customLabelContainer = container.createDiv({ cls: 'nc-relation-edit-section' });
    this.customLabelContainer.style.display = this.selectedType === RelationType.CUSTOM ? 'block' : 'none';
    
    this.customLabelContainer.createDiv({ cls: 'nc-relation-edit-label', text: '自定义标签' });
    
    this.customLabelEl = this.customLabelContainer.createEl('input', {
      cls: 'nc-relation-edit-input',
      attr: {
        type: 'text',
        placeholder: '输入自定义关联类型名称...',
        value: this.customLabel
      }
    });
    
    this.customLabelEl.addEventListener('input', (e) => {
      this.customLabel = (e.target as HTMLInputElement).value;
    });
  }

  /**
   * 渲染描述输入
   */
  private renderDescription(container: HTMLElement): void {
    const sectionEl = container.createDiv({ cls: 'nc-relation-edit-section' });
    sectionEl.createDiv({ cls: 'nc-relation-edit-label', text: '关联描述（可选）' });
    
    const textareaEl = sectionEl.createEl('textarea', {
      cls: 'nc-relation-edit-textarea',
      attr: {
        placeholder: '描述这两个故事单元之间的关联...',
        rows: '3'
      }
    });
    textareaEl.value = this.description;
    
    textareaEl.addEventListener('input', (e) => {
      this.description = (e.target as HTMLTextAreaElement).value;
    });
  }

  /**
   * 渲染底部按钮
   */
  private renderFooter(container: HTMLElement): void {
    const footerEl = container.createDiv({ cls: 'nc-relation-edit-footer' });
    
    // 删除按钮（仅编辑模式）
    if (this.config.existingRelation) {
      const deleteBtn = footerEl.createEl('button', {
        cls: 'nc-btn nc-relation-edit-delete',
        text: '🗑️ 删除'
      });
      deleteBtn.addEventListener('click', () => this.handleDelete());
    } else {
      footerEl.createDiv(); // 占位
    }
    
    // 操作按钮组
    const actionsEl = footerEl.createDiv({ cls: 'nc-relation-edit-actions' });
    
    const cancelBtn = actionsEl.createEl('button', {
      cls: 'nc-btn',
      text: '取消'
    });
    cancelBtn.addEventListener('click', () => this.close());
    
    const saveBtn = actionsEl.createEl('button', {
      cls: 'nc-btn nc-btn-primary',
      text: this.config.existingRelation ? '保存' : '创建'
    });
    saveBtn.addEventListener('click', () => this.handleSave());
  }

  /**
   * 处理保存
   */
  private async handleSave(): Promise<void> {
    // 验证
    if (this.selectedType === RelationType.CUSTOM && !this.customLabel.trim()) {
      showError('请输入自定义标签');
      return;
    }
    
    try {
      if (this.config.existingRelation) {
        // 更新现有关联
        const updates: RelationUpdateConfig = {
          relationType: this.selectedType,
          customLabel: this.selectedType === RelationType.CUSTOM ? this.customLabel.trim() : undefined,
          description: this.description.trim() || undefined,
          lineColor: this.lineColor
        };
        
        await this.config.relationService.updateRelation(this.config.existingRelation.id, updates);
        
        // 获取更新后的关联
        const updatedRelation = await this.config.relationService.getRelation(this.config.existingRelation.id);
        if (updatedRelation) {
          this.config.onSave?.(updatedRelation);
        }
        
        showSuccess('关联关系已更新');
      } else {
        // 创建新关联
        const createConfig: RelationCreateConfig = {
          sourceUnitId: this.config.sourceUnit.id,
          targetUnitId: this.config.targetUnit.id,
          relationType: this.selectedType,
          customLabel: this.selectedType === RelationType.CUSTOM ? this.customLabel.trim() : undefined,
          description: this.description.trim() || undefined,
          lineColor: this.lineColor
        };
        
        const relationId = await this.config.relationService.createRelation(createConfig);
        const newRelation = await this.config.relationService.getRelation(relationId);
        
        if (newRelation) {
          this.config.onSave?.(newRelation);
        }
        
        showSuccess('关联关系已创建');
      }
      
      this.close();
    } catch (error) {
      showError('操作失败', error instanceof Error ? error.message : '未知错误');
    }
  }

  /**
   * 处理删除
   */
  private async handleDelete(): Promise<void> {
    if (!this.config.existingRelation) return;
    
    const confirmed = confirm('确定要删除这条关联关系吗？');
    if (!confirmed) return;
    
    try {
      await this.config.relationService.deleteRelation(this.config.existingRelation.id);
      this.config.onDelete?.(this.config.existingRelation.id);
      showSuccess('关联关系已删除');
      this.close();
    } catch (error) {
      showError('删除失败', error instanceof Error ? error.message : '未知错误');
    }
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * 关联类型快速选择器
 * 用于工具栏中快速选择关联类型
 */
export class RelationTypeSelector {
  private container: HTMLElement;
  private selectedType: RelationType = RelationType.CAUSAL;
  private onTypeChange?: (type: RelationType) => void;

  constructor(
    parentEl: HTMLElement, 
    onTypeChange?: (type: RelationType) => void
  ) {
    this.onTypeChange = onTypeChange;
    this.container = parentEl.createDiv({ cls: 'nc-relation-type-selector' });
    this.render();
  }

  /**
   * 渲染选择器
   */
  private render(): void {
    this.container.empty();
    
    for (const typeConfig of RELATION_TYPES) {
      const btn = this.container.createEl('button', {
        cls: `nc-relation-type-btn ${this.selectedType === typeConfig.type ? 'active' : ''}`
      });
      btn.dataset.type = typeConfig.type;
      
      const colorEl = btn.createSpan({ cls: 'nc-relation-type-color' });
      colorEl.style.backgroundColor = typeConfig.color;
      
      btn.createSpan({ cls: 'nc-relation-type-name', text: typeConfig.name });
      
      btn.title = typeConfig.description;
      
      btn.addEventListener('click', () => {
        this.setSelectedType(typeConfig.type);
      });
    }
  }

  /**
   * 设置选中的类型
   */
  setSelectedType(type: RelationType): void {
    this.selectedType = type;
    
    // 更新UI
    this.container.querySelectorAll('.nc-relation-type-btn').forEach(btn => {
      const htmlBtn = btn as HTMLElement;
      htmlBtn.classList.toggle('active', htmlBtn.dataset.type === type);
    });
    
    this.onTypeChange?.(type);
  }

  /**
   * 获取选中的类型
   */
  getSelectedType(): RelationType {
    return this.selectedType;
  }

  /**
   * 销毁选择器
   */
  destroy(): void {
    this.container.remove();
  }
}
