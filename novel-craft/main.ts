import { Plugin, TFile, TFolder, MarkdownView, normalizePath } from 'obsidian';
import { NovelCraftSettings, DEFAULT_SETTINGS, AnalysisResult, ParsedBook, TokenUsageRecord, TokenUsage } from './src/types';
import { NovelCraftSettingTab } from './src/ui/SettingTab';
import { SearchModal } from './src/ui/SearchModal';
import { AnalysisPanel } from './src/ui/AnalysisPanel';
import { AnalysisView, ANALYSIS_VIEW_TYPE } from './src/ui/AnalysisView';
import { ChatView, CHAT_VIEW_TYPE } from './src/ui/ChatView';
import { ChatPanel } from './src/ui/ChatPanel';
import { MainPanel, MAIN_PANEL_VIEW_TYPE } from './src/ui/MainPanel';
import { StoryUnitView, STORY_UNIT_VIEW_TYPE } from './src/ui/StoryUnitView';
import { TimelineView, TIMELINE_VIEW_TYPE } from './src/ui/TimelineView';
import { StoryUnitToolbar } from './src/ui/StoryUnitToolbar';
import { 
  showSuccess, 
  showWarning, 
  showInfo,
  showError,
  globalOperationState
} from './src/ui/NotificationUtils';
import { LLMService } from './src/services/LLMService';
import { SoNovelService } from './src/services/SoNovelService';
import { NoteGenerator } from './src/services/NoteGenerator';
import { ConversationManager } from './src/services/ConversationManager';
import { LibraryService } from './src/services/LibraryService';
import { ReadingProgressService } from './src/services/ReadingProgressService';
import { EpubConverterService } from './src/services/EpubConverterService';
import { isSupportedDocument, getSupportedExtensions } from './src/core/ParserFactory';
import { databaseService } from './src/services/DatabaseService';

/**
 * NovelCraft Plugin - 网络小说拆书分析插件
 * 
 * 功能：
 * - 小说搜索和下载（通过 SoNovel 服务）
 * - epub 文件解析和智能分析
 * - 交互式追问对话
 * - 结构化笔记生成
 * 
 * 需求: 全部
 */
export default class NovelCraftPlugin extends Plugin {
  settings: NovelCraftSettings;
  
  // 核心服务
  llmService: LLMService;
  soNovelService: SoNovelService;
  conversationManager: ConversationManager;
  libraryService: LibraryService;
  readingProgressService: ReadingProgressService;
  epubConverterService: EpubConverterService;
  
  // 故事单元工具栏
  storyUnitToolbar: StoryUnitToolbar;
  
  // 存储最近的分析结果，用于打开对话
  private lastAnalysisResult: AnalysisResult | null = null;
  private lastParsedBook: ParsedBook | null = null;
  private lastBookPath: string | null = null;
  private currentBookTitle: string | null = null;
  
  // 加载状态
  private isInitialized = false;

  async onload() {
    console.log('NovelCraft: 插件加载中...');
    
    try {
      // 加载设置
      await this.loadSettings();
      
      // 初始化所有服务
      await this.initializeServices();
      
      // 注册侧边栏视图
      this.registerView(
        MAIN_PANEL_VIEW_TYPE,
        (leaf) => {
          const panel = new MainPanel(
            leaf,
            this.settings,
            this.soNovelService,
            this.llmService,
            (path) => this.openAnalysisView(path),
            () => this.openChatPanel(),
            () => this.lastAnalysisResult !== null
          );
          panel.setEpubConverterService(this.epubConverterService);
          panel.setLibraryService(this.libraryService);
          return panel;
        }
      );
      
      // 注册分析视图
      this.registerView(
        ANALYSIS_VIEW_TYPE,
        (leaf) => new AnalysisView(leaf, this.settings, this.llmService)
      );
      
      // 注册对话视图
      this.registerView(
        CHAT_VIEW_TYPE,
        (leaf) => new ChatView(leaf, this.settings, this.llmService)
      );
      
      // 注册故事单元视图
      this.registerView(
        STORY_UNIT_VIEW_TYPE,
        (leaf) => new StoryUnitView(leaf)
      );
      
      // 注册时间线视图
      this.registerView(
        TIMELINE_VIEW_TYPE,
        (leaf) => new TimelineView(leaf)
      );
      
      // 注册命令
      this.registerCommands();
      
      // 注册右键菜单
      this.registerContextMenu();
      
      // 注册 LLM 服务请求事件（用于从其他视图获取 LLM 服务）
      this.registerEvent(
        this.app.workspace.on('novel-craft:request-llm-service' as any, (view: any) => {
          if (view && typeof view.setLLMService === 'function') {
            view.setLLMService(this.llmService);
          }
        })
      );
      
      // 添加设置标签页
      this.addSettingTab(new NovelCraftSettingTab(this.app, this));
      
      this.isInitialized = true;
      console.log('NovelCraft: 插件加载完成');
      showInfo('NovelCraft 插件已加载');
    } catch (error) {
      console.error('NovelCraft: 插件加载失败', error);
      showError('NovelCraft 插件加载失败', '请检查控制台日志获取详细信息');
    }
  }

