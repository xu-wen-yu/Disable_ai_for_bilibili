/**
 * Bilibili AI 视频屏蔽插件 - Content Script
 * 实现视频信息提取、关键词匹配、屏蔽功能
 */

(function () {
  'use strict';

  const CONFIG = {
    DEFAULT_KEYWORDS: [
      'AI生成', 'AI绘图', 'AI配音', 'AI合成', 'AI脚本', 'AI动画',
      '人工智能', 'AI翻唱', 'AI演唱', 'AI虚拟主播', 'AI女友', 'AI男友'
    ],
    BLOCK_MODES: {
      HIDE: 'hide',
      SHOW: 'show'
    }
  };

  const MessageTypes = {
    GET_SETTINGS: 'getSettings',
    GET_WHITELIST: 'getWhitelist',
    GET_BLOCK_RECORDS: 'getBlockRecords',
    ADD_BLOCK_RECORD: 'addBlockRecord',
    SETTINGS_UPDATED: 'settingsUpdated'
  };

  class VideoInfoExtractor {
    constructor() {
      this.pageType = this.detectPageType();
      this.selectors = this.getSelectors();
    }

    detectPageType() {
      const path = window.location.pathname;
      const hash = window.location.hash;

      if (path === '/' || path === '/index.html') {
        return 'homepage';
      }
      if (path.includes('/video/BV') || path.includes('/video/av')) {
        return 'video';
      }
      if (path.includes('/search') || hash.includes('keyword')) {
        return 'search';
      }
      if (path.includes('/space/')) {
        return 'space';
      }
      if (path.includes('/favorites') || path.includes('/medialist')) {
        return 'favorites';
      }
      if (path.includes('/channel/')) {
        return 'channel';
      }
      if (path.includes('/following')) {
        return 'following';
      }
      return 'unknown';
    }

    getSelectors() {
      const baseSelectors = {
        videoCard: [
          '.bili-video-card',
          '.video-card',
          '.video-card-default',
          '.bili-video-card__info',
          '[data-videos-card-type]'
        ],
        videoTitle: [
          '.video-card__info--title',
          '.video-title',
          '.bili-video-card__info--title',
          'a.title',
          'h3.title',
          '.video-name'
        ],
        upName: [
          '.video-card__info--owner',
          '.up-name',
          '.bili-video-card__info--owner',
          '.author',
          '.user-name'
        ],
        tags: [
          '.tag-area',
          '.tag-wrapper',
          '.video-tag',
          '.tag-link'
        ],
        description: [
          '.desc',
          '.video-desc',
          '.bili-video-card__info--desc',
          '.description'
        ],
        bvid: [
          '[data-bvid]',
          'a[href*="BV"]',
          'a[href*="avid"]'
        ]
      };

      const pageSpecificSelectors = {
        homepage: {
          videoCard: [
            '.recommend-container .bili-video-card',
            '.video-card-container .bili-video-card',
            '#recom_list .bili-video-card'
          ],
          videoTitle: [
            '.bili-video-card__info--title',
            '.video-card__info--title'
          ],
          upName: [
            '.bili-video-card__info--owner',
            '.up-info'
          ]
        },
        search: {
          videoCard: [
            '.video-item',
            '.bili-video-item',
            '.search-video-list .bili-video-card'
          ],
          videoTitle: [
            '.video-title',
            'a.title',
            '.bili-video-card__info--title'
          ],
          upName: [
            '.up-name',
            '.bili-video-item__owner'
          ]
        },
        space: {
          videoCard: [
            '.small-item',
            '.video-item',
            '.user-video-list .bili-video-card'
          ],
          videoTitle: [
            '.title',
            '.video-title a'
          ],
          upName: []
        },
        video: {
          videoTitle: [
            '#viewbox_report h1',
            '.video-title',
            'h1.title',
            '#arc_toolbar_report h1'
          ],
          tags: [
            '.tag-area',
            '#tag_domain_module',
            '.video-tag-list'
          ],
          description: [
            '#viewbox_report .desc',
            '.video-desc',
            '.desc-info'
          ]
        },
        favorites: {
          videoCard: [
            '.fav-video-list .bili-video-card',
            '.media-list-item'
          ]
        },
        following: {
          videoCard: [
            '.dynamic-video-card',
            '.bili-video-card'
          ]
        },
        channel: {
          videoCard: [
            '.video-card',
            '.bili-video-card',
            '.channel-video-card'
          ]
        }
      };

      const merged = { ...baseSelectors };
      if (pageSpecificSelectors[this.pageType]) {
        for (const key in pageSpecificSelectors[this.pageType]) {
          if (merged[key]) {
            merged[key] = [
              ...pageSpecificSelectors[this.pageType][key],
              ...baseSelectors[key]
            ];
          } else {
            merged[key] = pageSpecificSelectors[this.pageType][key];
          }
        }
      }

      return merged;
    }

    queryFirst(selectors) {
      for (const selector of selectors) {
        try {
          const element = document.querySelector(selector);
          if (element) {
            return element;
          }
        } catch (e) {
          console.warn(`Selector error: ${selector}`, e);
        }
      }
      return null;
    }

    queryAll(selectors) {
      const results = [];
      const seen = new Set();

      for (const selector of selectors) {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            if (!seen.has(el)) {
              seen.add(el);
              results.push(el);
            }
          });
        } catch (e) {
          console.warn(`Selector error: ${selector}`, e);
        }
      }

      return results;
    }

    extractText(element) {
      if (!element) return '';
      return (element.textContent || element.innerText || '').trim();
    }

    extractHref(element) {
      if (!element) return '';
      return (element.href || element.getAttribute('href') || '').trim();
    }

    extractBvid(cardElement) {
      const linkElement = this.queryFirst(this.selectors.bvid);
      if (linkElement) {
        const href = this.extractHref(linkElement);
        const bvidMatch = href.match(/BV[\w]+/i);
        if (bvidMatch) {
          return bvidMatch[0].toUpperCase();
        }
        const avidMatch = href.match(/av\d+/i);
        if (avidMatch) {
          return avidMatch[0].toLowerCase();
        }
      }

      if (cardElement) {
        const href = this.extractHref(cardElement);
        const bvidMatch = href.match(/BV[\w]+/i);
        if (bvidMatch) {
          return bvidMatch[0].toUpperCase();
        }
      }

      const dataBvid = cardElement?.getAttribute('data-bvid');
      if (dataBvid) {
        return dataBvid.toUpperCase();
      }

      return '';
    }

    extractUpMid(cardElement) {
      if (cardElement) {
        const dataMid = cardElement.getAttribute('data-mid');
        if (dataMid) {
          return dataMid;
        }

        const linkElement = cardElement.querySelector('a[href*="/space/"]');
        if (linkElement) {
          const href = this.extractHref(linkElement);
          const midMatch = href.match(/(\d+)/);
          if (midMatch) {
            return midMatch[1];
          }
        }
      }
      return '';
    }

    extractTags(containerElement) {
      const tags = [];
      const tagElements = this.queryAll(this.selectors.tags);

      tagElements.forEach(tagEl => {
        const tagText = this.extractText(tagEl);
        if (tagText && !tags.includes(tagText)) {
          tags.push(tagText);
        }

        const linkTags = tagEl.querySelectorAll('a.tag-link, .tag, a');
        linkTags.forEach(link => {
          const linkText = this.extractText(link);
          if (linkText && !tags.includes(linkText)) {
            tags.push(linkText);
          }
        });
      });

      return tags;
    }

    extractTagsFromCard(cardElement) {
      const tags = [];

      const tagArea = cardElement.querySelector('.tag-area, .video-tag, .tags');
      if (tagArea) {
        const tagTexts = tagArea.querySelectorAll('.tag-text, .tag, a');
        tagTexts.forEach(tag => {
          const text = this.extractText(tag);
          if (text) {
            tags.push(text);
          }
        });
      }

      const metaTags = cardElement.querySelectorAll('[class*="tag"]');
      metaTags.forEach(el => {
        const text = this.extractText(el);
        if (text && text.length < 30 && !tags.includes(text)) {
          tags.push(text);
        }
      });

      return tags;
    }

    extractVideoInfo(cardElement) {
      if (this.pageType === 'video') {
        return this.extractVideoPageInfo();
      }

      const titleElement = this.queryFirst(this.selectors.videoTitle);
      const upElement = this.queryFirst(this.selectors.upName);

      const title = cardElement
        ? this.extractText(cardElement.querySelector(this.selectors.videoTitle[0])) ||
          this.extractText(cardElement.querySelector('a.title, h3, .video-name'))
        : this.extractText(titleElement);

      const upName = cardElement
        ? this.extractText(cardElement.querySelector(this.selectors.upName[0]))
        : this.extractText(upElement);

      const description = cardElement
        ? this.extractText(cardElement.querySelector(this.selectors.description[0]))
        : '';

      const bvid = this.extractBvid(cardElement);
      const upMid = this.extractUpMid(cardElement);
      const tags = cardElement ? this.extractTagsFromCard(cardElement) : [];

      return {
        title: title || '',
        upName: upName || '',
        description: description || '',
        bvid: bvid || '',
        upMid: upMid || '',
        tags: tags,
        pageType: this.pageType
      };
    }

    extractVideoPageInfo() {
      const titleElement = this.queryFirst(this.selectors.videoTitle);
      const title = this.extractText(titleElement);

      const descriptionElement = this.queryFirst(this.selectors.description);
      const description = this.extractText(descriptionElement);

      const tagElements = document.querySelectorAll('#tag_domain_module .tag-link, .tag-area a, #v_tag .tag');
      const tags = [];
      tagElements.forEach(tag => {
        const text = this.extractText(tag);
        if (text && !tags.includes(text)) {
          tags.push(text);
        }
      });

      const upElement = document.querySelector('#up_details .user-name, #v_upinfo .name, .up-info .name');
      const upName = this.extractText(upElement);

      const upMidElement = document.querySelector('#up_details a, #v_upinfo a');
      let upMid = '';
      if (upMidElement) {
        const href = this.extractHref(upMidElement);
        const midMatch = href.match(/(\d+)/);
        if (midMatch) {
          upMid = midMatch[1];
        }
      }

      const currentUrl = window.location.href;
      let bvid = '';
      const bvidMatch = currentUrl.match(/BV[\w]+/i);
      if (bvidMatch) {
        bvid = bvidMatch[0].toUpperCase();
      }

      return {
        title: title || '',
        upName: upName || '',
        description: description || '',
        bvid: bvid || '',
        upMid: upMid || '',
        tags: tags,
        pageType: 'video'
      };
    }

    getAllVideoCards() {
      if (this.pageType === 'video') {
        return [document.body];
      }

      const cards = this.queryAll(this.selectors.videoCard);
      return cards;
    }
  }

  class KeywordMatcher {
    constructor(keywords = []) {
      this.keywords = keywords;
    }

    updateKeywords(keywords) {
      this.keywords = keywords;
    }

    escapeRegExp(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    createPattern(keyword) {
      try {
        if (keyword.startsWith('/') && keyword.endsWith('/')) {
          const pattern = keyword.slice(1, -1);
          return new RegExp(pattern, 'i');
        }

        const escaped = this.escapeRegExp(keyword);
        return new RegExp(escaped, 'i');
      } catch (e) {
        console.error(`Invalid pattern: ${keyword}`, e);
        return null;
      }
    }

    matchKeyword(text, keyword) {
      if (!text || !keyword) return false;

      const pattern = this.createPattern(keyword);
      if (!pattern) return false;

      return pattern.test(text);
    }

    matchAllKeywords(text, keywords = this.keywords) {
      const matches = [];

      for (const keyword of keywords) {
        if (this.matchKeyword(text, keyword)) {
          matches.push({
            keyword: keyword,
            matched: true
          });
        }
      }

      return matches;
    }

    matchVideoInfo(videoInfo) {
      const results = {
        isAI: false,
        matches: [],
        reasons: [],
        confidence: 0
      };

      const searchFields = [
        { name: 'title', value: videoInfo.title, weight: 3 },
        { name: 'tags', value: videoInfo.tags.join(' '), weight: 3 },
        { name: 'description', value: videoInfo.description, weight: 2 },
        { name: 'upName', value: videoInfo.upName, weight: 1 }
      ];

      for (const field of searchFields) {
        if (!field.value) continue;

        const fieldMatches = this.matchAllKeywords(field.value);

        for (const match of fieldMatches) {
          results.matches.push({
            field: field.name,
            keyword: match.keyword,
            weight: field.weight
          });
        }
      }

      const matchCount = results.matches.length;
      if (matchCount > 0) {
        results.isAI = true;
        const totalWeight = results.matches.reduce((sum, m) => sum + m.weight, 0);
        results.confidence = Math.min(1, (totalWeight / 10) * (matchCount / this.keywords.length));

        results.reasons = results.matches.map(m =>
          `${m.field}包含关键词: ${m.keyword}`
        );
      }

      return results;
    }
  }

  class BlockerHandler {
    constructor(blockMode = CONFIG.BLOCK_MODES.HIDE) {
      this.blockMode = blockMode;
      this.blockedElements = new Map();
    }

    setBlockMode(mode) {
      this.blockMode = mode;
    }

    hideVideo(cardElement, videoInfo, matchResult) {
      if (!cardElement) return false;

      const wrapper = cardElement.closest('.video-card-container, .bili-video-card__wrap, li, div[itemscope]') || cardElement;

      if (this.blockMode === CONFIG.BLOCK_MODES.HIDE) {
        wrapper.style.display = 'none';
        wrapper.setAttribute('data-ai-blocked', 'true');
        wrapper.setAttribute('data-block-reason', matchResult.reasons.join('; '));

        this.blockedElements.set(videoInfo.bvid || videoInfo.title, {
          element: wrapper,
          videoInfo: videoInfo,
          matchResult: matchResult
        });

        return true;
      } else {
        this.showBlockIndicator(wrapper, videoInfo, matchResult);
        return true;
      }
    }

    showBlockIndicator(element, videoInfo, matchResult) {
      const existingIndicator = element.querySelector('.ai-block-indicator');
      if (existingIndicator) return;

      const indicator = document.createElement('div');
      indicator.className = 'ai-block-indicator';
      indicator.innerHTML = `
        <div class="ai-block-overlay">
          <div class="ai-block-content">
            <div class="ai-block-icon">🤖</div>
            <div class="ai-block-title">已屏蔽 AI 生成视频</div>
            <div class="ai-block-reason">${matchResult.reasons[0] || '该视频被识别为 AI 生成内容'}</div>
            <div class="ai-block-actions">
              <button class="ai-block-btn ai-block-view" data-bvid="${videoInfo.bvid}">查看详情</button>
              <button class="ai-block-btn ai-block-unblock" data-bvid="${videoInfo.bvid}">取消屏蔽</button>
            </div>
          </div>
        </div>
      `;

      element.style.position = 'relative';
      element.appendChild(indicator);

      this.addIndicatorStyles();

      indicator.querySelector('.ai-block-unblock').addEventListener('click', (e) => {
        e.stopPropagation();
        this.unblockVideo(element, videoInfo.bvid);
      });
    }

    addIndicatorStyles() {
      if (document.getElementById('ai-block-styles')) return;

      const styles = document.createElement('style');
      styles.id = 'ai-block-styles';
      styles.textContent = `
        .ai-block-indicator {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 100;
          pointer-events: auto;
        }
        .ai-block-overlay {
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
        }
        .ai-block-content {
          text-align: center;
          color: #fff;
          padding: 20px;
        }
        .ai-block-icon {
          font-size: 48px;
          margin-bottom: 12px;
        }
        .ai-block-title {
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 8px;
        }
        .ai-block-reason {
          font-size: 14px;
          color: #fb7299;
          margin-bottom: 16px;
        }
        .ai-block-actions {
          display: flex;
          gap: 12px;
          justify-content: center;
        }
        .ai-block-btn {
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          transition: opacity 0.2s;
        }
        .ai-block-btn:hover {
          opacity: 0.8;
        }
        .ai-block-view {
          background: #00a1d6;
          color: #fff;
        }
        .ai-block-unblock {
          background: #fb7299;
          color: #fff;
        }
      `;
      document.head.appendChild(styles);
    }

    blockVideoPage(videoInfo, matchResult) {
      const playerElement = document.querySelector('#bilibili-player, .bilibili-player, .player');
      const videoElement = document.querySelector('video');

      if (videoElement) {
        videoElement.pause();
        videoElement.src = '';
        videoElement.load();
      }

      const container = document.querySelector('#player_module, .player-wrapper, #bilibili-player') ||
                       document.querySelector('.bpx-player-container');

      if (container) {
        container.innerHTML = `
          <div class="ai-block-page-overlay">
            <div class="ai-block-page-content">
              <div class="ai-block-page-icon">🤖</div>
              <div class="ai-block-page-title">已屏蔽 AI 生成视频</div>
              <div class="ai-block-page-reason">${matchResult.reasons[0] || '该视频被识别为 AI 生成内容'}</div>
              <div class="ai-block-page-video-info">
                <div class="video-info-title">${videoInfo.title}</div>
                <div class="video-info-up">UP主: ${videoInfo.upName}</div>
              </div>
              <div class="ai-block-page-actions">
                <button class="ai-block-page-btn ai-block-page-close" data-bvid="${videoInfo.bvid}">关闭提示</button>
                <button class="ai-block-page-btn ai-block-page-unblock" data-bvid="${videoInfo.bvid}">取消屏蔽</button>
              </div>
            </div>
          </div>
        `;

        this.addPageBlockStyles();

        const closeBtn = container.querySelector('.ai-block-page-close');
        const unblockBtn = container.querySelector('.ai-block-page-unblock');

        closeBtn.addEventListener('click', () => {
          container.innerHTML = '';
          if (videoElement) {
            videoElement.src = videoElement.dataset.originalSrc || '';
          }
        });

        unblockBtn.addEventListener('click', () => {
          this.unblockVideoPage(videoInfo.bvid);
        });
      }
    }

    addPageBlockStyles() {
      if (document.getElementById('ai-block-page-styles')) return;

      const styles = document.createElement('style');
      styles.id = 'ai-block-page-styles';
      styles.textContent = `
        .ai-block-page-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.95);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 99999;
        }
        .ai-block-page-content {
          text-align: center;
          color: #fff;
          max-width: 500px;
          padding: 40px;
        }
        .ai-block-page-icon {
          font-size: 80px;
          margin-bottom: 24px;
        }
        .ai-block-page-title {
          font-size: 28px;
          font-weight: bold;
          margin-bottom: 16px;
        }
        .ai-block-page-reason {
          font-size: 18px;
          color: #fb7299;
          margin-bottom: 24px;
        }
        .ai-block-page-video-info {
          background: rgba(255, 255, 255, 0.1);
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 24px;
        }
        .video-info-title {
          font-size: 16px;
          margin-bottom: 8px;
        }
        .video-info-up {
          font-size: 14px;
          color: #aaa;
        }
        .ai-block-page-actions {
          display: flex;
          gap: 16px;
          justify-content: center;
        }
        .ai-block-page-btn {
          padding: 12px 24px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 16px;
          transition: opacity 0.2s;
        }
        .ai-block-page-btn:hover {
          opacity: 0.8;
        }
        .ai-block-page-close {
          background: #555;
          color: #fff;
        }
        .ai-block-page-unblock {
          background: #fb7299;
          color: #fff;
        }
      `;
      document.head.appendChild(styles);
    }

    unblockVideo(element, bvid) {
      if (!element) return false;

      const wrapper = element.closest('.video-card-container, .bili-video-card__wrap, li, div[itemscope]') || element;

      wrapper.style.display = '';
      wrapper.removeAttribute('data-ai-blocked');
      wrapper.removeAttribute('data-block-reason');

      const indicator = wrapper.querySelector('.ai-block-indicator');
      if (indicator) {
        indicator.remove();
      }

      this.blockedElements.delete(bvid);

      return true;
    }

    unblockVideoPage(bvid) {
      const container = document.querySelector('#player_module, .player-wrapper, #bilibili-player, .bpx-player-container');
      if (container) {
        container.innerHTML = '';
      }

      const videoElement = document.querySelector('video');
      if (videoElement && videoElement.dataset.originalSrc) {
        videoElement.src = videoElement.dataset.originalSrc;
        videoElement.load();
        videoElement.play().catch(() => {});
      }

      this.blockedElements.delete(bvid);
    }

    isVideoBlocked(bvid) {
      return this.blockedElements.has(bvid);
    }
  }

  class BilibiliAIFilter {
    constructor() {
      this.extractor = new VideoInfoExtractor();
      this.matcher = new KeywordMatcher(CONFIG.DEFAULT_KEYWORDS);
      this.blocker = new BlockerHandler();
      this.whitelistChecker = new WhitelistChecker();
      this.recordManager = new BlockRecordManager();
      this.settings = {
        globalEnabled: true,
        blockMode: CONFIG.BLOCK_MODES.HIDE,
        customKeywords: CONFIG.DEFAULT_KEYWORDS
      };
      this.isInitialized = false;
      this.processedVideos = new Set();
      this.observer = null;
    }

    async initialize() {
      if (this.isInitialized) return;

      try {
        await this.loadSettings();
        await this.loadWhitelist();
        await this.loadBlockRecords();

        this.matcher.updateKeywords(this.settings.customKeywords);
        this.blocker.setBlockMode(this.settings.blockMode);

        this.isInitialized = true;

        this.startProcessing();

        this.setupMutationObserver();

        console.log('[Bilibili AI Filter] Initialized successfully');
      } catch (e) {
        console.error('[Bilibili AI Filter] Failed to initialize:', e);
      }
    }

    async loadSettings() {
      try {
        const response = await this.sendMessage(MessageTypes.GET_SETTINGS);
        if (response && response.settings) {
          this.settings = {
            globalEnabled: response.settings.globalEnabled !== false,
            blockMode: response.settings.blockMode || CONFIG.BLOCK_MODES.HIDE,
            customKeywords: response.settings.customKeywords || CONFIG.DEFAULT_KEYWORDS
          };
        }
      } catch (e) {
        console.error('[Bilibili AI Filter] Failed to load settings:', e);
      }
    }

    async loadWhitelist() {
      try {
        const response = await this.sendMessage(MessageTypes.GET_WHITELIST);
        if (response && response.whitelist) {
          this.whitelistChecker.updateWhitelist(response.whitelist);
        }
      } catch (e) {
        console.error('[Bilibili AI Filter] Failed to load whitelist:', e);
      }
    }

    async loadBlockRecords() {
      try {
        const response = await this.sendMessage(MessageTypes.GET_BLOCK_RECORDS, { limit: 100 });
        if (response && response.records) {
          this.recordManager.records = response.records;
        }
      } catch (e) {
        console.error('[Bilibili AI Filter] Failed to load block records:', e);
      }
    }

    async saveBlockRecord(record) {
      try {
        await this.sendMessage(MessageTypes.ADD_BLOCK_RECORD, record);
      } catch (e) {
        console.error('[Bilibili AI Filter] Failed to save block record:', e);
      }
    }

    sendMessage(type, data = null) {
      return new Promise((resolve, reject) => {
        try {
          chrome.runtime.sendMessage({ type, data }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        } catch (error) {
          reject(error);
        }
      });
    }

    async reloadSettings() {
      await this.loadSettings();
      this.matcher.updateKeywords(this.settings.customKeywords);
      this.blocker.setBlockMode(this.settings.blockMode);

      if (this.settings.globalEnabled) {
        this.processAllVideos();
      } else {
        this.unblockAllVideos();
      }
    }

    startProcessing() {
      if (!this.settings.globalEnabled) {
        return;
      }

      if (this.extractor.pageType === 'video') {
        this.processVideoPage();
      } else {
        this.processAllVideos();
      }
    }

    processAllVideos() {
      if (!this.settings.globalEnabled) return;

      const cards = this.extractor.getAllVideoCards();

      cards.forEach(card => {
        if (!card) return;

        const cacheKey = this.getVideoCacheKey(card);
        if (this.processedVideos.has(cacheKey)) return;

        const videoInfo = this.extractor.extractVideoInfo(card);

        if (!videoInfo.title && !videoInfo.bvid) return;

        this.processVideo(card, videoInfo);
        this.processedVideos.add(cacheKey);
      });
    }

    processVideoPage() {
      if (!this.settings.globalEnabled) return;

      const videoInfo = this.extractor.extractVideoPageInfo();

      if (!videoInfo.title && !videoInfo.bvid) {
        setTimeout(() => this.processVideoPage(), 1000);
        return;
      }

      const whitelistResult = this.whitelistChecker.isInWhitelist(videoInfo);
      if (whitelistResult.whitelisted) {
        console.log('[Bilibili AI Filter] Video is whitelisted, skipping:', videoInfo.title);
        return;
      }

      const matchResult = this.matcher.matchVideoInfo(videoInfo);

      if (matchResult.isAI) {
        const record = this.recordManager.addRecord(videoInfo, matchResult);
        this.saveBlockRecord(record);
        this.blocker.blockVideoPage(videoInfo, matchResult);

        console.log('[Bilibili AI Filter] Blocked AI video:', videoInfo.title, 'Reason:', matchResult.reasons);
      }

      this.setupVideoObserver();
    }

    processVideo(cardElement, videoInfo) {
      const whitelistResult = this.whitelistChecker.isInWhitelist(videoInfo);
      if (whitelistResult.whitelisted) {
        return;
      }

      const matchResult = this.matcher.matchVideoInfo(videoInfo);

      if (matchResult.isAI) {
        const record = this.recordManager.addRecord(videoInfo, matchResult);
        this.saveBlockRecord(record);
        this.blocker.hideVideo(cardElement, videoInfo, matchResult);

        console.log('[Bilibili AI Filter] Blocked AI video:', videoInfo.title, 'Reason:', matchResult.reasons);
      }
    }

    getVideoCacheKey(element) {
      const bvid = this.extractor.extractBvid(element);
      const title = this.extractor.extractText(
        element.querySelector(this.extractor.selectors.videoTitle[0])
      );

      return `${bvid}-${title}`.substring(0, 100);
    }

    setupMutationObserver() {
      if (this.observer) {
        this.observer.disconnect();
      }

      this.observer = new MutationObserver((mutations) => {
        let shouldProcess = false;

        for (const mutation of mutations) {
          if (mutation.addedNodes.length > 0) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.matches?.(this.extractor.selectors.videoCard.join(',')) ||
                    node.querySelector?.(this.extractor.selectors.videoCard.join(','))) {
                  shouldProcess = true;
                  break;
                }
              }
            }
          }
          if (shouldProcess) break;
        }

        if (shouldProcess) {
          setTimeout(() => this.processAllVideos(), 100);
        }
      });

      this.observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    setupVideoObserver() {
      const videoElement = document.querySelector('video');
      if (videoElement) {
        videoElement.dataset.originalSrc = videoElement.src;
      }
    }

    unblockAllVideos() {
      this.blockedElements?.forEach((data, bvid) => {
        if (data.element) {
          this.blocker.unblockVideo(data.element, bvid);
        }
      });

      const blockedElements = document.querySelectorAll('[data-ai-blocked="true"]');
      blockedElements.forEach(el => {
        el.style.display = '';
        el.removeAttribute('data-ai-blocked');
        el.removeAttribute('data-block-reason');
      });
    }

    showNotification(message, title) {
      console.log(`[Bilibili AI Filter] ${message}: ${title}`);
    }

    async addToWhitelist(videoInfo) {
      try {
        await chrome.runtime.sendMessage({
          action: 'addToWhitelist',
          data: {
            type: videoInfo.upMid ? 'user' : 'video',
            value: videoInfo.upMid || videoInfo.bvid
          }
        });

        await this.whitelistChecker.loadWhitelist();

        if (videoInfo.upMid) {
          const cards = this.extractor.getAllVideoCards();
          cards.forEach(card => {
            const info = this.extractor.extractVideoInfo(card);
            if (info.upMid === videoInfo.upMid) {
              this.blocker.unblockVideo(card, info.bvid);
            }
          });
        }
      } catch (e) {
        console.error('Failed to add to whitelist:', e);
      }
    }

    destroy() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }

      this.processedVideos.clear();
      this.isInitialized = false;
    }
  }

  class WhitelistChecker {
    constructor() {
      this.whitelist = {
        users: [],
        videos: []
      };
    }

    updateWhitelist(whitelist) {
      if (whitelist) {
        this.whitelist = {
          users: whitelist.users || [],
          videos: whitelist.videos || []
        };
      }
    }

    isInWhitelist(videoInfo) {
      if (videoInfo.bvid && this.whitelist.videos.includes(videoInfo.bvid)) {
        return { whitelisted: true, type: 'video' };
      }

      if (videoInfo.upMid && this.whitelist.users.includes(videoInfo.upMid)) {
        return { whitelisted: true, type: 'user' };
      }

      return { whitelisted: false, type: null };
    }
  }

  class BlockRecordManager {
    constructor() {
      this.records = [];
    }

    addRecord(videoInfo, matchResult) {
      const record = {
        bvid: videoInfo.bvid || '',
        title: videoInfo.title || '未知标题',
        author: videoInfo.upName || '未知UP主',
        authorMid: videoInfo.upMid || '',
        blockedAt: new Date().toISOString(),
        reason: matchResult.reasons.join('; ') || '关键词匹配'
      };

      const existingIndex = this.records.findIndex(r => r.bvid === record.bvid);
      if (existingIndex >= 0) {
        this.records[existingIndex].blockedAt = record.blockedAt;
      } else {
        this.records.unshift(record);
      }

      if (this.records.length > 1000) {
        this.records = this.records.slice(0, 1000);
      }

      return record;
    }

    removeRecord(bvid) {
      this.records = this.records.filter(r => r.bvid !== bvid);
    }

    clearAllRecords() {
      this.records = [];
    }
  }

  const filterInstance = new BilibiliAIFilter();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => filterInstance.initialize());
  } else {
    filterInstance.initialize();
  }

  window.addEventListener('beforeunload', () => {
    filterInstance.destroy();
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'settingsUpdated') {
      filterInstance.reloadSettings();
      sendResponse({ success: true });
    }

    if (message.action === 'addToWhitelist') {
      filterInstance.addToWhitelist(message.videoInfo);
      sendResponse({ success: true });
    }

    return true;
  });

  window.BilibiliAIFilter = BilibiliAIFilter;
  window.filterInstance = filterInstance;
})();
