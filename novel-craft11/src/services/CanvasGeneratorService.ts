/**
 * CanvasGeneratorService - Canvas 生成服务
 * 
 * 生成人物关系和故事发展的 Canvas 可视化：
 * - 生成人物关系 Canvas
 * - 生成故事发展 Canvas
 * - 支持 Canvas 双向同步
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */

import { App, TFile, normalizePath } from 'obsidian';
import { BookDatabaseService } from './BookDatabaseService';
import {
  Character,
  StoryUnit,
  DATABASE_FILES,
  DbCharacterRole,
} from '../types/database';

// ============ Canvas 数据结构 ============

/**
 * Canvas 节点类型
 */
export type CanvasNodeType = 'text' | 'file' | 'link' | 'group';

/**
 * Canvas 节点
 */
export interface CanvasNode {
  /** 节点 ID */
  id: string;
  /** 节点类型 */
  type: CanvasNodeType;
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
export interface CanvasEdge {
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
export interface CanvasData {
  /** 节点列表 */
  nodes: CanvasNode[];
  /** 边列表 */
  edges: CanvasEdge[];
}

/**
 * Canvas 变更类型
 */
export interface CanvasChange {
  /** 变更类型 */
  type: 'add' | 'update' | 'delete';
  /** 节点/边 ID */
  id: string;
  /** 变更数据 */
  data?: Record<string, unknown>;
}

// ============ 颜色配置 ============

/**
 * 人物角色颜色映射
 */
const CHARACTER_ROLE_COLORS: Record<DbCharacterRole, string> = {
  protagonist: '1',  // 红色
  antagonist: '5',   // 紫色
  supporting: '4',   // 蓝色
  minor: '6',        // 灰色
};

/**
 * 关系类型颜色映射
 */
const RELATIONSHIP_COLORS: Record<string, string> = {
  friend: '4',    // 蓝色
  enemy: '1',     // 红色
  family: '3',    // 绿色
  lover: '2',     // 橙色
  rival: '5',     // 紫色
  custom: '6',    // 灰色
};

/**
 * 故事线类型颜色映射
 */
const STORYLINE_COLORS: Record<string, string> = {
  main: '1',        // 红色 - 主线
  sub: '4',         // 蓝色 - 支线
  independent: '3', // 绿色 - 独立
  custom: '6',      // 灰色 - 自定义
};

// ============ 布局配置 ============

/**
 * 节点尺寸配置
 */
const NODE_SIZE = {
  character: { width: 200, height: 100 },
  storyUnit: { width: 250, height: 120 },
};

/**
 * 布局间距配置
 */
const LAYOUT_SPACING = {
  horizontal: 300,
  vertical: 200,
  groupPadding: 50,
};

/**
 * CanvasGeneratorService - Canvas 生成服务
 */
export class CanvasGeneratorService {
  private app: App;
  private bookDatabaseService: BookDatabaseService;

  constructor(app: App, bookDatabaseService: BookDatabaseService) {
    this.app = app;
    this.bookDatabaseService = bookDatabaseService;
  }

  // ============ 人物关系 Canvas 生成 ============

  /**
   * 生成人物关系 Canvas
   * 
   * @param bookPath - 书籍文件夹路径
   * @returns Canvas 文件路径
   * 
   * Requirements: 7.1, 7.2
   */
  async generateCharacterCanvas(bookPath: string): Promise<string> {
    const normalizedPath = normalizePath(bookPath);
    const canvasPath = normalizePath(`${normalizedPath}/${DATABASE_FILES.CHARACTER_CANVAS}`);
    
    // 获取人物数据
    const characters = await this.bookDatabaseService.getCharacters(bookPath);
    
    if (characters.length === 0) {
      // 创建空 Canvas
      const emptyCanvas: CanvasData = { nodes: [], edges: [] };
      await this.writeCanvasFile(canvasPath, emptyCanvas);
      return canvasPath;
    }
    
    // 生成 Canvas 数据
    const canvasData = this.buildCharacterCanvasData(characters);
    
    // 写入 Canvas 文件
    await this.writeCanvasFile(canvasPath, canvasData);
    
    return canvasPath;
  }

