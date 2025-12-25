/**
 * 主题适配工具函数
 * 提供Obsidian主题颜色获取和动态适配功能
 */

/**
 * 主题颜色工具类
 */
export class ThemeUtils {
  /**
   * 获取CSS变量值
   * @param variableName CSS变量名（不含--前缀）
   * @param fallback 备用值
   * @returns CSS变量值
   */
  static getCSSVariable(variableName: string, fallback: string = '#000000'): string {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(`--${variableName}`)
      .trim();
    
    return value || fallback;
  }

  /**
   * 获取Obsidian主题的主要颜色
   * @returns 主题颜色对象
   */
  static getThemeColors(): ThemeColors {
    return {
      // 背景色
      backgroundPrimary: this.getCSSVariable('background-primary', '#ffffff'),
      backgroundSecondary: this.getCSSVariable('background-secondary', '#f5f5f5'),
      backgroundModifier: this.getCSSVariable('background-modifier-border', '#e0e0e0'),
      
      // 文本色
      textNormal: this.getCSSVariable('text-normal', '#2e3338'),
      textMuted: this.getCSSVariable('text-muted', '#888888'),
      textFaint: this.getCSSVariable('text-faint', '#999999'),
      
      // 强调色
      textAccent: this.getCSSVariable('text-accent', '#7c3aed'),
      textAccentHover: this.getCSSVariable('text-accent-hover', '#6d28d9'),
      
      // 交互色
      interactive: this.getCSSVariable('interactive-normal', '#e0e0e0'),
      interactiveHover: this.getCSSVariable('interactive-hover', '#d0d0d0'),
      interactiveAccent: this.getCSSVariable('interactive-accent', '#7c3aed'),
      
      // 边框色
      borderNormal: this.getCSSVariable('background-modifier-border', '#e0e0e0'),
      borderHover: this.getCSSVariable('background-modifier-border-hover', '#d0d0d0'),
      
      // 状态色
      success: this.getCSSVariable('text-success', '#22c55e'),
      warning: this.getCSSVariable('text-warning', '#f59e0b'),
      error: this.getCSSVariable('text-error', '#ef4444'),
    };
  }

  /**
   * 检测当前是否为暗色主题
   * @returns 是否为暗色主题
   */
  static isDarkTheme(): boolean {
    const backgroundColor = this.getCSSVariable('background-primary', '#ffffff');
    return this.isColorDark(backgroundColor);
  }

  /**
   * 判断颜色是否为暗色
   * @param color 颜色值（hex、rgb、hsl等）
   * @returns 是否为暗色
   */
  static isColorDark(color: string): boolean {
    // 将颜色转换为RGB值
    const rgb = this.colorToRgb(color);
    if (!rgb) return false;
    
    // 计算亮度（使用相对亮度公式）
    const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
    return brightness < 128;
  }

  /**
   * 将颜色字符串转换为RGB对象
   * @param color 颜色字符串
   * @returns RGB对象或null
   */
  static colorToRgb(color: string): { r: number; g: number; b: number } | null {
    // 创建临时元素来获取计算后的颜色
    const tempElement = document.createElement('div');
    tempElement.style.color = color;
    document.body.appendChild(tempElement);
    
    const computedColor = getComputedStyle(tempElement).color;
    document.body.removeChild(tempElement);
    
    // 解析rgb()格式
    const rgbMatch = computedColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      return {
        r: parseInt(rgbMatch[1]),
        g: parseInt(rgbMatch[2]),
        b: parseInt(rgbMatch[3])
      };
    }
    
