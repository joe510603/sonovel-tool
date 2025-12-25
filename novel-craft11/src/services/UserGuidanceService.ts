import { App, Modal, Setting } from 'obsidian';
import { showInfo, showSuccess } from '../ui/NotificationUtils';

/**
 * 引导步骤类型
 */
export enum GuideStepType {
  TOOLTIP = 'tooltip',
  MODAL = 'modal',
  HIGHLIGHT = 'highlight',
  OVERLAY = 'overlay'
}

/**
 * 引导步骤
 */
export interface GuideStep {
  id: string;
  type: GuideStepType;
  title: string;
  content: string;
  targetSelector?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  action?: () => void;
  condition?: () => boolean;
  skippable?: boolean;
}

/**
 * 引导流程
 */
export interface GuideFlow {
  id: string;
  name: string;
  description: string;
  steps: GuideStep[];
  triggerCondition?: () => boolean;
  onComplete?: () => void;
  onSkip?: () => void;
}

/**
 * 用户进度
 */
export interface UserProgress {
  completedFlows: Set<string>;
  skippedFlows: Set<string>;
  currentStep?: { flowId: string; stepIndex: number };
  preferences: {
    showTips: boolean;
    autoStartGuides: boolean;
    skipAnimations: boolean;
  };
}

/**
 * 提示配置
 */
export interface TipConfig {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'success';
  condition: () => boolean;
  action?: {
    text: string;
    callback: () => void;
  };
  dismissible: boolean;
  showOnce: boolean;
}

/**
 * UserGuidanceService - 用户引导和提示服务
 * 
 * 提供新手引导、操作提示、帮助信息等用户体验优化功能
 * Requirements: 添加用户操作的引导和提示
 */
export class UserGuidanceService {
  private app: App;
  private userProgress: UserProgress;
  private guideFlows: Map<string, GuideFlow> = new Map();
  private activeTips: Map<string, TipConfig> = new Map();
  private currentGuide: { flow: GuideFlow; stepIndex: number } | null = null;
  private guideOverlay: HTMLElement | null = null;
  
  /** 存储键 */
  private static readonly STORAGE_KEY = 'novelcraft-user-guidance';

  constructor(app: App) {
    this.app = app;
    this.userProgress = this.loadUserProgress();
    this.initializeDefaultGuides();
    this.initializeDefaultTips();
  }

  // ============ 引导流程管理 ============

  /**
   * 注册引导流程
   */
  registerGuideFlow(flow: GuideFlow): void {
    this.guideFlows.set(flow.id, flow);
  }

  /**
   * 开始引导流程
   */
  async startGuideFlow(flowId: string): Promise<void> {
    const flow = this.guideFlows.get(flowId);
    if (!flow) {
      console.warn(`Guide flow not found: ${flowId}`);
      return;
    }

    // 检查是否已完成或跳过
    if (this.userProgress.completedFlows.has(flowId) || 
        this.userProgress.skippedFlows.has(flowId)) {
      return;
    }

    // 检查触发条件
    if (flow.triggerCondition && !flow.triggerCondition()) {
      return;
    }

    this.currentGuide = { flow, stepIndex: 0 };
    this.userProgress.currentStep = { flowId, stepIndex: 0 };
    
    await this.showCurrentStep();
  }

  /**
   * 显示当前步骤
   */
  private async showCurrentStep(): Promise<void> {
    if (!this.currentGuide) return;

    const { flow, stepIndex } = this.currentGuide;
    const step = flow.steps[stepIndex];

    if (!step) {
      await this.completeGuideFlow();
      return;
    }

    // 检查步骤条件
    if (step.condition && !step.condition()) {
      await this.nextStep();
      return;
    }

    switch (step.type) {
      case GuideStepType.TOOLTIP:
        this.showTooltip(step);
        break;
      case GuideStepType.MODAL:
        this.showModal(step);
        break;
      case GuideStepType.HIGHLIGHT:
        this.showHighlight(step);
        break;
      case GuideStepType.OVERLAY:
        this.showOverlay(step);
        break;
    }
  }

  /**
   * 下一步
   */
  async nextStep(): Promise<void> {
    if (!this.currentGuide) return;

    this.currentGuide.stepIndex++;
    this.userProgress.currentStep!.stepIndex = this.currentGuide.stepIndex;
    
    await this.showCurrentStep();
  }

