# Bilibili AI 视频屏蔽插件 - Debug 计划

## 摘要

本计划旨在修复 Bilibili AI 视频屏蔽插件在 Edge 浏览器中加载成功但屏蔽功能未生效的问题。通过代码审查发现了多个关键 Bug，包括消息响应格式不匹配、空数组判断错误、以及重复的内容脚本文件。

## 当前状态分析

### 架构概览
- **manifest.json**: Manifest V3，配置 content_scripts 引用 `content-script.js`
- **background.js**: Service Worker，处理存储和消息通信
- **content.js**: 完整的内容脚本实现（包含 VideoInfoExtractor、KeywordMatcher、BlockerHandler 等类）
- **content-script.js**: 简化的内容脚本（硬编码关键词，独立运行）
- **popup.js**: 弹出设置页面

### 发现的 Bug

#### Bug 1: 消息响应格式不匹配（严重）
**位置**: `content.js:L882-888` 和 `background.js:L134-140`

**问题描述**:
- `background.js` 的 `handleGetSettings()` 直接返回 `settings` 对象
- `background.js` 的 `handleMessage()` 将结果包装为 `{ success: true, data: result }`
- `content.js` 的 `loadSettings()` 期望 `response.settings` 存在
- 实际接收到的 `response` 是 `{ success: true, data: {...} }`，所以 `response.settings` 是 `undefined`

**影响**: 设置永远无法正确加载，始终使用默认值

#### Bug 2: 空数组判断错误（中等）
**位置**: `popup.js:L82` 和 `content.js:L887`

**问题描述**:
```javascript
customKeywords: settings.customKeywords || CONFIG.DEFAULT_KEYWORDS
```
空数组 `[]` 在 JavaScript 中是 truthy 值，所以 `||` 不会触发默认值。

**影响**: 用户清空关键词后，下次加载不会恢复默认关键词

#### Bug 3: 重复的内容脚本文件（严重）
**位置**: `manifest.json:L21` 和文件系统

**问题描述**:
- `manifest.json` 引用 `content-script.js`
- 但 `content.js` 包含更完整的实现
- 两个文件同时存在，功能重复但实现不同

**影响**: 维护困难，可能导致冲突

#### Bug 4: Bilibili 页面选择器可能过时（潜在）
**位置**: `content.js:L62-103`

**问题描述**:
- CSS 选择器基于 Bilibili 旧版页面结构
- Bilibili 可能已更新 DOM 结构

**影响**: 视频卡片可能无法被正确识别

## 修复方案

### 修复 1: 统一消息响应格式

**文件**: `content.js`

**改动**:
- 修改 `loadSettings()` 以正确解析 `response.data`
- 修改 `loadWhitelist()` 以正确解析 `response.data`
- 修改 `loadBlockRecords()` 以正确解析 `response.data`

**代码变更**:
```javascript
async loadSettings() {
  try {
    const response = await this.sendMessage(MessageTypes.GET_SETTINGS);
    // 修复：检查 response.data 而不是 response.settings
    if (response && response.data) {
      const settings = response.data;
      this.settings = {
        globalEnabled: settings.globalEnabled !== false,
        blockMode: settings.blockMode || CONFIG.BLOCK_MODES.HIDE,
        customKeywords: (settings.customKeywords && settings.customKeywords.length > 0) 
          ? settings.customKeywords 
          : CONFIG.DEFAULT_KEYWORDS
      };
    }
  } catch (e) {
    console.error('[Bilibili AI Filter] Failed to load settings:', e);
  }
}
```

### 修复 2: 修复空数组判断

**文件**: `popup.js` 和 `content.js`

**改动**:
- 将所有 `settings.customKeywords || DEFAULT_KEYWORDS` 改为检查数组长度

### 修复 3: 合并内容脚本

**文件**: `content-script.js`, `manifest.json`

**改动**:
- 将 `content.js` 的完整功能合并到 `content-script.js`
- 删除 `content.js` 文件
- 更新 `manifest.json` 确认引用正确

### 修复 4: 增强选择器兼容性

**文件**: `content-script.js` (合并后的)

**改动**:
- 添加更多备选选择器
- 增加对 Bilibili 新版页面的支持

## 验证步骤

1. 在 Edge 浏览器中加载已解压的扩展
2. 访问 Bilibili 首页
3. 检查控制台日志确认插件初始化成功
4. 搜索包含 "AI生成" 的视频
5. 确认视频被正确屏蔽
6. 测试 popup 设置页面的开关和关键词功能

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `content-script.js` | 重写 | 合并 content.js 的完整功能 |
| `content.js` | 删除 | 功能已合并到 content-script.js |
| `popup.js` | 修改 | 修复空数组判断 |
| `background.js` | 可选修改 | 添加更多日志便于调试 |

## 假设与决策

1. **假设**: Bilibili 页面结构变化不大，现有选择器仍能匹配大部分视频卡片
2. **决策**: 优先修复消息格式问题，这是导致功能失效的最根本原因
3. **决策**: 保留 background.js 的响应格式，修改 content.js 的解析逻辑，以保持 API 一致性