  /**
   * 构建人物关系 Canvas 数据
   * 
   * @param characters - 人物列表
   * @returns Canvas 数据
   */
  private buildCharacterCanvasData(characters: Character[]): CanvasData {
    const nodes: CanvasNode[] = [];
    const edges: CanvasEdge[] = [];
    
    // 按角色类型分组
    const roleGroups = this.groupCharactersByRole(characters);
    
    // 计算布局位置
    const positions = this.calculateCharacterPositions(roleGroups);
    
    // 创建人物节点
    for (const character of characters) {
      const position = positions.get(character.characterId);
      if (!position) continue;
      
      const node = this.createCharacterNode(character, position.x, position.y);
      nodes.push(node);
    }
    
    // 创建关系连线
    const characterIdMap = new Map(characters.map(c => [c.characterId, c]));
    const characterNameMap = new Map(characters.map(c => [c.name, c]));
    
    for (const character of characters) {
      for (const relationship of character.relationships) {
        // 尝试通过 ID 或名称找到目标人物
        let targetCharacter = characterIdMap.get(relationship.targetCharacterId);
        if (!targetCharacter) {
          targetCharacter = characterNameMap.get(relationship.targetName);
        }
        
        if (targetCharacter) {
          // 避免重复创建边（只从 ID 较小的一方创建）
          if (character.characterId < targetCharacter.characterId) {
            const edge = this.createRelationshipEdge(
              character.characterId,
              targetCharacter.characterId,
              relationship.relationshipType,
              relationship.description || relationship.customType
            );
            edges.push(edge);
          }
        }
      }
    }
    
    return { nodes, edges };
  }

  /**
   * 按角色类型分组人物
   */
  private groupCharactersByRole(characters: Character[]): Map<DbCharacterRole, Character[]> {
    const groups = new Map<DbCharacterRole, Character[]>();
    
    for (const character of characters) {
      const role = character.role;
      if (!groups.has(role)) {
        groups.set(role, []);
      }
      groups.get(role)!.push(character);
    }
    
    return groups;
  }

  /**
   * 计算人物节点位置
   * 使用分层布局：主角在中心，其他角色围绕
   */
  private calculateCharacterPositions(
    roleGroups: Map<DbCharacterRole, Character[]>
  ): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>();
    
    // 角色类型的布局顺序和位置
    const roleLayout: { role: DbCharacterRole; row: number }[] = [
      { role: 'protagonist', row: 0 },
      { role: 'antagonist', row: 1 },
      { role: 'supporting', row: 2 },
      { role: 'minor', row: 3 },
    ];
    
    for (const { role, row } of roleLayout) {
      const characters = roleGroups.get(role) || [];
      const startX = -(characters.length - 1) * LAYOUT_SPACING.horizontal / 2;
      
      characters.forEach((character, index) => {
        positions.set(character.characterId, {
          x: startX + index * LAYOUT_SPACING.horizontal,
          y: row * LAYOUT_SPACING.vertical,
        });
      });
    }
    
    return positions;
  }

  /**
   * 创建人物节点
   */
  private createCharacterNode(
    character: Character,
    x: number,
    y: number
  ): CanvasNode {
    // 构建节点文本内容
    const lines: string[] = [
      `## ${character.name}`,
    ];
    
    if (character.aliases && character.aliases.length > 0) {
      lines.push(`*别名: ${character.aliases.join(', ')}*`);
    }
    
    if (character.tags && character.tags.length > 0) {
      lines.push(`标签: ${character.tags.join(', ')}`);
    }
    
    if (character.aiDescription) {
      // 截取前100个字符作为简介
      const shortDesc = character.aiDescription.length > 100
        ? character.aiDescription.substring(0, 100) + '...'
        : character.aiDescription;
      lines.push('', shortDesc);
    }
    
    return {
      id: character.characterId,
      type: 'text',
      x,
      y,
      width: NODE_SIZE.character.width,
      height: NODE_SIZE.character.height,
      text: lines.join('\n'),
      color: CHARACTER_ROLE_COLORS[character.role],
    };
  }