  onunload() {
    console.log('NovelCraft: 插件卸载中...');
    
    // 清理服务资源
    this.cleanupServices();
    
    // 清理全局操作状态
    globalOperationState.clear();
    
    // 清理状态
    this.lastAnalysisResult = null;
    this.lastParsedBook = null;
    this.lastBookPath = null;
    this.isInitialized = false;
    
    console.log('NovelCraft: 插件卸载完成');
  }

  /**
   * 初始化所有服务
   */
  private async initializeServices(): Promise<void> {
    // 初始化 LLM 服务
    this.llmService = new LLMService(this.settings);
    this.llmService.setOnSettingsChange((providers, defaultId) => {
      this.settings.llmProviders = providers;
      this.settings.defaultProviderId = defaultId;
      this.saveSettings();
    });
    
    // 设置 Token 使用回调
    this.llmService.setOnTokenUsage((usage, providerId, model) => {
      this.recordTokenUsage(usage, providerId, model);
    });
    
    // 初始化 SoNovel 服务
    this.soNovelService = new SoNovelService(this.settings.sonovelUrl);
    
    // 初始化对话管理器
    this.conversationManager = new ConversationManager(this.app, this.llmService);
    
    // 初始化书库服务
    const outputPath = (this.settings as any).epubConversion?.outputPath || 'NovelCraft/books';
    this.libraryService = new LibraryService(this.app, outputPath);
    
    // 初始化阅读进度服务
    this.readingProgressService = new ReadingProgressService(this.app, this.libraryService, outputPath);
    this.readingProgressService.startWatching();
    
    // 初始化 EPUB 转换服务（传入 LibraryService）
    this.epubConverterService = new EpubConverterService(this.app, undefined, this.libraryService);
    
    // 初始化故事单元工具栏
    this.storyUnitToolbar = new StoryUnitToolbar(this.app, {
      getBookIdFromFile: async (filePath: string) => {
        return this.getBookIdFromFile(filePath);
      },
      llmService: this.llmService
    });
    this.storyUnitToolbar.registerEditorExtension();
    
    // 扫描现有书籍
    this.scanExistingBooks();
    
    // 检查 SoNovel 服务状态（非阻塞）
    this.checkSoNovelServiceHealth();
    
    // 首次使用时生成教学文档
    this.generateTutorialIfNeeded();
  }

  /**
   * 扫描现有书籍并导入到书库
   */
  private async scanExistingBooks(): Promise<void> {
    try {
      const count = await this.libraryService.scanAndImportExistingBooks();
      if (count > 0) {
        console.log(`NovelCraft: 已导入 ${count} 本现有书籍`);
      }
    } catch (error) {
      console.warn('NovelCraft: 扫描现有书籍失败', error);
    }
  }

