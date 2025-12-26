/**
 * 关联关系服务
 * 提供故事单元之间关联关系的 CRUD 操作和坐标计算
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { databaseService } from './DatabaseService';
import { RelationRecord, StoryUnitRecord } from '../types/database';
import { RelationType, LineCoords } from '../types/timeline';

/**
 * 关联关系创建配置
 */
export interface RelationCreateConfig {
  /** 源故事单元ID */
  sourceUnitId: string;
  /** 目标故事单元ID */
  targetUnitId: string;
  /** 关联类型 */
  relationType: RelationType;
  /** 自定义标签（type为custom时使用） */
  customLabel?: string;
  /** 关联描述 */
  description?: string;
  /** 关联线颜色（可选，默认根据类型自动设置） */
  lineColor?: string;
}

/**
 * 关联关系更新配置
 */
export interface RelationUpdateConfig {
  /** 关联类型 */
  relationType?: RelationType;
  /** 自定义标签 */
  customLabel?: string;
  /** 关联描述 */
  description?: string;
  /** 关联线颜色 */
  lineColor?: string;
}

/**
 * 故事单元位置信息（用于坐标计算）
 */
export interface UnitPosition {
  /** 单元ID */
  unitId: string;
  /** X坐标（左边缘） */
  x: number;
  /** Y坐标（顶边缘） */
  y: number;
  /** 宽度 */
  width: number;
  /** 高度 */
  height: number;
  /** 轨道索引 */
  trackIndex: number;
}

/**
 * 关联线渲染信息
 */
export interface RelationLineInfo {
  /** 关联关系记录 */
  relation: RelationRecord;
  /** 线条坐标 */
  coords: LineCoords;
  /** 控制点（用于曲线） */
  controlPoints?: { x: number; y: number }[];
  /** 线条样式 */
  style: {
    /** 颜色 */
    color: string;
    /** 线宽 */
    strokeWidth: number;
    /** 虚线模式 */
    dashArray: string;
    /** 是否显示箭头 */
    showArrow: boolean;
  };
}

/**
 * 关联类型对应的默认颜色
 */
const RELATION_TYPE_COLORS: Record<RelationType, string> = {
  [RelationType.CAUSAL]: '#e74c3c',      // 红色 - 因果关系
  [RelationType.FORESHADOW]: '#9b59b6',  // 紫色 - 铺垫关系
  [RelationType.CONTRAST]: '#f39c12',    // 橙色 - 对比关系
  [RelationType.PARALLEL]: '#3498db',    // 蓝色 - 并行关系
  [RelationType.INCLUDE]: '#27ae60',     // 绿色 - 包含关系
  [RelationType.CUSTOM]: '#7f8c8d'       // 灰色 - 自定义关系
};

/**
 * 关联类型对应的虚线模式
 */
const RELATION_TYPE_DASH: Record<RelationType, string> = {
  [RelationType.CAUSAL]: '8,4',          // 长虚线
  [RelationType.FORESHADOW]: '4,4',      // 短虚线
  [RelationType.CONTRAST]: '12,4,4,4',   // 点划线
  [RelationType.PARALLEL]: '2,4',        // 点线
  [RelationType.INCLUDE]: '16,4',        // 超长虚线
  [RelationType.CUSTOM]: '6,6'           // 中等虚线
};

/**
 * 关联类型中文名称
 */
export const RELATION_TYPE_NAMES: Record<RelationType, string> = {
  [RelationType.CAUSAL]: '因果关系',
  [RelationType.FORESHADOW]: '铺垫关系',
  [RelationType.CONTRAST]: '对比关系',
  [RelationType.PARALLEL]: '并行关系',
  [RelationType.INCLUDE]: '包含关系',
  [RelationType.CUSTOM]: '自定义'
};

/**
 * 关联关系服务类
 */
export class RelationService {
  /**
   * 创建关联关系
   */
  async createRelation(config: RelationCreateConfig): Promise<string> {
    const {
      sourceUnitId,
      targetUnitId,
      relationType,
      customLabel,
      description,
      lineColor
    } = config;

    // 验证源和目标单元不能相同
    if (sourceUnitId === targetUnitId) {
      throw new Error('源故事单元和目标故事单元不能相同');
    }

    // 验证自定义类型必须有标签
    if (relationType === RelationType.CUSTOM && !customLabel) {
      throw new Error('自定义关联类型必须提供标签');
    }

    // 检查是否已存在相同的关联关系
    const existingRelations = await this.getRelationsBetweenUnits(sourceUnitId, targetUnitId);
    if (existingRelations.length > 0) {
      throw new Error('这两个故事单元之间已存在关联关系');
    }

    // 确定关联线颜色
    const finalLineColor = lineColor || RELATION_TYPE_COLORS[relationType];

    // 创建数据库记录
    const id = await databaseService.relations.create({
      source_unit_id: sourceUnitId,
      target_unit_id: targetUnitId,
      relation_type: relationType,
      custom_label: customLabel,
      description,
      line_color: finalLineColor
    });

    return id;
  }