  /**
   * 创建关系连线
   */
  private createRelationshipEdge(
    fromId: string,
    toId: string,
    relationshipType: string,
    label?: string
  ): CanvasEdge {
    return {
      id: `edge_${fromId}_${toId}`,
      fromNode: fromId,
      fromSide: 'right',
      toNode: toId,
      toSide: 'left',
      color: RELATIONSHIP_COLORS[relationshipType] || RELATIONSHIP_COLORS.custom,
      label: label || this.getRelationshipLabel(relationshipType),
    };
  }

  /**
   * 获取关系类型的中文标签
   */
  private getRelationshipLabel(type: string): string {
    const labels: Record<string, string> = {
      friend: '朋友',
      enemy: '敌人',
      family: '家人',
      lover: '恋人',
      rival: '对手',
      custom: '',
    };
    return labels[type] || type;
  }

  // ============ 故事发展 Canvas 生成 ============

  /**
   * 生成故事发展 Canvas
   * 
   * @param bookPath - 书籍文件夹路径
   * @returns Canvas 文件路径
   * 
   * Requirements: 7.3
   */
  async generateStoryCanvas(bookPath: string): Promise<string> {
    const normalizedPath = normalizePath(bookPath);
    const canvasPath = normalizePath(`${normalizedPath}/${DATABASE_FILES.STORY_CANVAS}`);
    
    // 获取故事单元数据
    const storyUnits = await this.bookDatabaseService.getStoryUnits(bookPath);
    
    if (storyUnits.length === 0) {
      // 创建空 Canvas
      const emptyCanvas: CanvasData = { nodes: [], edges: [] };
      await this.writeCanvasFile(canvasPath, emptyCanvas);
      return canvasPath;
    }
    
    // 生成 Canvas 数据
    const canvasData = this.buildStoryCanvasData(storyUnits);
    
    // 写入 Canvas 文件
    await this.writeCanvasFile(canvasPath, canvasData);
    
    return canvasPath;
  }

  /**
   * 构建故事发展 Canvas 数据
   * 
   * @param storyUnits - 故事单元列表
   * @returns Canvas 数据
   */
  private buildStoryCanvasData(storyUnits: StoryUnit[]): CanvasData {
    const nodes: CanvasNode[] = [];
    const edges: CanvasEdge[] = [];
    
    // 按故事线类型分组
    const lineGroups = this.groupStoryUnitsByLine(storyUnits);
    
    // 计算布局位置
    const positions = this.calculateStoryUnitPositions(lineGroups);
    
    // 创建故事单元节点
    for (const unit of storyUnits) {
      const position = positions.get(unit.unitId);
      if (!position) continue;
      
      const node = this.createStoryUnitNode(unit, position.x, position.y);
      nodes.push(node);
    }
    
    // 创建故事流程连线（按章节顺序）
    const sortedUnits = [...storyUnits].sort(
      (a, b) => a.chapterRange.start - b.chapterRange.start
    );
    
    // 按故事线类型分别创建连线
    for (const [lineType, units] of lineGroups) {
      const sortedLineUnits = units.sort(
        (a, b) => a.chapterRange.start - b.chapterRange.start
      );
      
      for (let i = 0; i < sortedLineUnits.length - 1; i++) {
        const current = sortedLineUnits[i];
        const next = sortedLineUnits[i + 1];
        
        const edge: CanvasEdge = {
          id: `edge_${current.unitId}_${next.unitId}`,
          fromNode: current.unitId,
          fromSide: 'right',
          toNode: next.unitId,
          toSide: 'left',
          color: STORYLINE_COLORS[lineType] || STORYLINE_COLORS.custom,
        };
        edges.push(edge);
      }
    }
    
    return { nodes, edges };
  }

