const DEFAULT_SETTINGS = {
  provider: "openai",
  apiKey: "",
  model: "gpt-4o-mini",
  targetLanguage: "简体中文",
  temperature: 0.2,
  reasoningEffort: "minimal",
  concurrency: 4,
  bilingualMode: false
};

const PROVIDER_OPTIONS = {
  openai: {
    defaultModel: "gpt-4o-mini",
    hint: "使用 https://api.openai.com/v1/chat/completions，启用 JSON Schema 严格输出。"
  },
  deepseek: {
    defaultModel: "deepseek-v4-flash",
    hint: "使用 DeepSeek Chat Completions，自动关闭 thinking，并使用 json_object 输出。"
  },
  openrouter: {
    defaultModel: "openai/gpt-4o-mini",
    hint: "使用 https://openrouter.ai/api/v1/chat/completions，启用 JSON Schema 严格输出。"
  },
  minimax: {
    defaultModel: "MiniMax-M2",
    hint: "使用 MiniMax OpenAI-compatible Chat Completions，使用 json_object 输出。"
  },
  dashscope: {
    defaultModel: "qwen-plus",
    hint: "使用 DashScope 兼容模式 https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions。"
  }
};

const form = document.querySelector("#settingsForm");
const saveStatus = document.querySelector("#saveStatus");
const shortcutsButton = document.querySelector("#openShortcuts");
const providerTabs = document.querySelector("#providerTabs");
const providerHint = document.querySelector("#providerHint");
const languageTabs = document.querySelector("#languageTabs");
const customTargetLanguage = document.querySelector("#customTargetLanguage");

document.addEventListener("DOMContentLoaded", restoreOptions);
form.addEventListener("submit", saveOptions);
shortcutsButton.addEventListener("click", openShortcutsPage);
providerTabs.addEventListener("click", selectProviderTab);
languageTabs.addEventListener("click", selectLanguageTab);
customTargetLanguage.addEventListener("input", useCustomTargetLanguage);

async function restoreOptions() {
  const settings = normalizeSettings(await chrome.storage.sync.get(DEFAULT_SETTINGS));
  for (const [key, value] of Object.entries(settings)) {
    const input = form.elements.namedItem(key);
    if (input) {
      if (input.type === "checkbox") {
        input.checked = Boolean(value);
      } else {
        input.value = value;
      }
    }
  }
  setProvider(settings.provider || DEFAULT_SETTINGS.provider, false);
  setTargetLanguage(settings.targetLanguage || DEFAULT_SETTINGS.targetLanguage);
}

async function saveOptions(event) {
  event.preventDefault();
  const settings = {
    provider: form.provider.value,
    apiKey: form.apiKey.value.trim(),
    model: form.model.value.trim(),
    targetLanguage: form.targetLanguage.value.trim(),
    temperature: DEFAULT_SETTINGS.temperature,
    reasoningEffort: DEFAULT_SETTINGS.reasoningEffort,
    concurrency: clampNumber(form.concurrency.value, 1, 12, DEFAULT_SETTINGS.concurrency),
    bilingualMode: form.bilingualMode.checked
  };

  await chrome.storage.sync.set(settings);
  saveStatus.textContent = "已保存";
  setTimeout(() => {
    saveStatus.textContent = "";
  }, 1600);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

function openShortcutsPage() {
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
}

function selectProviderTab(event) {
  const button = event.target.closest("[data-provider]");
  if (!button) {
    return;
  }
  setProvider(button.dataset.provider, true);
}

function setProvider(provider, updateModel) {
  const nextProvider = PROVIDER_OPTIONS[provider] ? provider : DEFAULT_SETTINGS.provider;
  form.provider.value = nextProvider;
  const option = PROVIDER_OPTIONS[nextProvider];

  providerTabs.querySelectorAll("[data-provider]").forEach((tab) => {
    const isActive = tab.dataset.provider === nextProvider;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  providerHint.textContent = option.hint;
  form.model.placeholder = option.defaultModel;

  if (updateModel) {
    form.model.value = option.defaultModel;
  }
}

function selectLanguageTab(event) {
  const button = event.target.closest("[data-language]");
  if (!button) {
    return;
  }
  setTargetLanguage(button.dataset.language);
}

function useCustomTargetLanguage() {
  const value = customTargetLanguage.value.trim();
  if (value) {
    setTargetLanguage(value);
  }
}

function normalizeSettings(settings) {
  const next = { ...DEFAULT_SETTINGS, ...settings };
  if (next.apiUrl && (!settings.provider || settings.provider === DEFAULT_SETTINGS.provider)) {
    next.provider = inferProviderFromUrl(next.apiUrl);
  }
  if (!PROVIDER_OPTIONS[next.provider]) {
    next.provider = DEFAULT_SETTINGS.provider;
  }
  return next;
}

function inferProviderFromUrl(rawUrl) {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase();
    if (hostname.includes("deepseek")) {
      return "deepseek";
    }
    if (hostname.includes("openrouter")) {
      return "openrouter";
    }
    if (hostname.includes("minimax")) {
      return "minimax";
    }
    if (hostname.includes("dashscope") || hostname.includes("aliyuncs")) {
      return "dashscope";
    }
  } catch {
    return DEFAULT_SETTINGS.provider;
  }
  return "openai";
}

function setTargetLanguage(language) {
  form.targetLanguage.value = language;
  const tabs = languageTabs.querySelectorAll("[data-language]");
  let matched = false;

  tabs.forEach((tab) => {
    const isActive = tab.dataset.language === language;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
    matched = matched || isActive;
  });

  if (matched) {
    customTargetLanguage.value = "";
  } else {
    customTargetLanguage.value = language;
  }
}
