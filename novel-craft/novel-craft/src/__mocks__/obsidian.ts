// Mock Obsidian API for testing

export class Plugin {
  app: App;
  manifest: PluginManifest;

  constructor() {
    this.app = new App();
    this.manifest = {
      id: 'novel-craft',
      name: 'NovelCraft',
      version: '1.0.0',
      minAppVersion: '1.0.0',
      description: '',
      author: '',
      authorUrl: '',
      isDesktopOnly: false
    };
  }

  async loadData(): Promise<any> {
    return {};
  }

  async saveData(data: any): Promise<void> {}

  addCommand(command: Command): Command {
    return command;
  }

  registerEvent(event: any): void {}
}

export class App {
  vault: Vault;
  workspace: Workspace;

  constructor() {
    this.vault = new Vault();
    this.workspace = new Workspace();
  }
}

export class Vault {
  async read(file: TFile): Promise<string> {
    return '';
  }

  async create(path: string, data: string): Promise<TFile> {
    return new TFile();
  }

  async createBinary(path: string, data: ArrayBuffer): Promise<TFile> {
    return new TFile();
  }

  async createFolder(path: string): Promise<void> {}

  async modify(file: TFile, data: string): Promise<void> {}

  async modifyBinary(file: TFile, data: ArrayBuffer): Promise<void> {}

  async delete(file: TFile): Promise<void> {}

  getAbstractFileByPath(path: string): TAbstractFile | null {
    return null;
  }
}

export class Workspace {
  on(name: string, callback: (...args: any[]) => any): EventRef {
    return { id: name };
  }

  getActiveFile(): TFile | null {
    return null;
  }
}

export class TFile {
  path: string = '';
  name: string = '';
  extension: string = '';
  basename: string = '';
}

export class TAbstractFile {
  path: string = '';
  name: string = '';
}

export class Modal {
  app: App;
  contentEl: HTMLElement;

  constructor(app: App) {
    this.app = app;
    this.contentEl = document.createElement('div');
  }

  open(): void {}
  close(): void {}
  onOpen(): void {}
  onClose(): void {}
}

export class PluginSettingTab {
  app: App;
  plugin: Plugin;
  containerEl: HTMLElement;

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement('div');
  }

  display(): void {}
  hide(): void {}
}

export class Setting {
  settingEl: HTMLElement;
  infoEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    this.settingEl = document.createElement('div');
    this.infoEl = document.createElement('div');
    this.nameEl = document.createElement('div');
    this.descEl = document.createElement('div');
    this.controlEl = document.createElement('div');
  }

  setName(name: string): this {
    return this;
  }

  setDesc(desc: string): this {
    return this;
  }

  addText(cb: (text: TextComponent) => any): this {
    cb(new TextComponent(document.createElement('input')));
    return this;
  }

  addDropdown(cb: (dropdown: DropdownComponent) => any): this {
    cb(new DropdownComponent(document.createElement('select')));
    return this;
  }

  addButton(cb: (button: ButtonComponent) => any): this {
    cb(new ButtonComponent(document.createElement('button')));
    return this;
  }

  addToggle(cb: (toggle: ToggleComponent) => any): this {
    cb(new ToggleComponent(document.createElement('input')));
    return this;
  }
}

export class TextComponent {
  inputEl: HTMLInputElement;

  constructor(inputEl: HTMLInputElement) {
    this.inputEl = inputEl;
  }

  setValue(value: string): this {
    return this;
  }

  setPlaceholder(placeholder: string): this {
    return this;
  }

  onChange(callback: (value: string) => any): this {
    return this;
  }
}

export class DropdownComponent {
  selectEl: HTMLSelectElement;

  constructor(selectEl: HTMLSelectElement) {
    this.selectEl = selectEl;
  }

  addOption(value: string, display: string): this {
    return this;
  }

  setValue(value: string): this {
    return this;
  }

  onChange(callback: (value: string) => any): this {
    return this;
  }
}

export class ButtonComponent {
  buttonEl: HTMLButtonElement;

  constructor(buttonEl: HTMLButtonElement) {
    this.buttonEl = buttonEl;
  }

  setButtonText(name: string): this {
    return this;
  }

  setCta(): this {
    return this;
  }

  onClick(callback: () => any): this {
    return this;
  }
}

export class ToggleComponent {
  toggleEl: HTMLInputElement;

  constructor(toggleEl: HTMLInputElement) {
    this.toggleEl = toggleEl;
  }

  setValue(value: boolean): this {
    return this;
  }

  onChange(callback: (value: boolean) => any): this {
    return this;
  }
}

export interface Command {
  id: string;
  name: string;
  callback?: () => any;
  checkCallback?: (checking: boolean) => boolean | void;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  minAppVersion: string;
  description: string;
  author: string;
  authorUrl: string;
  isDesktopOnly: boolean;
}

export interface EventRef {
  id: string;
}

export function requestUrl(request: RequestUrlParam): Promise<RequestUrlResponse> {
  return Promise.resolve({
    status: 200,
    headers: {},
    arrayBuffer: new ArrayBuffer(0),
    json: {},
    text: ''
  });
}

export interface RequestUrlParam {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string | ArrayBuffer;
}

export interface RequestUrlResponse {
  status: number;
  headers: Record<string, string>;
  arrayBuffer: ArrayBuffer;
  json: any;
  text: string;
}

export class Notice {
  constructor(message: string, timeout?: number) {}
}