  /**
   * 跳过引导
   */
  async skipGuideFlow(): Promise<void> {
    if (!this.currentGuide) return;

    const flowId = this.currentGuide.flow.id;
    this.userProgress.skippedFlows.add(flowId);
    this.userProgress.currentStep = undefined;
    
    this.hideGuideElements();
    
    if (this.currentGuide.flow.onSkip) {
      this.currentGuide.flow.onSkip();
    }
    
    this.currentGuide = null;
    this.saveUserProgress();
  }

  /**
   * 完成引导流程
   */
  private async completeGuideFlow(): Promise<void> {
    if (!this.currentGuide) return;

    const flowId = this.currentGuide.flow.id;
    this.userProgress.completedFlows.add(flowId);
    this.userProgress.currentStep = undefined;
    
    this.hideGuideElements();
    
    if (this.currentGuide.flow.onComplete) {
      this.currentGuide.flow.onComplete();
    }
    
    showSuccess(`完成引导: ${this.currentGuide.flow.name}`);
    
    this.currentGuide = null;
    this.saveUserProgress();
  }

  // ============ 引导步骤显示 ============

  /**
   * 显示工具提示
   */
  private showTooltip(step: GuideStep): void {
    const target = step.targetSelector ? 
      document.querySelector(step.targetSelector) : null;
    
    if (!target) {
      console.warn(`Target not found for tooltip: ${step.targetSelector}`);
      this.nextStep();
      return;
    }

    const tooltip = this.createTooltip(step, target as HTMLElement);
    document.body.appendChild(tooltip);

    // 自动进入下一步（延迟）
    setTimeout(() => {
      tooltip.remove();
      this.nextStep();
    }, 3000);
  }

  /**
   * 显示模态框
   */
  private showModal(step: GuideStep): void {
    const modal = new GuideModal(this.app, step, {
      onNext: () => this.nextStep(),
      onSkip: () => this.skipGuideFlow(),
      showSkip: step.skippable !== false
    });
    
    modal.open();
  }

  /**
   * 显示高亮
   */
  private showHighlight(step: GuideStep): void {
    const target = step.targetSelector ? 
      document.querySelector(step.targetSelector) : null;
    
    if (!target) {
      console.warn(`Target not found for highlight: ${step.targetSelector}`);
      this.nextStep();
      return;
    }

    const highlight = this.createHighlight(step, target as HTMLElement);
    document.body.appendChild(highlight);

    // 点击继续
    highlight.addEventListener('click', () => {
      highlight.remove();
      this.nextStep();
    });
  }

  /**
   * 显示覆盖层
   */
  private showOverlay(step: GuideStep): void {
    this.guideOverlay = this.createOverlay(step);
    document.body.appendChild(this.guideOverlay);
  }

  // ============ DOM 元素创建 ============

  /**
   * 创建工具提示
   */
  private createTooltip(step: GuideStep, target: HTMLElement): HTMLElement {
    const tooltip = document.createElement('div');
    tooltip.className = 'nc-guide-tooltip';
    
    const rect = target.getBoundingClientRect();
    const position = step.position || 'top';
    
    tooltip.innerHTML = `
      <div class="nc-tooltip-content">
        <div class="nc-tooltip-title">${step.title}</div>
        <div class="nc-tooltip-text">${step.content}</div>
      </div>
      <div class="nc-tooltip-arrow"></div>
    `;
    
    // 定位
    this.positionTooltip(tooltip, rect, position);
    
    return tooltip;
  }

  /**
   * 创建高亮
   */
  private createHighlight(step: GuideStep, target: HTMLElement): HTMLElement {
    const highlight = document.createElement('div');
    highlight.className = 'nc-guide-highlight';
    
    const rect = target.getBoundingClientRect();
    
    highlight.style.position = 'fixed';
    highlight.style.left = `${rect.left - 4}px`;
    highlight.style.top = `${rect.top - 4}px`;
    highlight.style.width = `${rect.width + 8}px`;
    highlight.style.height = `${rect.height + 8}px`;
    highlight.style.border = '2px solid #007acc';
    highlight.style.borderRadius = '4px';
    highlight.style.backgroundColor = 'rgba(0, 122, 204, 0.1)';
    highlight.style.cursor = 'pointer';
    highlight.style.zIndex = '10000';
    
    // 添加提示文本
    const tooltip = document.createElement('div');
    tooltip.className = 'nc-highlight-tooltip';
    tooltip.innerHTML = `
      <div class="nc-tooltip-title">${step.title}</div>
      <div class="nc-tooltip-text">${step.content}</div>
      <div class="nc-tooltip-hint">点击继续</div>
    `;
    
    highlight.appendChild(tooltip);
    
    return highlight;
  }

