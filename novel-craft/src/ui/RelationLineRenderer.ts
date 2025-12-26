/**
 * 关联线渲染器
 * 负责在时间线上绘制故事单元之间的关联关系线
 * 
 * Requirements: 4.3, 9.2
 */

import { RelationRecord } from '../types/database';
import { RelationType } from '../types/timeline';
import { 
  RelationService, 
  UnitPosition, 
  RelationLineInfo,
  RELATION_TYPE_NAMES 
} from '../services/RelationService';

/**
 * 关联线渲染配置
 */
export interface RelationLineRenderConfig {
  /** 书籍ID */
  bookId: string;
  /** 关联关系服务 */
  relationService: RelationService;
  /** 关联线点击回调 */
  onLineClick?: (relation: RelationRecord, event: MouseEvent) => void;
  /** 关联线悬停回调 */
  onLineHover?: (relation: RelationRecord | null, event: MouseEvent) => void;
  /** 关联线双击回调 */
  onLineDoubleClick?: (relation: RelationRecord, event: MouseEvent) => void;
}

/**
 * 关联线渲染器类
 */
export class RelationLineRenderer {
  private svgContainer: SVGElement;
  private config: RelationLineRenderConfig;
  
  // 缓存
  private lineInfos: RelationLineInfo[] = [];
  private lineElements: Map<string, SVGGElement> = new Map();
  private unitPositions: Map<string, UnitPosition> = new Map();
  
  // 悬停提示元素
  private tooltipEl: HTMLElement | null = null;
  
  // 当前悬停的关联线
  private hoveredLineId: string | null = null;

  constructor(container: HTMLElement, config: RelationLineRenderConfig) {
    this.config = config;
    this.svgContainer = this.createSVGContainer(container);
    this.setupEventListeners();
  }

  /**
   * 创建SVG容器
   */
  private createSVGContainer(container: HTMLElement): SVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('nc-relation-svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.pointerEvents = 'none';
    svg.style.overflow = 'visible';
    svg.style.zIndex = '10';
    
    // 添加箭头标记定义
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = this.createArrowMarkerDefs();
    svg.appendChild(defs);
    
    container.appendChild(svg);
    return svg;
  }

  /**
   * 创建箭头标记定义
   */
  private createArrowMarkerDefs(): string {
    const colors = [
      { id: 'causal', color: '#e74c3c' },
      { id: 'foreshadow', color: '#9b59b6' },
      { id: 'contrast', color: '#f39c12' },
      { id: 'parallel', color: '#3498db' },
      { id: 'include', color: '#27ae60' },
      { id: 'custom', color: '#7f8c8d' }
    ];

    return colors.map(({ id, color }) => `
      <marker id="arrow-${id}" markerWidth="10" markerHeight="10" 
              refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L0,6 L9,3 z" fill="${color}" />
      </marker>
    `).join('');
  }

  /**
   * 设置事件监听
   */
  private setupEventListeners(): void {
    // SVG容器的鼠标事件需要启用pointer-events
    this.svgContainer.addEventListener('mousemove', (e) => {
      this.handleMouseMove(e);
    });

    this.svgContainer.addEventListener('click', (e) => {
      this.handleClick(e);
    });

    this.svgContainer.addEventListener('dblclick', (e) => {
      this.handleDoubleClick(e);
    });

    this.svgContainer.addEventListener('mouseleave', () => {
      this.hideTooltip();
      this.clearHover();
    });
  }

  /**
   * 更新故事单元位置
   */
  updateUnitPositions(positions: Map<string, UnitPosition>): void {
    this.unitPositions = positions;
  }

  /**
   * 渲染所有关联线
   */
  async render(relations: RelationRecord[]): Promise<void> {
    // 清除现有线条
    this.clearLines();
    
    // 计算所有关联线信息
    this.lineInfos = [];
    
    for (const relation of relations) {
      const sourcePos = this.unitPositions.get(relation.source_unit_id);
      const targetPos = this.unitPositions.get(relation.target_unit_id);
      
      if (sourcePos && targetPos) {
        const lineInfo = this.config.relationService.getRelationLineInfo(
          relation, 
          sourcePos, 
          targetPos
        );
        this.lineInfos.push(lineInfo);
      }
    }
    
    // 渲染每条关联线
    for (const lineInfo of this.lineInfos) {
      this.renderLine(lineInfo);
    }
  }