  /**
   * 首次使用时生成教学文档
   */
  private async generateTutorialIfNeeded(): Promise<void> {
    // 检查是否已经生成过教学文档
    const tutorialGenerated = (this.settings as any).tutorialGenerated;
    if (tutorialGenerated) {
      return;
    }
    
    const tutorialPath = 'NovelCraft 使用指南.md';
    
    // 检查文件是否已存在
    const existingFile = this.app.vault.getAbstractFileByPath(tutorialPath);
    if (existingFile) {
      // 文件已存在，标记为已生成
      (this.settings as any).tutorialGenerated = true;
      await this.saveSettings();
      return;
    }
    
    try {
      // 教学文档内容
      const tutorialContent = this.getTutorialContent();
      
      // 创建文件
      await this.app.vault.create(tutorialPath, tutorialContent);
      
      // 标记为已生成
      (this.settings as any).tutorialGenerated = true;
      await this.saveSettings();
      
      console.log('NovelCraft: 教学文档已生成');
      showInfo('欢迎使用 NovelCraft！已生成使用指南文档');
      
      // 打开教学文档
      const file = this.app.vault.getAbstractFileByPath(tutorialPath);
      if (file instanceof TFile) {
        await this.app.workspace.openLinkText(tutorialPath, '', false);
      }
    } catch (error) {
      console.warn('NovelCraft: 生成教学文档失败', error);
    }
  }

