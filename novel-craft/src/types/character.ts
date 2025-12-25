/**
 * 人物关系图谱相关类型定义
 * 扩展现有人物数据，支持关系可视化和编辑
 */

/**
 * 人物角色枚举
 * 定义人物在故事中的基本角色类型
 */
export enum CharacterRole {
  /** 主角 */
  PROTAGONIST = 'protagonist',
  /** 队友/盟友 */
  ALLY = 'ally',
  /** 对手/反派 */
  ANTAGONIST = 'antagonist',
  /** 中立角色 */
  NEUTRAL = 'neutral',
  /** 配角 */
  SUPPORTING = 'supporting'
}

/**
 * 人物关系强度枚举
 * 表示人物关系的紧密程度
 */
export enum RelationshipIntensity {
  /** 高强度关系（核心关系） */
  HIGH = 'high',
  /** 中等强度关系（重要关系） */
  MEDIUM = 'medium',
  /** 低强度关系（一般关系） */
  LOW = 'low'
}

/**
 * 章节引用
 * 记录人物在特定章节的出现信息
 */
export interface ChapterReference {
  /** 章节索引 */
  chapterIndex: number;
  /** 章节标题 */
  chapterTitle: string;
  /** 出场描述（可选） */
  description?: string;
  /** 重要程度（1-10，10最重要） */
  importance: number;
}

/**
 * 人物信息接口（扩展现有数据）
 * 基于现有Character类型，增加时间线相关字段
 */
export interface Character {
  /** 人物唯一标识 */
  id: string;
  /** 所属书籍ID */
  bookId: string;
  /** 人物姓名 */
  name: string;
  /** 性别（可选） */
  gender?: string;
  /** 人物角色类型 */
  role: CharacterRole;
  /** 人物描述 */
  description?: string;
  /** 人物动机 */
  motivation?: string;
  /** 成长轨迹 */
  growthArc?: string;
  /** 人物关系列表 */
  relationships: CharacterRelationship[];
  /** 出场章节列表 */
  appearances: ChapterReference[];
  /** 参与的重要事件 */
  importantEvents: string[];
  /** 戏份权重（用于图谱节点大小计算） */
  screenTimeWeight: number;
  /** 创建时间 */
  createTime: Date;
  /** 更新时间 */
  updateTime: Date;
}

/**
 * 人物关系模型
 * 表示两个人物之间的关系
 */
export interface CharacterRelationship {
  /** 关系唯一标识 */
  id: string;
  /** 所属书籍ID */
  bookId: string;
  /** 人物A的ID */
  characterAId: string;
  /** 人物B的ID */
  characterBId: string;
  /** 关系类型（如"朋友"、"敌人"、"师父"等） */
  type: string;
  /** 关系描述 */
  description?: string;
  /** 涉及的故事单元ID列表 */
  storyUnitIds: string[];
  /** 关系强度 */
  intensity: RelationshipIntensity;
  /** 是否有临时关系变化 */
  isTemporaryChange?: boolean;
  /** 变化节点（章节+事件描述） */
  changeNode?: string;
  /** 关系是否为单向（默认false，表示双向） */
  isDirectional?: boolean;
  /** 创建时间 */
  createTime: Date;
  /** 更新时间 */
  updateTime: Date;
}

/**
 * 人物图谱节点
 * 用于可视化渲染的节点数据
 */
export interface CharacterGraphNode {
  /** 节点ID（对应人物ID） */
  id: string;
  /** 显示标签（人物姓名） */
  label: string;
  /** 节点大小（基于戏份权重计算） */
  size: number;
  /** 节点颜色（基于角色类型） */
  color: string;
  /** 节点形状 */
  shape: 'circle' | 'square' | 'triangle';
  /** 位置坐标 */
  position: {
    x: number;
    y: number;
  };
  /** 人物角色 */
  role: CharacterRole;
  /** 戏份权重 */
  weight: number;
}

/**
 * 人物图谱边
 * 用于可视化渲染的关系连线
 */
export interface CharacterGraphEdge {
  /** 边ID */
  id: string;
  /** 源节点ID */
  from: string;
  /** 目标节点ID */
  to: string;
  /** 关系类型标签 */
  label: string;
  /** 线条颜色 */
  color: string;
  /** 线条样式 */
  style: 'solid' | 'dashed' | 'dotted';
  /** 线条宽度 */
  width: number;
  /** 是否显示箭头（单向关系） */
  arrows?: 'to' | 'from' | 'middle';
  /** 关系强度 */
  intensity: RelationshipIntensity;
}

/**
 * 人物关系图谱渲染结果
 * 图谱渲染完成后的结果数据
 */
export interface CharacterGraphResult {
  /** 节点列表 */
  nodes: CharacterGraphNode[];
  /** 边列表 */
  edges: CharacterGraphEdge[];
  /** 图谱配置 */
  config: {
    /** 布局算法 */
    layout: 'force' | 'hierarchical' | 'circular';
    /** 节点间距 */
    nodeSpacing: number;
    /** 边长度 */
    edgeLength: number;
  };
  /** 统计信息 */
  stats: {
    /** 总人物数 */
    totalCharacters: number;
    /** 总关系数 */
    totalRelationships: number;
    /** 主要人物数（高权重） */
    majorCharacters: number;
  };
}

/**
 * 人物关系编辑操作
 * 定义可执行的关系编辑操作类型
 */
export interface RelationshipEditOperation {
  /** 操作类型 */
  type: 'create' | 'update' | 'delete';
  /** 关系ID（更新和删除时需要） */
  relationshipId?: string;
  /** 关系数据（创建和更新时需要） */
  relationshipData?: Partial<CharacterRelationship>;
}

/**
 * 人物图谱配置
 * 图谱显示和交互的配置选项
 */
export interface CharacterGraphConfig {
  /** 所属书籍ID */
  bookId: string;
  /** 布局算法 */
  layout: 'force' | 'hierarchical' | 'circular';
  /** 显示选项 */
  display: {
    /** 是否显示关系标签 */
    showRelationLabels: boolean;
    /** 是否显示人物描述 */
    showCharacterDescriptions: boolean;
    /** 节点大小缩放因子 */
    nodeSizeScale: number;
    /** 边宽度缩放因子 */
    edgeWidthScale: number;
  };
  /** 过滤选项 */
  filters: {
    /** 显示的角色类型 */
    roleTypes: CharacterRole[];
    /** 最小关系强度 */
    minIntensity: RelationshipIntensity;
    /** 是否显示临时关系变化 */
    showTemporaryChanges: boolean;
  };
  /** 创建时间 */
  createTime: Date;
  /** 更新时间 */
  updateTime: Date;
}