  /**
   * 渲染单条关联线
   */
  private renderLine(lineInfo: RelationLineInfo): void {
    const { relation, coords, controlPoints, style } = lineInfo;
    
    // 创建线条组
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.classList.add('nc-relation-line-group');
    group.dataset.relationId = relation.id;
    group.style.pointerEvents = 'stroke';
    
    // 创建路径
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    
    // 使用贝塞尔曲线
    let d: string;
    if (controlPoints && controlPoints.length >= 2) {
      d = `M ${coords.x1} ${coords.y1} C ${controlPoints[0].x} ${controlPoints[0].y}, ${controlPoints[1].x} ${controlPoints[1].y}, ${coords.x2} ${coords.y2}`;
    } else {
      d = `M ${coords.x1} ${coords.y1} L ${coords.x2} ${coords.y2}`;
    }
    
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', style.color);
    path.setAttribute('stroke-width', String(style.strokeWidth));
    path.setAttribute('stroke-dasharray', style.dashArray);
    path.classList.add('nc-relation-line');
    
    // 添加箭头
    if (style.showArrow) {
      const relationType = relation.relation_type as RelationType;
      path.setAttribute('marker-end', `url(#arrow-${relationType})`);
    }
    
    // 创建透明的宽线条用于点击检测
    const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hitArea.setAttribute('d', d);
    hitArea.setAttribute('fill', 'none');
    hitArea.setAttribute('stroke', 'transparent');
    hitArea.setAttribute('stroke-width', '20');
    hitArea.classList.add('nc-relation-hit-area');
    hitArea.style.cursor = 'pointer';
    
    group.appendChild(hitArea);
    group.appendChild(path);
    
    this.svgContainer.appendChild(group);
    this.lineElements.set(relation.id, group);
  }

  /**
   * 更新单条关联线位置
   */
  updateLinePosition(relationId: string): void {
    const lineInfo = this.lineInfos.find(l => l.relation.id === relationId);
    if (!lineInfo) return;
    
    const sourcePos = this.unitPositions.get(lineInfo.relation.source_unit_id);
    const targetPos = this.unitPositions.get(lineInfo.relation.target_unit_id);
    
    if (!sourcePos || !targetPos) return;
    
    // 重新计算坐标
    const newLineInfo = this.config.relationService.getRelationLineInfo(
      lineInfo.relation,
      sourcePos,
      targetPos
    );
    
    // 更新缓存
    const index = this.lineInfos.findIndex(l => l.relation.id === relationId);
    if (index >= 0) {
      this.lineInfos[index] = newLineInfo;
    }
    
    // 更新DOM
    const group = this.lineElements.get(relationId);
    if (group) {
      const paths = group.querySelectorAll('path');
      const { coords, controlPoints } = newLineInfo;
      
      let d: string;
      if (controlPoints && controlPoints.length >= 2) {
        d = `M ${coords.x1} ${coords.y1} C ${controlPoints[0].x} ${controlPoints[0].y}, ${controlPoints[1].x} ${controlPoints[1].y}, ${coords.x2} ${coords.y2}`;
      } else {
        d = `M ${coords.x1} ${coords.y1} L ${coords.x2} ${coords.y2}`;
      }
      
      paths.forEach(path => path.setAttribute('d', d));
    }
  }

  /**
   * 实时更新所有关联线位置（用于拖拽时）
   */
  updateAllLinePositions(): void {
    for (const lineInfo of this.lineInfos) {
      this.updateLinePosition(lineInfo.relation.id);
    }
  }

  /**
   * 清除所有线条
   */
  private clearLines(): void {
    this.lineElements.forEach(group => group.remove());
    this.lineElements.clear();
    this.lineInfos = [];
  }

  /**
   * 处理鼠标移动
   */
  private handleMouseMove(e: MouseEvent): void {
    const point = this.getMousePosition(e);
    const lineInfo = this.config.relationService.findRelationAtPoint(point, this.lineInfos, 15);
    
    if (lineInfo) {
      if (this.hoveredLineId !== lineInfo.relation.id) {
        this.clearHover();
        this.setHover(lineInfo.relation.id);
        this.showTooltip(lineInfo.relation, e);
      } else {
        this.updateTooltipPosition(e);
      }
      this.config.onLineHover?.(lineInfo.relation, e);
    } else {
      if (this.hoveredLineId) {
        this.clearHover();
        this.hideTooltip();
        this.config.onLineHover?.(null, e);
      }
    }
  }

  /**
   * 处理点击
   */
  private handleClick(e: MouseEvent): void {
    const point = this.getMousePosition(e);
    const lineInfo = this.config.relationService.findRelationAtPoint(point, this.lineInfos, 15);
    
    if (lineInfo) {
      e.stopPropagation();
      this.config.onLineClick?.(lineInfo.relation, e);
    }
  }