  /**
   * 获取关联关系
   */
  async getRelation(id: string): Promise<RelationRecord | null> {
    return await databaseService.relations.getById(id);
  }

  /**
   * 获取故事单元的所有关联关系（作为源或目标）
   */
  async getRelationsByUnit(unitId: string): Promise<RelationRecord[]> {
    const [asSource, asTarget] = await Promise.all([
      databaseService.relations.query({ source_unit_id: unitId }),
      databaseService.relations.query({ target_unit_id: unitId })
    ]);
    
    return [...asSource, ...asTarget];
  }

  /**
   * 获取故事单元作为源的关联关系
   */
  async getOutgoingRelations(unitId: string): Promise<RelationRecord[]> {
    return await databaseService.relations.query({ source_unit_id: unitId });
  }

  /**
   * 获取故事单元作为目标的关联关系
   */
  async getIncomingRelations(unitId: string): Promise<RelationRecord[]> {
    return await databaseService.relations.query({ target_unit_id: unitId });
  }

  /**
   * 获取两个故事单元之间的关联关系
   */
  async getRelationsBetweenUnits(unitId1: string, unitId2: string): Promise<RelationRecord[]> {
    const allRelations = await databaseService.relations.getAll();
    return allRelations.filter(r => 
      (r.source_unit_id === unitId1 && r.target_unit_id === unitId2) ||
      (r.source_unit_id === unitId2 && r.target_unit_id === unitId1)
    );
  }

  /**
   * 获取书籍的所有关联关系
   */
  async getRelationsByBook(bookId: string): Promise<RelationRecord[]> {
    // 先获取书籍的所有故事单元
    const units = await databaseService.storyUnits.query({ book_id: bookId });
    const unitIds = new Set(units.map(u => u.id));
    
    // 获取所有关联关系，筛选出属于该书籍的
    const allRelations = await databaseService.relations.getAll();
    return allRelations.filter(r => 
      unitIds.has(r.source_unit_id) && unitIds.has(r.target_unit_id)
    );
  }

  /**
   * 更新关联关系
   */
  async updateRelation(id: string, updates: RelationUpdateConfig): Promise<boolean> {
    const updateData: Partial<RelationRecord> = {};

    if (updates.relationType !== undefined) {
      updateData.relation_type = updates.relationType;
      // 如果更改了类型且没有指定颜色，使用新类型的默认颜色
      if (!updates.lineColor) {
        updateData.line_color = RELATION_TYPE_COLORS[updates.relationType];
      }
    }
    if (updates.customLabel !== undefined) {
      updateData.custom_label = updates.customLabel;
    }
    if (updates.description !== undefined) {
      updateData.description = updates.description;
    }
    if (updates.lineColor !== undefined) {
      updateData.line_color = updates.lineColor;
    }

    return await databaseService.relations.update(id, updateData);
  }

  /**
   * 删除关联关系
   */
  async deleteRelation(id: string): Promise<boolean> {
    return await databaseService.relations.delete(id);
  }

  /**
   * 删除故事单元的所有关联关系
   */
  async deleteRelationsByUnit(unitId: string): Promise<number> {
    const [count1, count2] = await Promise.all([
      databaseService.relations.deleteWhere({ source_unit_id: unitId }),
      databaseService.relations.deleteWhere({ target_unit_id: unitId })
    ]);
    return count1 + count2;
  }

  /**
   * 计算关联线坐标
   * 根据源和目标故事单元的位置计算连接线的坐标
   * 始终从边框中点连接
   */
  calculateLineCoords(
    sourcePos: UnitPosition,
    targetPos: UnitPosition
  ): LineCoords {
    // 计算源单元的中心点
    const sourceCenter = {
      x: sourcePos.x + sourcePos.width / 2,
      y: sourcePos.y + sourcePos.height / 2
    };
    
    // 计算目标单元的中心点
    const targetCenter = {
      x: targetPos.x + targetPos.width / 2,
      y: targetPos.y + targetPos.height / 2
    };

    // 确定连接点（从边框中点连接）
    let x1: number, y1: number, x2: number, y2: number;

    // 判断相对位置，选择最佳连接边
    const dx = targetCenter.x - sourceCenter.x;
    const dy = targetCenter.y - sourceCenter.y;

    // 根据两个单元的相对位置决定从哪条边连接
    if (Math.abs(dx) > Math.abs(dy)) {
      // 水平方向距离更大，从左右边缘的垂直中点连接
      if (dx > 0) {
        // 目标在右边：源的右边中点 -> 目标的左边中点
        x1 = sourcePos.x + sourcePos.width;
        y1 = sourcePos.y + sourcePos.height / 2;
        x2 = targetPos.x;
        y2 = targetPos.y + targetPos.height / 2;
      } else {
        // 目标在左边：源的左边中点 -> 目标的右边中点
        x1 = sourcePos.x;
        y1 = sourcePos.y + sourcePos.height / 2;
        x2 = targetPos.x + targetPos.width;
        y2 = targetPos.y + targetPos.height / 2;
      }
    } else {
      // 垂直方向距离更大，从上下边缘的水平中点连接
      if (dy > 0) {
        // 目标在下方：源的下边中点 -> 目标的上边中点
        x1 = sourcePos.x + sourcePos.width / 2;
        y1 = sourcePos.y + sourcePos.height;
        x2 = targetPos.x + targetPos.width / 2;
        y2 = targetPos.y;
      } else {
        // 目标在上方：源的上边中点 -> 目标的下边中点
        x1 = sourcePos.x + sourcePos.width / 2;
        y1 = sourcePos.y;
        x2 = targetPos.x + targetPos.width / 2;
        y2 = targetPos.y + targetPos.height;
      }
    }

    return { x1, y1, x2, y2 };
  }

