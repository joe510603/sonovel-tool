/**
 * TimelineVisualizationService - 时间轴可视化服务
 * 
 * 生成伪时间轴甘特图：
 * - 生成甘特图 Canvas
 * - 支持事件拖拽更新
 * - 支持在面板中渲染甘特图
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import { App, TFile, normalizePath } from 'obsidian';
import { BookDatabaseService } from './BookDatabaseService';
import {
  StoryEvent,
  DATABASE_FILES,
} from '../types/database';

// ============ Canvas 数据结构 ============

/**
 * Canvas 节点类型
 */
export type TimelineNodeType = 'text' | 'file' | 'link' | 'group';

/**
 * Canvas 节点
 */
export interface TimelineNode {
  /** 节点 ID */
  id: string;
  /** 节点类型 */
  type: TimelineNodeType;
  /** X 坐标 */
  x: number;
  /** Y 坐标 */
  y: number;
  /** 宽度 */
  width: number;
  /** 高度 */
  height: number;
  /** 文本内容（text 类型） */
  text?: string;
  /** 文件路径（file 类型） */
  file?: string;
  /** 链接 URL（link 类型） */
  url?: string;
  /** 背景颜色 */
  color?: string;
  /** 标签（用于分组） */
  label?: string;
}

/**
 * Canvas 边（连线）
 */
export interface TimelineEdge {
  /** 边 ID */
  id: string;
  /** 起始节点 ID */
  fromNode: string;
  /** 起始端点位置 */
  fromSide: 'top' | 'right' | 'bottom' | 'left';
  /** 结束节点 ID */
  toNode: string;
  /** 结束端点位置 */
  toSide: 'top' | 'right' | 'bottom' | 'left';
  /** 边的颜色 */
  color?: string;
  /** 边的标签 */
  label?: string;
}

/**
 * Canvas 数据结构
 */
export interface TimelineCanvasData {
  /** 节点列表 */
  nodes: TimelineNode[];
  /** 边列表 */
  edges: TimelineEdge[];
}

// ============ 事件位置类型 ============

/**
 * 事件位置
 */
export interface EventPosition {
  /** 伪时间顺序 */
  pseudoTimeOrder?: number;
  /** 持续跨度 */
  durationSpan?: number;
  /** 纵向层级 */
  layer?: number;
}

// ============ 布局配置 ============

/**
 * 时间轴布局配置
 */
const TIMELINE_LAYOUT = {
  /** 时间单位宽度（像素） */
  TIME_UNIT_WIDTH: 100,
  /** 层级高度（像素） */
  LAYER_HEIGHT: 80,
  /** 事件块高度 */
  EVENT_HEIGHT: 60,
  /** 事件块最小宽度 */
  MIN_EVENT_WIDTH: 80,
  /** 左边距（用于标签） */
  LEFT_MARGIN: 150,
  /** 顶部边距（用于时间刻度） */
  TOP_MARGIN: 60,
  /** 层级间距 */
  LAYER_GAP: 20,
  /** 时间刻度高度 */
  SCALE_HEIGHT: 40,
};

/**
 * 默认事件颜色
 */
const DEFAULT_EVENT_COLORS = [
  '#4ECDC4', // 青色
  '#FF6B6B', // 红色
  '#45B7D1', // 蓝色
  '#96CEB4', // 绿色
  '#FFEAA7', // 黄色
  '#DDA0DD', // 紫色
  '#98D8C8', // 薄荷绿
  '#F7DC6F', // 金色
];

/**
 * TimelineVisualizationService - 时间轴可视化服务
 */
export class TimelineVisualizationService {
  private app: App;
  private bookDatabaseService: BookDatabaseService;

  constructor(app: App, bookDatabaseService: BookDatabaseService) {
    this.app = app;
    this.bookDatabaseService = bookDatabaseService;
  }

  // ============ 甘特图 Canvas 生成 ============

