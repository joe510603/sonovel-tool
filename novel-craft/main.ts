import { Plugin, TFile, TFolder } from 'obsidian';
import { NovelCraftSettings, DEFAULT_SETTINGS, AnalysisResult, ParsedBook, TokenUsageRecord, TokenUsage } from './src/types';
import { NovelCraftSettingTab } from './src/ui/SettingTab';
import { SearchModal } from './src/ui/SearchModal';
import { AnalysisPanel } from './src/ui/AnalysisPanel';
import { AnalysisView, ANALYSIS_VIEW_TYPE } from './src/ui/AnalysisView';
import { ChatView, CHAT_VIEW_TYPE } from './src/ui/ChatView';
import { ChatPanel } from './src/ui/ChatPanel';
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
import { NoteGenerator } from './src/services/NoteGenerator';
import { ConversationManager } from './src/services/ConversationManager';
import { isSupportedDocument, getSupportedExtensions } from './src/core/ParserFactory';

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
        (leaf) => new MainPanel(
          leaf,
          this.settings,
          this.soNovelService,
          this.llmService,
          (path) => this.openAnalysisView(path),
          () => this.openChatPanel(),
          () => this.lastAnalysisResult !== null
        )
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
      
      // 注册命令
      this.registerCommands();
      
      // 注册右键菜单
      this.registerContextMenu();
      
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
    
    // 检查 SoNovel 服务状态（非阻塞）
    this.checkSoNovelServiceHealth();
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

    // 添加 ribbon 图标
    this.addRibbonIcon('book-open', 'NovelCraft', () => {
      this.activateMainPanel();
    });
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