  /**
   * 获取教学文档内容
   */
  private getTutorialContent(): string {
    return `# 📚 NovelCraft 使用指南

欢迎使用 NovelCraft！这是一款专为网文作者和爱好者设计的 Obsidian 插件，帮助你深度分析小说的写作技法、人物塑造、情节结构。

---

## 🚀 快速开始

### 1. 配置 LLM 服务

首先需要配置 AI 服务才能使用分析功能：

1. 打开 Obsidian 设置 → 第三方插件 → NovelCraft
2. 在「LLM 配置」区域添加你的 AI 服务：
   - **服务名称**：自定义名称（如 "DeepSeek"）
   - **API 地址**：
     - OpenAI: \`https://api.openai.com/v1\`
     - DeepSeek: \`https://api.deepseek.com\`
     - Claude: \`https://api.anthropic.com\`
   - **API Key**：你的 API 密钥
   - **模型**：如 \`gpt-4\`、\`deepseek-chat\` 等

### 2. 导入书籍

**手动创建书籍目录**

如果没有使用下载功能，需要手动创建目录结构：

1. 在 Vault 根目录创建 \`NovelCraft/books/\` 文件夹
2. 在 \`books/\` 下为每本书创建一个文件夹（如 \`NovelCraft/books/书名/\`）
3. 将章节文件（.md 格式）放入书籍文件夹中
4. 点击左侧边栏的 📚 图标打开主面板查看书籍

---

## 📖 核心功能

### 一、书籍分析

对整本书或指定章节进行 AI 分析：

1. 在主面板找到书籍，点击「分析」
2. 选择分析模式：
   - **快速模式**：故事梗概、核心人物、主要技法
   - **标准模式**：+ 情绪曲线、章节结构、伏笔分析
   - **深度模式**：+ 逐章拆解、写作复盘
3. 选择小说类型（都市、玄幻、仙侠等）
4. 设置章节范围
5. 点击「开始分析」

分析结果会自动生成笔记保存到 \`NovelCraft/notes/书名/\` 目录。

---

### 二、故事单元管理

将小说按情节单元划分，便于结构化分析。

#### 创建故事单元

**方法一：使用编辑器工具栏**
1. 打开任意章节文件
2. 顶部会显示故事单元工具栏
3. 选中文本后点击「标记起始」和「标记结束」
4. 点击「创建故事单元」

**方法二：使用侧边栏**
1. 点击右侧边栏的「故事单元管理」图标
2. 点击「➕ 新建」按钮
3. 填写标题、选择轨道、设置章节范围

#### 管理故事单元

- **轨道分组**：主线、支线、回忆等
- **内联编辑**：点击卡片展开直接编辑
- **关联人物**：选择参与的角色

---

### 三、AI 故事拆解 ⭐

这是 NovelCraft 的核心功能，使用「七步故事法」分析网文爽点结构。

#### 使用方法

1. 创建或选择一个故事单元
2. 点击展开卡片
3. 切换到「🤖 AI分析」标签页
4. 选择分析模板（默认：七步故事法）
5. 点击「🚀 开始分析」

#### 七步故事法

分析网文的爽点循环结构：

| 步骤 | 说明 | 示例 |
|------|------|------|
| 主角优势 | 隐藏实力、道具、潜力 | 隐藏金丹修为，持有上古炼器术 |
| 反派+信息差 | 反派及其对主角的错误认知 | 长老之子（筑基），误认主角炼气期 |
| 初次摩擦 | 主角与反派的初次冲突 | 手下挑衅→主角打脸→反派记恨 |
| 负面预期 | 周围人不看好主角 | 众人看衰，认为必败 |
| 高潮反杀 | 主角反杀反派 | 三次反转秒败反派 |
| 震惊反应 | 周围人的震惊 | 同门震惊→长老侧目→宗主召见 |
| 收获+升级 | 主角的收获和提升 | 夺宝物，入内门，阶层↑ |

#### 分析结果

- **精简表格**：关键词形式，可手动编辑
- **故事梗概**：50-100字情节概括
- **情绪折线**：读者情绪起伏
- **人物关系**：友方/中立/敌方分类
- **完整报告**：自动生成 MD 文档

---

### 四、基本信息

在故事单元的「📝 基本信息」标签页：

- **AI 分析摘要**：显示故事梗概、情绪折线、人物关系
- **基础设置**：标题、轨道、章节范围
- **人物关联**：选择参与的角色
- **备注**：添加你的阅读笔记和心得

---

## 💡 使用技巧

### 分析长篇小说

对于超过 50 章的长篇小说，建议：

1. **分批分析**：每次分析 30-50 章
2. **使用增量分析**：
   - 继续分析：从上次结束位置继续
   - 追加分析：自定义范围追加
3. **断点续传**：分析中断后可从断点恢复

### 故事单元划分建议

- 按「爽点循环」划分：一个完整的冲突-解决周期
- 按「情节弧线」划分：一个完整的小故事
- 按「章节数量」划分：每 5-10 章一个单元

### 提高分析质量

1. 选择正确的小说类型
2. 添加自定义提示词
3. 手动编辑和补充分析结果

---

## ⌨️ 快捷命令

使用 \`Ctrl/Cmd + P\` 打开命令面板，输入 "NovelCraft"：

| 命令 | 说明 |
|------|------|
| 打开主面板 | 打开侧边栏主面板 |
| 搜索小说 | 打开搜索弹窗 |
| 分析当前书籍 | 分析当前打开的文档 |
| 打开对话 | 打开追问对话 |

---

## 📁 文件结构

\`\`\`
NovelCraft/
├── books/                    # 导入的书籍
│   ├── 00-书库总览.md         # 书库总览
│   └── 书名/
│       ├── _book_meta.md     # 书籍元数据
│       ├── 书名-管理.md       # 书籍管理文件
│       ├── chapters/         # 章节文件
│       └── 分析报告/          # AI分析报告
└── notes/                    # 分析笔记
    └── 书名/
        ├── 00-概览.md
        ├── 01-人物图谱.md
        ├── 02-情节分析.md
        └── 03-写作技法.md
\`\`\`

---

## ❓ 常见问题

### Q: 分析失败怎么办？

1. 检查 LLM 服务配置是否正确
2. 检查 API Key 是否有效
3. 尝试减少分析章节数量
4. 查看控制台错误信息

### Q: 如何更新分析结果？

在 AI 分析标签页点击「🔄 重新分析」按钮。

### Q: 分析结果可以编辑吗？

可以！表格中的每个单元格都可以直接编辑，失去焦点时自动保存。

### Q: 如何导出分析结果？

点击「📄 导出笔记」按钮，会生成 Markdown 文件。

---

> 💡 **提示**：这个文档可以删除，不会影响插件功能。

---

*NovelCraft v1.4.2 - 网络小说拆书分析插件*
`;
  }