  /**
   * 生成甘特图 Canvas
   * 
   * @param bookPath - 书籍文件夹路径
   * @returns Canvas 文件路径
   * 
   * Requirements: 6.1, 6.2, 6.3
   */
  async generateTimelineCanvas(bookPath: string): Promise<string> {
    const normalizedPath = normalizePath(bookPath);
    const canvasPath = normalizePath(`${normalizedPath}/${DATABASE_FILES.CANVAS_FOLDER}/时间轴.canvas`);
    
    // 获取事件数据
    const events = await this.bookDatabaseService.getEvents(bookPath);
    
    if (events.length === 0) {
      // 创建空 Canvas
      const emptyCanvas: TimelineCanvasData = { nodes: [], edges: [] };
      await this.writeCanvasFile(canvasPath, emptyCanvas);
      return canvasPath;
    }
    
    // 生成 Canvas 数据
    const canvasData = this.buildTimelineCanvasData(events);
    
    // 写入 Canvas 文件
    await this.writeCanvasFile(canvasPath, canvasData);
    
    return canvasPath;
  }

  /**
   * 构建时间轴 Canvas 数据
   * 
   * @param events - 事件列表
   * @returns Canvas 数据
   */
  private buildTimelineCanvasData(events: StoryEvent[]): TimelineCanvasData {
    const nodes: TimelineNode[] = [];
    const edges: TimelineEdge[] = [];
    
    // 按伪时间顺序排序
    const sortedEvents = [...events].sort((a, b) => a.pseudoTimeOrder - b.pseudoTimeOrder);
    
    // 计算时间范围
    const timeRange = this.calculateTimeRange(sortedEvents);
    
    // 创建时间刻度节点
    const scaleNodes = this.createTimeScaleNodes(timeRange);
    nodes.push(...scaleNodes);
    
    // 创建层级标签节点
    const maxLayer = Math.max(...sortedEvents.map(e => e.layer), 0);
    const layerNodes = this.createLayerLabelNodes(maxLayer);
    nodes.push(...layerNodes);
    
    // 创建事件节点
    for (const event of sortedEvents) {
      const eventNode = this.createEventNode(event, timeRange);
      nodes.push(eventNode);
    }
    
    // 创建事件之间的连线（按时间顺序）
    const eventEdges = this.createEventEdges(sortedEvents);
    edges.push(...eventEdges);
    
    return { nodes, edges };
  }

  /**
   * 计算时间范围
   */
  private calculateTimeRange(events: StoryEvent[]): { min: number; max: number } {
    if (events.length === 0) {
      return { min: 0, max: 10 };
    }
    
    const min = Math.min(...events.map(e => e.pseudoTimeOrder));
    const max = Math.max(...events.map(e => e.pseudoTimeOrder + e.durationSpan));
    
    // 添加一些边距
    return {
      min: Math.max(0, min - 1),
      max: max + 1,
    };
  }

  /**
   * 创建时间刻度节点
   */
  private createTimeScaleNodes(timeRange: { min: number; max: number }): TimelineNode[] {
    const nodes: TimelineNode[] = [];
    
    // 创建时间轴标题
    nodes.push({
      id: 'timeline_title',
      type: 'text',
      x: TIMELINE_LAYOUT.LEFT_MARGIN,
      y: 0,
      width: 200,
      height: 30,
      text: '## 时间轴（伪）',
      color: '6',
    });
    
    // 创建时间刻度
    for (let t = timeRange.min; t <= timeRange.max; t++) {
      const x = TIMELINE_LAYOUT.LEFT_MARGIN + (t - timeRange.min) * TIMELINE_LAYOUT.TIME_UNIT_WIDTH;
      
      nodes.push({
        id: `scale_${t}`,
        type: 'text',
        x,
        y: TIMELINE_LAYOUT.SCALE_HEIGHT,
        width: 40,
        height: 20,
        text: `${t}`,
        color: '6',
      });
    }
    
    return nodes;
  }

