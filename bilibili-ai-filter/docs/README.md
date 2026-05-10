# Bilibili AI 视频屏蔽插件

## 功能说明

本插件用于智能识别并屏蔽 Bilibili 首页推荐中的 AI 生成内容视频。

## 安装方法

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 开启右上角的「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `bilibili-ai-filter` 文件夹

## 主要特性

- 自动识别包含 AI 关键词的视频
- 实时监控页面动态加载内容
- 可通过 Popup 界面控制开关
- 支持自定义屏蔽关键词

## 文件结构

```
bilibili-ai-filter/
├── manifest.json        # 插件配置文件
├── background.js        # 后台服务脚本
├── content-script.js    # 内容脚本
├── content-style.css    # 内容样式
├── popup.html          # 弹出窗口界面
├── popup.js            # 弹出窗口逻辑
└── icons/              # 图标资源
```

## 技术实现

- 使用 Manifest V3 规范
- Content Script 注入到 Bilibili 页面
- Storage API 持久化设置
- MutationObserver 监听动态内容