  /**
   * 处理双击
   */
  private handleDoubleClick(e: MouseEvent): void {
    const point = this.getMousePosition(e);
    const lineInfo = this.config.relationService.findRelationAtPoint(point, this.lineInfos, 15);
    
    if (lineInfo) {
      e.stopPropagation();
      this.config.onLineDoubleClick?.(lineInfo.relation, e);
    }
  }

  /**
   * 获取鼠标在SVG中的位置
   */
  private getMousePosition(e: MouseEvent): { x: number; y: number } {
    const rect = this.svgContainer.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  /**
   * 设置悬停状态
   */
  private setHover(relationId: string): void {
    this.hoveredLineId = relationId;
    const group = this.lineElements.get(relationId);
    if (group) {
      group.classList.add('nc-relation-line-hover');
      const path = group.querySelector('.nc-relation-line');
      if (path) {
        path.setAttribute('stroke-width', '3');
      }
    }
  }

  /**
   * 清除悬停状态
   */
  private clearHover(): void {
    if (this.hoveredLineId) {
      const group = this.lineElements.get(this.hoveredLineId);
      if (group) {
        group.classList.remove('nc-relation-line-hover');
        const path = group.querySelector('.nc-relation-line');
        if (path) {
          path.setAttribute('stroke-width', '2');
        }
      }
      this.hoveredLineId = null;
    }
  }

  /**
   * 显示悬停提示
   */
  private showTooltip(relation: RelationRecord, e: MouseEvent): void {
    if (!this.tooltipEl) {
      this.tooltipEl = document.createElement('div');
      this.tooltipEl.className = 'nc-relation-tooltip';
      document.body.appendChild(this.tooltipEl);
    }
    
    const relationType = relation.relation_type as RelationType;
    const typeName = RELATION_TYPE_NAMES[relationType] || relation.custom_label || '关联';
    
    let content = `<div class="nc-relation-tooltip-type" style="color: ${relation.line_color}">${typeName}</div>`;
    
    if (relation.custom_label && relationType === RelationType.CUSTOM) {
      content += `<div class="nc-relation-tooltip-label">${relation.custom_label}</div>`;
    }
    
    if (relation.description) {
      content += `<div class="nc-relation-tooltip-desc">${relation.description}</div>`;
    }
    
    content += `<div class="nc-relation-tooltip-hint">点击编辑 | 双击删除</div>`;
    
    this.tooltipEl.innerHTML = content;
    this.tooltipEl.style.display = 'block';
    this.updateTooltipPosition(e);
  }

  /**
   * 更新提示位置
   */
  private updateTooltipPosition(e: MouseEvent): void {
    if (this.tooltipEl) {
      this.tooltipEl.style.left = `${e.clientX + 15}px`;
      this.tooltipEl.style.top = `${e.clientY + 15}px`;
    }
  }

  /**
   * 隐藏提示
   */
  private hideTooltip(): void {
    if (this.tooltipEl) {
      this.tooltipEl.style.display = 'none';
    }
  }

  /**
   * 高亮指定的关联线
   */
  highlightLine(relationId: string): void {
    this.clearHighlight();
    const group = this.lineElements.get(relationId);
    if (group) {
      group.classList.add('nc-relation-line-highlight');
    }
  }

  /**
   * 清除高亮
   */
  clearHighlight(): void {
    this.lineElements.forEach(group => {
      group.classList.remove('nc-relation-line-highlight');
    });
  }

  /**
   * 添加新的关联线
   */
  addLine(relation: RelationRecord): void {
    const sourcePos = this.unitPositions.get(relation.source_unit_id);
    const targetPos = this.unitPositions.get(relation.target_unit_id);
    
    if (sourcePos && targetPos) {
      const lineInfo = this.config.relationService.getRelationLineInfo(
        relation,
        sourcePos,
        targetPos
      );
      this.lineInfos.push(lineInfo);
      this.renderLine(lineInfo);
    }
  }

  /**
   * 移除关联线
   */
  removeLine(relationId: string): void {
    const group = this.lineElements.get(relationId);
    if (group) {
      group.remove();
      this.lineElements.delete(relationId);
    }
    
    const index = this.lineInfos.findIndex(l => l.relation.id === relationId);
    if (index >= 0) {
      this.lineInfos.splice(index, 1);
    }
  }

  /**
   * 获取SVG容器
   */
  getSVGContainer(): SVGElement {
    return this.svgContainer;
  }

  /**
   * 销毁渲染器
   */
  destroy(): void {
    this.clearLines();
    this.hideTooltip();
    if (this.tooltipEl) {
      this.tooltipEl.remove();
      this.tooltipEl = null;
    }
    this.svgContainer.remove();
  }
}