  /**
   * 创建层级标签节点
   */
  private createLayerLabelNodes(maxLayer: number): TimelineNode[] {
    const nodes: TimelineNode[] = [];
    
    for (let layer = 0; layer <= maxLayer; layer++) {
      const y = TIMELINE_LAYOUT.TOP_MARGIN + layer * (TIMELINE_LAYOUT.LAYER_HEIGHT + TIMELINE_LAYOUT.LAYER_GAP);
      
      nodes.push({
        id: `layer_label_${layer}`,
        type: 'text',
        x: 0,
        y,
        width: TIMELINE_LAYOUT.LEFT_MARGIN - 20,
        height: TIMELINE_LAYOUT.EVENT_HEIGHT,
        text: `层级 ${layer + 1}`,
        color: '6',
      });
    }
    
    return nodes;
  }

  /**
   * 创建事件节点
   */
  private createEventNode(event: StoryEvent, timeRange: { min: number; max: number }): TimelineNode {
    // 计算位置
    const x = TIMELINE_LAYOUT.LEFT_MARGIN + 
              (event.pseudoTimeOrder - timeRange.min) * TIMELINE_LAYOUT.TIME_UNIT_WIDTH;
    const y = TIMELINE_LAYOUT.TOP_MARGIN + 
              event.layer * (TIMELINE_LAYOUT.LAYER_HEIGHT + TIMELINE_LAYOUT.LAYER_GAP);
    
    // 计算宽度（基于持续跨度）
    const width = Math.max(
      TIMELINE_LAYOUT.MIN_EVENT_WIDTH,
      event.durationSpan * TIMELINE_LAYOUT.TIME_UNIT_WIDTH
    );
    
    // 构建节点文本
    const lines: string[] = [
      `**${event.name}**`,
    ];
    
    if (event.description) {
      // 截取前50个字符
      const shortDesc = event.description.length > 50
        ? event.description.substring(0, 50) + '...'
        : event.description;
      lines.push(shortDesc);
    }
    
    lines.push(`章节: ${event.chapterRange.start}-${event.chapterRange.end}`);
    
    // 将颜色转换为 Obsidian Canvas 颜色索引
    const colorIndex = this.colorToCanvasIndex(event.color);
    
    return {
      id: event.eventId,
      type: 'text',
      x,
      y,
      width,
      height: TIMELINE_LAYOUT.EVENT_HEIGHT,
      text: lines.join('\n'),
      color: colorIndex,
    };
  }

  /**
   * 创建事件之间的连线
   */
  private createEventEdges(events: StoryEvent[]): TimelineEdge[] {
    const edges: TimelineEdge[] = [];
    
    // 按层级分组
    const layerGroups = new Map<number, StoryEvent[]>();
    for (const event of events) {
      if (!layerGroups.has(event.layer)) {
        layerGroups.set(event.layer, []);
      }
      layerGroups.get(event.layer)!.push(event);
    }
    
    // 在同一层级内，按时间顺序连接事件
    for (const [, layerEvents] of layerGroups) {
      const sortedLayerEvents = [...layerEvents].sort(
        (a, b) => a.pseudoTimeOrder - b.pseudoTimeOrder
      );
      
      for (let i = 0; i < sortedLayerEvents.length - 1; i++) {
        const current = sortedLayerEvents[i];
        const next = sortedLayerEvents[i + 1];
        
        edges.push({
          id: `edge_${current.eventId}_${next.eventId}`,
          fromNode: current.eventId,
          fromSide: 'right',
          toNode: next.eventId,
          toSide: 'left',
          color: '6',
        });
      }
    }
    
    return edges;
  }

  /**
   * 将颜色转换为 Canvas 颜色索引
   */
  private colorToCanvasIndex(color: string): string {
    // Obsidian Canvas 使用数字 1-6 表示颜色
    const colorMap: Record<string, string> = {
      '#FF6B6B': '1', // 红色
      '#FFEAA7': '2', // 橙色/黄色
      '#96CEB4': '3', // 绿色
      '#45B7D1': '4', // 蓝色
      '#DDA0DD': '5', // 紫色
      '#4ECDC4': '4', // 青色 -> 蓝色
      '#98D8C8': '3', // 薄荷绿 -> 绿色
      '#F7DC6F': '2', // 金色 -> 橙色
    };
    
    return colorMap[color] || '4';
  }