  /**
   * 从文件路径获取书籍ID
   * 只要在 NovelCraft/books 目录下就会显示工具栏
   * 如果数据库中没有记录会自动创建
   */
  private async getBookIdFromFile(filePath: string): Promise<string | null> {
    // 规范化文件路径
    const normalizedFilePath = normalizePath(filePath);
    
    // 检查是否在 books 目录下
    const outputPath = (this.settings as any).epubConversion?.outputPath || 'NovelCraft/books';
    const isInBooksPath = normalizedFilePath.includes('/books/') || 
                          normalizedFilePath.toLowerCase().includes('novelcraft/books/');
    
    if (!isInBooksPath) {
      return null;
    }
    
    // 提取书籍文件夹路径
    const parts = normalizedFilePath.split('/');
    const booksIndex = parts.findIndex(p => p === 'books' || p.toLowerCase() === 'books');
    if (booksIndex === -1 || booksIndex >= parts.length - 1) {
      return null;
    }
    
    const bookFolderName = parts[booksIndex + 1];
    const bookFolderPath = normalizePath(parts.slice(0, booksIndex + 2).join('/'));
    
    // 先尝试从数据库查找
    const books = await databaseService.books.getAll();
    let book = books.find(b => {
      const dbPath = normalizePath(b.file_path);
      return dbPath === bookFolderPath || b.title === bookFolderName;
    });
    
    // 如果找到了，直接返回
    if (book) {
      return book.id;
    }
    
    // 如果数据库中没有，自动创建书籍记录
    console.log('NovelCraft: 自动创建书籍记录:', bookFolderPath);
    try {
      const bookId = await databaseService.books.create({
        title: bookFolderName,
        author: '',
        file_path: bookFolderPath,
        import_time: Date.now(),
        total_word_count: 0,
        chapter_count: 0
      });
      console.log('NovelCraft: 书籍记录创建成功:', bookId);
      return bookId;
    } catch (error) {
      console.warn('NovelCraft: 创建书籍记录失败:', error);
      // 即使创建失败，也返回一个临时ID让工具栏显示
      // 使用文件夹名作为临时ID
      return `temp_${bookFolderName}`;
    }
  }

  /**
   * 检查是否是 NovelCraft 章节文件
   */
  private isNovelCraftChapter(path: string): boolean {
    const outputPath = (this.settings as any).epubConversion?.outputPath || 'NovelCraft/books';
    const isInBookPath = path.includes(outputPath) || 
                         path.includes('NovelCraft/books/') ||
                         path.includes('novelcraft/books/');
    return isInBookPath && path.endsWith('.md') && !path.includes('_index') && !path.startsWith('_');
  }