  /**
   * 按故事线类型分组故事单元
   */
  private groupStoryUnitsByLine(storyUnits: StoryUnit[]): Map<string, StoryUnit[]> {
    const groups = new Map<string, StoryUnit[]>();
    
    for (const unit of storyUnits) {
      const lineType = unit.lineType;
      if (!groups.has(lineType)) {
        groups.set(lineType, []);
      }
      groups.get(lineType)!.push(unit);
    }
    
    return groups;
  }

  /**
   * 计算故事单元节点位置
   * 使用时间线布局：按章节顺序从左到右，不同故事线在不同行
   */
  private calculateStoryUnitPositions(
    lineGroups: Map<string, StoryUnit[]>
  ): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>();
    
    // 故事线类型的行号
    const lineRows: Record<string, number> = {
      main: 0,
      sub: 1,
      independent: 2,
      custom: 3,
    };
    
    for (const [lineType, units] of lineGroups) {
      const row = lineRows[lineType] ?? 3;
      
      // 按章节顺序排序
      const sortedUnits = [...units].sort(
        (a, b) => a.chapterRange.start - b.chapterRange.start
      );
      
      sortedUnits.forEach((unit, index) => {
        positions.set(unit.unitId, {
          x: index * LAYOUT_SPACING.horizontal,
          y: row * LAYOUT_SPACING.vertical,
        });
      });
    }
    
    return positions;
  }

  /**
   * 创建故事单元节点
   */
  private createStoryUnitNode(
    unit: StoryUnit,
    x: number,
    y: number
  ): CanvasNode {
    // 构建节点文本内容
    const lines: string[] = [
      `## ${unit.name}`,
      `章节: ${unit.chapterRange.start}-${unit.chapterRange.end}`,
    ];
    
    if (unit.categories && unit.categories.length > 0) {
      lines.push(`分类: ${unit.categories.join(', ')}`);
    }
    
    if (unit.aiAnalysis?.summary) {
      // 截取前80个字符作为摘要
      const shortSummary = unit.aiAnalysis.summary.length > 80
        ? unit.aiAnalysis.summary.substring(0, 80) + '...'
        : unit.aiAnalysis.summary;
      lines.push('', shortSummary);
    }
    
    return {
      id: unit.unitId,
      type: 'text',
      x,
      y,
      width: NODE_SIZE.storyUnit.width,
      height: NODE_SIZE.storyUnit.height,
      text: lines.join('\n'),
      color: STORYLINE_COLORS[unit.lineType] || STORYLINE_COLORS.custom,
    };
  }

  // ============ Canvas 更新 ============

  /**
   * 更新 Canvas（增量更新）
   * 
   * @param canvasPath - Canvas 文件路径
   * @param changes - 变更列表
   * 
   * Requirements: 7.4
   */
  async updateCanvas(canvasPath: string, changes: CanvasChange[]): Promise<void> {
    const normalizedPath = normalizePath(canvasPath);
    
    // 读取现有 Canvas 数据
    const canvasData = await this.parseCanvas(normalizedPath);
    
    // 应用变更
    for (const change of changes) {
      this.applyCanvasChange(canvasData, change);
    }
    
    // 写入更新后的 Canvas
    await this.writeCanvasFile(normalizedPath, canvasData);
  }