  /**
   * 创建覆盖层
   */
  private createOverlay(step: GuideStep): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'nc-guide-overlay';
    
    overlay.innerHTML = `
      <div class="nc-overlay-backdrop"></div>
      <div class="nc-overlay-content">
        <div class="nc-overlay-header">
          <h3>${step.title}</h3>
          <button class="nc-overlay-close">✕</button>
        </div>
        <div class="nc-overlay-body">
          <p>${step.content}</p>
        </div>
        <div class="nc-overlay-footer">
          <button class="nc-overlay-skip">跳过引导</button>
          <button class="nc-overlay-next">下一步</button>
        </div>
      </div>
    `;
    
    // 事件监听
    overlay.querySelector('.nc-overlay-close')?.addEventListener('click', () => {
      this.skipGuideFlow();
    });
    
    overlay.querySelector('.nc-overlay-skip')?.addEventListener('click', () => {
      this.skipGuideFlow();
    });
    
    overlay.querySelector('.nc-overlay-next')?.addEventListener('click', () => {
      this.nextStep();
    });
    
    return overlay;
  }

  /**
   * 定位工具提示
   */
  private positionTooltip(tooltip: HTMLElement, targetRect: DOMRect, position: string): void {
    const tooltipRect = tooltip.getBoundingClientRect();
    let left = 0;
    let top = 0;
    
    switch (position) {
      case 'top':
        left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
        top = targetRect.top - tooltipRect.height - 8;
        break;
      case 'bottom':
        left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
        top = targetRect.bottom + 8;
        break;
      case 'left':
        left = targetRect.left - tooltipRect.width - 8;
        top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
        break;
      case 'right':
        left = targetRect.right + 8;
        top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
        break;
    }
    
    // 确保不超出视口
    left = Math.max(8, Math.min(left, window.innerWidth - tooltipRect.width - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - tooltipRect.height - 8));
    
    tooltip.style.position = 'fixed';
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.zIndex = '10001';
  }

  /**
   * 隐藏引导元素
   */
  private hideGuideElements(): void {
    // 移除所有引导相关的元素
    document.querySelectorAll('.nc-guide-tooltip, .nc-guide-highlight, .nc-guide-overlay')
      .forEach(el => el.remove());
    
    if (this.guideOverlay) {
      this.guideOverlay.remove();
      this.guideOverlay = null;
    }
  }

  // ============ 智能提示系统 ============

  /**
   * 注册提示
   */
  registerTip(tip: TipConfig): void {
    this.activeTips.set(tip.id, tip);
  }

  /**
   * 检查并显示提示
   */
  checkAndShowTips(): void {
    if (!this.userProgress.preferences.showTips) return;

    for (const [tipId, tip] of this.activeTips) {
      if (tip.condition()) {
        this.showTip(tip);
        
        if (tip.showOnce) {
          this.activeTips.delete(tipId);
        }
      }
    }
  }

  /**
   * 显示提示
   */
  private showTip(tip: TipConfig): void {
    const message = tip.action ? 
      `${tip.message} ${tip.action.text}` : tip.message;
    
    switch (tip.type) {
      case 'success':
        showSuccess(message);
        break;
      case 'warning':
        showInfo(message); // 使用 info 避免过于突兀
        break;
      default:
        showInfo(message);
        break;
    }
    
    if (tip.action) {
      // 这里可以添加更复杂的交互逻辑
      setTimeout(() => {
        if (confirm(`${tip.message}\n\n是否${tip.action!.text}？`)) {
          tip.action!.callback();
        }
      }, 1000);
    }
  }

  // ============ 默认引导和提示 ============

  /**
   * 初始化默认引导流程
   */
  private initializeDefaultGuides(): void {
    // 交互式标记入门引导
    this.registerGuideFlow({
      id: 'interactive-marking-intro',
      name: '交互式标记入门',
      description: '学习如何使用交互式标记功能',
      steps: [
        {
          id: 'welcome',
          type: GuideStepType.MODAL,
          title: '欢迎使用交互式标记',
          content: '交互式标记功能可以帮助您精确标记小说中的故事情节、设定信息、场景和人物。让我们开始学习如何使用这个强大的功能。',
          skippable: true
        },
        {
          id: 'toolbar-intro',
          type: GuideStepType.HIGHLIGHT,
          title: '浮动工具栏',
          content: '这是交互式标记工具栏，包含开始标记、结束标记和快速标记按钮。',
          targetSelector: '.nc-interactive-toolbar',
          condition: () => document.querySelector('.nc-interactive-toolbar') !== null
        },
        {
          id: 'start-mark',
          type: GuideStepType.TOOLTIP,
          title: '开始标记',
          content: '点击此按钮在当前光标位置插入开始标记',
          targetSelector: '.nc-start-mark-btn',
          position: 'bottom'
        },
        {
          id: 'end-mark',
          type: GuideStepType.TOOLTIP,
          title: '结束标记',
          content: '点击此按钮插入结束标记并完成标记配对',
          targetSelector: '.nc-end-mark-btn',
          position: 'bottom'
        },
        {
          id: 'quick-marks',
          type: GuideStepType.TOOLTIP,
          title: '快速标记',
          content: '使用这些按钮可以快速开始特定类型的标记',
          targetSelector: '.nc-toolbar-quick',
          position: 'bottom'
        }
      ],
      triggerCondition: () => !this.userProgress.completedFlows.has('interactive-marking-intro'),
      onComplete: () => {
        showSuccess('恭喜！您已经掌握了交互式标记的基本用法');
      }
    });

    // AI 分析引导
    this.registerGuideFlow({
      id: 'ai-analysis-intro',
      name: 'AI 分析功能介绍',
      description: '学习如何使用 AI 分析标记的内容',
      steps: [
        {
          id: 'analysis-intro',
          type: GuideStepType.MODAL,
          title: 'AI 智能分析',
          content: '完成标记后，您可以使用 AI 分析功能来深度解析故事结构、情绪变化和写作技法。',
          skippable: true
        },
        {
          id: 'template-selection',
          type: GuideStepType.OVERLAY,
          title: '选择分析模板',
          content: '系统提供多种分析模板，如七步法、起承转合等。您也可以创建自定义模板来满足特定的分析需求。'
        },
        {
          id: 'analysis-results',
          type: GuideStepType.MODAL,
          title: '分析结果',
          content: 'AI 分析完成后，您将看到结构化的分析报告，包括情绪曲线、角色作用和写作技法等。您可以编辑和保存这些分析结果。'
        }
      ],
      triggerCondition: () => {
        // 当用户完成第一个标记对时触发
        return this.userProgress.completedFlows.has('interactive-marking-intro');
      }
    });
  }

  /**
   * 初始化默认提示
   */
  private initializeDefaultTips(): void {
    // 未配对标记提示
    this.registerTip({
      id: 'unpaired-marks-tip',
      message: '您有未完成的标记，记得添加结束标记来完成配对',
      type: 'info',
      condition: () => {
        const unpairedPanel = document.querySelector('.nc-unpaired-panel') as HTMLElement;
        return unpairedPanel && unpairedPanel.style.display !== 'none';
      },
      dismissible: true,
      showOnce: false
    });

    // 性能优化提示
    this.registerTip({
      id: 'performance-tip',
      message: '检测到大量标记，建议定期导出数据以优化性能',
      type: 'warning',
      condition: () => {
        // 这里需要实际的标记数量检查逻辑
        return false; // 占位
      },
      action: {
        text: '立即导出',
        callback: () => {
          // 触发导出功能
          console.log('Triggering export...');
        }
      },
      dismissible: true,
      showOnce: true
    });

    // LLM 服务配置提示
    this.registerTip({
      id: 'llm-config-tip',
      message: '尚未配置 AI 服务，无法使用智能分析功能',
      type: 'warning',
      condition: () => {
        // 这里需要检查 LLM 服务配置
        return false; // 占位
      },
      action: {
        text: '前往配置',
        callback: () => {
          // 打开设置页面
          console.log('Opening settings...');
        }
      },
      dismissible: true,
      showOnce: true
    });
  }

  // ============ 用户偏好管理 ============

  /**
   * 更新用户偏好
   */
  updatePreferences(preferences: Partial<UserProgress['preferences']>): void {
    this.userProgress.preferences = {
      ...this.userProgress.preferences,
      ...preferences
    };
    this.saveUserProgress();
  }

  /**
   * 获取用户偏好
   */
  getPreferences(): UserProgress['preferences'] {
    return { ...this.userProgress.preferences };
  }

  /**
   * 重置引导进度
   */
  resetProgress(): void {
    this.userProgress = {
      completedFlows: new Set(),
      skippedFlows: new Set(),
      preferences: {
        showTips: true,
        autoStartGuides: true,
        skipAnimations: false
      }
    };
    this.saveUserProgress();
  }

  // ============ 数据持久化 ============

  /**
   * 加载用户进度
   */
  private loadUserProgress(): UserProgress {
    try {
      const stored = localStorage.getItem(UserGuidanceService.STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        return {
          completedFlows: new Set(data.completedFlows || []),
          skippedFlows: new Set(data.skippedFlows || []),
          currentStep: data.currentStep,
          preferences: {
            showTips: data.preferences?.showTips ?? true,
            autoStartGuides: data.preferences?.autoStartGuides ?? true,
            skipAnimations: data.preferences?.skipAnimations ?? false
          }
        };
      }
    } catch (error) {
      console.error('Failed to load user guidance progress:', error);
    }

    return {
      completedFlows: new Set(),
      skippedFlows: new Set(),
      preferences: {
        showTips: true,
        autoStartGuides: true,
        skipAnimations: false
      }
    };
  }

  /**
   * 保存用户进度
   */
  private saveUserProgress(): void {
    try {
      const data = {
        completedFlows: Array.from(this.userProgress.completedFlows),
        skippedFlows: Array.from(this.userProgress.skippedFlows),
        currentStep: this.userProgress.currentStep,
        preferences: this.userProgress.preferences
      };
      localStorage.setItem(UserGuidanceService.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save user guidance progress:', error);
    }
  }

  // ============ 公共接口 ============

  /**
   * 检查是否应该自动开始引导
   */
  shouldAutoStartGuides(): boolean {
    return this.userProgress.preferences.autoStartGuides;
  }

  /**
   * 获取可用的引导流程
   */
  getAvailableGuides(): GuideFlow[] {
    return Array.from(this.guideFlows.values()).filter(flow => 
      !this.userProgress.completedFlows.has(flow.id) &&
      !this.userProgress.skippedFlows.has(flow.id)
    );
  }

  /**
   * 手动触发引导检查
   */
  triggerGuideCheck(): void {
    if (!this.shouldAutoStartGuides()) return;

    const availableGuides = this.getAvailableGuides();
    for (const guide of availableGuides) {
      if (!guide.triggerCondition || guide.triggerCondition()) {
        this.startGuideFlow(guide.id);
        break; // 一次只启动一个引导
      }
    }
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    this.hideGuideElements();
    this.currentGuide = null;
    this.guideFlows.clear();
    this.activeTips.clear();
  }
}

/**
 * 引导模态框
 */
class GuideModal extends Modal {
  private step: GuideStep;
  private callbacks: {
    onNext: () => void;
    onSkip: () => void;
    showSkip: boolean;
  };

  constructor(
    app: App, 
    step: GuideStep, 
    callbacks: { onNext: () => void; onSkip: () => void; showSkip: boolean }
  ) {
    super(app);
    this.step = step;
    this.callbacks = callbacks;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: this.step.title });
    contentEl.createEl('p', { text: this.step.content });

    const buttonContainer = contentEl.createDiv({ cls: 'nc-guide-modal-buttons' });

    if (this.callbacks.showSkip) {
      const skipBtn = buttonContainer.createEl('button', { text: '跳过引导' });
      skipBtn.addEventListener('click', () => {
        this.close();
        this.callbacks.onSkip();
      });
    }

    const nextBtn = buttonContainer.createEl('button', { 
      text: '下一步',
      cls: 'mod-cta'
    });
    nextBtn.addEventListener('click', () => {
      this.close();
      this.callbacks.onNext();
    });

    // 执行步骤动作
    if (this.step.action) {
      this.step.action();
    }
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}