  /**
   * 从路径提取书籍路径
   */
  private getBookPathFromFile(filePath: string): string | null {
    const patterns = [
      /(.*NovelCraft\/books\/[^/]+)\//i,
      /(.*novelcraft\/books\/[^/]+)\//i,
      /(.*books\/[^/]+)\//i
    ];
    
    for (const pattern of patterns) {
      const match = filePath.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  /**
   * 记录 Token 使用
   */
  private recordTokenUsage(usage: TokenUsage, providerId: string, model: string): void {
    const record: TokenUsageRecord = {
      timestamp: Date.now(),
      stage: 'analysis',
      bookTitle: this.currentBookTitle || undefined,
      providerId,
      model,
      usage
    };
    
    if (!this.settings.tokenUsageRecords) {
      this.settings.tokenUsageRecords = [];
    }
    
    this.settings.tokenUsageRecords.push(record);
    
    // 异步保存，不阻塞
    this.saveSettings().catch(err => {
      console.warn('NovelCraft: 保存 Token 记录失败', err);
    });
  }
  
  /**
   * 检查 SoNovel 服务健康状态
   */
  private async checkSoNovelServiceHealth(): Promise<void> {
    try {
      const isHealthy = await this.soNovelService.checkHealth();
      if (!isHealthy) {
        console.warn('NovelCraft: SoNovel 服务不可用');
        // 不显示警告，因为用户可能不需要下载功能
      }
    } catch (error) {
      console.warn('NovelCraft: 检查 SoNovel 服务状态失败', error);
    }
  }

  /**
   * 清理服务资源
   */
  private cleanupServices(): void {
    if (this.llmService) {
      this.llmService.destroy();
    }
    
    if (this.soNovelService) {
      this.soNovelService.destroy();
    }
    
    if (this.conversationManager) {
      this.conversationManager.clear();
    }
    
    if (this.readingProgressService) {
      this.readingProgressService.destroy();
    }
    
    if (this.storyUnitToolbar) {
      this.storyUnitToolbar.destroy();
    }
  }

  /**
   * 注册所有命令
   */
  private registerCommands(): void {
    // 注册命令: 打开主面板
    this.addCommand({
      id: 'open-main-panel',
      name: '打开主面板',
      callback: () => this.activateMainPanel()
    });

    // 注册命令: 搜索小说
    this.addCommand({
      id: 'search-novel',
      name: '搜索小说',
      callback: () => this.openSearchModal()
    });

    // 注册命令: 分析当前书籍
    this.addCommand({
      id: 'analyze-current-book',
      name: '分析当前书籍',
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        const isEpub = activeFile && activeFile.extension === 'epub';
        
        if (checking) {
          return !!isEpub;
        }
        
        if (activeFile && isEpub) {
          this.openAnalysisView(activeFile.path);
        }
        return true;
      }
    });

    // 注册命令: 打开对话（始终可用，可在视图内选择已有分析）
    this.addCommand({
      id: 'open-chat',
      name: '打开对话',
      callback: () => this.openChatPanel()
    });

    // 注册命令: 打开故事单元管理面板
    this.addCommand({
      id: 'open-story-unit-panel',
      name: '打开故事单元管理',
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        const isChapter = activeFile && this.isNovelCraftChapter(activeFile.path);
        
        if (checking) {
          return !!isChapter;
        }
        
        if (activeFile && isChapter) {
          this.openStoryUnitPanel(activeFile.path);
        }
        return true;
      }
    });

    // 注册命令: 刷新书库
    this.addCommand({
      id: 'refresh-library',
      name: '刷新书库',
      callback: async () => {
        try {
          await this.libraryService.updateLibraryIndex();
          showSuccess('书库已刷新');
        } catch (error) {
          showError('刷新书库失败', error instanceof Error ? error.message : '未知错误');
        }
      }
    });

    // 注册命令: 打开时间线视图
    this.addCommand({
      id: 'open-timeline-view',
      name: '打开故事时间线',
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        const isChapter = activeFile && this.isNovelCraftChapter(activeFile.path);
        
        if (checking) {
          return !!isChapter;
        }
        
        if (activeFile && isChapter) {
          this.openTimelineView(activeFile.path);
        }
        return true;
      }
    });

