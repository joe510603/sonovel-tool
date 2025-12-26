/**
 * 时间线渲染器
 * 负责时间线的虚拟列表渲染、拖拽交互和关联线绘制
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 9.1
 */

import { StoryUnitRecord, TrackRecord, TimelineConfigRecord, RelationRecord } from '../types/database';
import { ChapterInfo } from '../services/StoryUnitService';
import { RelationService, UnitPosition as RelationUnitPosition } from '../services/RelationService';
import { RelationLineRenderer } from './RelationLineRenderer';

/**
 * 时间线渲染配置
 */
export interface TimelineRenderConfig {
  bookId: string;
  bookTitle?: string; // 书名，用于导出文件命名
  units: StoryUnitRecord[];
  tracks: TrackRecord[];
  chapters: ChapterInfo[];
  config: TimelineConfigRecord;
  relations?: RelationRecord[];
  relationService?: RelationService;
  onUnitClick?: (unit: StoryUnitRecord) => void;
  onUnitDragEnd?: (unit: StoryUnitRecord, newPosition: { start: number; trackId: string }) => void;
  onTrackReorder?: (trackIds: string[]) => void;
  onTrackEdit?: (track: TrackRecord) => void;
  onTrackDelete?: (trackId: string) => void;
  onTrackColorChange?: (trackId: string, color: string) => void;
  onRelationClick?: (relation: RelationRecord) => void;
  onRelationCreate?: (sourceUnitId: string, targetUnitId: string) => void;
}

/**
 * 故事单元位置信息
 */
interface UnitPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 单轨道最大单元数限制
 */
const MAX_UNITS_PER_TRACK = 50;

/**
 * 过去事件区域宽度比例
 */
const PAST_AREA_RATIO = 0.2;

/**
 * 时间线渲染器类
 */
export class TimelineRenderer {
  private container: HTMLElement;
  private config: TimelineRenderConfig;
  
  // DOM 元素
  private timelineEl: HTMLElement | null = null;
  private headerEl: HTMLElement | null = null;
  private tracksEl: HTMLElement | null = null;
  private svgEl: SVGElement | null = null;
  
  // 状态
  private zoomLevel: number = 1;
  private scrollLeft: number = 0;
  private relationMode: boolean = false;
  private draggedUnit: StoryUnitRecord | null = null;
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  
  // 单元位置缓存
  private unitPositions: Map<string, UnitPosition> = new Map();
  
  // 可视区域
  private visibleRange: { start: number; end: number } = { start: 0, end: 20 };
  
  // 关联线渲染器
  private relationLineRenderer: RelationLineRenderer | null = null;
  
  // 关联创建状态
  private relationCreateSource: StoryUnitRecord | null = null;
  private tempRelationLine: SVGLineElement | null = null;

  constructor(container: HTMLElement, config: TimelineRenderConfig) {
    this.container = container;
    this.config = config;
    this.zoomLevel = config.config.zoom_level;
    
    this.render();
    this.setupEventListeners();
  }

  /**
   * 更新配置并重新渲染
   */
  update(config: TimelineRenderConfig): void {
    this.config = config;
    this.zoomLevel = config.config.zoom_level;
    this.render();
  }

  /**
   * 设置缩放级别
   */
  setZoom(level: number): void {
    this.zoomLevel = level;
    this.render();
  }

  /**
   * 切换关联模式
   */
  toggleRelationMode(): boolean {
    this.relationMode = !this.relationMode;
    if (this.timelineEl) {
      this.timelineEl.classList.toggle('nc-timeline-relation-mode', this.relationMode);
    }
    
    // 退出关联模式时清除创建状态
    if (!this.relationMode) {
      this.clearRelationCreateState();
    }
    
    return this.relationMode;
  }
  
  /**
   * 获取关联模式状态
   */
  isRelationMode(): boolean {
    return this.relationMode;
  }
  
  /**
   * 开始创建关联（从源单元）
   */
  startRelationCreate(sourceUnit: StoryUnitRecord): void {
    this.relationCreateSource = sourceUnit;
    
    // 高亮源单元
    const sourceEl = this.timelineEl?.querySelector(`[data-unit-id="${sourceUnit.id}"]`);
    if (sourceEl) {
      sourceEl.classList.add('nc-relation-source-selected');
    }
  }
  
  /**
   * 完成创建关联（到目标单元）
   */
  completeRelationCreate(targetUnit: StoryUnitRecord): void {
    if (!this.relationCreateSource) return;
    
    if (this.relationCreateSource.id !== targetUnit.id) {
      this.config.onRelationCreate?.(this.relationCreateSource.id, targetUnit.id);
    }
    
    this.clearRelationCreateState();
  }
  
  /**
   * 清除关联创建状态
   */
  private clearRelationCreateState(): void {
    if (this.relationCreateSource) {
      const sourceEl = this.timelineEl?.querySelector(`[data-unit-id="${this.relationCreateSource.id}"]`);
      if (sourceEl) {
        sourceEl.classList.remove('nc-relation-source-selected');
      }
    }
    
    this.relationCreateSource = null;
    
    // 移除临时线
    if (this.tempRelationLine) {
      this.tempRelationLine.remove();
      this.tempRelationLine = null;
    }
  }

  /**
   * 导出时间线，返回 Blob 数据
   */
  async export(format: 'svg' | 'png'): Promise<{ blob: Blob; filename: string } | null> {
    if (!this.timelineEl) return null;
    
    if (format === 'svg') {
      return await this.exportAsSVG();
    } else {
      return await this.exportAsPNG();
    }
  }

  /**
   * 销毁渲染器
   */
  destroy(): void {
    // 销毁关联线渲染器
    if (this.relationLineRenderer) {
      this.relationLineRenderer.destroy();
      this.relationLineRenderer = null;
    }
    
    this.container.empty();
    this.unitPositions.clear();
  }

  /**
   * 主渲染方法
   */
  private render(): void {
    this.container.empty();
    this.unitPositions.clear();
    
    // 创建时间线容器
    this.timelineEl = this.container.createDiv({ cls: 'nc-timeline' });
    
    // 创建固定的轨道标签列
    const trackLabelsCol = this.timelineEl.createDiv({ cls: 'nc-timeline-track-labels' });
    
    // 创建可滚动的内容区域
    const scrollableArea = this.timelineEl.createDiv({ cls: 'nc-timeline-scrollable' });
    
    // 渲染时间轴刻度（顶部）
    this.renderTimeAxis(scrollableArea);
    
    // 渲染轨道标签和内容
    this.renderTracksWithLabels(trackLabelsCol, scrollableArea);
    
    // 渲染 SVG 关联线层
    this.renderSVGLayer();
    
    // 更新可视区域
    this.updateVisibleRange();
  }

