import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type NovelCraftPlugin from '../../main';
import { 
  LLMProvider, 
  DEFAULT_PROVIDERS, 
  AnalysisMode, 
  NovelType,
  MergeMode,
  DEFAULT_INCREMENTAL_SETTINGS,
  DEFAULT_EPUB_CONVERSION_SETTINGS,
  DEFAULT_MARKING_SETTINGS,
  DEFAULT_INTERACTIVE_TOOLBAR_SETTINGS
} from '../types';
import { 
  getAllNovelTypes, 
  getAllPromptStages, 
  getDefaultPrompt, 
  getTypePrompt 
} from '../services/PromptTemplates';
import { TokenTracker } from '../services/TokenTracker';

export class NovelCraftSettingTab extends PluginSettingTab {
  plugin: NovelCraftPlugin;

  constructor(app: App, plugin: NovelCraftPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h1', { text: 'NovelCraft 设置' });

    // SoNovel Service Settings
    this.renderSoNovelSettings(containerEl);

    // Path Settings
    this.renderPathSettings(containerEl);

    // LLM Provider Settings
    this.renderLLMSettings(containerEl);

    // Analysis Default Settings
    this.renderAnalysisSettings(containerEl);

    // Incremental Analysis Settings
    this.renderIncrementalAnalysisSettings(containerEl);

    // EPUB Conversion Settings
    this.renderEpubConversionSettings(containerEl);

    // Marking Settings
    // Requirements: 10.5
    this.renderMarkingSettings(containerEl);

    // Interactive Toolbar Settings
    // Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
    this.renderInteractiveToolbarSettings(containerEl);

    // Token Usage Statistics
    this.renderTokenStats(containerEl);
  }

