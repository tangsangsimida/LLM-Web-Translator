const DEFAULT_SETTINGS = {
  targetLanguage: "简体中文",
  concurrency: 4
};

const statusEl = document.querySelector("#status");
const translateButton = document.querySelector("#translate");
const restoreButton = document.querySelector("#restore");
const translateTextButton = document.querySelector("#translateText");
const optionsButton = document.querySelector("#openOptions");
const targetLanguageSelect = document.querySelector("#targetLanguage");
const concurrencyInput = document.querySelector("#concurrency");
const sourceTextInput = document.querySelector("#sourceText");
const translatedTextOutput = document.querySelector("#translatedText");

document.addEventListener("DOMContentLoaded", restorePopupSettings);
targetLanguageSelect.addEventListener("change", savePopupSettings);
concurrencyInput.addEventListener("change", savePopupSettings);

translateButton.addEventListener("click", async () => {
  setBusy(true, "正在翻译页面文本...");
  try {
    await savePopupSettings();
    const response = await sendToActiveTab({ type: "START_TRANSLATION" });
    if (!response?.ok) {
      throw new Error(response?.error || "无法翻译当前页面。");
    }
    setStatus(formatTranslationStatus(response));
  } catch (error) {
    setStatus(error.message);
  } finally {
    setBusy(false);
  }
});

restoreButton.addEventListener("click", async () => {
  setBusy(true, "正在恢复原文...");
  try {
    const response = await sendToActiveTab({ type: "RESTORE_ORIGINALS" });
    if (!response?.ok) {
      throw new Error(response?.error || "无法恢复当前页面。");
    }
    setStatus(`已恢复 ${response.restored} 段文本`);
  } catch (error) {
    setStatus(error.message);
  } finally {
    setBusy(false);
  }
});

translateTextButton.addEventListener("click", async () => {
  const sourceText = sourceTextInput.value.trim();
  if (!sourceText) {
    translatedTextOutput.textContent = "请输入要翻译的文本。";
    return;
  }

  setBusy(true, "正在翻译输入文本...");
  translatedTextOutput.textContent = "";

  try {
    await savePopupSettings();
    const response = await chrome.runtime.sendMessage({
      type: "TRANSLATE_BATCH",
      texts: [sourceText]
    });

    if (!response?.ok) {
      throw new Error(response?.error || "文本翻译失败。");
    }

    const translation = response.translations?.[0];
    if (typeof translation !== "string" || !translation.trim()) {
      throw new Error("模型没有返回可用译文。");
    }

    translatedTextOutput.textContent = translation.trim();
    setStatus("文本翻译完成");
  } catch (error) {
    translatedTextOutput.textContent = error.message;
    setStatus(error.message);
  } finally {
    setBusy(false);
  }
});

optionsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

async function restorePopupSettings() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  ensureLanguageOption(settings.targetLanguage || DEFAULT_SETTINGS.targetLanguage);
  targetLanguageSelect.value = settings.targetLanguage || DEFAULT_SETTINGS.targetLanguage;
  concurrencyInput.value = clampNumber(settings.concurrency, 1, 12, DEFAULT_SETTINGS.concurrency);
}

async function savePopupSettings() {
  await chrome.storage.sync.set({
    targetLanguage: targetLanguageSelect.value,
    concurrency: clampNumber(concurrencyInput.value, 1, 12, DEFAULT_SETTINGS.concurrency)
  });
  concurrencyInput.value = clampNumber(concurrencyInput.value, 1, 12, DEFAULT_SETTINGS.concurrency);
}

async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("没有找到当前标签页。");
  }

  if (!/^https?:\/\//.test(tab.url || "")) {
    throw new Error("Chrome 内部页面或扩展页面不能被翻译。");
  }

  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (error) {
    if (!String(error.message).includes("Receiving end does not exist")) {
      throw error;
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["src/content.js"]
    });
    return chrome.tabs.sendMessage(tab.id, message);
  }
}

function setBusy(isBusy, text) {
  translateButton.disabled = isBusy;
  restoreButton.disabled = isBusy;
  translateTextButton.disabled = isBusy;
  targetLanguageSelect.disabled = isBusy;
  concurrencyInput.disabled = isBusy;
  sourceTextInput.disabled = isBusy;
  if (text) {
    setStatus(text);
  }
}

function setStatus(text) {
  statusEl.textContent = text;
}

function formatTranslationStatus(response) {
  if (response.reused) {
    return "当前页面已有翻译结果";
  }

  const parts = [`已翻译 ${response.translated ?? 0}/${response.total ?? 0} 段`];
  if (response.failed > 0) {
    parts.push(`${response.failed} 段失败`);
  }
  if (response.skipped > 0) {
    parts.push(`${response.skipped} 段跳过`);
  }
  const message = parts.join("，");
  if (Array.isArray(response.errors) && response.errors.length > 0) {
    return `${message}\n${response.errors[0]}`;
  }
  return message;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

function ensureLanguageOption(language) {
  if ([...targetLanguageSelect.options].some((option) => option.value === language)) {
    return;
  }

  const option = document.createElement("option");
  option.value = language;
  option.textContent = language;
  targetLanguageSelect.appendChild(option);
}
