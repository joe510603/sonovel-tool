/**
 * 时间线可视化相关类型定义
 * 包含轨道、故事单元、关联关系等核心数据模型
 */

/**
 * 轨道模型
 * 用于组织和展示故事单元的容器
 */
export interface Track {
  /** 轨道唯一标识 */
  id: string;
  /** 所属书籍ID */
  bookId: string;
  /** 轨道类型：主线或支线 */
  type: 'main' | 'side';
  /** 轨道名称（支线必填，主线可选） */
  name: string;
  /** 轨道颜色（hex格式，默认自动生成） */
  color: string;
  /** 显示顺序（数值越小越靠上，主线固定为0） */
  order: number;
  /** 创建时间 */
  createTime: Date;
  /** 更新时间 */
  updateTime: Date;
}

/**
 * 时间位置模型
 * 定义故事单元在时间线上的位置信息
 */
export interface TimePosition {
  /** 时间线起始点（章节序号，从1开始） */
  start: number;
  /** 时长（章节跨度，最小为1） */
  duration: number;
  /** 是否为过去事件（回忆/闪回等） */
  isPast: boolean;
}

/**
 * 关联类型枚举
 * 定义故事单元之间的逻辑关系类型
 */
export enum RelationType {
  /** 因果关系 - A导致B */
  CAUSAL = 'causal',
  /** 铺垫关系 - A为B做铺垫 */
  FORESHADOW = 'foreshadow',
  /** 对比关系 - A与B形成对比 */
  CONTRAST = 'contrast',
  /** 并行关系 - A与B同时发生 */
  PARALLEL = 'parallel',
  /** 包含关系 - A包含B */
  INCLUDE = 'include',
  /** 自定义关系 - 用户定义的特殊关系 */
  CUSTOM = 'custom'
}

/**
 * 关联关系模型
 * 表示故事单元之间的逻辑关联
 */
export interface Relation {
  /** 关联关系唯一标识 */
  id: string;
  /** 目标故事单元ID */
  targetUnitId: string;
  /** 关联类型 */
  type: RelationType;
  /** 自定义标签（type为custom时必填） */
  customLabel?: string;
  /** 关联描述（可选的详细说明） */
  description?: string;
  /** 关联线颜色（hex格式） */
  lineColor: string;
  /** 创建时间 */
  createTime: Date;
}

/**
 * 故事单元模型
 * 时间线可视化的核心数据单元
 */
export interface StoryUnit {
  /** 故事单元唯一标识 */
  id: string;
  /** 所属书籍ID */
  bookId: string;
  /** 故事单元标题 */
  title: string;
  /** 章节范围 [起始章节, 结束章节] */
  chapterRange: [number, number];
  /** 关联轨道ID */
  trackId: string;
  /** 时间线位置信息 */
  timePosition: TimePosition;
  /** AI分析结果 */
  aiAnalysis: {
    /** 拆解模板名称（如"七步故事法"） */
    method: string;
    /** 拆解结果内容（键值对形式） */
    content: Record<string, string>;
    /** 手动编辑标记（标记哪些字段被手动修改） */
    isEdited: Record<string, boolean>;
  };
  /** 涉及人物ID列表 */
  characters: string[];
  /** 关联的其他故事单元 */
  relatedUnits: Relation[];
  /** 创建时间 */
  createTime: Date;
  /** 更新时间 */
  updateTime: Date;
}

/**
 * 时间线配置模型
 * 存储整个时间线的配置信息
 */
export interface TimelineConfig {
  /** 所属书籍ID */
  bookId: string;
  /** 轨道配置列表 */
  tracks: Track[];
  /** 是否启用过去事件区域 */
  pastEventArea: boolean;
  /** 时间线缩放级别 */
  zoomLevel: number;
  /** 视图配置 */
  viewConfig: {
    /** 章节单位宽度（像素） */
    chapterWidth: number;
    /** 轨道高度（像素） */
    trackHeight: number;
    /** 轨道间距（像素） */
    trackSpacing: number;
  };
  /** 创建时间 */
  createTime: Date;
  /** 更新时间 */
  updateTime: Date;
}

/**
 * 故事单元创建配置
 * 用于创建新故事单元时的参数
 */
export interface StoryUnitConfig {
  /** 故事单元标题 */
  title: string;
  /** 章节范围 */
  chapterRange: [number, number];
  /** 轨道类型 */
  trackType: 'main' | 'side';
  /** 轨道名称（支线必填） */
  trackName?: string;
  /** 是否为过去事件 */
  isPast: boolean;
  /** AI分析模板 */
  analysisTemplate?: string;
}

/**
 * AI分析模板
 * 定义AI分析的结构和提示词
 */
export interface AnalysisTemplate {
  /** 模板唯一标识 */
  id: string;
  /** 模板名称 */
  name: string;
  /** 模板描述 */
  description: string;
  /** 分析步骤定义 */
  steps: {
    /** 步骤名称 */
    name: string;
    /** 步骤提示词 */
    prompt: string;
    /** 是否必填 */
    required: boolean;
  }[];
  /** 是否为系统内置模板 */
  isBuiltIn: boolean;
}

/**
 * AI分析结果
 * AI分析完成后的结构化结果
 */
export interface AnalysisResult {
  /** 分析ID */
  id: string;
  /** 故事单元ID */
  storyUnitId: string;
  /** 使用的模板ID */
  templateId: string;
  /** 分析结果内容 */
  content: Record<string, string>;
  /** 分析状态 */
  status: 'pending' | 'analyzing' | 'completed' | 'failed';
  /** 错误信息（如果失败） */
  error?: string;
  /** 分析开始时间 */
  startTime: Date;
  /** 分析完成时间 */
  completeTime?: Date;
}

/**
 * 时间线渲染结果
 * 时间线渲染完成后的结果数据
 */
export interface TimelineRenderResult {
  /** 渲染的故事单元列表 */
  storyUnits: StoryUnit[];
  /** 轨道信息 */
  tracks: Track[];
  /** 关联关系列表 */
  relations: Relation[];
  /** 渲染配置 */
  config: TimelineConfig;
  /** 渲染统计信息 */
  stats: {
    /** 总故事单元数 */
    totalUnits: number;
    /** 总轨道数 */
    totalTracks: number;
    /** 总关联关系数 */
    totalRelations: number;
  };
}

/**
 * 导出结果
 * 时间线导出操作的结果
 */
export interface ExportResult {
  /** 导出格式 */
  format: 'svg' | 'png';
  /** 导出文件路径 */
  filePath: string;
  /** 导出文件大小（字节） */
  fileSize: number;
  /** 导出时间 */
  exportTime: Date;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（如果失败） */
  error?: string;
}

/**
 * 线条坐标
 * 用于SVG关联线绘制的坐标信息
 */
export interface LineCoords {
  /** 起点X坐标 */
  x1: number;
  /** 起点Y坐标 */
  y1: number;
  /** 终点X坐标 */
  x2: number;
  /** 终点Y坐标 */
  y2: number;
}