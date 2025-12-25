import { Plugin, TFile, MarkdownView } from 'obsidian';
import { NovelCraftSettings, DEFAULT_SETTINGS, AnalysisResult, ParsedBook, TokenUsageRecord, TokenUsage } from './src/types';
import { NovelCraftSettingTab } from './src/ui/SettingTab';
import { SearchModal } from './src/ui/SearchModal';
import { AnalysisView, ANALYSIS_VIEW_TYPE } from './src/ui/AnalysisView';
import { ChatView, CHAT_VIEW_TYPE } from './src/ui/ChatView';
import { MainPanel, MAIN_PANEL_VIEW_TYPE } from './src/ui/MainPanel';
import { 
  showSuccess, 
  showWarning, 
  showInfo,
  showError,
  globalOperationState
} from './src/ui/NotificationUtils';
import { LLMService } from './src/services/LLMService';
import { SoNovelService } from './src/services/SoNovelService';
import { ConversationManager } from './src/services/ConversationManager';
import { LibraryService } from './src/services/LibraryService';
import { ReadingProgressService } from './src/services/ReadingProgressService';
import { EpubConverterService } from './src/services/EpubConverterService';
import { isSupportedDocument } from './src/core/ParserFactory';

// 统一标记系统相关导入
import { UnifiedMarkRepository } from './src/services/UnifiedMarkRepository';
import { UnifiedMarkingService } from './src/services/UnifiedMarkingService';
import { UnifiedMarkingPanel, UNIFIED_MARKING_PANEL_VIEW_TYPE } from './src/ui/UnifiedMarkingPanel';
import { MarkingToolbar } from './src/ui/MarkingToolbar';
import { StoryUnitAnalysisService } from './src/services/StoryUnitAnalysisService';
import { GlobalMaterialLibraryService } from './src/services/GlobalMaterialLibraryService';
import { GlobalMaterialPanel, GLOBAL_MATERIAL_PANEL_VIEW_TYPE } from './src/ui/GlobalMaterialPanel';

// 故事数据库系统相关导入
import { BookDatabaseService } from './src/services/BookDatabaseService';
import { PreciseMarkingService } from './src/services/PreciseMarkingService';
import { TimelineVisualizationService } from './src/services/TimelineVisualizationService';
import { CanvasGeneratorService } from './src/services/CanvasGeneratorService';
import { DataSyncService } from './src/services/DataSyncService';
import { StoryUnitModal } from './src/ui/StoryUnitModal';
import { DatabaseFieldManager } from './src/ui/DatabaseFieldManager';
import { DatabaseTemplateManager } from './src/ui/DatabaseTemplateManager';
import { CategoryManager } from './src/ui/CategoryManager';

// 错误处理服务
import { ErrorHandlingIntegrationService } from './src/services/ErrorHandlingIntegrationService';