  // ============ 事件位置更新 ============

  /**
   * 更新事件位置（用于拖拽操作）
   * 
   * @param bookPath - 书籍文件夹路径
   * @param eventId - 事件 ID
   * @param position - 新位置
   * 
   * Requirements: 6.6
   */
  async updateEventPosition(
    bookPath: string,
    eventId: string,
    position: EventPosition
  ): Promise<void> {
    // 更新数据库中的事件位置
    await this.bookDatabaseService.updateEventPosition(bookPath, eventId, position);
    
    // 重新生成 Canvas 以反映变更
    await this.generateTimelineCanvas(bookPath);
  }

  /**
   * 从 Canvas 节点位置计算事件位置
   * 用于处理用户在 Canvas 中拖拽节点后的同步
   * 
   * @param node - Canvas 节点
   * @param timeRange - 时间范围
   * @returns 事件位置
   */
  calculateEventPositionFromNode(
    node: TimelineNode,
    timeRange: { min: number; max: number }
  ): EventPosition {
    // 从 X 坐标计算伪时间顺序
    const pseudoTimeOrder = Math.round(
      (node.x - TIMELINE_LAYOUT.LEFT_MARGIN) / TIMELINE_LAYOUT.TIME_UNIT_WIDTH + timeRange.min
    );
    
    // 从宽度计算持续跨度
    const durationSpan = Math.max(
      1,
      Math.round(node.width / TIMELINE_LAYOUT.TIME_UNIT_WIDTH)
    );
    
    // 从 Y 坐标计算层级
    const layer = Math.max(
      0,
      Math.round((node.y - TIMELINE_LAYOUT.TOP_MARGIN) / (TIMELINE_LAYOUT.LAYER_HEIGHT + TIMELINE_LAYOUT.LAYER_GAP))
    );
    
    return {
      pseudoTimeOrder: Math.max(0, pseudoTimeOrder),
      durationSpan,
      layer,
    };
  }

  /**
   * 同步 Canvas 变更到数据库
   * 
   * @param bookPath - 书籍文件夹路径
   * @param canvasData - Canvas 数据
   */
  async syncCanvasToDatabase(bookPath: string, canvasData: TimelineCanvasData): Promise<void> {
    const events = await this.bookDatabaseService.getEvents(bookPath);
    const eventMap = new Map(events.map(e => [e.eventId, e]));
    
    // 计算当前时间范围
    const timeRange = this.calculateTimeRange(events);
    
    // 遍历 Canvas 节点，更新事件位置
    for (const node of canvasData.nodes) {
      // 跳过非事件节点（时间刻度、层级标签等）
      if (node.id.startsWith('scale_') || 
          node.id.startsWith('layer_label_') || 
          node.id === 'timeline_title') {
        continue;
      }
      
      const event = eventMap.get(node.id);
      if (event) {
        const newPosition = this.calculateEventPositionFromNode(node, timeRange);
        
        // 检查位置是否有变化
        if (newPosition.pseudoTimeOrder !== event.pseudoTimeOrder ||
            newPosition.durationSpan !== event.durationSpan ||
            newPosition.layer !== event.layer) {
          await this.bookDatabaseService.updateEventPosition(bookPath, event.eventId, newPosition);
        }
      }
    }
  }

  // ============ 内嵌时间轴视图渲染 ============