    return null;
  }

  /**
   * 生成适配主题的颜色调色板
   * @param baseColor 基础颜色
   * @returns 颜色调色板
   */
  static generateColorPalette(baseColor?: string): ColorPalette {
    const isDark = this.isDarkTheme();
    const base = baseColor || this.getCSSVariable('text-accent', '#7c3aed');
    
    return {
      primary: base,
      secondary: this.adjustColorBrightness(base, isDark ? 0.3 : -0.3),
      tertiary: this.adjustColorBrightness(base, isDark ? 0.6 : -0.6),
      
      // 轨道颜色（用于时间线）
      trackColors: [
        base,
        this.adjustColorHue(base, 60),
        this.adjustColorHue(base, 120),
        this.adjustColorHue(base, 180),
        this.adjustColorHue(base, 240),
        this.adjustColorHue(base, 300),
      ],
      
      // 关联关系颜色
      relationColors: {
        causal: this.getCSSVariable('text-success', '#22c55e'),
        foreshadow: this.getCSSVariable('text-warning', '#f59e0b'),
        contrast: this.getCSSVariable('text-error', '#ef4444'),
        parallel: this.getCSSVariable('text-accent', '#7c3aed'),
        include: this.getCSSVariable('text-muted', '#888888'),
        custom: this.adjustColorHue(base, 45)
      }
    };
  }

  /**
   * 调整颜色亮度
   * @param color 原始颜色
   * @param amount 调整量（-1到1之间）
   * @returns 调整后的颜色
   */
  static adjustColorBrightness(color: string, amount: number): string {
    const rgb = this.colorToRgb(color);
    if (!rgb) return color;
    
    const adjust = (value: number) => {
      const adjusted = value + (255 * amount);
      return Math.max(0, Math.min(255, Math.round(adjusted)));
    };
    
    return `rgb(${adjust(rgb.r)}, ${adjust(rgb.g)}, ${adjust(rgb.b)})`;
  }

  /**
   * 调整颜色色相
   * @param color 原始颜色
   * @param degrees 色相调整度数
   * @returns 调整后的颜色
   */
  static adjustColorHue(color: string, degrees: number): string {
    const rgb = this.colorToRgb(color);
    if (!rgb) return color;
    
    const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);
    hsl.h = (hsl.h + degrees) % 360;
    if (hsl.h < 0) hsl.h += 360;
    
    const newRgb = this.hslToRgb(hsl.h, hsl.s, hsl.l);
    return `rgb(${newRgb.r}, ${newRgb.g}, ${newRgb.b})`;
  }

  /**
   * RGB转HSL
   */
  private static rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    
    return { h: h * 360, s: s * 100, l: l * 100 };
  }

  /**
   * HSL转RGB
   */
  private static hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
    h /= 360;
    s /= 100;
    l /= 100;
    
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    
    let r, g, b;
    
    if (s === 0) {
      r = g = b = l; // 灰色
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    
    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    };
  }

  /**
   * 创建CSS样式字符串
   * @param styles 样式对象
   * @returns CSS样式字符串
   */
  static createStyleString(styles: Record<string, string | number>): string {
    return Object.entries(styles)
      .map(([key, value]) => `${this.camelToKebab(key)}: ${value}`)
      .join('; ');
  }

  /**
   * 将驼峰命名转换为短横线命名
   * @param str 驼峰命名字符串
   * @returns 短横线命名字符串
   */
  private static camelToKebab(str: string): string {
    return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  }

  /**
   * 监听主题变化
   * @param callback 主题变化回调函数
   * @returns 取消监听的函数
   */
  static onThemeChange(callback: (isDark: boolean) => void): () => void {
    const observer = new MutationObserver(() => {
      callback(this.isDarkTheme());
    });
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    });
    
    return () => observer.disconnect();
  }
}

/**
 * 主题颜色接口
 */
export interface ThemeColors {
  // 背景色
  backgroundPrimary: string;
  backgroundSecondary: string;
  backgroundModifier: string;
  
  // 文本色
  textNormal: string;
  textMuted: string;
  textFaint: string;
  textAccent: string;
  textAccentHover: string;
  
  // 交互色
  interactive: string;
  interactiveHover: string;
  interactiveAccent: string;
  
  // 边框色
  borderNormal: string;
  borderHover: string;
  
  // 状态色
  success: string;
  warning: string;
  error: string;
}

/**
 * 颜色调色板接口
 */
export interface ColorPalette {
  primary: string;
  secondary: string;
  tertiary: string;
  trackColors: string[];
  relationColors: {
    causal: string;
    foreshadow: string;
    contrast: string;
    parallel: string;
    include: string;
    custom: string;
  };
}