  /**
   * 渲染时间轴刻度
   */
  private renderTimeAxis(scrollableArea: HTMLElement): void {
    this.headerEl = scrollableArea.createDiv({ cls: 'nc-timeline-header' });
    
    const { chapters, config } = this.config;
    const chapterWidth = config.chapter_width * this.zoomLevel;
    
    // 章节刻度
    const axisEl = this.headerEl.createDiv({ cls: 'nc-timeline-axis' });
    
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      const tickEl = axisEl.createDiv({ cls: 'nc-timeline-tick' });
      tickEl.style.width = `${chapterWidth}px`;
      tickEl.style.minWidth = `${chapterWidth}px`;
      
      // 显示章节号
      const labelEl = tickEl.createSpan({ cls: 'nc-timeline-tick-label' });
      labelEl.textContent = `${chapter.index}`;
      labelEl.title = chapter.title;
      
      // 每5章显示完整标题
      if (i % 5 === 0 || i === chapters.length - 1) {
        tickEl.addClass('nc-timeline-tick-major');
      }
    }
  }

  /**
   * 渲染轨道标签和内容
   */
  private renderTracksWithLabels(trackLabelsCol: HTMLElement, scrollableArea: HTMLElement): void {
    // 轨道标签区域的头部占位（与时间轴对齐）
    const labelHeader = trackLabelsCol.createDiv({ cls: 'nc-timeline-label-header' });
    labelHeader.createSpan({ text: '轨道', cls: 'nc-timeline-label-title' });
    
    // 轨道内容区域
    this.tracksEl = scrollableArea.createDiv({ cls: 'nc-timeline-tracks' });
    
    const { tracks, chapters, config } = this.config;
    const chapterWidth = config.chapter_width * this.zoomLevel;
    const trackHeight = config.track_height;
    const trackSpacing = config.track_spacing;
    
    // 按顺序渲染轨道（主线在顶部）
    const sortedTracks = [...tracks].sort((a, b) => {
      if (a.type === 'main') return -1;
      if (b.type === 'main') return 1;
      return a.order - b.order;
    });
    
    for (const track of sortedTracks) {
      // 渲染轨道标签（固定列）
      const labelEl = this.renderTrackLabel(track, trackHeight);
      trackLabelsCol.appendChild(labelEl);
      
      // 渲染轨道内容（可滚动区域）
      const trackEl = this.renderTrackContent(track, chapterWidth, trackHeight, chapters.length);
      this.tracksEl.appendChild(trackEl);
      
      // 添加轨道间距
      if (track !== sortedTracks[sortedTracks.length - 1]) {
        const labelSpacer = trackLabelsCol.createDiv({ cls: 'nc-timeline-track-spacer' });
        labelSpacer.style.height = `${trackSpacing}px`;
        
        const trackSpacer = this.tracksEl.createDiv({ cls: 'nc-timeline-track-spacer' });
        trackSpacer.style.height = `${trackSpacing}px`;
      }
    }
  }

  /**
   * 渲染轨道标签
   * 支持点击编辑轨道名称
   */
  private renderTrackLabel(track: TrackRecord, trackHeight: number): HTMLElement {
    const labelEl = document.createElement('div');
    labelEl.className = `nc-timeline-track-label nc-timeline-track-label-${track.type}`;
    labelEl.style.height = `${trackHeight}px`;
    labelEl.dataset.trackId = track.id;
    
    // 颜色指示器（点击可修改颜色）
    const colorDot = labelEl.createSpan({ cls: 'nc-timeline-track-color nc-timeline-track-color-clickable' });
    colorDot.style.backgroundColor = track.color;
    colorDot.title = '点击修改颜色';
    colorDot.addEventListener('click', (e) => {
      e.stopPropagation();
      this.config.onTrackColorChange?.(track.id, this.getNextColor(track.color));
    });
    
    // 轨道名称（点击可编辑）
    const nameEl = labelEl.createSpan({ cls: 'nc-timeline-track-name nc-timeline-track-name-editable' });
    nameEl.textContent = track.name;
    nameEl.title = '点击编辑轨道名称';
    nameEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showTrackNameEditor(nameEl, track);
    });
    
    // 主线标记
    if (track.type === 'main') {
      const badge = labelEl.createSpan({ cls: 'nc-timeline-track-badge' });
      badge.textContent = '主';
    } else {
      // 支线轨道显示删除按钮
      const deleteBtn = labelEl.createSpan({ cls: 'nc-timeline-track-delete' });
      deleteBtn.textContent = '×';
      deleteBtn.title = '删除轨道';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.config.onTrackDelete?.(track.id);
      });
    }
    
    return labelEl;
  }

  /**
   * 显示轨道名称编辑器
   */
  private showTrackNameEditor(nameEl: HTMLElement, track: TrackRecord): void {
    const currentName = track.name;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.className = 'nc-timeline-track-name-input';
    
    // 替换文本为输入框
    nameEl.textContent = '';
    nameEl.appendChild(input);
    input.focus();
    input.select();
    
    const saveAndClose = () => {
      const newName = input.value.trim();
      if (newName && newName !== currentName) {
        this.config.onTrackEdit?.(track);
        // 临时更新显示
        nameEl.textContent = newName;
      } else {
        nameEl.textContent = currentName;
      }
    };
    
    input.addEventListener('blur', saveAndClose);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        input.blur();
      } else if (e.key === 'Escape') {
        nameEl.textContent = currentName;
      }
    });
  }

  /**
   * 获取下一个颜色（循环切换）
   */
  private getNextColor(currentColor: string): string {
    const colors = [
      '#4a90d9', '#50c878', '#daa520', '#9370db', 
      '#ff6b6b', '#4ecdc4', '#45b7d1', '#f39c12',
      '#e74c3c', '#9b59b6', '#1abc9c', '#34495e'
    ];
    const currentIndex = colors.indexOf(currentColor);
    const nextIndex = (currentIndex + 1) % colors.length;
    return colors[nextIndex];
  }

  /**
   * 渲染轨道内容（故事单元区域）
   */
  private renderTrackContent(
    track: TrackRecord, 
    chapterWidth: number, 
    trackHeight: number,
    totalChapters: number
  ): HTMLElement {
    const { units } = this.config;
    
    const trackEl = document.createElement('div');
    trackEl.className = `nc-timeline-track-content nc-timeline-track-content-${track.type}`;
    trackEl.dataset.trackId = track.id;
    trackEl.style.height = `${trackHeight}px`;
    trackEl.style.width = `${chapterWidth * totalChapters}px`;
    
    // 绘制网格背景
    this.renderTrackGrid(trackEl, chapterWidth, totalChapters);
    
    // 获取该轨道的故事单元
    let trackUnits = units.filter(u => u.track_id === track.id);
    
    console.log('NovelCraft [TimelineRenderer] renderTrackContent:', {
      trackId: track.id,
      trackName: track.name,
      trackUnitsCount: trackUnits.length
    });
    
    if (trackUnits.length > MAX_UNITS_PER_TRACK) {
      trackUnits = trackUnits
        .sort((a, b) => a.time_position_start - b.time_position_start)
        .slice(0, MAX_UNITS_PER_TRACK);
    }
    
    // 渲染故事单元
    for (const unit of trackUnits) {
      const unitEl = this.renderUnit(unit, track, chapterWidth, trackHeight);
      trackEl.appendChild(unitEl);
    }
    
    return trackEl;
  }

  /**
   * 渲染轨道网格背景
   */
  private renderTrackGrid(trackEl: HTMLElement, chapterWidth: number, totalChapters: number): void {
    for (let i = 0; i < totalChapters; i++) {
      const gridCell = trackEl.createDiv({ cls: 'nc-timeline-grid-cell' });
      gridCell.style.left = `${i * chapterWidth}px`;
      gridCell.style.width = `${chapterWidth}px`;
      
      // 每5章加深边框
      if ((i + 1) % 5 === 0) {
        gridCell.addClass('nc-timeline-grid-cell-major');
      }
    }
  }

  /**
   * 设置轨道拖拽排序
   */
  private setupTrackDrag(trackEl: HTMLElement, track: TrackRecord, handle: HTMLElement): void {
    let isDragging = false;
    let startY = 0;
    let startOrder = 0;
    
    handle.addEventListener('mousedown', (e) => {
      isDragging = true;
      startY = e.clientY;
      startOrder = track.order;
      trackEl.classList.add('nc-timeline-track-dragging');
      
      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging) return;
        
        const deltaY = moveEvent.clientY - startY;
        const trackHeight = this.config.config.track_height + this.config.config.track_spacing;
        const orderDelta = Math.round(deltaY / trackHeight);
        
        // 视觉反馈
        trackEl.style.transform = `translateY(${deltaY}px)`;
      };
      
      const onMouseUp = (upEvent: MouseEvent) => {
        if (!isDragging) return;
        isDragging = false;
        
        trackEl.classList.remove('nc-timeline-track-dragging');
        trackEl.style.transform = '';
        
        const deltaY = upEvent.clientY - startY;
        const trackHeight = this.config.config.track_height + this.config.config.track_spacing;
        const orderDelta = Math.round(deltaY / trackHeight);
        
        if (orderDelta !== 0) {
          // 计算新的轨道顺序
          const sideTracks = this.config.tracks
            .filter(t => t.type === 'side')
            .sort((a, b) => a.order - b.order);
          
          const currentIndex = sideTracks.findIndex(t => t.id === track.id);
          const newIndex = Math.max(0, Math.min(sideTracks.length - 1, currentIndex + orderDelta));
          
          if (currentIndex !== newIndex) {
            // 重新排序
            const reordered = [...sideTracks];
            const [moved] = reordered.splice(currentIndex, 1);
            reordered.splice(newIndex, 0, moved);
            
            // 主线始终在最前面
            const mainTrack = this.config.tracks.find(t => t.type === 'main');
            const newOrder = mainTrack ? [mainTrack.id, ...reordered.map(t => t.id)] : reordered.map(t => t.id);
            
            this.config.onTrackReorder?.(newOrder);
          }
        }
        
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  /**
   * 显示颜色选择器
   */
  private showColorPicker(track: TrackRecord, anchorEl: HTMLElement): void {
    // 预设颜色
    const colors = [
      '#4a90d9', '#50c878', '#daa520', '#9370db', 
      '#ff6b6b', '#4ecdc4', '#45b7d1', '#f39c12',
      '#e74c3c', '#9b59b6', '#1abc9c', '#34495e'
    ];
    
    // 创建颜色选择器弹窗
    const picker = document.createElement('div');
    picker.className = 'nc-timeline-color-picker';
    
    const rect = anchorEl.getBoundingClientRect();
    picker.style.top = `${rect.bottom + 4}px`;
    picker.style.left = `${rect.left}px`;
    
    // 颜色选项
    for (const color of colors) {
      const colorOption = picker.createDiv({ cls: 'nc-timeline-color-option' });
      colorOption.style.backgroundColor = color;
      if (color === track.color) {
        colorOption.classList.add('nc-timeline-color-selected');
      }
      
      colorOption.addEventListener('click', () => {
        this.config.onTrackColorChange?.(track.id, color);
        picker.remove();
      });
    }
    
    // 点击外部关闭
    const closeHandler = (e: MouseEvent) => {
      if (!picker.contains(e.target as Node)) {
        picker.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', closeHandler);
    }, 0);
    
    document.body.appendChild(picker);
  }

  /**
   * 渲染故事单元
   */
  private renderUnit(
    unit: StoryUnitRecord,
    track: TrackRecord,
    chapterWidth: number,
    trackHeight: number
  ): HTMLElement {
    const unitEl = document.createElement('div');
    unitEl.className = 'nc-timeline-unit';
    unitEl.dataset.unitId = unit.id;
    
    // 计算位置 - 使用 chapter_start 作为备选
    const timeStart = unit.time_position_start || unit.chapter_start || 1;
    const duration = unit.time_position_duration || (unit.chapter_end - unit.chapter_start + 1) || 1;
    
    const x = (timeStart - 1) * chapterWidth;
    const width = duration * chapterWidth;
    
    unitEl.style.left = `${x}px`;
    unitEl.style.width = `${Math.max(width - 2, 30)}px`; // 最小宽度30px，留2px间隙
    unitEl.style.backgroundColor = track.color;
    
    // 标题
    const titleEl = unitEl.createSpan({ cls: 'nc-timeline-unit-title' });
    titleEl.textContent = unit.title;
    titleEl.title = `${unit.title}\n第${unit.chapter_start}-${unit.chapter_end}章`;
    
    // 缓存位置信息
    this.unitPositions.set(unit.id, {
      x,
      y: 0,
      width: Math.max(width - 2, 30),
      height: trackHeight - 8
    });
    
    // 设置拖拽
    this.setupUnitDrag(unitEl, unit);
    
    // 点击事件 - 区分普通模式和关联模式
    unitEl.addEventListener('click', (e) => {
      if (!this.draggedUnit) {
        e.stopPropagation();
        
        // 关联模式下处理关联创建
        if (this.relationMode) {
          if (!this.relationCreateSource) {
            // 第一次点击：选择源单元
            this.startRelationCreate(unit);
          } else {
            // 第二次点击：选择目标单元，完成创建
            this.completeRelationCreate(unit);
          }
        } else {
          // 普通模式：触发点击回调
          this.config.onUnitClick?.(unit);
        }
      }
    });
    
    console.log('NovelCraft [TimelineRenderer] renderUnit:', {
      unitId: unit.id,
      title: unit.title,
      x,
      width,
      timeStart,
      duration
    });
    
    return unitEl;
  }

  /**
   * 渲染 SVG 关联线层
   * 将SVG层放置在可滚动区域内，确保关联线与故事单元同步滚动
   */
  private renderSVGLayer(): void {
    if (!this.timelineEl || !this.tracksEl) return;
    
    // 如果有关联关系服务，创建关联线渲染器
    if (this.config.relationService) {
      // 销毁旧的渲染器
      if (this.relationLineRenderer) {
        this.relationLineRenderer.destroy();
      }
      
      // 在轨道容器内创建关联线渲染器（确保与故事单元同步滚动）
      this.relationLineRenderer = new RelationLineRenderer(this.tracksEl, {
        bookId: this.config.bookId,
        relationService: this.config.relationService,
        onLineClick: (relation, event) => {
          this.config.onRelationClick?.(relation);
        },
        onLineHover: (relation, event) => {
          // 悬停处理由 RelationLineRenderer 内部完成
        },
        onLineDoubleClick: (relation, event) => {
          // 双击删除确认
          if (confirm(`确定要删除这条${this.getRelationTypeName(relation.relation_type)}关联吗？`)) {
            this.config.relationService?.deleteRelation(relation.id).then(() => {
              this.relationLineRenderer?.removeLine(relation.id);
            });
          }
        }
      });
      
      // 延迟更新位置，确保DOM已渲染
      setTimeout(() => {
        this.updateRelationLinePositions();
        
        // 渲染关联线
        if (this.config.relations && this.config.relations.length > 0) {
          this.relationLineRenderer?.render(this.config.relations);
        }
      }, 50);
    } else {
      // 没有关联服务时，创建空的 SVG 层
      this.svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.svgEl.classList.add('nc-timeline-svg');
      this.timelineEl.appendChild(this.svgEl);
    }
  }
  
  /**
   * 获取关联类型名称
   */
  private getRelationTypeName(type: string): string {
    const names: Record<string, string> = {
      'causal': '因果',
      'foreshadow': '铺垫',
      'contrast': '对比',
      'parallel': '并行',
      'include': '包含',
      'custom': '自定义'
    };
    return names[type] || type;
  }
  
  /**
   * 更新关联线位置
   * 使用相对于轨道容器的坐标
   */
  private updateRelationLinePositions(): void {
    if (!this.relationLineRenderer || !this.tracksEl) return;
    
    // 转换位置格式
    const positions = new Map<string, RelationUnitPosition>();
    
    // 获取 SVG 容器的位置作为参考（SVG 是 tracksEl 的子元素）
    const svgContainer = this.relationLineRenderer.getSVGContainer();
    const svgRect = svgContainer.getBoundingClientRect();
    
    // 遍历所有故事单元，获取实际位置
    const allUnitEls = this.tracksEl.querySelectorAll('[data-unit-id]');
    allUnitEls.forEach((el) => {
      const unitEl = el as HTMLElement;
      const unitId = unitEl.dataset.unitId;
      if (!unitId) return;
      
      const rect = unitEl.getBoundingClientRect();
      
      // 计算相对于 SVG 容器的位置
      const relativePos = {
        unitId,
        x: rect.left - svgRect.left,
        y: rect.top - svgRect.top,
        width: rect.width,
        height: rect.height,
        trackIndex: 0
      };
      
      positions.set(unitId, relativePos);
    });
    
    this.relationLineRenderer.updateUnitPositions(positions);
  }
  
  /**
   * 刷新关联线
   */
  refreshRelationLines(): void {
    if (this.relationLineRenderer && this.config.relations) {
      this.updateRelationLinePositions();
      this.relationLineRenderer.render(this.config.relations);
    }
  }
  
  /**
   * 添加关联线
   */
  addRelationLine(relation: RelationRecord): void {
    if (this.relationLineRenderer) {
      this.updateRelationLinePositions();
      this.relationLineRenderer.addLine(relation);
    }
  }
  
  /**
   * 移除关联线
   */
  removeRelationLine(relationId: string): void {
    if (this.relationLineRenderer) {
      this.relationLineRenderer.removeLine(relationId);
    }
  }

  /**
   * 设置故事单元拖拽
   * 使用鼠标事件实现，支持实时更新关联线
   */
  private setupUnitDrag(unitEl: HTMLElement, unit: StoryUnitRecord): void {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let originalLeft = 0;
    
    // 鼠标按下开始拖拽
    unitEl.addEventListener('mousedown', (e) => {
      // 只响应左键
      if (e.button !== 0) return;
      
      isDragging = true;
      this.draggedUnit = unit;
      startX = e.clientX;
      startY = e.clientY;
      originalLeft = parseInt(unitEl.style.left) || 0;
      
      unitEl.classList.add('nc-timeline-unit-dragging');
      e.preventDefault();
      
      // 鼠标移动
      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging) return;
        
        const deltaX = moveEvent.clientX - startX;
        const newLeft = originalLeft + deltaX;
        
        // 实时更新元素位置
        unitEl.style.left = `${newLeft}px`;
        
        // 更新缓存的位置信息
        const pos = this.unitPositions.get(unit.id);
        if (pos) {
          pos.x = newLeft;
          this.unitPositions.set(unit.id, pos);
        }
        
        // 实时更新关联线位置
        this.updateRelationLinePositions();
        if (this.relationLineRenderer) {
          this.relationLineRenderer.updateAllLinePositions();
        }
        
        // 显示章节提示
        this.showChapterHint(moveEvent.clientX, moveEvent.clientY);
      };
      
      // 鼠标释放结束拖拽
      const onMouseUp = (upEvent: MouseEvent) => {
        if (!isDragging) return;
        
        isDragging = false;
        unitEl.classList.remove('nc-timeline-unit-dragging');
        this.hideChapterHint();
        
        // 计算新位置
        const deltaX = upEvent.clientX - startX;
        const chapterWidth = this.config.config.chapter_width * this.zoomLevel;
        const chapterDelta = Math.round(deltaX / chapterWidth);
        
        if (chapterDelta !== 0) {
          const newStart = Math.max(1, unit.time_position_start + chapterDelta);
          const duration = unit.time_position_duration;
          const maxChapter = this.config.chapters.length;
          
          // 检查是否超出范围
          if (newStart + duration - 1 > maxChapter) {
            this.showRangeWarning(upEvent.clientX, upEvent.clientY, newStart, duration, maxChapter);
            // 恢复原位置
            unitEl.style.left = `${originalLeft}px`;
            const pos = this.unitPositions.get(unit.id);
            if (pos) {
              pos.x = originalLeft;
              this.unitPositions.set(unit.id, pos);
            }
            this.updateRelationLinePositions();
            if (this.relationLineRenderer) {
              this.relationLineRenderer.updateAllLinePositions();
            }
          } else {
            // 查找目标轨道
            const targetTrackEl = document.elementFromPoint(upEvent.clientX, upEvent.clientY)?.closest('.nc-timeline-track-content');
            const targetTrackId = targetTrackEl?.getAttribute('data-track-id') || unit.track_id;
            
            this.config.onUnitDragEnd?.(unit, { start: newStart, trackId: targetTrackId });
          }
        } else {
          // 没有移动，恢复原位置
          unitEl.style.left = `${originalLeft}px`;
          const pos = this.unitPositions.get(unit.id);
          if (pos) {
            pos.x = originalLeft;
            this.unitPositions.set(unit.id, pos);
          }
          this.updateRelationLinePositions();
          if (this.relationLineRenderer) {
            this.relationLineRenderer.updateAllLinePositions();
          }
        }
        
        this.draggedUnit = null;
        
        // 移除事件监听
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      
      // 添加文档级事件监听
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
    
    // 禁用原生拖拽
    unitEl.draggable = false;
  }

  /**
   * 设置事件监听
   */
  private setupEventListeners(): void {
    // 滚动监听（用于虚拟列表）
    this.container.addEventListener('scroll', () => {
      this.scrollLeft = this.container.scrollLeft;
      this.updateVisibleRange();
    });
    
    // 轨道拖放
    this.container.addEventListener('dragover', (e) => {
      e.preventDefault();
      
      // 显示章节刻度提示
      if (this.draggedUnit) {
        this.showChapterHint(e.clientX, e.clientY);
      }
    });
    
    this.container.addEventListener('drop', (e) => {
      e.preventDefault();
      this.hideChapterHint();
    });
    
    this.container.addEventListener('dragleave', () => {
      this.hideChapterHint();
    });
  }

  /**
   * 更新可视区域
   */
  private updateVisibleRange(): void {
    const containerWidth = this.container.clientWidth;
    const chapterWidth = this.config.config.chapter_width * this.zoomLevel;
    
    const startChapter = Math.floor(this.scrollLeft / chapterWidth);
    const visibleChapters = Math.ceil(containerWidth / chapterWidth) + 2;
    
    this.visibleRange = {
      start: Math.max(0, startChapter - 1),
      end: startChapter + visibleChapters
    };
  }

  // 章节提示元素
  private chapterHintEl: HTMLElement | null = null;

  /**
   * 显示章节刻度提示
   */
  private showChapterHint(clientX: number, clientY: number): void {
    if (!this.draggedUnit) return;
    
    // 计算当前章节位置
    const containerRect = this.container.getBoundingClientRect();
    const relativeX = clientX - containerRect.left + this.container.scrollLeft;
    const chapterWidth = this.config.config.chapter_width * this.zoomLevel;
    const pastAreaWidth = this.config.config.past_event_area 
      ? chapterWidth * this.config.chapters.length * PAST_AREA_RATIO 
      : 0;
    
    // 减去轨道标签宽度和过去区域
    const trackLabelWidth = 100;
    const adjustedX = relativeX - trackLabelWidth - pastAreaWidth;
    const chapter = Math.max(1, Math.floor(adjustedX / chapterWidth) + 1);
    
    // 计算新的结束章节
    const duration = this.draggedUnit.time_position_duration;
    const endChapter = chapter + duration - 1;
    const maxChapter = this.config.chapters.length;
    const isOutOfRange = endChapter > maxChapter;
    
    // 创建或更新提示元素
    if (!this.chapterHintEl) {
      this.chapterHintEl = document.createElement('div');
      this.chapterHintEl.className = 'nc-timeline-chapter-hint';
      document.body.appendChild(this.chapterHintEl);
    }
    
    // 更新内容
    const chapterInfo = this.config.chapters[chapter - 1];
    const chapterTitle = chapterInfo ? chapterInfo.title : `第${chapter}章`;
    
    this.chapterHintEl.innerHTML = `
      <div class="nc-timeline-hint-chapter">📍 ${chapterTitle}</div>
      <div class="nc-timeline-hint-range">范围: 第${chapter}-${endChapter}章</div>
      ${isOutOfRange ? '<div class="nc-timeline-hint-warning">⚠️ 超出章节范围</div>' : ''}
    `;
    
    // 更新位置
    this.chapterHintEl.style.left = `${clientX + 15}px`;
    this.chapterHintEl.style.top = `${clientY + 15}px`;
    
    // 添加警告样式
    this.chapterHintEl.classList.toggle('nc-timeline-hint-out-of-range', isOutOfRange);
  }

  /**
   * 隐藏章节刻度提示
   */
  private hideChapterHint(): void {
    if (this.chapterHintEl) {
      this.chapterHintEl.remove();
      this.chapterHintEl = null;
    }
  }

  /**
   * 显示范围警告
   */
  private showRangeWarning(
    clientX: number, 
    clientY: number, 
    newStart: number, 
    duration: number, 
    maxChapter: number
  ): void {
    // 创建警告提示
    const warningEl = document.createElement('div');
    warningEl.className = 'nc-timeline-range-warning';
    warningEl.innerHTML = `
      <div class="nc-timeline-warning-icon">⚠️</div>
      <div class="nc-timeline-warning-text">
        故事单元超出章节范围<br>
        当前: 第${newStart}-${newStart + duration - 1}章<br>
        最大: 第${maxChapter}章
      </div>
    `;
    
    warningEl.style.left = `${clientX}px`;
    warningEl.style.top = `${clientY - 80}px`;
    
    document.body.appendChild(warningEl);
    
    // 2秒后自动移除
    setTimeout(() => {
      warningEl.classList.add('nc-timeline-warning-fade');
      setTimeout(() => warningEl.remove(), 300);
    }, 2000);
  }

  /**
   * 生成导出文件名
   */
  private getExportFileName(format: 'svg' | 'png'): string {
    const bookTitle = this.config.bookTitle || '时间线';
    // 清理文件名中的非法字符
    const safeTitle = bookTitle.replace(/[\\/:*?"<>|]/g, '_');
    // 生成日期字符串
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return `时间线-${safeTitle}-${dateStr}.${format}`;
  }

  /**
   * 创建纯 SVG 时间线
   * 
   * 优化逻辑：
   * 1. 只包含有故事单元的章节范围
   * 2. 固定宽高比 16:9
   * 3. 内容自动缩放适应
   */
  private createPureSVG(): SVGSVGElement {
    // 固定输出尺寸（16:9 比例）
    const OUTPUT_WIDTH = 1920;
    const OUTPUT_HEIGHT = 1080;
    
    // 获取主题颜色
    const computedStyle = getComputedStyle(document.body);
    const bgColor = computedStyle.getPropertyValue('--background-primary').trim() || '#1e1e1e';
    const bgSecondary = computedStyle.getPropertyValue('--background-secondary').trim() || '#262626';
    const textColor = computedStyle.getPropertyValue('--text-normal').trim() || '#dcddde';
    const mutedColor = computedStyle.getPropertyValue('--text-muted').trim() || '#888888';
    const borderColor = computedStyle.getPropertyValue('--background-modifier-border').trim() || '#404040';
    
    // 计算故事单元覆盖的章节范围
    const units = this.config.units;
    if (units.length === 0) {
      // 没有故事单元，返回空白 SVG
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', String(OUTPUT_WIDTH));
      svg.setAttribute('height', String(OUTPUT_HEIGHT));
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('width', '100%');
      bg.setAttribute('height', '100%');
      bg.setAttribute('fill', bgColor);
      svg.appendChild(bg);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(OUTPUT_WIDTH / 2));
      text.setAttribute('y', String(OUTPUT_HEIGHT / 2));
      text.setAttribute('fill', mutedColor);
      text.setAttribute('font-size', '24');
      text.setAttribute('text-anchor', 'middle');
      text.textContent = '暂无故事单元';
      svg.appendChild(text);
      return svg;
    }
    
    // 计算章节范围（只包含有故事单元的部分）
    let minChapter = Infinity;
    let maxChapter = 0;
    for (const unit of units) {
      const start = unit.time_position_start || unit.chapter_start || 1;
      const end = start + (unit.time_position_duration || (unit.chapter_end - unit.chapter_start + 1) || 1) - 1;
      minChapter = Math.min(minChapter, start);
      maxChapter = Math.max(maxChapter, end);
    }
    minChapter = Math.max(1, minChapter - 1);
    maxChapter = Math.min(this.config.chapters.length, maxChapter + 1);
    const chapterRange = maxChapter - minChapter + 1;
    
    // 筛选有故事单元的轨道
    const tracksWithUnits = new Set<string>();
    for (const unit of units) {
      tracksWithUnits.add(unit.track_id);
    }
    const sortedTracks = [...this.config.tracks]
      .filter(t => tracksWithUnits.has(t.id))
      .sort((a, b) => {
        if (a.type === 'main') return -1;
        if (b.type === 'main') return 1;
        return a.order - b.order;
      });
    if (sortedTracks.length === 0) {
      const mainTrack = this.config.tracks.find(t => t.type === 'main');
      if (mainTrack) sortedTracks.push(mainTrack);
    }
    
    // 计算布局参数
    const padding = 40;
    const headerHeight = 60;
    const legendHeight = 40;
    const trackLabelWidth = 100;
    const availableWidth = OUTPUT_WIDTH - padding * 2 - trackLabelWidth;
    const availableHeight = OUTPUT_HEIGHT - padding * 2 - headerHeight - legendHeight;
    const trackCount = Math.max(sortedTracks.length, 1);
    const trackSpacing = 12;
    const trackHeight = Math.min(80, Math.max(50, (availableHeight - trackSpacing * (trackCount - 1)) / trackCount));
    const chapterWidth = Math.min(100, Math.max(40, availableWidth / chapterRange));
    
    // 关联线颜色
    const relationColors: Record<string, string> = {
      'causal': '#e74c3c',
      'foreshadow': '#9b59b6',
      'contrast': '#3498db',
      'parallel': '#2ecc71',
      'include': '#f39c12',
      'custom': '#95a5a6'
    };
    
    // 创建 SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(OUTPUT_WIDTH));
    svg.setAttribute('height', String(OUTPUT_HEIGHT));
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('viewBox', `0 0 ${OUTPUT_WIDTH} ${OUTPUT_HEIGHT}`);
    
    // 添加箭头标记定义
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    for (const [type, color] of Object.entries(relationColors)) {
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', `arrow-${type}`);
      marker.setAttribute('markerWidth', '10');
      marker.setAttribute('markerHeight', '10');
      marker.setAttribute('refX', '9');
      marker.setAttribute('refY', '3');
      marker.setAttribute('orient', 'auto');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M0,0 L0,6 L9,3 z');
      path.setAttribute('fill', color);
      marker.appendChild(path);
      defs.appendChild(marker);
    }
    svg.appendChild(defs);
    
    // 绘制背景
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('width', '100%');
    bgRect.setAttribute('height', '100%');
    bgRect.setAttribute('fill', bgColor);
    svg.appendChild(bgRect);
    
    // 绘制标题
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', String(padding));
    title.setAttribute('y', String(padding + 24));
    title.setAttribute('fill', textColor);
    title.setAttribute('font-size', '20');
    title.setAttribute('font-weight', 'bold');
    title.setAttribute('font-family', 'sans-serif');
    title.textContent = `📚 ${this.config.bookTitle || '故事时间线'}`;
    svg.appendChild(title);
    
    // 绘制章节范围信息
    const rangeInfo = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    rangeInfo.setAttribute('x', String(OUTPUT_WIDTH - padding));
    rangeInfo.setAttribute('y', String(padding + 24));
    rangeInfo.setAttribute('fill', mutedColor);
    rangeInfo.setAttribute('font-size', '14');
    rangeInfo.setAttribute('text-anchor', 'end');
    rangeInfo.textContent = `第 ${minChapter} - ${maxChapter} 章 (共 ${units.length} 个故事单元)`;
    svg.appendChild(rangeInfo);
    
    // 时间轴起始位置
    const axisStartX = padding + trackLabelWidth;
    const axisY = padding + headerHeight - 15;
    
    // 绘制时间轴刻度
    for (let i = 0; i < chapterRange; i++) {
      const chapterNum = minChapter + i;
      const x = axisStartX + i * chapterWidth + chapterWidth / 2;
      const tickText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      tickText.setAttribute('x', String(x));
      tickText.setAttribute('y', String(axisY));
      tickText.setAttribute('fill', mutedColor);
      tickText.setAttribute('font-size', '12');
      tickText.setAttribute('text-anchor', 'middle');
      tickText.textContent = String(chapterNum);
      svg.appendChild(tickText);
    }
    
    // 绘制分隔线
    const headerLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    headerLine.setAttribute('x1', String(padding));
    headerLine.setAttribute('y1', String(padding + headerHeight));
    headerLine.setAttribute('x2', String(OUTPUT_WIDTH - padding));
    headerLine.setAttribute('y2', String(padding + headerHeight));
    headerLine.setAttribute('stroke', borderColor);
    svg.appendChild(headerLine);
    
    // 绘制轨道
    let currentY = padding + headerHeight + 10;
    const unitPositions = new Map<string, { x: number; y: number; width: number; height: number }>();
    
    for (const track of sortedTracks) {
      // 轨道背景
      const trackBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      trackBg.setAttribute('x', String(padding));
      trackBg.setAttribute('y', String(currentY));
      trackBg.setAttribute('width', String(OUTPUT_WIDTH - padding * 2));
      trackBg.setAttribute('height', String(trackHeight));
      trackBg.setAttribute('fill', bgSecondary);
      trackBg.setAttribute('rx', '6');
      svg.appendChild(trackBg);
      
      // 轨道颜色指示器
      const colorDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      colorDot.setAttribute('cx', String(padding + 15));
      colorDot.setAttribute('cy', String(currentY + trackHeight / 2));
      colorDot.setAttribute('r', '8');
      colorDot.setAttribute('fill', track.color);
      svg.appendChild(colorDot);
      
      // 轨道名称
      const trackName = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      trackName.setAttribute('x', String(padding + 30));
      trackName.setAttribute('y', String(currentY + trackHeight / 2 + 5));
      trackName.setAttribute('fill', textColor);
      trackName.setAttribute('font-size', '13');
      trackName.setAttribute('font-weight', '500');
      trackName.textContent = track.name + (track.type === 'main' ? ' ★' : '');
      svg.appendChild(trackName);
      
      // 绘制该轨道的故事单元
      const trackUnits = units.filter(u => u.track_id === track.id);
      for (const unit of trackUnits) {
        const timeStart = unit.time_position_start || unit.chapter_start || 1;
        const duration = unit.time_position_duration || (unit.chapter_end - unit.chapter_start + 1) || 1;
        const relativeStart = timeStart - minChapter;
        const unitX = axisStartX + relativeStart * chapterWidth + 3;
        const unitWidth = Math.max(duration * chapterWidth - 6, 50);
        const unitY = currentY + 6;
        const unitHeight = trackHeight - 12;
        
        unitPositions.set(unit.id, { x: unitX, y: unitY, width: unitWidth, height: unitHeight });
        
        // 单元背景
        const unitRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        unitRect.setAttribute('x', String(unitX));
        unitRect.setAttribute('y', String(unitY));
        unitRect.setAttribute('width', String(unitWidth));
        unitRect.setAttribute('height', String(unitHeight));
        unitRect.setAttribute('fill', track.color);
        unitRect.setAttribute('rx', '5');
        svg.appendChild(unitRect);
        
        // 单元标题
        const unitTitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        unitTitle.setAttribute('x', String(unitX + 8));
        unitTitle.setAttribute('y', String(unitY + unitHeight / 2 + 5));
        unitTitle.setAttribute('fill', '#ffffff');
        unitTitle.setAttribute('font-size', '12');
        const maxChars = Math.floor((unitWidth - 16) / 8);
        let displayText = unit.title;
        if (displayText.length > maxChars && maxChars > 3) {
          displayText = displayText.slice(0, maxChars - 1) + '…';
        }
        unitTitle.textContent = displayText;
        svg.appendChild(unitTitle);
        
        // 章节范围
        if (unitWidth > 80) {
          const rangeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          rangeText.setAttribute('x', String(unitX + unitWidth - 6));
          rangeText.setAttribute('y', String(unitY + unitHeight - 6));
          rangeText.setAttribute('fill', 'rgba(255,255,255,0.7)');
          rangeText.setAttribute('font-size', '10');
          rangeText.setAttribute('text-anchor', 'end');
          rangeText.textContent = `${unit.chapter_start}-${unit.chapter_end}章`;
          svg.appendChild(rangeText);
        }
      }
      currentY += trackHeight + trackSpacing;
    }
    
    // 绘制关联线
    if (this.config.relations && this.config.relations.length > 0) {
      for (const relation of this.config.relations) {
        const sourcePos = unitPositions.get(relation.source_unit_id);
        const targetPos = unitPositions.get(relation.target_unit_id);
        if (sourcePos && targetPos) {
          const color = relationColors[relation.relation_type] || '#95a5a6';
          const sourceX = sourcePos.x + sourcePos.width;
          const sourceY = sourcePos.y + sourcePos.height / 2;
          const targetX = targetPos.x;
          const targetY = targetPos.y + targetPos.height / 2;
          const controlX1 = sourceX + Math.abs(targetX - sourceX) * 0.3;
          const controlX2 = targetX - Math.abs(targetX - sourceX) * 0.3;
          
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', `M ${sourceX} ${sourceY} C ${controlX1} ${sourceY}, ${controlX2} ${targetY}, ${targetX} ${targetY}`);
          path.setAttribute('stroke', color);
          path.setAttribute('stroke-width', '2.5');
          path.setAttribute('fill', 'none');
          path.setAttribute('marker-end', `url(#arrow-${relation.relation_type})`);
          if (relation.relation_type === 'foreshadow') {
            path.setAttribute('stroke-dasharray', '6,4');
          } else if (relation.relation_type === 'contrast') {
            path.setAttribute('stroke-dasharray', '10,5');
          }
          svg.appendChild(path);
          
          if (relation.custom_label) {
            const midX = (sourceX + targetX) / 2;
            const midY = (sourceY + targetY) / 2 - 10;
            const labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            labelBg.setAttribute('x', String(midX - 25));
            labelBg.setAttribute('y', String(midY - 12));
            labelBg.setAttribute('width', '50');
            labelBg.setAttribute('height', '16');
            labelBg.setAttribute('fill', bgColor);
            labelBg.setAttribute('stroke', color);
            labelBg.setAttribute('rx', '3');
            svg.appendChild(labelBg);
            const labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            labelText.setAttribute('x', String(midX));
            labelText.setAttribute('y', String(midY));
            labelText.setAttribute('fill', color);
            labelText.setAttribute('font-size', '10');
            labelText.setAttribute('text-anchor', 'middle');
            labelText.textContent = relation.custom_label.slice(0, 6);
            svg.appendChild(labelText);
          }
        }
      }
    }
    
    // 添加图例
    const legendY = OUTPUT_HEIGHT - padding - 10;
    const legendItems = [
      { type: 'causal', label: '因果' },
      { type: 'foreshadow', label: '铺垫' },
      { type: 'contrast', label: '对比' },
      { type: 'parallel', label: '并行' },
      { type: 'include', label: '包含' }
    ];
    
    const legendBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    legendBg.setAttribute('x', String(padding - 10));
    legendBg.setAttribute('y', String(legendY - 18));
    legendBg.setAttribute('width', String(legendItems.length * 70 + 20));
    legendBg.setAttribute('height', '28');
    legendBg.setAttribute('fill', bgSecondary);
    legendBg.setAttribute('rx', '4');
    svg.appendChild(legendBg);
    
    let legendX = padding;
    for (const item of legendItems) {
      const colorRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      colorRect.setAttribute('x', String(legendX));
      colorRect.setAttribute('y', String(legendY - 10));
      colorRect.setAttribute('width', '14');
      colorRect.setAttribute('height', '14');
      colorRect.setAttribute('fill', relationColors[item.type]);
      colorRect.setAttribute('rx', '3');
      svg.appendChild(colorRect);
      
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(legendX + 20));
      label.setAttribute('y', String(legendY + 2));
      label.setAttribute('fill', textColor);
      label.setAttribute('font-size', '12');
      label.textContent = item.label;
      svg.appendChild(label);
      legendX += 70;
    }
    
    // 添加导出时间戳
    const timestamp = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    timestamp.setAttribute('x', String(OUTPUT_WIDTH - padding));
    timestamp.setAttribute('y', String(legendY + 2));
    timestamp.setAttribute('fill', mutedColor);
    timestamp.setAttribute('font-size', '10');
    timestamp.setAttribute('text-anchor', 'end');
    const now = new Date();
    timestamp.textContent = `导出时间: ${now.toLocaleString('zh-CN')}`;
    svg.appendChild(timestamp);
    
    return svg;
  }

  /**
   * 导出为 SVG
   */
  private async exportAsSVG(): Promise<{ blob: Blob; filename: string } | null> {
    if (!this.timelineEl) return null;
    
    try {
      const svg = this.createPureSVG();
      const svgData = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([svgData], { type: 'image/svg+xml' });
      return { blob, filename: this.getExportFileName('svg') };
    } catch (error) {
      console.error('NovelCraft [TimelineRenderer] SVG 导出失败:', error);
      return null;
    }
  }

  /**
   * 导出为 PNG
   * 使用纯 SVG 转换为 PNG，避免跨域问题
   */
  private async exportAsPNG(): Promise<{ blob: Blob; filename: string } | null> {
    if (!this.timelineEl) return null;
    
    try {
      // 创建纯 SVG
      const svg = this.createPureSVG();
      const svgWidth = parseInt(svg.getAttribute('width') || '800');
      const svgHeight = parseInt(svg.getAttribute('height') || '600');
      
      // 高清缩放
      const scale = 2;
      
      // 创建 canvas
      const canvas = document.createElement('canvas');
      canvas.width = svgWidth * scale;
      canvas.height = svgHeight * scale;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('NovelCraft [TimelineRenderer] 无法创建 canvas context');
        return null;
      }
      
      // 序列化 SVG
      const svgData = new XMLSerializer().serializeToString(svg);
      
      // 创建 Blob URL（使用 base64 编码避免跨域问题）
      const svgBase64 = btoa(unescape(encodeURIComponent(svgData)));
      const svgDataUrl = `data:image/svg+xml;base64,${svgBase64}`;
      
      // 加载图片并绘制到 canvas
      return new Promise((resolve) => {
        const img = new Image();
        
        img.onload = () => {
          // 绘制到 canvas
          ctx.drawImage(img, 0, 0, svgWidth * scale, svgHeight * scale);
          
          // 导出 PNG
          canvas.toBlob((blob) => {
            if (blob) {
              resolve({ blob, filename: this.getExportFileName('png') });
            } else {
              console.error('NovelCraft [TimelineRenderer] PNG blob 创建失败');
              resolve(null);
            }
          }, 'image/png');
        };
        
        img.onerror = (error) => {
          console.error('NovelCraft [TimelineRenderer] PNG 导出失败：图片加载错误', error);
          resolve(null);
        };
        
        img.src = svgDataUrl;
      });
    } catch (error) {
      console.error('NovelCraft [TimelineRenderer] PNG 导出失败:', error);
      return null;
    }
  }

  /**
   * 获取导出样式
   */
  private getExportStyles(): string {
    return `
      .nc-timeline { font-family: sans-serif; }
      .nc-timeline-track { display: flex; align-items: center; }
      .nc-timeline-unit { 
        position: absolute; 
        border-radius: 4px; 
        padding: 4px 8px;
        color: white;
        font-size: 12px;
      }
    `;
  }
}