  /**
   * 渲染时间轴（用于内嵌视图）
   * 
   * @param container - 容器元素
   * @param bookPath - 书籍文件夹路径
   * 
   * Requirements: 6.4, 6.5
   */
  async renderTimeline(container: HTMLElement, bookPath: string): Promise<void> {
    // 清空容器
    container.empty();
    
    // 获取事件数据
    const events = await this.bookDatabaseService.getEvents(bookPath);
    
    // 获取书籍元数据
    const bookMeta = await this.bookDatabaseService.getBookMeta(bookPath);
    const bookTitle = bookMeta?.title || '未知书籍';
    
    // 创建时间轴容器
    const timelineContainer = container.createDiv({ cls: 'timeline-container' });
    
    // 添加标题
    const header = timelineContainer.createDiv({ cls: 'timeline-header' });
    header.createEl('h3', { text: `${bookTitle} - 时间轴（伪）` });
    
    if (events.length === 0) {
      // 显示空状态
      const emptyState = timelineContainer.createDiv({ cls: 'timeline-empty' });
      emptyState.createEl('p', { text: '暂无事件数据' });
      emptyState.createEl('p', { 
        text: '请先从故事单元中拆分事件，或手动添加事件。',
        cls: 'timeline-empty-hint'
      });
      return;
    }
    
    // 按伪时间顺序排序
    const sortedEvents = [...events].sort((a, b) => a.pseudoTimeOrder - b.pseudoTimeOrder);
    
    // 计算时间范围
    const timeRange = this.calculateTimeRange(sortedEvents);
    const maxLayer = Math.max(...sortedEvents.map(e => e.layer), 0);
    
    // 创建甘特图区域
    const ganttArea = timelineContainer.createDiv({ cls: 'timeline-gantt' });
    
    // 渲染时间刻度
    this.renderTimeScale(ganttArea, timeRange);
    
    // 渲染层级和事件
    this.renderLayers(ganttArea, sortedEvents, timeRange, maxLayer, bookPath);
    
    // 添加样式
    this.injectTimelineStyles(container);
  }

  /**
   * 渲染时间刻度
   */
  private renderTimeScale(container: HTMLElement, timeRange: { min: number; max: number }): void {
    const scaleRow = container.createDiv({ cls: 'timeline-scale-row' });
    
    // 空白占位（对应层级标签列）
    scaleRow.createDiv({ cls: 'timeline-layer-label' });
    
    // 时间刻度
    const scaleContainer = scaleRow.createDiv({ cls: 'timeline-scale-container' });
    
    for (let t = timeRange.min; t <= timeRange.max; t++) {
      const scaleMark = scaleContainer.createDiv({ cls: 'timeline-scale-mark' });
      scaleMark.createSpan({ text: `${t}` });
    }
  }

  /**
   * 渲染层级和事件
   */
  private renderLayers(
    container: HTMLElement,
    events: StoryEvent[],
    timeRange: { min: number; max: number },
    maxLayer: number,
    bookPath: string
  ): void {
    // 按层级分组事件
    const layerGroups = new Map<number, StoryEvent[]>();
    for (const event of events) {
      if (!layerGroups.has(event.layer)) {
        layerGroups.set(event.layer, []);
      }
      layerGroups.get(event.layer)!.push(event);
    }
    
    // 渲染每个层级
    for (let layer = 0; layer <= maxLayer; layer++) {
      const layerRow = container.createDiv({ cls: 'timeline-layer-row' });
      
      // 层级标签
      const layerLabel = layerRow.createDiv({ cls: 'timeline-layer-label' });
      layerLabel.createSpan({ text: `层级 ${layer + 1}` });
      
      // 事件容器
      const eventsContainer = layerRow.createDiv({ cls: 'timeline-events-container' });
      
      // 渲染该层级的事件
      const layerEvents = layerGroups.get(layer) || [];
      for (const event of layerEvents) {
        this.renderEvent(eventsContainer, event, timeRange, bookPath);
      }
    }
  }