  /**
   * 渲染交互式工具栏设置
   * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
   */
  private renderInteractiveToolbarSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: '交互式标记工具栏设置' });

    containerEl.createEl('p', { 
      text: '配置交互式拆书标记工具栏的显示和行为',
      cls: 'setting-item-description'
    });

    // 确保 interactiveToolbar 设置存在
    if (!this.plugin.settings.interactiveToolbar) {
      this.plugin.settings.interactiveToolbar = { ...DEFAULT_INTERACTIVE_TOOLBAR_SETTINGS };
    }

    // 启用标记工具栏
    new Setting(containerEl)
      .setName('启用标记工具栏')
      .setDesc('在章节文件中显示标记工具栏，支持开始/结束标记操作')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.interactiveToolbar.enabled)
        .onChange(async (value) => {
          this.plugin.settings.interactiveToolbar.enabled = value;
          await this.plugin.saveSettings();
        }));

    // 重置为默认按钮
    new Setting(containerEl)
      .setName('重置工具栏设置')
      .setDesc('将所有工具栏设置恢复为默认值')
      .addButton(button => button
        .setButtonText('重置为默认')
        .onClick(async () => {
          this.plugin.settings.interactiveToolbar = { ...DEFAULT_INTERACTIVE_TOOLBAR_SETTINGS };
          await this.plugin.saveSettings();
          this.display();
          new Notice('工具栏设置已重置为默认值');
        }));
  }

  private renderTokenStats(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Token 使用统计' });

    const records = this.plugin.settings.tokenUsageRecords || [];
    
    if (records.length === 0) {
      containerEl.createEl('p', { 
        text: '暂无 Token 使用记录',
        cls: 'setting-item-description'
      });
      return;
    }

    const tracker = new TokenTracker(records);
    const stats = tracker.getStats();

    // 总体统计
    const statsContainer = containerEl.createDiv({ cls: 'nc-token-stats-container' });
    
    const totalSection = statsContainer.createDiv({ cls: 'nc-stats-section' });
    totalSection.createEl('h3', { text: '总体统计' });
    
    const totalGrid = totalSection.createDiv({ cls: 'nc-stats-grid' });
    totalGrid.innerHTML = `
      <div class="nc-stat-item">
        <span class="nc-stat-label">总输入 Token</span>
        <span class="nc-stat-value">${TokenTracker.formatTokenCount(stats.totalPromptTokens)}</span>
      </div>
      <div class="nc-stat-item">
        <span class="nc-stat-label">总输出 Token</span>
        <span class="nc-stat-value">${TokenTracker.formatTokenCount(stats.totalCompletionTokens)}</span>
      </div>
      <div class="nc-stat-item nc-stat-total">
        <span class="nc-stat-label">总计</span>
        <span class="nc-stat-value">${TokenTracker.formatTokenCount(stats.totalTokens)}</span>
      </div>
      <div class="nc-stat-item">
        <span class="nc-stat-label">分析次数</span>
        <span class="nc-stat-value">${stats.recordCount}</span>
      </div>
    `;

    // 按书籍统计
    if (Object.keys(stats.byBook).length > 0) {
      const bookSection = statsContainer.createDiv({ cls: 'nc-stats-section' });
      bookSection.createEl('h3', { text: '按书籍统计' });
      
      const bookList = bookSection.createDiv({ cls: 'nc-stats-list' });
      for (const [book, usage] of Object.entries(stats.byBook)) {
        const item = bookList.createDiv({ cls: 'nc-stats-list-item' });
        item.innerHTML = `
          <span class="nc-stats-book-name">${book}</span>
          <span class="nc-stats-book-tokens">${TokenTracker.formatTokenCount(usage.totalTokens)}</span>
        `;
      }
    }

    // 清除记录按钮
    new Setting(containerEl)
      .setName('清除 Token 记录')
      .setDesc('清除所有 Token 使用记录')
      .addButton(button => button
        .setButtonText('清除全部')
        .setWarning()
        .onClick(async () => {
          this.plugin.settings.tokenUsageRecords = [];
          await this.plugin.saveSettings();
          this.display();
          new Notice('Token 记录已清除');
        }))
      .addButton(button => button
        .setButtonText('清除30天前')
        .onClick(async () => {
          const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
          this.plugin.settings.tokenUsageRecords = records.filter(r => r.timestamp >= thirtyDaysAgo);
          await this.plugin.saveSettings();
          this.display();
          new Notice('已清除30天前的记录');
        }));
  }

  private renderSoNovelSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'SoNovel 服务配置' });

    new Setting(containerEl)
      .setName('SoNovel 服务地址')
      .setDesc('SoNovel 下载服务的 HTTP 地址')
      .addText(text => text
        .setPlaceholder('http://localhost:7765')
        .setValue(this.plugin.settings.sonovelUrl)
        .onChange(async (value) => {
          this.plugin.settings.sonovelUrl = value;
          await this.plugin.saveSettings();
        }));
  }

  private renderPathSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: '路径配置' });

    new Setting(containerEl)
      .setName('下载保存路径')
      .setDesc('小说 epub 文件的保存目录（相对于 vault 根目录）')
      .addText(text => text
        .setPlaceholder('NovelCraft/downloads')
        .setValue(this.plugin.settings.downloadPath)
        .onChange(async (value) => {
          this.plugin.settings.downloadPath = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('笔记保存路径')
      .setDesc('分析笔记的保存目录（相对于 vault 根目录）')
      .addText(text => text
        .setPlaceholder('NovelCraft/notes')
        .setValue(this.plugin.settings.notesPath)
        .onChange(async (value) => {
          this.plugin.settings.notesPath = value;
          await this.plugin.saveSettings();
        }));
  }


  private renderLLMSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'LLM 服务配置' });

    // Add provider from defaults
    new Setting(containerEl)
      .setName('添加预设服务商')
      .setDesc('从预设列表中添加 LLM 服务商')
      .addDropdown(dropdown => {
        dropdown.addOption('', '选择服务商...');
        DEFAULT_PROVIDERS.forEach(provider => {
          // Only show providers not already added
          const exists = this.plugin.settings.llmProviders.some(p => p.id === provider.id);
          if (!exists) {
            dropdown.addOption(provider.id!, provider.name!);
          }
        });
        dropdown.onChange(async (value) => {
          if (value) {
            const template = DEFAULT_PROVIDERS.find(p => p.id === value);
            if (template) {
              const newProvider: LLMProvider = {
                id: template.id!,
                name: template.name!,
                baseUrl: template.baseUrl!,
                apiKey: '',
                model: template.model!
              };
              this.plugin.settings.llmProviders.push(newProvider);
              await this.plugin.saveSettings();
              this.display(); // Refresh UI
            }
          }
        });
      })
      .addButton(button => button
        .setButtonText('添加自定义')
        .onClick(async () => {
          const customId = `custom-${Date.now()}`;
          const newProvider: LLMProvider = {
            id: customId,
            name: '自定义服务商',
            baseUrl: '',
            apiKey: '',
            model: ''
          };
          this.plugin.settings.llmProviders.push(newProvider);
          await this.plugin.saveSettings();
          this.display();
        }));

    // List existing providers
    if (this.plugin.settings.llmProviders.length > 0) {
      containerEl.createEl('h3', { text: '已配置的服务商' });
      
      this.plugin.settings.llmProviders.forEach((provider, index) => {
        this.renderProviderSettings(containerEl, provider, index);
      });
    }
  }

  private renderProviderSettings(containerEl: HTMLElement, provider: LLMProvider, index: number): void {
    const providerContainer = containerEl.createDiv({ cls: 'novel-craft-provider-container' });
    
    const isDefault = this.plugin.settings.defaultProviderId === provider.id;
    const headerText = `${provider.name}${isDefault ? ' (默认)' : ''}`;
    
    providerContainer.createEl('h4', { text: headerText });

    new Setting(providerContainer)
      .setName('服务商名称')
      .addText(text => text
        .setValue(provider.name)
        .onChange(async (value) => {
          this.plugin.settings.llmProviders[index].name = value;
          await this.plugin.saveSettings();
        }));

    new Setting(providerContainer)
      .setName('API 地址')
      .setDesc('OpenAI 兼容的 API 端点')
      .addText(text => text
        .setPlaceholder('https://api.example.com/v1')
        .setValue(provider.baseUrl)
        .onChange(async (value) => {
          this.plugin.settings.llmProviders[index].baseUrl = value;
          await this.plugin.saveSettings();
        }));

    new Setting(providerContainer)
      .setName('API Key')
      .setDesc('API 认证密钥')
      .addText(text => {
        text.inputEl.type = 'password';
        text
          .setPlaceholder('sk-...')
          .setValue(provider.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.llmProviders[index].apiKey = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(providerContainer)
      .setName('模型')
      .setDesc('使用的模型名称')
      .addText(text => text
        .setPlaceholder('gpt-4o')
        .setValue(provider.model)
        .onChange(async (value) => {
          this.plugin.settings.llmProviders[index].model = value;
          await this.plugin.saveSettings();
        }));

    // Action buttons
    new Setting(providerContainer)
      .addButton(button => button
        .setButtonText('设为默认')
        .setCta()
        .onClick(async () => {
          this.plugin.settings.defaultProviderId = provider.id;
          await this.plugin.saveSettings();
          this.display();
          new Notice(`已将 ${provider.name} 设为默认服务商`);
        }))
      .addButton(button => button
        .setButtonText('删除')
        .onClick(async () => {
          this.plugin.settings.llmProviders.splice(index, 1);
          if (this.plugin.settings.defaultProviderId === provider.id) {
            this.plugin.settings.defaultProviderId = '';
          }
          await this.plugin.saveSettings();
          this.display();
          new Notice(`已删除 ${provider.name}`);
        }));
  }


  private renderAnalysisSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: '分析默认设置' });

    new Setting(containerEl)
      .setName('默认分析模式')
      .setDesc('选择默认的拆书分析深度')
      .addDropdown(dropdown => dropdown
        .addOption('quick', '快速模式')
        .addOption('standard', '标准模式')
        .addOption('deep', '深度模式')
        .setValue(this.plugin.settings.defaultAnalysisMode)
        .onChange(async (value) => {
          this.plugin.settings.defaultAnalysisMode = value as AnalysisMode;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('默认小说类型')
      .setDesc('选择默认的小说类型，用于类型特化分析')
      .addDropdown(dropdown => {
        for (const type of getAllNovelTypes()) {
          dropdown.addOption(type.value, type.label);
        }
        dropdown.setValue(this.plugin.settings.defaultNovelType);
        dropdown.onChange(async (value) => {
          this.plugin.settings.defaultNovelType = value as NovelType;
          await this.plugin.saveSettings();
        });
      });

    // 提示词自定义
    this.renderPromptSettings(containerEl);
  }

  /**
   * 渲染增量分析设置
   * Requirements: 1.3.4.1, 1.3.4.2, 1.3.4.3
   */
  private renderIncrementalAnalysisSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: '分析设置' });

    containerEl.createEl('p', { 
      text: '配置增量分析和分批处理的相关参数',
      cls: 'setting-item-description'
    });

    // 确保 incrementalAnalysis 设置存在
    if (!this.plugin.settings.incrementalAnalysis) {
      this.plugin.settings.incrementalAnalysis = { ...DEFAULT_INCREMENTAL_SETTINGS };
    }

    // 默认批次大小
    new Setting(containerEl)
      .setName('默认批次大小')
      .setDesc('分批分析时每批处理的章节数量')
      .addText(text => text
        .setPlaceholder('30')
        .setValue(String(this.plugin.settings.incrementalAnalysis.defaultBatchSize))
        .onChange(async (value) => {
          const num = parseInt(value, 10);
          if (!isNaN(num) && num > 0) {
            this.plugin.settings.incrementalAnalysis.defaultBatchSize = num;
            await this.plugin.saveSettings();
          }
        }));

    // 自动分批阈值
    new Setting(containerEl)
      .setName('自动分批阈值')
      .setDesc('当选择的章节数超过此值时，系统将建议使用分批分析')
      .addText(text => text
        .setPlaceholder('50')
        .setValue(String(this.plugin.settings.incrementalAnalysis.autoBatchThreshold))
        .onChange(async (value) => {
          const num = parseInt(value, 10);
          if (!isNaN(num) && num > 0) {
            this.plugin.settings.incrementalAnalysis.autoBatchThreshold = num;
            await this.plugin.saveSettings();
          }
        }));

    // 合并模式
    new Setting(containerEl)
      .setName('合并模式')
      .setDesc('增量分析时新旧结果的合并方式')
      .addDropdown(dropdown => dropdown
        .addOption('append', '追加模式 - 新内容追加到已有内容后')
        .addOption('merge', '合并模式 - 智能合并新旧内容')
        .setValue(this.plugin.settings.incrementalAnalysis.mergeMode)
        .onChange(async (value) => {
          this.plugin.settings.incrementalAnalysis.mergeMode = value as MergeMode;
          await this.plugin.saveSettings();
        }));

    // 重置为默认按钮
    new Setting(containerEl)
      .setName('重置分析设置')
      .setDesc('将所有分析设置恢复为默认值')
      .addButton(button => button
        .setButtonText('重置为默认')
        .onClick(async () => {
          this.plugin.settings.incrementalAnalysis = { ...DEFAULT_INCREMENTAL_SETTINGS };
          await this.plugin.saveSettings();
          this.display();
          new Notice('分析设置已重置为默认值');
        }));
  }

  /**
   * 渲染 EPUB 转换设置
   * Requirements: 7.1, 7.2, 7.3, 7.4
   */
  private renderEpubConversionSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'EPUB 转换设置' });

    containerEl.createEl('p', { 
      text: '配置 EPUB 转 Markdown 的相关参数',
      cls: 'setting-item-description'
    });

    // 确保 epubConversion 设置存在
    if (!this.plugin.settings.epubConversion) {
      this.plugin.settings.epubConversion = { ...DEFAULT_EPUB_CONVERSION_SETTINGS };
    }

    // 输出路径配置
    // Requirements: 7.2
    new Setting(containerEl)
      .setName('输出路径')
      .setDesc('转换后的 Markdown 文件保存目录（相对于 vault 根目录）')
      .addText(text => text
        .setPlaceholder('NovelCraft/books')
        .setValue(this.plugin.settings.epubConversion.outputPath)
        .onChange(async (value) => {
          this.plugin.settings.epubConversion.outputPath = value || DEFAULT_EPUB_CONVERSION_SETTINGS.outputPath;
          await this.plugin.saveSettings();
        }));

    // 合并为单文件选项
    // Requirements: 7.3
    new Setting(containerEl)
      .setName('合并为单文件')
      .setDesc('将所有章节合并为一个 Markdown 文件，而不是每章一个文件')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.epubConversion.mergeToSingleFile)
        .onChange(async (value) => {
          this.plugin.settings.epubConversion.mergeToSingleFile = value;
          await this.plugin.saveSettings();
        }));

    // 保留 HTML 标签选项
    // Requirements: 7.4
    new Setting(containerEl)
      .setName('保留 HTML 标签')
      .setDesc('在转换时保留部分 HTML 格式标签（如加粗、斜体等）')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.epubConversion.preserveHtmlTags)
        .onChange(async (value) => {
          this.plugin.settings.epubConversion.preserveHtmlTags = value;
          await this.plugin.saveSettings();
        }));

    // 包含章节导航
    new Setting(containerEl)
      .setName('包含章节导航')
      .setDesc('在每个章节文件底部添加上一章/下一章导航链接')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.epubConversion.includeNavigation)
        .onChange(async (value) => {
          this.plugin.settings.epubConversion.includeNavigation = value;
          await this.plugin.saveSettings();
        }));

    // 自动链接分析笔记
    new Setting(containerEl)
      .setName('自动链接分析笔记')
      .setDesc('在书籍管理文档中自动添加分析笔记的链接')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.epubConversion.autoLinkAnalysis)
        .onChange(async (value) => {
          this.plugin.settings.epubConversion.autoLinkAnalysis = value;
          await this.plugin.saveSettings();
        }));

    // 重置为默认按钮
    new Setting(containerEl)
      .setName('重置转换设置')
      .setDesc('将所有 EPUB 转换设置恢复为默认值')
      .addButton(button => button
        .setButtonText('重置为默认')
        .onClick(async () => {
          this.plugin.settings.epubConversion = { ...DEFAULT_EPUB_CONVERSION_SETTINGS };
          await this.plugin.saveSettings();
          this.display();
          new Notice('EPUB 转换设置已重置为默认值');
        }));
  }

  /**
   * 渲染标记功能设置
   * Requirements: 10.5
   */
  private renderMarkingSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: '标记功能设置' });

    containerEl.createEl('p', { 
      text: '配置拆书标记功能的相关参数',
      cls: 'setting-item-description'
    });

    // 确保 markingSettings 设置存在
    if (!this.plugin.settings.markingSettings) {
      this.plugin.settings.markingSettings = { ...DEFAULT_MARKING_SETTINGS };
    }

    // 标记存储路径
    new Setting(containerEl)
      .setName('标记存储路径')
      .setDesc('标记数据的存储目录（相对于 vault 根目录）')
      .addText(text => text
        .setPlaceholder('.novelcraft/marks')
        .setValue(this.plugin.settings.markingSettings.storagePath)
        .onChange(async (value) => {
          this.plugin.settings.markingSettings.storagePath = value || DEFAULT_MARKING_SETTINGS.storagePath;
          await this.plugin.saveSettings();
        }));

    // 默认标记类型
    new Setting(containerEl)
      .setName('默认标记类型')
      .setDesc('创建标记时的默认类型')
      .addDropdown(dropdown => dropdown
        .addOption('', '无默认')
        .addOption('structure', '结构')
        .addOption('character', '人物')
        .addOption('setting', '设定')
        .addOption('level', '境界')
        .addOption('material', '素材')
        .setValue(this.plugin.settings.markingSettings.defaultType || '')
        .onChange(async (value) => {
          this.plugin.settings.markingSettings.defaultType = value || undefined;
          await this.plugin.saveSettings();
        }));

    // 最近类型追踪数量
    new Setting(containerEl)
      .setName('最近类型数量')
      .setDesc('浮动工具栏中显示的最近使用类型数量')
      .addText(text => text
        .setPlaceholder('5')
        .setValue(String(this.plugin.settings.markingSettings.recentTypesLimit))
        .onChange(async (value) => {
          const num = parseInt(value, 10);
          if (!isNaN(num) && num > 0 && num <= 10) {
            this.plugin.settings.markingSettings.recentTypesLimit = num;
            await this.plugin.saveSettings();
          }
        }));

    // 浮动工具栏开关
    new Setting(containerEl)
      .setName('启用浮动工具栏')
      .setDesc('在章节文件中选中文本时显示快捷标记工具栏')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.markingSettings.floatingToolbarEnabled)
        .onChange(async (value) => {
          this.plugin.settings.markingSettings.floatingToolbarEnabled = value;
          await this.plugin.saveSettings();
        }));

    // 重置为默认按钮
    new Setting(containerEl)
      .setName('重置标记设置')
      .setDesc('将所有标记功能设置恢复为默认值')
      .addButton(button => button
        .setButtonText('重置为默认')
        .onClick(async () => {
          this.plugin.settings.markingSettings = { ...DEFAULT_MARKING_SETTINGS };
          await this.plugin.saveSettings();
          this.display();
          new Notice('标记功能设置已重置为默认值');
        }));
  }

  private renderPromptSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: '提示词自定义' });
    
    containerEl.createEl('p', { 
      text: '自定义分析提示词可以让 AI 按照您的需求进行分析。留空则使用默认提示词。',
      cls: 'setting-item-description'
    });

    // 分析阶段提示词
    const stageContainer = containerEl.createDiv({ cls: 'nc-prompt-section' });
    stageContainer.createEl('h3', { text: '分析阶段提示词' });

    const stages = getAllPromptStages();
    const categories = ['基础', '标准', '深度'];
    
    for (const category of categories) {
      const categoryStages = stages.filter(s => s.category === category);
      if (categoryStages.length === 0) continue;
      
      const categoryEl = stageContainer.createDiv({ cls: 'nc-prompt-category' });
      categoryEl.createEl('h4', { text: `${category}模式` });
      
      for (const stage of categoryStages) {
        this.createPromptEditor(
          categoryEl,
          stage.name,
          stage.key,
          getDefaultPrompt(stage.key),
          this.plugin.settings.customPrompts[stage.key as keyof typeof this.plugin.settings.customPrompts] || '',
          async (value) => {
            if (!this.plugin.settings.customPrompts) {
              this.plugin.settings.customPrompts = {};
            }
            if (value.trim()) {
              (this.plugin.settings.customPrompts as Record<string, string>)[stage.key] = value;
            } else {
              delete (this.plugin.settings.customPrompts as Record<string, string>)[stage.key];
            }
            await this.plugin.saveSettings();
          }
        );
      }
    }

    // 类型特化提示词
    const typeContainer = containerEl.createDiv({ cls: 'nc-prompt-section' });
    typeContainer.createEl('h3', { text: '类型特化提示词' });
    typeContainer.createEl('p', { 
      text: '针对不同小说类型的特化分析提示词',
      cls: 'setting-item-description'
    });

    for (const type of getAllNovelTypes()) {
      if (type.value === 'custom') continue; // 自定义类型单独处理
      
      this.createPromptEditor(
        typeContainer,
        type.label,
        `type-${type.value}`,
        getTypePrompt(type.value),
        this.plugin.settings.customTypePrompts[type.value] || '',
        async (value) => {
          if (!this.plugin.settings.customTypePrompts) {
            this.plugin.settings.customTypePrompts = {};
          }
          if (value.trim()) {
            this.plugin.settings.customTypePrompts[type.value] = value;
          } else {
            delete this.plugin.settings.customTypePrompts[type.value];
          }
          await this.plugin.saveSettings();
        }
      );
    }
  }

  private createPromptEditor(
    container: HTMLElement,
    name: string,
    key: string,
    defaultPrompt: string,
    customPrompt: string,
    onChange: (value: string) => Promise<void>
  ): void {
    const itemEl = container.createDiv({ cls: 'nc-prompt-item' });
    
    const headerEl = itemEl.createDiv({ cls: 'nc-prompt-header' });
    headerEl.createSpan({ text: name, cls: 'nc-prompt-name' });
    
    const isCustomized = customPrompt.trim().length > 0;
    const statusEl = headerEl.createSpan({ 
      text: isCustomized ? '(已自定义)' : '(默认)', 
      cls: `nc-prompt-status ${isCustomized ? 'nc-customized' : ''}` 
    });
    
    // 展开/折叠按钮
    const toggleBtn = headerEl.createEl('button', {
      text: '编辑',
      cls: 'nc-prompt-toggle'
    });
    
    const editorEl = itemEl.createDiv({ cls: 'nc-prompt-editor' });
    editorEl.style.display = 'none';
    
    // 默认提示词预览
    const defaultPreview = editorEl.createDiv({ cls: 'nc-prompt-default' });
    defaultPreview.createEl('div', { text: '默认提示词:', cls: 'nc-prompt-label' });
    const previewText = defaultPreview.createEl('pre', { cls: 'nc-prompt-preview' });
    previewText.textContent = defaultPrompt.slice(0, 500) + (defaultPrompt.length > 500 ? '...' : '');
    
    // 自定义提示词输入
    const customEl = editorEl.createDiv({ cls: 'nc-prompt-custom' });
    customEl.createEl('div', { text: '自定义提示词 (留空使用默认):', cls: 'nc-prompt-label' });
    
    const textArea = customEl.createEl('textarea', {
      cls: 'nc-prompt-textarea',
      attr: { rows: '8', placeholder: '输入自定义提示词...' }
    }) as HTMLTextAreaElement;
    textArea.value = customPrompt;
    
    // 按钮区域
    const btnArea = editorEl.createDiv({ cls: 'nc-prompt-buttons' });
    
    const saveBtn = btnArea.createEl('button', { text: '保存', cls: 'nc-btn nc-btn-primary' });
    saveBtn.addEventListener('click', async () => {
      await onChange(textArea.value);
      statusEl.textContent = textArea.value.trim() ? '(已自定义)' : '(默认)';
      statusEl.className = `nc-prompt-status ${textArea.value.trim() ? 'nc-customized' : ''}`;
      new Notice(`${name} 提示词已保存`);
    });
    
    const resetBtn = btnArea.createEl('button', { text: '重置为默认', cls: 'nc-btn' });
    resetBtn.addEventListener('click', async () => {
      textArea.value = '';
      await onChange('');
      statusEl.textContent = '(默认)';
      statusEl.className = 'nc-prompt-status';
      new Notice(`${name} 提示词已重置`);
    });
    
    const copyDefaultBtn = btnArea.createEl('button', { text: '复制默认到编辑区', cls: 'nc-btn' });
    copyDefaultBtn.addEventListener('click', () => {
      textArea.value = defaultPrompt;
      new Notice('已复制默认提示词');
    });
    
    toggleBtn.addEventListener('click', () => {
      const isHidden = editorEl.style.display === 'none';
      editorEl.style.display = isHidden ? 'block' : 'none';
      toggleBtn.textContent = isHidden ? '收起' : '编辑';
    });
  }
}