    // 添加 ribbon 图标
    this.addRibbonIcon('book-open', 'NovelCraft', () => {
      this.activateMainPanel();
    });
  }

  /**
   * 打开故事单元管理面板（在右侧边栏）
   */
  private async openStoryUnitPanel(filePath: string): Promise<void> {
    const bookId = await this.getBookIdFromFile(filePath);
    if (!bookId) {
      showWarning('无法识别书籍');
      return;
    }
    
    const { workspace } = this.app;
    
    // 查找或创建故事单元视图
    let leaf = workspace.getLeavesOfType(STORY_UNIT_VIEW_TYPE)[0];
    
    if (!leaf) {
      // 在右侧创建新的叶子
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({
          type: STORY_UNIT_VIEW_TYPE,
          active: true
        });
        leaf = rightLeaf;
      }
    }
    
    if (leaf) {
      workspace.revealLeaf(leaf);
      
      // 设置当前书籍和LLM服务
      const view = leaf.view as StoryUnitView;
      if (view && typeof view.setBook === 'function') {
        // 设置LLM服务（用于AI分析）
        if (typeof view.setLLMService === 'function') {
          view.setLLMService(this.llmService);
        }
        await view.setBook(bookId);
      }
    }
  }

  /**
   * 打开时间线视图（在底部面板）
   */
  private async openTimelineView(filePath: string): Promise<void> {
    const bookId = await this.getBookIdFromFile(filePath);
    if (!bookId) {
      showWarning('无法识别书籍');
      return;
    }
    
    const { workspace } = this.app;
    
    // 查找或创建时间线视图
    let leaf = workspace.getLeavesOfType(TIMELINE_VIEW_TYPE)[0];
    
    if (!leaf) {
      // 在底部创建新的叶子（类似剪辑软件的时间线）
      const mostRecentLeaf = workspace.getMostRecentLeaf();
      if (mostRecentLeaf) {
        leaf = workspace.createLeafBySplit(mostRecentLeaf, 'horizontal', true);
        if (leaf) {
          await leaf.setViewState({
            type: TIMELINE_VIEW_TYPE,
            active: true
          });
        }
      }
    }
    
    if (leaf) {
      workspace.revealLeaf(leaf);
      
      // 设置当前书籍
      const view = leaf.view as TimelineView;
      if (view && typeof view.setBook === 'function') {
        await view.setBook(bookId);
      }
    }
  }

  /**
   * 激活主面板
   */
  async activateMainPanel(): Promise<void> {
    const { workspace } = this.app;
    
    let leaf = workspace.getLeavesOfType(MAIN_PANEL_VIEW_TYPE)[0];
    
    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({
          type: MAIN_PANEL_VIEW_TYPE,
          active: true
        });
        leaf = rightLeaf;
      }
    }
    
    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  /**
   * 注册右键菜单
   */
  private registerContextMenu(): void {
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFile && isSupportedDocument(file.name)) {
          menu.addItem((item) => {
            item
              .setTitle('使用 NovelCraft 分析')
              .setIcon('book-open')
              .onClick(() => {
                this.openAnalysisView(file.path);
              });
          });
        }
      })
    );
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    
    // 同步更新服务配置
    if (this.llmService) {
      this.llmService.loadFromSettings(this.settings);
    }
    
    if (this.soNovelService) {
      this.soNovelService.setBaseUrl(this.settings.sonovelUrl);
    }
    
    // 更新书库和阅读进度服务的输出路径
    const outputPath = (this.settings as any).epubConversion?.outputPath;
    if (outputPath) {
      if (this.libraryService) {
        this.libraryService.setOutputPath(outputPath);
      }
      if (this.readingProgressService) {
        this.readingProgressService.setOutputPath(outputPath);
      }
    }
  }

  /**
   * 打开搜索弹窗
   */
  private openSearchModal(): void {
    if (!this.isInitialized) {
      showWarning('插件正在初始化，请稍候...');
      return;
    }
    
    new SearchModal(this.app, this.settings, (filePath) => {
      showSuccess(`书籍已下载到: ${filePath}`);
    }).open();
  }

  /**
   * 打开分析视图（侧边栏）
   */
  private async openAnalysisView(epubPath: string): Promise<void> {
    if (!this.isInitialized) {
      showWarning('插件正在初始化，请稍候...');
      return;
    }
    
    // 检查 LLM 配置
    if (!this.llmService.getDefaultProvider()) {
      showWarning('请先在设置中配置 LLM 服务');
      return;
    }

    const { workspace } = this.app;
    
    // 查找或创建分析视图
    let leaf = workspace.getLeavesOfType(ANALYSIS_VIEW_TYPE)[0];
    
    if (!leaf) {
      // 在右侧创建新的叶子
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({
          type: ANALYSIS_VIEW_TYPE,
          active: true
        });
        leaf = rightLeaf;
      }
    }
    
    if (leaf) {
      workspace.revealLeaf(leaf);
      
      // 设置要分析的书籍
      const view = leaf.view as AnalysisView;
      await view.setBook(epubPath, async (result: AnalysisResult, book: ParsedBook) => {
        // 分析完成回调
        this.lastAnalysisResult = result;
        this.lastParsedBook = book;
        this.lastBookPath = epubPath;
        this.currentBookTitle = book.metadata.title;
        
        // 更新主面板的对话按钮状态
        this.updateMainPanelChatButton();
        
        showInfo('分析完成！点击主面板的"打开对话"按钮进行追问');
      });
    }
  }

  /**
   * 更新主面板的对话按钮状态
   */
  private updateMainPanelChatButton(): void {
    const leaves = this.app.workspace.getLeavesOfType(MAIN_PANEL_VIEW_TYPE);
    for (const leaf of leaves) {
      const view = leaf.view as MainPanel;
      if (view && typeof view.updateChatButtonState === 'function') {
        view.updateChatButtonState();
      }
    }
  }

  /**
   * 打开分析面板（弹窗模式，保留作为备用）
   */
  private openAnalysisPanel(epubPath: string): void {
    if (!this.isInitialized) {
      showWarning('插件正在初始化，请稍候...');
      return;
    }
    
    // 检查 LLM 配置
    if (!this.llmService.getDefaultProvider()) {
      showWarning('请先在设置中配置 LLM 服务');
      return;
    }

    const panel = new AnalysisPanel(
      this.app,
      this.settings,
      epubPath,
      this.llmService,
      async (result: AnalysisResult, book: ParsedBook) => {
        // 分析完成回调
        this.lastAnalysisResult = result;
        this.lastParsedBook = book;
        this.lastBookPath = epubPath;
        this.currentBookTitle = book.metadata.title;

        // 生成笔记
        await this.generateAnalysisNotes(book, result);

        // 提示用户
        showInfo('分析完成！使用命令 "NovelCraft: 打开对话" 进行追问');
      }
    );
    panel.open();
  }

  /**
   * 生成分析笔记
   */
  private async generateAnalysisNotes(book: ParsedBook, result: AnalysisResult): Promise<void> {
    const operationId = `generate-notes-${Date.now()}`;
    globalOperationState.start(operationId, '正在生成分析笔记...');
    
    try {
      const noteGenerator = new NoteGenerator({ mode: this.settings.defaultAnalysisMode });
      const createFile = async (path: string, content: string) => {
        await this.ensureDirectoryExists(path);
        const existingFile = this.app.vault.getAbstractFileByPath(path);
        if (existingFile instanceof TFile) {
          await this.app.vault.modify(existingFile, content);
        } else {
          await this.app.vault.create(path, content);
        }
      };
      
      const notePaths = await noteGenerator.generateNotes(
        book, 
        result, 
        this.settings.notesPath, 
        createFile
      );
      
      globalOperationState.complete(operationId);
      showSuccess(`已生成 ${notePaths.length} 个分析笔记`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      globalOperationState.fail(operationId, errorMessage);
      console.error('NovelCraft: 生成笔记失败', error);
      showWarning('生成笔记失败，但分析结果已保存');
    }
  }

  /**
   * 确保目录存在
   */
  private async ensureDirectoryExists(filePath: string): Promise<void> {
    const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
    if (!dirPath) return;
    
    const parts = dirPath.split('/').filter(p => p);
    let currentPath = '';
    
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const folder = this.app.vault.getAbstractFileByPath(currentPath);
      
      if (!folder) {
        await this.app.vault.createFolder(currentPath);
      } else if (!(folder instanceof TFolder)) {
        throw new Error(`路径 "${currentPath}" 已存在但不是文件夹`);
      }
    }
  }

  /**
   * 打开对话面板（侧边栏视图）
   * 可以直接打开，在视图内选择已有的分析结果
   */
  private async openChatPanel(): Promise<void> {
    if (!this.isInitialized) {
      showWarning('插件正在初始化，请稍候...');
      return;
    }

    const { workspace } = this.app;
    
    // 查找或创建对话视图
    let leaf = workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0];
    
    if (!leaf) {
      // 在右侧创建新的叶子
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({
          type: CHAT_VIEW_TYPE,
          active: true
        });
        leaf = rightLeaf;
      }
    }
    
    if (leaf) {
      workspace.revealLeaf(leaf);
      
      // 如果有刚完成的分析结果，直接设置
      if (this.lastAnalysisResult && this.lastBookPath) {
        const view = leaf.view as ChatView;
        view.setAnalysisResult(
          this.lastAnalysisResult,
          this.lastBookPath,
          this.lastParsedBook || undefined
        );
      }
      // 否则视图会显示已有分析结果的选择列表
    }
  }

  /**
   * 获取最近的分析结果（供外部使用）
   */
  getLastAnalysisResult(): AnalysisResult | null {
    return this.lastAnalysisResult;
  }

  /**
   * 获取最近解析的书籍（供外部使用）
   */
  getLastParsedBook(): ParsedBook | null {
    return this.lastParsedBook;
  }

  /**
   * 检查插件是否已初始化
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}