  /**
   * 渲染单个事件
   */
  private renderEvent(
    container: HTMLElement,
    event: StoryEvent,
    timeRange: { min: number; max: number },
    bookPath: string
  ): void {
    // 计算位置和宽度（百分比）
    const totalDuration = timeRange.max - timeRange.min;
    const leftPercent = ((event.pseudoTimeOrder - timeRange.min) / totalDuration) * 100;
    const widthPercent = (event.durationSpan / totalDuration) * 100;
    
    // 创建事件块
    const eventBlock = container.createDiv({ cls: 'timeline-event' });
    eventBlock.style.left = `${leftPercent}%`;
    eventBlock.style.width = `${Math.max(5, widthPercent)}%`;
    eventBlock.style.backgroundColor = event.color;
    
    // 事件名称
    eventBlock.createDiv({ cls: 'timeline-event-name', text: event.name });
    
    // 章节范围
    eventBlock.createDiv({ 
      cls: 'timeline-event-chapters', 
      text: `${event.chapterRange.start}-${event.chapterRange.end}章` 
    });
    
    // 添加点击事件
    eventBlock.addEventListener('click', () => {
      this.onEventClick(event, bookPath);
    });
    
    // 添加拖拽支持
    eventBlock.draggable = true;
    eventBlock.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/plain', event.eventId);
    });
    
    // 添加 tooltip
    eventBlock.title = this.buildEventTooltip(event);
  }

  /**
   * 构建事件 tooltip
   */
  private buildEventTooltip(event: StoryEvent): string {
    const lines: string[] = [
      `事件: ${event.name}`,
      `章节: ${event.chapterRange.start}-${event.chapterRange.end}`,
      `时间顺序: ${event.pseudoTimeOrder}`,
      `持续跨度: ${event.durationSpan}`,
      `层级: ${event.layer + 1}`,
    ];
    
    if (event.description) {
      lines.push(`描述: ${event.description}`);
    }
    
    return lines.join('\n');
  }

  /**
   * 事件点击处理
   */
  private onEventClick(event: StoryEvent, _bookPath: string): void {
    // 如果有关联的故事单元，可以跳转
    if (event.storyUnitId) {
      // 触发跳转到故事单元的事件
      // 这里可以通过 Obsidian 的事件系统或回调来实现
      console.log(`点击事件: ${event.name}, 关联故事单元: ${event.storyUnitId}`);
    }
    
    // 也可以跳转到对应章节
    console.log(`事件章节范围: ${event.chapterRange.start}-${event.chapterRange.end}`);
  }

  /**
   * 注入时间轴样式
   */
  private injectTimelineStyles(container: HTMLElement): void {
    // 检查是否已注入样式
    if (container.querySelector('style.timeline-styles')) {
      return;
    }
    
    const style = container.createEl('style', { cls: 'timeline-styles' });
    style.textContent = `
      .timeline-container {
        padding: 16px;
        overflow-x: auto;
      }
      
      .timeline-header {
        margin-bottom: 16px;
        border-bottom: 1px solid var(--background-modifier-border);
        padding-bottom: 8px;
      }
      
      .timeline-header h3 {
        margin: 0;
        font-size: 1.2em;
      }
      
      .timeline-empty {
        text-align: center;
        padding: 40px;
        color: var(--text-muted);
      }
      
      .timeline-empty-hint {
        font-size: 0.9em;
        margin-top: 8px;
      }
      
      .timeline-gantt {
        min-width: 600px;
      }
      
      .timeline-scale-row,
      .timeline-layer-row {
        display: flex;
        align-items: stretch;
        min-height: 60px;
      }
      
      .timeline-scale-row {
        border-bottom: 2px solid var(--background-modifier-border);
        margin-bottom: 8px;
      }
      
      .timeline-layer-label {
        width: 100px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        padding: 8px;
        font-weight: 500;
        color: var(--text-muted);
        border-right: 1px solid var(--background-modifier-border);
      }
      
      .timeline-scale-container {
        flex: 1;
        display: flex;
        align-items: flex-end;
        padding-bottom: 4px;
      }
      
      .timeline-scale-mark {
        flex: 1;
        text-align: center;
        font-size: 0.85em;
        color: var(--text-muted);
        border-left: 1px dashed var(--background-modifier-border);
        padding: 4px;
      }
      
      .timeline-events-container {
        flex: 1;
        position: relative;
        min-height: 60px;
        background: repeating-linear-gradient(
          90deg,
          transparent,
          transparent calc(100% / var(--timeline-divisions, 10) - 1px),
          var(--background-modifier-border) calc(100% / var(--timeline-divisions, 10) - 1px),
          var(--background-modifier-border) calc(100% / var(--timeline-divisions, 10))
        );
      }
      
      .timeline-event {
        position: absolute;
        top: 4px;
        height: calc(100% - 8px);
        border-radius: 4px;
        padding: 4px 8px;
        cursor: pointer;
        overflow: hidden;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
        transition: transform 0.1s, box-shadow 0.1s;
      }
      
      .timeline-event:hover {
        transform: translateY(-2px);
        box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
      }
      
      .timeline-event-name {
        font-weight: 600;
        font-size: 0.9em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: #fff;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
      }
      
      .timeline-event-chapters {
        font-size: 0.75em;
        opacity: 0.9;
        color: #fff;
      }
      
      .timeline-layer-row {
        border-bottom: 1px solid var(--background-modifier-border);
      }
      
      .timeline-layer-row:last-child {
        border-bottom: none;
      }
    `;
  }

  // ============ Canvas 文件操作 ============

  /**
   * 写入 Canvas 文件
   */
  private async writeCanvasFile(canvasPath: string, data: TimelineCanvasData): Promise<void> {
    const normalizedPath = normalizePath(canvasPath);
    
    // 确保目录存在
    const folderPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));
    await this.ensureFolder(folderPath);
    
    const content = JSON.stringify(data, null, 2);
    
    const existingFile = this.app.vault.getAbstractFileByPath(normalizedPath);
    
    if (existingFile instanceof TFile) {
      await this.app.vault.modify(existingFile, content);
    } else {
      await this.app.vault.create(normalizedPath, content);
    }
  }

  /**
   * 读取 Canvas 文件
   */
  async readCanvasFile(canvasPath: string): Promise<TimelineCanvasData> {
    const normalizedPath = normalizePath(canvasPath);
    
    try {
      const file = this.app.vault.getAbstractFileByPath(normalizedPath);
      
      if (!(file instanceof TFile)) {
        return { nodes: [], edges: [] };
      }
      
      const content = await this.app.vault.read(file);
      const data = JSON.parse(content) as TimelineCanvasData;
      
      return {
        nodes: data.nodes || [],
        edges: data.edges || [],
      };
    } catch {
      return { nodes: [], edges: [] };
    }
  }

  /**
   * 确保文件夹存在
   */
  private async ensureFolder(folderPath: string): Promise<void> {
    const normalizedPath = normalizePath(folderPath);
    
    if (!this.app.vault.getAbstractFileByPath(normalizedPath)) {
      await this.app.vault.createFolder(normalizedPath);
    }
  }

  // ============ 辅助方法 ============

  /**
   * 获取默认事件颜色
   * 
   * @param index - 事件索引
   * @returns 颜色值
   */
  getDefaultEventColor(index: number): string {
    return DEFAULT_EVENT_COLORS[index % DEFAULT_EVENT_COLORS.length];
  }

  /**
   * 获取时间轴布局配置
   */
  getLayoutConfig(): typeof TIMELINE_LAYOUT {
    return { ...TIMELINE_LAYOUT };
  }

  /**
   * 检查时间轴 Canvas 是否存在
   * 
   * @param bookPath - 书籍文件夹路径
   * @returns 是否存在
   */
  async hasTimelineCanvas(bookPath: string): Promise<boolean> {
    const normalizedPath = normalizePath(bookPath);
    const canvasPath = normalizePath(`${normalizedPath}/${DATABASE_FILES.CANVAS_FOLDER}/时间轴.canvas`);
    
    const file = this.app.vault.getAbstractFileByPath(canvasPath);
    return file instanceof TFile;
  }

  /**
   * 删除时间轴 Canvas
   * 
   * @param bookPath - 书籍文件夹路径
   */
  async deleteTimelineCanvas(bookPath: string): Promise<void> {
    const normalizedPath = normalizePath(bookPath);
    const canvasPath = normalizePath(`${normalizedPath}/${DATABASE_FILES.CANVAS_FOLDER}/时间轴.canvas`);
    
    const file = this.app.vault.getAbstractFileByPath(canvasPath);
    if (file instanceof TFile) {
      await this.app.vault.delete(file);
    }
  }
}