/**
 * NovelCraft Plugin - 网络小说拆书分析插件
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
  
  // 统一标记系统服务
  unifiedMarkRepository: UnifiedMarkRepository;
  unifiedMarkingService: UnifiedMarkingService;
  markingToolbar: MarkingToolbar;
  storyUnitAnalysisService: StoryUnitAnalysisService;
  globalMaterialLibrary: GlobalMaterialLibraryService;
  
  // 故事数据库系统服务
  bookDatabaseService: BookDatabaseService;
  preciseMarkingService: PreciseMarkingService;
  timelineVisualizationService: TimelineVisualizationService;
  canvasGeneratorService: CanvasGeneratorService;
  dataSyncService: DataSyncService;
  
  // 错误处理服务
  errorHandlingIntegration: ErrorHandlingIntegrationService;
  
  // 状态
  private lastAnalysisResult: AnalysisResult | null = null;
  private lastParsedBook: ParsedBook | null = null;
  private lastBookPath: string | null = null;
  private currentBookTitle: string | null = null;
  private isInitialized = false;

  async onload() {
    console.log('NovelCraft: 插件加载中...');
    
    try {
      await this.loadSettings();
      await this.initializeServices();
      
      // 注册主面板视图
      this.registerView(
        MAIN_PANEL_VIEW_TYPE,
        (leaf) => {
          const panel = new MainPanel(
            leaf, this.settings, this.soNovelService, this.llmService,
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
      this.registerView(ANALYSIS_VIEW_TYPE, (leaf) => {
        const view = new AnalysisView(leaf, this.settings, this.llmService);
        view.setDataSyncService(this.dataSyncService);
        view.setBookDatabaseService(this.bookDatabaseService);
        return view;
      });
      
      // 注册对话视图
      this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this.settings, this.llmService));
      
      // 注册统一标记面板
      this.registerView(
        UNIFIED_MARKING_PANEL_VIEW_TYPE,
        (leaf) => {
          const panel = new UnifiedMarkingPanel(
            leaf, 
            this.unifiedMarkingService, 
            this.unifiedMarkRepository, 
            this.libraryService,
            this.bookDatabaseService,
            this.timelineVisualizationService
          );
          return panel;
        }
      );
      
      // 注册全局素材库面板
      this.registerView(
        GLOBAL_MATERIAL_PANEL_VIEW_TYPE,
        (leaf) => new GlobalMaterialPanel(leaf, this.globalMaterialLibrary)
      );
      
      this.registerCommands();
      this.registerContextMenu();
      this.addSettingTab(new NovelCraftSettingTab(this.app, this));
      
      this.isInitialized = true;
      console.log('NovelCraft: 插件加载完成');
      showInfo('NovelCraft 插件已加载');
    } catch (error) {
      console.error('NovelCraft: 插件加载失败', error);
      showError('NovelCraft 插件加载失败', '请检查控制台日志');
    }
  }

  onunload() {
    console.log('NovelCraft: 插件卸载中...');
    this.cleanupServices();
    this.cleanupEditorButtons(); // 清理编辑器按钮
    globalOperationState.clear();
    this.lastAnalysisResult = null;
    this.lastParsedBook = null;
    this.lastBookPath = null;
    this.isInitialized = false;
    console.log('NovelCraft: 插件卸载完成');
  }

  private async initializeServices(): Promise<void> {
    // 错误处理服务
    this.errorHandlingIntegration = new ErrorHandlingIntegrationService(this.app);
    
    // LLM 服务
    this.llmService = new LLMService(this.settings);
    this.llmService.setOnSettingsChange((providers, defaultId) => {
      this.settings.llmProviders = providers;
      this.settings.defaultProviderId = defaultId;
      this.saveSettings();
    });
    this.llmService.setOnTokenUsage((usage, providerId, model) => {
      this.recordTokenUsage(usage, providerId, model);
    });
    
    // SoNovel 服务
    this.soNovelService = new SoNovelService(this.settings.sonovelUrl);
    
    // 对话管理器
    this.conversationManager = new ConversationManager(this.app, this.llmService);
    
    // 书库服务
    this.libraryService = new LibraryService(this.app, this.settings.epubConversion?.outputPath);
    
    // 阅读进度服务
    this.readingProgressService = new ReadingProgressService(
      this.app, this.libraryService, this.settings.epubConversion?.outputPath
    );
    this.readingProgressService.startWatching();
    
    // EPUB 转换服务
    this.epubConverterService = new EpubConverterService(this.app, this.libraryService);
    
    // 统一标记系统
    await this.initializeUnifiedMarkingServices();
    
    // 扫描现有书籍
    this.scanExistingBooks();
    this.checkSoNovelServiceHealth();
  }

  private async initializeUnifiedMarkingServices(): Promise<void> {
    const storagePath = '.novelcraft/unified-marks';
    this.unifiedMarkRepository = new UnifiedMarkRepository(this.app, storagePath);
    this.unifiedMarkingService = new UnifiedMarkingService(this.app, this.unifiedMarkRepository);
    
    // 初始化故事数据库服务
    this.bookDatabaseService = new BookDatabaseService(this.app);
    
    // 初始化精确标记服务
    this.preciseMarkingService = new PreciseMarkingService(
      this.app,
      this.bookDatabaseService
    );
    
    // 初始化时间轴可视化服务
    this.timelineVisualizationService = new TimelineVisualizationService(
      this.app,
      this.bookDatabaseService
    );
    
    // 初始化 Canvas 生成服务
    this.canvasGeneratorService = new CanvasGeneratorService(
      this.app,
      this.bookDatabaseService
    );
    
    // 初始化数据同步服务
    this.dataSyncService = new DataSyncService(
      this.app,
      this.bookDatabaseService
    );
    
    // 初始化故事单元分析服务
    this.storyUnitAnalysisService = new StoryUnitAnalysisService(
      this.app,
      this.llmService,
      this.unifiedMarkingService
    );
    
    // 初始化全局素材库服务
    this.globalMaterialLibrary = new GlobalMaterialLibraryService(this.app);
    await this.globalMaterialLibrary.initialize();
    
    // 初始化标记工具栏，使用配置的书籍路径（禁用交互式功能）
    const bookPathPrefix = this.settings.epubConversion?.outputPath || 'NovelCraft/books/';
    this.markingToolbar = new MarkingToolbar(
      this.app,
      this.unifiedMarkingService,
      { 
        enabled: false, // 禁用交互式工具栏，只使用右键菜单
        bookPathPrefix: bookPathPrefix,
        preciseMarkingEnabled: true,
        contextMenuEnabled: true
      }
    );
    
    // 设置精确标记服务
    this.markingToolbar.setPreciseMarkingService(this.preciseMarkingService);
    this.markingToolbar.initialize();
    
    this.unifiedMarkingService.onMarkChange(async (event) => {
      console.log('Unified mark change:', event.type, event.mark.id);
      this.refreshMarkingViews();
    });
    
    console.log('NovelCraft: 统一标记系统初始化完成');
  }

  private async scanExistingBooks(): Promise<void> {
    try {
      const count = await this.libraryService.scanAndImportExistingBooks();
      if (count > 0) console.log(`NovelCraft: 已导入 ${count} 本现有书籍`);
    } catch (error) {
      console.warn('NovelCraft: 扫描现有书籍失败', error);
    }
  }

  private recordTokenUsage(usage: TokenUsage, providerId: string, model: string): void {
    const record: TokenUsageRecord = {
      timestamp: Date.now(), stage: 'analysis',
      bookTitle: this.currentBookTitle || undefined, providerId, model, usage
    };
    if (!this.settings.tokenUsageRecords) this.settings.tokenUsageRecords = [];
    this.settings.tokenUsageRecords.push(record);
    this.saveSettings().catch(err => console.warn('NovelCraft: 保存 Token 记录失败', err));
  }

  private async checkSoNovelServiceHealth(): Promise<void> {
    try {
      const isHealthy = await this.soNovelService.checkHealth();
      if (!isHealthy) console.warn('NovelCraft: SoNovel 服务不可用');
    } catch (error) {
      console.warn('NovelCraft: 检查 SoNovel 服务状态失败', error);
    }
  }

  private cleanupServices(): void {
    if (this.llmService) this.llmService.destroy();
    if (this.soNovelService) this.soNovelService.destroy();
    if (this.conversationManager) this.conversationManager.clear();
    if (this.readingProgressService) this.readingProgressService.destroy();
    if (this.errorHandlingIntegration) this.errorHandlingIntegration.destroy();
    if (this.markingToolbar) this.markingToolbar.destroy();
  }

  private refreshMarkingViews(): void {
    const leaves = this.app.workspace.getLeavesOfType(UNIFIED_MARKING_PANEL_VIEW_TYPE);
    for (const leaf of leaves) {
      const view = leaf.view as UnifiedMarkingPanel;
      if (view && typeof view.refresh === 'function') view.refresh();
    }
  }

  private registerCommands(): void {
    // 核心功能命令
    this.addCommand({ id: 'open-main-panel', name: '打开主面板', callback: () => this.activateMainPanel() });
    this.addCommand({ id: 'open-unified-marking-panel', name: '打开故事单元面板', callback: () => this.openUnifiedMarkingPanel() });
    
    // 故事单元相关命令
    this.addCommand({ 
      id: 'create-story-unit', 
      name: '创建故事单元', 
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const isChapter = file && this.isNovelCraftChapter(file.path);
        if (checking) return !!isChapter;
        if (file && isChapter) this.openStoryUnitModal(file.path);
        return true;
      }
    });
    
    // 数据库管理命令
    this.addCommand({ 
      id: 'initialize-book-database', 
      name: '初始化书籍数据库', 
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const isChapter = file && this.isNovelCraftChapter(file.path);
        if (checking) return !!isChapter;
        if (file && isChapter) this.initializeBookDatabase(file.path);
        return true;
      }
    });
    
    this.addCommand({ 
      id: 'import-from-ai-analysis', 
      name: '从AI分析导入数据到数据库', 
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const isChapter = file && this.isNovelCraftChapter(file.path);
        if (checking) return !!isChapter;
        if (file && isChapter) this.importFromAIAnalysis(file.path);
        return true;
      }
    });
    
    // 添加 Ribbon 图标（左侧边栏）
    this.addRibbonIcon('book-open', 'NovelCraft 主面板', () => this.activateMainPanel());
    this.addRibbonIcon('file-text', '故事单元', () => this.openUnifiedMarkingPanel());
    this.addRibbonIcon('users', '全局素材库', () => this.openGlobalMaterialPanel());
    
    // 注册编辑器工具栏按钮（上方工具栏）
    this.registerEditorToolbarButtons();
  }

  /**
   * 注册编辑器工具栏按钮
   * 在 NovelCraft 章节文件中显示故事单元按钮
   */
  private registerEditorToolbarButtons(): void {
    // 清理所有现有的 NovelCraft 编辑器按钮
    this.cleanupEditorButtons();
    
    // 监听活动叶子变化，为 MarkdownView 添加工具栏按钮
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => {
        if (!leaf) return;
        
        const view = leaf.view;
        if (!(view instanceof MarkdownView)) return;
        
        const file = view.file;
        if (!file || !this.isNovelCraftChapter(file.path)) {
          // 如果不是 NovelCraft 章节，清理按钮
          this.cleanupViewButtons(view);
          return;
        }
        
        // 清理现有按钮，然后添加新按钮
        this.cleanupViewButtons(view);
        this.addEditorToolbarButton(view, file.path);
      })
    );
    
    // 初始化时检查当前活动视图
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView?.file && this.isNovelCraftChapter(activeView.file.path)) {
      this.cleanupViewButtons(activeView);
      this.addEditorToolbarButton(activeView, activeView.file.path);
    }
  }

  /**
   * 清理所有视图的 NovelCraft 编辑器按钮
   */
  private cleanupEditorButtons(): void {
    const markdownViews = this.app.workspace.getLeavesOfType('markdown');
    for (const leaf of markdownViews) {
      const view = leaf.view as MarkdownView;
      this.cleanupViewButtons(view);
    }
  }

  /**
   * 清理指定视图的 NovelCraft 编辑器按钮
   */
  private cleanupViewButtons(view: MarkdownView): void {
    const existingBtns = view.containerEl.querySelectorAll('.nc-story-unit-toolbar-btn, .nc-toolbar-btn');
    existingBtns.forEach(btn => btn.remove());
  }

  /**
   * 为编辑器视图添加工具栏按钮
   */
  private addEditorToolbarButton(view: MarkdownView, filePath: string): void {
    // 使用 Obsidian 的 addAction API 添加按钮到视图的操作栏
    const actionEl = view.addAction('file-text', '故事单元', () => {
      this.openStoryUnitModal(filePath);
    });
    actionEl.addClass('nc-story-unit-toolbar-btn');
    actionEl.addClass('nc-toolbar-btn'); // 添加通用类名便于清理
  }

  private registerContextMenu(): void {
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFile && isSupportedDocument(file.name)) {
          menu.addItem((item) => {
            item.setTitle('使用 NovelCraft 分析').setIcon('book-open')
              .onClick(() => this.openAnalysisView(file.path));
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
    if (this.llmService) this.llmService.loadFromSettings(this.settings);
    if (this.soNovelService) this.soNovelService.setBaseUrl(this.settings.sonovelUrl);
    if (this.libraryService && this.settings.epubConversion?.outputPath) {
      this.libraryService.setOutputPath(this.settings.epubConversion.outputPath);
    }
    if (this.readingProgressService && this.settings.epubConversion?.outputPath) {
      this.readingProgressService.setOutputPath(this.settings.epubConversion.outputPath);
    }
  }

  private openSearchModal(): void {
    if (!this.isInitialized) { showWarning('插件正在初始化，请稍候...'); return; }
    new SearchModal(this.app, this.settings, (filePath) => {
      showSuccess(`书籍已下载到: ${filePath}`);
    }).open();
  }

  private async openAnalysisView(epubPath: string): Promise<void> {
    if (!this.isInitialized) { showWarning('插件正在初始化，请稍候...'); return; }
    if (!this.llmService.getDefaultProvider()) { showWarning('请先在设置中配置 LLM 服务'); return; }

    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(ANALYSIS_VIEW_TYPE)[0];
    
    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({ type: ANALYSIS_VIEW_TYPE, active: true });
        leaf = rightLeaf;
      }
    }
    
    if (leaf) {
      workspace.revealLeaf(leaf);
      const view = leaf.view as AnalysisView;
      await view.setBook(epubPath, async (result: AnalysisResult, book: ParsedBook) => {
        this.lastAnalysisResult = result;
        this.lastParsedBook = book;
        this.lastBookPath = epubPath;
        this.currentBookTitle = book.metadata.title;
        this.updateMainPanelChatButton();
        showInfo('分析完成！点击主面板的"打开对话"按钮进行追问');
      });
    }
  }

  private updateMainPanelChatButton(): void {
    const leaves = this.app.workspace.getLeavesOfType(MAIN_PANEL_VIEW_TYPE);
    for (const leaf of leaves) {
      const view = leaf.view as MainPanel;
      if (view && typeof view.updateChatButtonState === 'function') view.updateChatButtonState();
    }
  }

  private async openChatPanel(): Promise<void> {
    if (!this.isInitialized) { showWarning('插件正在初始化，请稍候...'); return; }

    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0];
    
    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
        leaf = rightLeaf;
      }
    }
    
    if (leaf) {
      workspace.revealLeaf(leaf);
      if (this.lastAnalysisResult && this.lastBookPath) {
        const view = leaf.view as ChatView;
        view.setAnalysisResult(this.lastAnalysisResult, this.lastBookPath, this.lastParsedBook || undefined);
      }
    }
  }

  async activateMainPanel(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(MAIN_PANEL_VIEW_TYPE)[0];
    
    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({ type: MAIN_PANEL_VIEW_TYPE, active: true });
        leaf = rightLeaf;
      }
    }
    
    if (leaf) workspace.revealLeaf(leaf);
  }

  private async openUnifiedMarkingPanel(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(UNIFIED_MARKING_PANEL_VIEW_TYPE)[0];
    
    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({ type: UNIFIED_MARKING_PANEL_VIEW_TYPE, active: true });
        leaf = rightLeaf;
      }
    }
    
    if (leaf) workspace.revealLeaf(leaf);
  }

  private async openGlobalMaterialPanel(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(GLOBAL_MATERIAL_PANEL_VIEW_TYPE)[0];
    
    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({ type: GLOBAL_MATERIAL_PANEL_VIEW_TYPE, active: true });
        leaf = rightLeaf;
      }
    }
    
    if (leaf) workspace.revealLeaf(leaf);
  }

  getLastAnalysisResult(): AnalysisResult | null { return this.lastAnalysisResult; }
  getLastParsedBook(): ParsedBook | null { return this.lastParsedBook; }
  isReady(): boolean { return this.isInitialized; }

  /**
   * 检查是否是 NovelCraft 章节文件
   */
  private isNovelCraftChapter(path: string): boolean {
    const prefix = this.settings.epubConversion?.outputPath || 'NovelCraft/books/';
    const isInBookPath = path.includes(prefix) || 
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
   * 打开故事单元模态框
   */
  private openStoryUnitModal(filePath: string): void {
    const bookPath = this.getBookPathFromFile(filePath);
    if (!bookPath) {
      showWarning('无法识别书籍路径');
      return;
    }
    
    // 从文件名提取章节索引
    const parts = filePath.split('/');
    const filename = parts[parts.length - 1];
    const chapterMatch = filename.match(/^(\d+)/);
    const chapterIndex = chapterMatch ? parseInt(chapterMatch[1], 10) - 1 : 0;
    
    // 提取书籍 ID（文件夹名）
    const bookIdMatch = bookPath.match(/\/([^/]+)$/);
    const bookId = bookIdMatch ? bookIdMatch[1] : 'unknown';
    
    // 注册书籍路径到各个服务
    this.storyUnitAnalysisService.registerBookPath(bookId, bookPath);
    this.unifiedMarkRepository.registerBookPath(bookId, bookPath);
    this.unifiedMarkingService.registerBookPath(bookId, bookPath);
    
    const config = {
      bookId: bookId,
      bookTitle: decodeURIComponent(bookId),
      bookPath: bookPath
    };
    
    const modal = new StoryUnitModal(
      this.app,
      config,
      this.storyUnitAnalysisService,
      this.globalMaterialLibrary,
      undefined,
      this.bookDatabaseService
    );
    modal.open();
  }

  /**
   * 打开数据库字段管理器
   */
  private openDatabaseFieldManager(): void {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      showWarning('请先打开一个章节文件');
      return;
    }
    
    const bookPath = this.getBookPathFromFile(file.path);
    if (!bookPath) {
      showWarning('请在 NovelCraft 书籍目录中打开文件');
      return;
    }
    
    // 提取书籍标题
    const bookIdMatch = bookPath.match(/\/([^/]+)$/);
    const bookTitle = bookIdMatch ? decodeURIComponent(bookIdMatch[1]) : '未知书籍';
    
    const config = {
      bookPath: bookPath,
      bookTitle: bookTitle,
      tableType: 'book' as const
    };
    
    const modal = new DatabaseFieldManager(this.app, config, this.bookDatabaseService);
    modal.open();
  }

  /**
   * 打开数据库模板管理器
   */
  private openDatabaseTemplateManager(): void {
    const config = {};
    const modal = new DatabaseTemplateManager(this.app, config, this.bookDatabaseService);
    modal.open();
  }

  /**
   * 打开分类管理器
   */
  private openCategoryManager(): void {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      showWarning('请先打开一个章节文件');
      return;
    }
    
    const bookPath = this.getBookPathFromFile(file.path);
    if (!bookPath) {
      showWarning('请在 NovelCraft 书籍目录中打开文件');
      return;
    }
    
    // 提取书籍标题
    const bookIdMatch = bookPath.match(/\/([^/]+)$/);
    const bookTitle = bookIdMatch ? decodeURIComponent(bookIdMatch[1]) : '未知书籍';
    
    const config = {
      bookPath: bookPath,
      bookTitle: bookTitle
    };
    
    const modal = new CategoryManager(this.app, config, this.bookDatabaseService);
    modal.open();
  }

  /**
   * 生成人物关系 Canvas
   */
  private async generateCharacterCanvas(filePath: string): Promise<void> {
    const bookPath = this.getBookPathFromFile(filePath);
    if (!bookPath) {
      showWarning('无法识别书籍路径');
      return;
    }
    
    try {
      const canvasPath = await this.canvasGeneratorService.generateCharacterCanvas(bookPath);
      showSuccess(`已生成人物关系 Canvas: ${canvasPath}`);
      // 打开 Canvas 文件
      await this.app.workspace.openLinkText(canvasPath, '', false);
    } catch (error) {
      showError('生成 Canvas 失败', error instanceof Error ? error.message : '未知错误');
    }
  }

  /**
   * 生成故事发展 Canvas
   */
  private async generateStoryCanvas(filePath: string): Promise<void> {
    const bookPath = this.getBookPathFromFile(filePath);
    if (!bookPath) {
      showWarning('无法识别书籍路径');
      return;
    }
    
    try {
      const canvasPath = await this.canvasGeneratorService.generateStoryCanvas(bookPath);
      showSuccess(`已生成故事发展 Canvas: ${canvasPath}`);
      await this.app.workspace.openLinkText(canvasPath, '', false);
    } catch (error) {
      showError('生成 Canvas 失败', error instanceof Error ? error.message : '未知错误');
    }
  }

  /**
   * 生成时间轴 Canvas
   */
  private async generateTimelineCanvas(filePath: string): Promise<void> {
    const bookPath = this.getBookPathFromFile(filePath);
    if (!bookPath) {
      showWarning('无法识别书籍路径');
      return;
    }
    
    try {
      const canvasPath = await this.timelineVisualizationService.generateTimelineCanvas(bookPath);
      showSuccess(`已生成时间轴 Canvas: ${canvasPath}`);
      await this.app.workspace.openLinkText(canvasPath, '', false);
    } catch (error) {
      showError('生成 Canvas 失败', error instanceof Error ? error.message : '未知错误');
    }
  }

  /**
   * 初始化书籍数据库
   */
  private async initializeBookDatabase(filePath: string): Promise<void> {
    const bookPath = this.getBookPathFromFile(filePath);
    if (!bookPath) {
      showWarning('无法识别书籍路径');
      return;
    }
    
    // 提取书籍标题
    const bookIdMatch = bookPath.match(/\/([^/]+)$/);
    const bookTitle = bookIdMatch ? decodeURIComponent(bookIdMatch[1]) : '未知书籍';
    
    try {
      // 检查是否已初始化
      const existingMeta = await this.bookDatabaseService.getBookMeta(bookPath);
      if (existingMeta) {
        showInfo(`数据库已存在，书籍: ${existingMeta.title}`);
        return;
      }
      
      // 初始化数据库
      const bookId = await this.bookDatabaseService.initializeDatabase(bookPath, {
        title: bookTitle,
      });
      
      showSuccess(`数据库初始化成功！\n已创建: _book_meta.md, _characters.md, _story_units.md, _events.md`);
      
      // 刷新文件浏览器
      this.app.workspace.trigger('file-explorer:refresh');
    } catch (error) {
      showError('初始化数据库失败', error instanceof Error ? error.message : '未知错误');
    }
  }

  /**
   * 从 AI 分析结果导入数据到数据库
   */
  private async importFromAIAnalysis(filePath: string): Promise<void> {
    const bookPath = this.getBookPathFromFile(filePath);
    if (!bookPath) {
      showWarning('无法识别书籍路径');
      return;
    }
    
    // 提取书籍标题
    const bookIdMatch = bookPath.match(/\/([^/]+)$/);
    const bookTitle = bookIdMatch ? decodeURIComponent(bookIdMatch[1]) : '未知书籍';
    
    try {
      // 确保数据库已初始化
      let existingMeta = await this.bookDatabaseService.getBookMeta(bookPath);
      if (!existingMeta) {
        await this.bookDatabaseService.initializeDatabase(bookPath, { title: bookTitle });
        existingMeta = await this.bookDatabaseService.getBookMeta(bookPath);
      }
      
      // 查找分析笔记文件
      const analysisNotePath = `${bookPath}/分析笔记`;
      const analysisNoteExists = await this.app.vault.adapter.exists(analysisNotePath);
      
      let importedCharacters = 0;
      let importedInfo = '';
      
      if (analysisNoteExists) {
        // 尝试读取人物分析文件
        const characterNotePath = `${analysisNotePath}/人物分析.md`;
        const characterNoteExists = await this.app.vault.adapter.exists(characterNotePath);
        
        if (characterNoteExists) {
          const content = await this.app.vault.adapter.read(characterNotePath);
          importedCharacters = await this.parseAndImportCharacters(bookPath, content, existingMeta?.bookId || '');
        }
        
        // 尝试读取整体分析文件
        const overviewNotePath = `${analysisNotePath}/整体分析.md`;
        const overviewNoteExists = await this.app.vault.adapter.exists(overviewNotePath);
        
        if (overviewNoteExists) {
          const content = await this.app.vault.adapter.read(overviewNotePath);
          await this.parseAndUpdateBookMeta(bookPath, content);
          importedInfo = '书籍概要';
        }
      }
      
      // 也检查书籍根目录下的分析文件
      const rootAnalysisPath = `${bookPath}/${bookTitle}-分析.md`;
      const rootAnalysisExists = await this.app.vault.adapter.exists(rootAnalysisPath);
      
      if (rootAnalysisExists) {
        const content = await this.app.vault.adapter.read(rootAnalysisPath);
        const chars = await this.parseAndImportCharacters(bookPath, content, existingMeta?.bookId || '');
        importedCharacters += chars;
        await this.parseAndUpdateBookMeta(bookPath, content);
        if (!importedInfo) importedInfo = '书籍概要';
      }
      
      if (importedCharacters > 0 || importedInfo) {
        showSuccess(`导入完成！\n人物: ${importedCharacters} 个\n${importedInfo ? '已更新: ' + importedInfo : ''}`);
      } else {
        showWarning('未找到可导入的 AI 分析数据。\n请先使用"分析书籍"功能生成分析笔记。');
      }
    } catch (error) {
      showError('导入失败', error instanceof Error ? error.message : '未知错误');
    }
  }

  /**
   * 解析并导入人物数据
   */
  private async parseAndImportCharacters(bookPath: string, content: string, bookId: string): Promise<number> {
    // 简单的人物解析逻辑 - 查找人物名称和描述
    const characterPattern = /###?\s*(?:人物|角色)[：:]\s*(.+?)(?:\n|$)|(?:主角|配角|反派)[：:]\s*(.+?)(?:\n|$)/gi;
    const namePattern = /[【\[](.+?)[】\]]|(?:^|\n)[-*]\s*\*\*(.+?)\*\*/g;
    
    const existingCharacters = await this.bookDatabaseService.getCharacters(bookPath);
    const existingNames = new Set(existingCharacters.map(c => c.name));
    
    let importedCount = 0;
    
    // 查找人物名称
    const names: string[] = [];
    let match;
    
    // 尝试匹配 **人物名** 格式
    const boldPattern = /\*\*([^*]+)\*\*/g;
    while ((match = boldPattern.exec(content)) !== null) {
      const name = match[1].trim();
      // 过滤掉太长的或明显不是人名的
      if (name.length <= 10 && !name.includes('：') && !name.includes(':') && !names.includes(name)) {
        names.push(name);
      }
    }
    
    // 尝试匹配 【人物名】 格式
    const bracketPattern = /[【\[]([^\]】]+)[】\]]/g;
    while ((match = bracketPattern.exec(content)) !== null) {
      const name = match[1].trim();
      if (name.length <= 10 && !names.includes(name)) {
        names.push(name);
      }
    }
    
    // 导入人物
    for (const name of names.slice(0, 20)) { // 限制最多导入20个
      if (existingNames.has(name)) continue;
      
      // 尝试提取该人物的描述
      const descPattern = new RegExp(`\\*\\*${name}\\*\\*[：:]?\\s*([^\\n*]+)`, 'i');
      const descMatch = content.match(descPattern);
      const description = descMatch ? descMatch[1].trim() : '';
      
      try {
        await this.bookDatabaseService.addCharacter(bookPath, {
          bookId,
          name,
          role: 'supporting', // 默认为配角
          aliases: [],
          tags: [],
          relationships: [],
          aiDescription: description,
          firstAppearanceChapter: 1,
          appearanceChapters: [],
          source: 'ai',
        });
        importedCount++;
      } catch (e) {
        console.warn(`导入人物失败: ${name}`, e);
      }
    }
    
    return importedCount;
  }

  /**
   * 解析并更新书籍元数据
   */
  private async parseAndUpdateBookMeta(bookPath: string, content: string): Promise<void> {
    // 提取摘要/简介
    const summaryPattern = /(?:简介|概要|摘要)[：:]\s*([^\n]+(?:\n(?![#*-]).*)*)/i;
    const summaryMatch = content.match(summaryPattern);
    
    // 提取写作技法
    const techniquePattern = /(?:写作技法|技巧|手法)[：:]\s*([^\n]+(?:\n(?![#*-]).*)*)/i;
    const techniqueMatch = content.match(techniquePattern);
    
    const updates: any = {};
    
    if (summaryMatch) {
      updates.aiSynopsis = summaryMatch[1].trim().slice(0, 1000);
    }
    
    if (techniqueMatch) {
      updates.aiWritingTechniques = techniqueMatch[1].trim().split(/[,，、\n]/).filter(t => t.trim());
    }
    
    if (Object.keys(updates).length > 0) {
      await this.bookDatabaseService.updateBookMeta(bookPath, updates);
    }
  }
}
