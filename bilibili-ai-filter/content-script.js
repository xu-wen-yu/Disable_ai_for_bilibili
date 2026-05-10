// Bilibili AI 视频屏蔽 - 内容脚本
(function() {
  'use strict';

  const CONFIG = {
    aiKeywords: ['AI生成', 'AI创作', '人工智能', 'AI配音', 'AI绘画'],
    blockedVideos: new Set()
  };

  function isAIGeneratedVideo(element) {
    const title = element.querySelector('.video-title')?.textContent || '';
    const desc = element.querySelector('.desc')?.textContent || '';
    const tags = element.querySelectorAll('.tag');

    const text = title + desc;
    const tagText = Array.from(tags).map(t => t.textContent).join('');

    return CONFIG.aiKeywords.some(keyword =>
      text.includes(keyword) || tagText.includes(keyword)
    );
  }

  function hideVideo(element) {
    element.style.display = 'none';
    element.setAttribute('data-ai-blocked', 'true');
  }

  function scanAndBlock() {
    const videoItems = document.querySelectorAll('.video-item, .recommend-item, .bili-video-card');
    videoItems.forEach(item => {
      if (!item.hasAttribute('data-ai-checked') && isAIGeneratedVideo(item)) {
        hideVideo(item);
      }
      item.setAttribute('data-ai-checked', 'true');
    });
  }

  function init() {
    scanAndBlock();

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const items = node.querySelectorAll?.('.video-item, .recommend-item, .bili-video-card');
            items?.forEach(item => {
              if (!item.hasAttribute('data-ai-checked')) {
                if (isAIGeneratedVideo(item)) {
                  hideVideo(item);
                }
                item.setAttribute('data-ai-checked', 'true');
              }
            });
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
