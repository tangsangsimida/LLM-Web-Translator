(() => {
  if (window.__LLM_WEB_TRANSLATOR_CONTENT_READY__) {
    return;
  }
  window.__LLM_WEB_TRANSLATOR_CONTENT_READY__ = true;

  const DEFAULT_CONCURRENT_SEGMENTS = 4;
  const MIN_CONCURRENT_SEGMENTS = 1;
  const MAX_CONCURRENT_SEGMENTS = 12;
  const MAX_SEGMENT_CHARS = 2400;
  const SPINNER_CLASS = "llm-web-translator-spinner";
  const SPINNER_STYLE_ID = "llm-web-translator-style";
  const BILINGUAL_CLASS = "llm-web-translator-bilingual";
  const SELECTION_CLASS = "llm-web-translator-selection";

  const TRANSLATOR_STATE = {
    originals: new Map(),
    bilingualTranslations: new Map(),
    spinners: new Map(),
    originalPositions: new Map(),
    translationCache: new Map(),
    active: false
  };

  const SKIP_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEXTAREA",
    "INPUT",
    "SELECT",
    "OPTION",
    "CODE",
    "PRE",
    "KBD",
    "SAMP",
    "SVG",
    "CANVAS"
  ]);
  const SKIP_TAG_SELECTOR = [...SKIP_TAGS].map((tagName) => tagName.toLowerCase()).join(",");

  const BLOCK_SELECTOR = [
    "p",
    "li",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "figcaption",
    "caption",
    "td",
    "th",
    "dt",
    "dd",
    "summary"
  ].join(",");

  const INLINE_FALLBACK_SELECTOR = [
    "a",
    "button",
    "label",
    "[role='button']",
    "[role='link']"
  ].join(",");

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "TOGGLE_TRANSLATION") {
      toggleTranslation()
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message?.type === "START_TRANSLATION") {
      translatePage()
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message?.type === "TRANSLATE_SELECTION") {
      translateSelection(message.selectedText)
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message?.type === "RESTORE_ORIGINALS") {
      const restored = restoreOriginals();
      sendResponse({ ok: true, restored });
      return false;
    }

    if (message?.type === "RESTORE_SELECTION") {
      const restored = restoreSelection();
      sendResponse({ ok: true, restored });
      return false;
    }

    return false;
  });

  async function toggleTranslation() {
    if (hasTranslatedContent()) {
      const restored = restoreOriginals();
      return { mode: "restored", restored };
    }

    const result = await translatePage();
    return { mode: "translated", ...result };
  }

  async function translateSelection(selectedText) {
    clearSpinners();
    injectSpinnerStyle();

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      throw new Error("没有找到选中的文本。");
    }

    const range = selection.getRangeAt(0);
    if (isInsideSkippedElement(getClosestElement(range.commonAncestorContainer))) {
      throw new Error("代码块、表单和不可翻译区域不会被翻译。");
    }

    const text = selectedText?.trim() || selection.toString().trim();
    if (!text) {
      throw new Error("选中的内容为空。");
    }

    const container = getRangeContainer(range);
    if (container) {
      showSpinner(container);
    }

    try {
      const settings = await getTranslationSettings();
      const [translation] = await translateTextsWithCache([text], settings);
      if (typeof translation !== "string" || !translation.trim()) {
        throw new Error("模型没有返回可用译文。");
      }

      const span = document.createElement("span");
      span.className = `${SELECTION_CLASS} notranslate`;
      span.dataset.originalText = text;
      span.setAttribute("translate", "no");

      if (settings.bilingualMode) {
        span.classList.add(BILINGUAL_CLASS);
        span.dataset.bilingual = "true";
        span.textContent = ` ${translation.trim()}`;
        const insertionRange = range.cloneRange();
        insertionRange.collapse(false);
        insertionRange.insertNode(span);
      } else if (canReplaceSelectionRange(range)) {
        span.textContent = translation.trim();
        range.deleteContents();
        range.insertNode(span);
      } else {
        span.classList.add(BILINGUAL_CLASS);
        span.dataset.detached = "true";
        span.textContent = translation.trim();
        insertDetachedSelectionTranslation(range, container, span);
      }

      selection.removeAllRanges();
      TRANSLATOR_STATE.active = true;

      return { mode: "selection", translated: 1, total: 1 };
    } finally {
      if (container) {
        hideSpinner(container);
      }
    }
  }

  async function translatePage() {
    clearSpinners();
    injectSpinnerStyle();
    if (hasTranslatedContent()) {
      return { translated: 0, failed: 0, skipped: 0, total: 0, reused: true };
    }

    const settings = await getTranslationSettings();
    const segments = collectSegments(document.body);
    if (segments.length === 0) {
      return { translated: 0, failed: 0, skipped: 0, total: 0 };
    }

    TRANSLATOR_STATE.active = true;

    const queue = [...segments];
    const result = {
      translated: 0,
      failed: 0,
      skipped: 0,
      total: segments.length,
      errors: []
    };

    const workerCount = Math.min(settings.concurrency, queue.length);
    const workers = Array.from({ length: workerCount }, () => runSegmentWorker(queue, result, settings));
    await Promise.all(workers);

    return result;
  }

  async function getTranslationSettings() {
    const settings = await chrome.storage.sync.get({
      concurrency: DEFAULT_CONCURRENT_SEGMENTS,
      targetLanguage: "简体中文",
      bilingualMode: false
    });
    return {
      concurrency: clampNumber(settings.concurrency, MIN_CONCURRENT_SEGMENTS, MAX_CONCURRENT_SEGMENTS, DEFAULT_CONCURRENT_SEGMENTS),
      targetLanguage: settings.targetLanguage || "简体中文",
      bilingualMode: Boolean(settings.bilingualMode)
    };
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  function hasTranslatedContent() {
    for (const node of TRANSLATOR_STATE.originals.keys()) {
      if (node.isConnected) {
        return true;
      }
    }
    return document.querySelector(`.${SELECTION_CLASS}, .${BILINGUAL_CLASS}`) !== null;
  }

  function getRangeContainer(range) {
    const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;

    if (!container || container === document.documentElement) {
      return document.body;
    }

    return container.closest(BLOCK_SELECTOR) || container;
  }

  function canReplaceSelectionRange(range) {
    if (range.startContainer !== range.endContainer || range.startContainer.nodeType !== Node.TEXT_NODE) {
      return false;
    }

    const parent = range.startContainer.parentElement;
    return Boolean(parent && !parent.closest("table, thead, tbody, tfoot, tr, td, th"));
  }

  function insertDetachedSelectionTranslation(range, container, node) {
    const target = getDetachedSelectionTarget(range, container);
    if (!target?.isConnected) {
      const insertionRange = range.cloneRange();
      insertionRange.collapse(false);
      insertionRange.insertNode(node);
      return;
    }

    if (canAppendBilingualBlock(target)) {
      target.appendChild(node);
      return;
    }

    target.parentNode.insertBefore(node, target.nextSibling);
  }

  function getDetachedSelectionTarget(range, container) {
    const rawTarget = container?.closest(BLOCK_SELECTOR) || getRangeContainer(range);
    if (!rawTarget) {
      return null;
    }

    const tablePart = rawTarget.closest("table, thead, tbody, tfoot, tr");
    if (!tablePart) {
      return rawTarget;
    }

    const startCell = getClosestElement(range.startContainer)?.closest("td, th");
    const endCell = getClosestElement(range.endContainer)?.closest("td, th");
    if (startCell && startCell === endCell) {
      return startCell;
    }

    return tablePart.closest("table") || tablePart;
  }

  function getClosestElement(node) {
    return node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  }

  async function runSegmentWorker(queue, result, settings) {
    while (queue.length > 0) {
      const segment = queue.shift();
      if (!segment?.element?.isConnected) {
        result.skipped += 1;
        continue;
      }

      showSpinner(segment.element);

      try {
        const changedNodes = await translateSegment(segment, settings);
        if (changedNodes > 0) {
          result.translated += 1;
        } else {
          result.skipped += 1;
        }
      } catch (error) {
        console.warn("LLM Web Translator segment failed:", error);
        result.failed += 1;
        addErrorSample(result, error);
      } finally {
        hideSpinner(segment.element);
      }
    }
  }

  function addErrorSample(result, error) {
    const message = error?.message || String(error);
    if (result.errors.length >= 3 || result.errors.includes(message)) {
      return;
    }
    result.errors.push(message);
  }

  async function translateSegment(segment, settings) {
    const nodes = segment.nodes.filter((node) => node.isConnected && isTranslatableNode(node));
    if (nodes.length === 0) {
      return 0;
    }

    if (settings.bilingualMode) {
      return translateSegmentBilingual(segment, nodes);
    }

    const batches = createNodeBatches(nodes);
    let changedNodes = 0;

    for (const batch of batches) {
      const texts = batch.map((node) => node.nodeValue.trim());
      const translations = await translateTextsWithCache(texts, settings);

      translations.forEach((translation, index) => {
        const node = batch[index];
        if (!node?.isConnected || typeof translation !== "string") {
          return;
        }

        const original = node.nodeValue;
        if (!TRANSLATOR_STATE.originals.has(node)) {
          TRANSLATOR_STATE.originals.set(node, original);
        }

        const nextValue = preserveOuterWhitespace(original, translation);
        if (nextValue !== original) {
          node.nodeValue = nextValue;
          changedNodes += 1;
        }
      });
    }

    return changedNodes;
  }

  async function translateSegmentBilingual(segment, nodes) {
    const translations = [];

    for (const batch of createNodeBatches(nodes)) {
      const texts = batch.map((node) => node.nodeValue.trim());
      const batchTranslations = await translateTextsWithCache(texts, settings);

      batchTranslations.forEach((translation) => {
        if (typeof translation === "string" && translation.trim()) {
          translations.push(translation.trim());
        }
      });
    }

    if (translations.length === 0) {
      return 0;
    }

    insertBilingualBlock(segment.element, translations.join(" "));
    return 1;
  }

  async function translateTextsWithCache(texts, settings) {
    const translations = new Array(texts.length);
    const misses = [];

    texts.forEach((text, index) => {
      const cacheKey = getCacheKey(text, settings);
      if (TRANSLATOR_STATE.translationCache.has(cacheKey)) {
        translations[index] = TRANSLATOR_STATE.translationCache.get(cacheKey);
      } else {
        misses.push({ text, index, cacheKey });
      }
    });

    if (misses.length === 0) {
      return translations;
    }

    const response = await chrome.runtime.sendMessage({
      type: "TRANSLATE_BATCH",
      texts: misses.map((item) => item.text)
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Translation failed.");
    }

    misses.forEach((item, responseIndex) => {
      const translation = response.translations?.[responseIndex];
      if (typeof translation === "string" && translation.trim()) {
        TRANSLATOR_STATE.translationCache.set(item.cacheKey, translation);
        translations[item.index] = translation;
      } else {
        translations[item.index] = item.text;
      }
    });

    return translations;
  }

  function getCacheKey(text, settings) {
    return JSON.stringify({
      targetLanguage: settings.targetLanguage,
      bilingualMode: settings.bilingualMode,
      text
    });
  }

  function collectSegments(root) {
    const segmentsByElement = new Map();
    const textNodes = collectTextNodes(root);

    for (const node of textNodes) {
      const element = findSegmentElement(node);
      if (!element) {
        continue;
      }

      if (!segmentsByElement.has(element)) {
        segmentsByElement.set(element, {
          element,
          nodes: []
        });
      }
      segmentsByElement.get(element).nodes.push(node);
    }

    return [...segmentsByElement.values()]
      .map(splitLargeSegment)
      .flat()
      .filter((segment) => segment.nodes.length > 0);
  }

  function splitLargeSegment(segment) {
    const chunks = [];
    let current = [];
    let chars = 0;

    for (const node of segment.nodes) {
      const length = node.nodeValue.trim().length;
      if (current.length > 0 && chars + length > MAX_SEGMENT_CHARS) {
        chunks.push({ element: segment.element, nodes: current });
        current = [];
        chars = 0;
      }
      current.push(node);
      chars += length;
    }

    if (current.length > 0) {
      chunks.push({ element: segment.element, nodes: current });
    }

    return chunks;
  }

  function collectTextNodes(root) {
    if (!root) {
      return [];
    }

    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!isTranslatableNode(node)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    return nodes;
  }

  function findSegmentElement(node) {
    const parent = node.parentElement;
    if (!parent) {
      return null;
    }

    const block = parent.closest(BLOCK_SELECTOR);
    if (block && document.body.contains(block)) {
      return block;
    }

    const inlineFallback = parent.closest(INLINE_FALLBACK_SELECTOR);
    if (inlineFallback && document.body.contains(inlineFallback)) {
      return inlineFallback;
    }

    return findNearestVisibleContainer(parent);
  }

  function findNearestVisibleContainer(element) {
    let current = element;
    while (current && current !== document.body) {
      if (isInsideSkippedElement(current) || current.closest(`.${SPINNER_CLASS}, .notranslate`)) {
        return null;
      }

      if (isVisibleElement(current) && current.innerText?.trim().length > 1) {
        return current;
      }

      current = current.parentElement;
    }

    return null;
  }

  function isTranslatableNode(node) {
    const parent = node.parentElement;
    if (!parent || isInsideSkippedElement(parent)) {
      return false;
    }

    if (parent.closest(`[contenteditable='true'], [translate='no'], .notranslate, .${SPINNER_CLASS}`)) {
      return false;
    }

    const text = node.nodeValue;
    if (!text || text.trim().length < 2) {
      return false;
    }

    if (/^[\d\s.,:;!?()[\]{}'"`~@#$%^&*_+=|\\/<>-]+$/.test(text.trim())) {
      return false;
    }

    return isVisibleElement(parent);
  }

  function isInsideSkippedElement(element) {
    return Boolean(element?.closest(SKIP_TAG_SELECTOR));
  }

  function isVisibleElement(element) {
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function createNodeBatches(nodes) {
    const batches = [];
    let current = [];
    let chars = 0;

    for (const node of nodes) {
      const length = node.nodeValue.trim().length;
      if (current.length > 0 && (current.length >= 12 || chars + length > 1200)) {
        batches.push(current);
        current = [];
        chars = 0;
      }
      current.push(node);
      chars += length;
    }

    if (current.length > 0) {
      batches.push(current);
    }

    return batches;
  }

  function showSpinner(element) {
    if (TRANSLATOR_STATE.spinners.has(element) || !element.isConnected) {
      return;
    }

    if (element.matches?.("table, thead, tbody, tfoot, tr")) {
      return;
    }

    const style = window.getComputedStyle(element);
    if (style.position === "static") {
      TRANSLATOR_STATE.originalPositions.set(element, element.style.position);
      element.style.position = "relative";
    }

    const spinner = document.createElement("span");
    spinner.className = `${SPINNER_CLASS} notranslate`;
    spinner.setAttribute("translate", "no");
    spinner.setAttribute("aria-hidden", "true");
    element.appendChild(spinner);
    TRANSLATOR_STATE.spinners.set(element, spinner);
  }

  function hideSpinner(element) {
    const spinner = TRANSLATOR_STATE.spinners.get(element);
    if (spinner) {
      spinner.remove();
      TRANSLATOR_STATE.spinners.delete(element);
    }

    if (TRANSLATOR_STATE.originalPositions.has(element)) {
      element.style.position = TRANSLATOR_STATE.originalPositions.get(element);
      TRANSLATOR_STATE.originalPositions.delete(element);
    }
  }

  function clearSpinners() {
    for (const element of [...TRANSLATOR_STATE.spinners.keys()]) {
      hideSpinner(element);
    }
  }

  function injectSpinnerStyle() {
    if (document.getElementById(SPINNER_STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = SPINNER_STYLE_ID;
    style.textContent = `
      .${SPINNER_CLASS} {
        position: absolute;
        top: 0.15em;
        left: -1.4em;
        box-sizing: border-box;
        width: 0.9em;
        height: 0.9em;
        border: 2px solid rgba(36, 107, 254, 0.2);
        border-top-color: #246bfe;
        border-radius: 999px;
        animation: llm-web-translator-spin 0.72s linear infinite;
        pointer-events: none;
        z-index: 2147483647;
      }

      .${SELECTION_CLASS} {
        background: rgba(36, 107, 254, 0.08);
        border-radius: 3px;
      }

      .${BILINGUAL_CLASS} {
        display: block;
        box-sizing: border-box;
        max-width: 100%;
        color: #1554d1;
        background: rgba(36, 107, 254, 0.08);
        border-left: 3px solid #246bfe;
        border-radius: 3px;
        margin: 0.35em 0 0.55em;
        padding: 0.45em 0.65em;
        line-height: 1.65;
        overflow-wrap: anywhere;
      }

      .${BILINGUAL_CLASS}[data-placement="cell"] {
        margin: 0.35em 0 0;
        padding: 0.3em 0.45em;
      }

      .${SELECTION_CLASS}.${BILINGUAL_CLASS} {
        display: inline;
        border-left: 0;
        margin: 0 0.25em;
        padding: 0.08em 0.25em;
        line-height: inherit;
      }

      .${SELECTION_CLASS}.${BILINGUAL_CLASS}[data-detached="true"] {
        display: block;
        border-left: 3px solid #246bfe;
        margin: 0.35em 0 0.55em;
        padding: 0.45em 0.65em;
        line-height: 1.65;
      }

      @keyframes llm-web-translator-spin {
        to {
          transform: rotate(360deg);
        }
      }
    `;
    document.documentElement.appendChild(style);
  }

  function preserveOuterWhitespace(original, translated) {
    const leading = original.match(/^\s*/)?.[0] ?? "";
    const trailing = original.match(/\s*$/)?.[0] ?? "";
    return `${leading}${translated.trim()}${trailing}`;
  }

  function insertBilingualBlock(element, translation) {
    if (!element?.isConnected) {
      return;
    }

    const existing = TRANSLATOR_STATE.bilingualTranslations.get(element);
    if (existing?.isConnected) {
      existing.remove();
    }

    const block = document.createElement(canUseBlockBilingualElement(element) ? "div" : "span");
    block.className = `${BILINGUAL_CLASS} notranslate`;
    block.setAttribute("translate", "no");
    block.dataset.placement = isTableCell(element) ? "cell" : "block";
    block.textContent = translation.trim();

    if (canAppendBilingualBlock(element)) {
      element.appendChild(block);
    } else {
      element.parentNode.insertBefore(block, element.nextSibling);
    }

    TRANSLATOR_STATE.bilingualTranslations.set(element, block);
  }

  function canAppendBilingualBlock(element) {
    return ["LI", "TD", "TH", "DD", "DT", "SUMMARY"].includes(element.tagName);
  }

  function canUseBlockBilingualElement(element) {
    return !["A", "BUTTON", "LABEL"].includes(element.tagName);
  }

  function isTableCell(element) {
    return ["TD", "TH"].includes(element.tagName);
  }

  function restoreSelection() {
    clearSpinners();

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return 0;
    }

    const range = selection.getRangeAt(0);
    let restored = 0;

    document.querySelectorAll(`.${SELECTION_CLASS}, .${BILINGUAL_CLASS}`).forEach((node) => {
      if (rangeIntersectsNode(range, node)) {
        restored += restoreTranslationElement(node);
      }
    });

    for (const [node, original] of [...TRANSLATOR_STATE.originals.entries()]) {
      if (node.isConnected && rangeIntersectsNode(range, node)) {
        node.nodeValue = original;
        TRANSLATOR_STATE.originals.delete(node);
        restored += 1;
      }
    }

    if (restored === 0) {
      const container = getRangeContainer(range);
      const bilingual = container ? TRANSLATOR_STATE.bilingualTranslations.get(container) : null;
      if (bilingual?.isConnected) {
        bilingual.remove();
        TRANSLATOR_STATE.bilingualTranslations.delete(container);
        restored += 1;
      }
    }

    selection.removeAllRanges();
    TRANSLATOR_STATE.active = hasTranslatedContent();
    return restored;
  }

  function restoreTranslationElement(node) {
    if (!node?.isConnected) {
      return 0;
    }

    if (
      node.classList.contains(SELECTION_CLASS) &&
      node.dataset.bilingual !== "true" &&
      node.dataset.detached !== "true"
    ) {
      node.replaceWith(document.createTextNode(node.dataset.originalText || node.textContent || ""));
      return 1;
    }

    node.remove();
    for (const [element, bilingual] of [...TRANSLATOR_STATE.bilingualTranslations.entries()]) {
      if (bilingual === node) {
        TRANSLATOR_STATE.bilingualTranslations.delete(element);
      }
    }
    return 1;
  }

  function rangeIntersectsNode(range, node) {
    try {
      return range.intersectsNode(node);
    } catch {
      const nodeRange = document.createRange();
      nodeRange.selectNodeContents(node);
      return range.compareBoundaryPoints(Range.START_TO_END, nodeRange) < 0 &&
        range.compareBoundaryPoints(Range.END_TO_START, nodeRange) > 0;
    }
  }

  function restoreOriginals() {
    clearSpinners();

    let restored = 0;
    document.querySelectorAll(`.${SELECTION_CLASS}`).forEach((node) => {
      if (node.dataset.bilingual === "true") {
        node.remove();
      } else {
        node.replaceWith(document.createTextNode(node.dataset.originalText || node.textContent || ""));
      }
      restored += 1;
    });

    document.querySelectorAll(`.${BILINGUAL_CLASS}`).forEach((node) => {
      node.remove();
      restored += 1;
    });
    TRANSLATOR_STATE.bilingualTranslations.clear();

    for (const [node, original] of TRANSLATOR_STATE.originals.entries()) {
      if (node.isConnected) {
        node.nodeValue = original;
        restored += 1;
      }
    }
    TRANSLATOR_STATE.originals.clear();
    TRANSLATOR_STATE.active = false;
    return restored;
  }
})();