  /**
   * 计算贝塞尔曲线控制点
   * 用于绘制平滑的曲线连接
   */
  calculateBezierControlPoints(
    coords: LineCoords,
    curvature: number = 0.3
  ): { cp1: { x: number; y: number }; cp2: { x: number; y: number } } {
    const dx = coords.x2 - coords.x1;
    const dy = coords.y2 - coords.y1;
    
    // 计算控制点偏移
    const offsetX = dx * curvature;
    const offsetY = dy * curvature;

    return {
      cp1: {
        x: coords.x1 + offsetX,
        y: coords.y1
      },
      cp2: {
        x: coords.x2 - offsetX,
        y: coords.y2
      }
    };
  }

  /**
   * 获取关联线渲染信息
   */
  getRelationLineInfo(
    relation: RelationRecord,
    sourcePos: UnitPosition,
    targetPos: UnitPosition
  ): RelationLineInfo {
    const coords = this.calculateLineCoords(sourcePos, targetPos);
    const controlPoints = this.calculateBezierControlPoints(coords);
    const relationType = relation.relation_type as RelationType;

    return {
      relation,
      coords,
      controlPoints: [controlPoints.cp1, controlPoints.cp2],
      style: {
        color: relation.line_color || RELATION_TYPE_COLORS[relationType] || '#7f8c8d',
        strokeWidth: 2,
        dashArray: RELATION_TYPE_DASH[relationType] || '6,6',
        showArrow: relationType === RelationType.CAUSAL || relationType === RelationType.FORESHADOW
      }
    };
  }

  /**
   * 批量获取关联线渲染信息
   */
  async getRelationLinesForBook(
    bookId: string,
    unitPositions: Map<string, UnitPosition>
  ): Promise<RelationLineInfo[]> {
    const relations = await this.getRelationsByBook(bookId);
    const lineInfos: RelationLineInfo[] = [];

    for (const relation of relations) {
      const sourcePos = unitPositions.get(relation.source_unit_id);
      const targetPos = unitPositions.get(relation.target_unit_id);

      if (sourcePos && targetPos) {
        lineInfos.push(this.getRelationLineInfo(relation, sourcePos, targetPos));
      }
    }

    return lineInfos;
  }

  /**
   * 获取关联类型的默认颜色
   */
  getDefaultColor(relationType: RelationType): string {
    return RELATION_TYPE_COLORS[relationType];
  }

  /**
   * 获取关联类型的虚线模式
   */
  getDashPattern(relationType: RelationType): string {
    return RELATION_TYPE_DASH[relationType];
  }

  /**
   * 获取关联类型的中文名称
   */
  getTypeName(relationType: RelationType): string {
    return RELATION_TYPE_NAMES[relationType];
  }

  /**
   * 获取所有关联类型选项
   */
  getAllRelationTypes(): { type: RelationType; name: string; color: string }[] {
    return Object.values(RelationType).map(type => ({
      type,
      name: RELATION_TYPE_NAMES[type],
      color: RELATION_TYPE_COLORS[type]
    }));
  }

  /**
   * 检查点是否在关联线附近（用于点击检测）
   */
  isPointNearLine(
    point: { x: number; y: number },
    coords: LineCoords,
    threshold: number = 10
  ): boolean {
    // 计算点到线段的距离
    const { x1, y1, x2, y2 } = coords;
    const px = point.x;
    const py = point.y;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      // 线段退化为点
      const dist = Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
      return dist <= threshold;
    }

    // 计算投影参数
    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));

    // 计算最近点
    const nearestX = x1 + t * dx;
    const nearestY = y1 + t * dy;

    // 计算距离
    const dist = Math.sqrt((px - nearestX) ** 2 + (py - nearestY) ** 2);
    return dist <= threshold;
  }

  /**
   * 查找点击位置附近的关联线
   */
  findRelationAtPoint(
    point: { x: number; y: number },
    lineInfos: RelationLineInfo[],
    threshold: number = 10
  ): RelationLineInfo | null {
    for (const lineInfo of lineInfos) {
      if (this.isPointNearLine(point, lineInfo.coords, threshold)) {
        return lineInfo;
      }
    }
    return null;
  }
}