  /**
   * 应用单个 Canvas 变更
   */
  private applyCanvasChange(canvasData: CanvasData, change: CanvasChange): void {
    switch (change.type) {
      case 'add':
        if (change.data) {
          if (change.data.fromNode && change.data.toNode) {
            // 添加边
            canvasData.edges.push({
              id: change.id,
              fromNode: String(change.data.fromNode),
              fromSide: (change.data.fromSide as CanvasEdge['fromSide']) || 'right',
              toNode: String(change.data.toNode),
              toSide: (change.data.toSide as CanvasEdge['toSide']) || 'left',
              color: change.data.color as string,
              label: change.data.label as string,
            });
          } else {
            // 添加节点
            canvasData.nodes.push({
              id: change.id,
              type: (change.data.type as CanvasNodeType) || 'text',
              x: Number(change.data.x) || 0,
              y: Number(change.data.y) || 0,
              width: Number(change.data.width) || 200,
              height: Number(change.data.height) || 100,
              text: change.data.text as string,
              color: change.data.color as string,
            });
          }
        }
        break;
        
      case 'update':
        // 尝试更新节点
        const nodeIndex = canvasData.nodes.findIndex(n => n.id === change.id);
        if (nodeIndex !== -1 && change.data) {
          canvasData.nodes[nodeIndex] = {
            ...canvasData.nodes[nodeIndex],
            ...change.data,
          } as CanvasNode;
        }
        
        // 尝试更新边
        const edgeIndex = canvasData.edges.findIndex(e => e.id === change.id);
        if (edgeIndex !== -1 && change.data) {
          canvasData.edges[edgeIndex] = {
            ...canvasData.edges[edgeIndex],
            ...change.data,
          } as CanvasEdge;
        }
        break;
        
      case 'delete':
        // 删除节点
        canvasData.nodes = canvasData.nodes.filter(n => n.id !== change.id);
        // 删除边
        canvasData.edges = canvasData.edges.filter(e => e.id !== change.id);
        // 删除与该节点相关的边
        canvasData.edges = canvasData.edges.filter(
          e => e.fromNode !== change.id && e.toNode !== change.id
        );
        break;
    }
  }

  // ============ Canvas 解析 ============

  /**
   * 解析 Canvas 获取数据
   * 
   * @param canvasPath - Canvas 文件路径
   * @returns Canvas 数据
   */
  async parseCanvas(canvasPath: string): Promise<CanvasData> {
    const normalizedPath = normalizePath(canvasPath);
    
    try {
      const file = this.app.vault.getAbstractFileByPath(normalizedPath);
      
      if (!(file instanceof TFile)) {
        return { nodes: [], edges: [] };
      }
      
      const content = await this.app.vault.read(file);
      const data = JSON.parse(content) as CanvasData;
      
      return {
        nodes: data.nodes || [],
        edges: data.edges || [],
      };
    } catch {
      return { nodes: [], edges: [] };
    }
  }

  // ============ 文件操作 ============

  /**
   * 写入 Canvas 文件
   */
  private async writeCanvasFile(canvasPath: string, data: CanvasData): Promise<void> {
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
   * 从 Canvas 节点提取人物数据
   * 用于 Canvas → 数据库同步
   */
  extractCharacterFromNode(node: CanvasNode): Partial<Character> | null {
    if (node.type !== 'text' || !node.text) {
      return null;
    }
    
    // 解析节点文本
    const lines = node.text.split('\n');
    const nameMatch = lines[0]?.match(/^##\s*(.+)$/);
    
    if (!nameMatch) {
      return null;
    }
    
    return {
      characterId: node.id,
      name: nameMatch[1].trim(),
    };
  }

  /**
   * 从 Canvas 节点提取故事单元数据
   * 用于 Canvas → 数据库同步
   */
  extractStoryUnitFromNode(node: CanvasNode): Partial<StoryUnit> | null {
    if (node.type !== 'text' || !node.text) {
      return null;
    }
    
    // 解析节点文本
    const lines = node.text.split('\n');
    const nameMatch = lines[0]?.match(/^##\s*(.+)$/);
    const chapterMatch = lines.find(l => l.startsWith('章节:'))?.match(/章节:\s*(\d+)-(\d+)/);
    
    if (!nameMatch) {
      return null;
    }
    
    return {
      unitId: node.id,
      name: nameMatch[1].trim(),
      chapterRange: chapterMatch
        ? { start: parseInt(chapterMatch[1], 10), end: parseInt(chapterMatch[2], 10) }
        : undefined,
    };
  }

  /**
   * 从 Canvas 边提取关系数据
   * 用于 Canvas → 数据库同步
   */
  extractRelationshipFromEdge(edge: CanvasEdge): {
    fromId: string;
    toId: string;
    label?: string;
  } {
    return {
      fromId: edge.fromNode,
      toId: edge.toNode,
      label: edge.label,
    };
  }
}
