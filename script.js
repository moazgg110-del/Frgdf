'use strict';

/* رحلة الفضاء اللانهائية | اتصال مباشر بـ Gemini API */
const CONFIG = {
  textModels: ['gemini-3.8-flash', 'gemini-2.5-flash'],
  imageModel: 'gemini-3.1-flash-image',
  apiBase: 'https://generativelanguage.googleapis.com/v1beta/models/',
  requestTimeoutMs: 60000,
  maxHistoryMessages: 20
};

const $ = (id) => document.getElementById(id);
const storyBox = $('story-box');
const choicesContainer = $('choices-container');
const customActionInput = $('custom-action');
const sendActionBtn = $('send-action-btn');
const sceneImage = $('scene-image');
const imageLoader = $('image-loader');
const toggleSettingsBtn = $('toggle-settings-btn');
const toggleAboutBtn = $('toggle-about-btn');
const settingsPanel = $('settings-panel');
const aboutPanel = $('about-panel');
const gamePanel = $('game-panel');
const closeSettingsBtn = $('close-settings-btn');
const closeAboutBtn = $('close-about-btn');
const apiKeyInput = $('api-key-input');
const saveApiBtn = $('save-api-btn');
const themeDarkBtn = $('theme-dark-btn');
const themeLightBtn = $('theme-light-btn');
const fontSmallBtn = $('font-small-btn');
const fontMediumBtn = $('font-medium-btn');
const fontLargeBtn = $('font-large-btn');

const STORAGE_KEY = 'space_adventure_gemini_key_v2';
let apiKey = localStorage.getItem(STORAGE_KEY) || '';
let chatHistory = [];
let busy = false;
let adventureStarted = false;

const systemPrompt = `أنت محرك لعبة مغامرة خيال علمي تفاعلية لا نهائية. اكتب بالعربية الفصحى بأسلوب مشوق وواضح، واجعل قرارات اللاعب تؤثر في الأحداث مع الحفاظ على استمرارية الشخصيات والمكان والمخزون. لا تنه القصة نهائياً. في كل دور أخرج بالترتيب:
القصة: فقرتان أو ثلاث تصف الحدث والنتيجة.
المشهد: وصف بصري باللغة الإنجليزية لصورة سينمائية مناسبة للمشهد، دون أي كتابة أو شعارات داخل الصورة.
الخيار 1: فعل واضح ومختلف.
الخيار 2: فعل واضح ومختلف.
الخيار 3: فعل واضح ومختلف.
لا تضف مقدمات أو تنسيقات JSON.`;

if (apiKey) apiKeyInput.value = apiKey;

function setPanel(panel) {
  [settingsPanel, aboutPanel].forEach(p => p.classList.add('hidden'));
  gamePanel.classList.add('hidden');
  if (panel === 'game') gamePanel.classList.remove('hidden');
  else if (panel) panel.classList.remove('hidden');
}

toggleSettingsBtn.addEventListener('click', () => setPanel(settingsPanel));
toggleAboutBtn.addEventListener('click', () => setPanel(aboutPanel));
closeSettingsBtn.addEventListener('click', () => setPanel('game'));
closeAboutBtn.addEventListener('click', () => setPanel('game'));

saveApiBtn.addEventListener('click', () => {
  const value = apiKeyInput.value.trim();
  if (!value) {
    alert('الصق مفتاح Gemini API أولاً.');
    setPanel(settingsPanel);
    apiKeyInput.focus();
    return;
  }
  apiKey = value;
  localStorage.setItem(STORAGE_KEY, apiKey);
  setPanel('game');
  if (!adventureStarted) startAdventure();
  else appendStoryText('تم حفظ المفتاح على هذا الجهاز. يمكنك متابعة المغامرة.', 'story-paragraph');
});

themeDarkBtn.addEventListener('click', () => {
  document.body.classList.remove('light-mode');
  themeDarkBtn.classList.add('active');
  themeLightBtn.classList.remove('active');
  localStorage.setItem('space_theme', 'dark');
});
themeLightBtn.addEventListener('click', () => {
  document.body.classList.add('light-mode');
  themeLightBtn.classList.add('active');
  themeDarkBtn.classList.remove('active');
  localStorage.setItem('space_theme', 'light');
});
if (localStorage.getItem('space_theme') === 'light') themeLightBtn.click();

fontSmallBtn.addEventListener('click', () => setFontSize('0.9rem', fontSmallBtn));
fontMediumBtn.addEventListener('click', () => setFontSize('1.05rem', fontMediumBtn));
fontLargeBtn.addEventListener('click', () => setFontSize('1.2rem', fontLargeBtn));
function setFontSize(size, activeBtn) {
  document.documentElement.style.setProperty('--font-size', size);
  [fontSmallBtn, fontMediumBtn, fontLargeBtn].forEach(b => b.classList.remove('active'));
  activeBtn.classList.add('active');
}

sendActionBtn.addEventListener('click', submitCustomAction);
customActionInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') submitCustomAction();
});
function submitCustomAction() {
  const action = customActionInput.value.trim();
  if (!action || busy) return;
  customActionInput.value = '';
  progressStory(action);
}

function appendStoryText(text, className = 'story-paragraph') {
  const p = document.createElement('p');
  p.className = className;
  p.textContent = text;
  storyBox.appendChild(p);
  storyBox.scrollTop = storyBox.scrollHeight;
}
function setBusy(value, message = '') {
  busy = value;
  sendActionBtn.disabled = value;
  customActionInput.disabled = value;
  choicesContainer.querySelectorAll('button').forEach(b => b.disabled = value);
  if (value) {
    imageLoader.textContent = message || 'جاري تجهيز مغامرتك...';
    imageLoader.classList.remove('hidden');
  }
}
function errorMessage(status, message) {
  if (status === 400) return 'الطلب غير مقبول من Gemini. راجع إعدادات النموذج أو المفتاح.';
  if (status === 401 || status === 403) return 'المفتاح غير صالح أو لا يملك صلاحية استخدام Gemini API. افتح الإعدادات وضع مفتاحًا صحيحًا.';
  if (status === 404) return 'النموذج المطلوب غير متاح لهذا المفتاح أو المشروع.';
  if (status === 429) return 'تم الوصول إلى حد الطلبات مؤقتًا. انتظر قليلًا ثم حاول مرة أخرى.';
  if (status >= 500) return 'خدمة Gemini تواجه ضغطًا مؤقتًا. حاول مرة أخرى بعد قليل.';
  return message || 'تعذر الاتصال بخدمة Gemini. تحقق من الإنترنت ثم أعد المحاولة.';
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.requestTimeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function geminiRequest(model, payload) {
  const url = `${CONFIG.apiBase}${encodeURIComponent(model)}:generateContent`;
  let response;
  try {
    response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('انتهت مهلة الاتصال. تحقق من الإنترنت وحاول مجددًا.');
    if (err instanceof TypeError) throw new Error('تعذر الوصول إلى Gemini من المتصفح. تحقق من الإنترنت وافتح اللعبة في متصفح حديث.');
    throw err;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message || '';
    throw Object.assign(new Error(errorMessage(response.status, detail)), { status: response.status });
  }
  const candidate = data?.candidates?.[0];
  if (!candidate?.content?.parts) {
    const reason = data?.promptFeedback?.blockReason;
    throw new Error(reason ? `تم إيقاف الطلب بسبب سياسة السلامة (${reason}). جرّب صياغة أخرى.` : 'وصل رد فارغ من Gemini. حاول مرة أخرى.');
  }
  return candidate.content.parts;
}

async function generateStory(userText) {
  const contents = [...chatHistory, { role: 'user', parts: [{ text: userText }] }];
  const payload = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { temperature: 0.9, maxOutputTokens: 1800 }
  };
  let lastError;
  for (const model of CONFIG.textModels) {
    try {
      const parts = await geminiRequest(model, payload);
      const text = parts.filter(p => typeof p.text === 'string').map(p => p.text).join('\n').trim();
      if (!text) throw new Error('لم يرجع نموذج القصة نصًا.');
      chatHistory.push({ role: 'user', parts: [{ text: userText }] });
      chatHistory.push({ role: 'model', parts: [{ text }] });
      if (chatHistory.length > CONFIG.maxHistoryMessages) chatHistory = chatHistory.slice(-CONFIG.maxHistoryMessages);
      return text;
    } catch (err) {
      lastError = err;
      if (err.status && ![404, 429, 500, 502, 503, 504].includes(err.status)) break;
    }
  }
  throw lastError || new Error('تعذر توليد القصة.');
}

function parseStory(text) {
  const lines = text.split(/\r?\n/);
  const story = [];
  const choices = [];
  let imagePrompt = 'Cinematic science fiction scene inside an abandoned space station, dramatic lighting, detailed environment, no text';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^المشهد\s*[:：]/i.test(line)) imagePrompt = line.replace(/^المشهد\s*[:：]\s*/i, '').trim() || imagePrompt;
    else {
      const match = line.match(/^(?:الخيار\s*[1-3]|[1-3][.)、])\s*[:：-]?\s*(.+)$/i);
      if (match) choices.push(match[1].trim());
      else if (!/^القصة\s*[:：]/.test(line)) story.push(line.replace(/^القصة\s*[:：]\s*/, ''));
      else story.push(line.replace(/^القصة\s*[:：]\s*/, ''));
    }
  }
  return {
    story: story.join('\n\n').trim() || 'تتحرك المحطة الفضائية في صمت، ويبدو أن سرًا جديدًا ينتظر اكتشافك.',
    imagePrompt,
    choices: choices.slice(0, 3)
  };
}

async function generateSceneImage(prompt) {
  imageLoader.textContent = 'جاري توليد صورة المشهد بواسطة Gemini...';
  imageLoader.classList.remove('hidden');
  sceneImage.classList.add('hidden');
  try {
    const parts = await geminiRequest(CONFIG.imageModel, {
      contents: [{ role: 'user', parts: [{ text: `Create a high-quality cinematic science-fiction game scene, wide landscape composition, no words, no letters, no logo. Scene: ${prompt}` }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9', imageSize: '1K' } }
    });
    const imagePart = parts.find(p => p.inlineData?.data && p.inlineData?.mimeType);
    if (!imagePart) throw new Error('لم يرجع نموذج الصور ملف صورة.');
    sceneImage.src = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
    await new Promise((resolve, reject) => {
      sceneImage.onload = resolve;
      sceneImage.onerror = reject;
    });
    imageLoader.classList.add('hidden');
  } catch (err) {
    imageLoader.textContent = `تعذر توليد الصورة حاليًا: ${err.message}`;
    imageLoader.classList.remove('hidden');
  }
}

function displayChoices(choices) {
  const fallback = [
    'استكشف لوحة التحكم القريبة وابحث عن سجل المحطة.',
    'افحص صناديق الإمدادات بحثًا عن أدوات مفيدة.',
    'تحرك بحذر نحو الممر المظلم لتعرف مصدر الإشارة.'
  ];
  const valid = choices.length ? choices : fallback;
  choicesContainer.replaceChildren();
  valid.forEach((choice, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice-btn';
    btn.textContent = `الخيار ${index + 1}: ${choice}`;
    btn.addEventListener('click', () => progressStory(choice));
    choicesContainer.appendChild(btn);
  });
}

async function handleStory(text, isNewTurn = false) {
  const parsed = parseStory(text);
  if (isNewTurn) appendStoryText('— — —', 'story-paragraph');
  appendStoryText(parsed.story);
  displayChoices(parsed.choices);
  // الصورة لا توقف القصة إذا تعذر نموذج الصور.
  generateSceneImage(parsed.imagePrompt);
}

async function startAdventure() {
  if (busy) return;
  if (!apiKey) {
    setPanel(settingsPanel);
    appendStoryText('أدخل مفتاح Gemini API مرة واحدة من الإعدادات لبدء المغامرة. سيُحفظ على هذا الجهاز.', 'error-msg');
    return;
  }
  adventureStarted = true;
  chatHistory = [];
  storyBox.replaceChildren();
  choicesContainer.replaceChildren();
  setBusy(true, 'جاري الاتصال بـ Gemini وبدء المغامرة...');
  try {
    const text = await generateStory('ابدأ القصة: يستيقظ البطل داخل كبسولة أمان في محطة فضائية مهجورة تدور حول كوكب مجهول. أضواء الإنذار الحمراء تومض، والباب الرئيسي مغلق، ويصل صوت غامض من الممر. قدّم بداية قوية وثلاثة اختيارات.');
    await handleStory(text);
  } catch (err) {
    appendStoryText(`تعذر بدء المغامرة: ${err.message}`, 'error-msg');
  } finally {
    setBusy(false);
    if (imageLoader.textContent.includes('جاري تجهيز')) imageLoader.classList.add('hidden');
  }
}

async function progressStory(actionText) {
  if (busy || !apiKey) return;
  appendStoryText(`إجراءك: ${actionText}`, 'user-action');
  setBusy(true, 'جاري متابعة أحداث المغامرة...');
  try {
    const text = await generateStory(`إجراء اللاعب: ${actionText}\nواصل القصة بناءً على هذا القرار، واذكر النتيجة بوضوح، ثم وصف المشهد بالإنجليزية وثلاثة اختيارات جديدة.`);
    await handleStory(text, true);
  } catch (err) {
    appendStoryText(`تعذر متابعة المغامرة: ${err.message}`, 'error-msg');
  } finally {
    setBusy(false);
  }
}

// تشغيل تلقائي إذا كان المفتاح محفوظًا، وإلا فتح إعدادات المفتاح.
window.addEventListener('DOMContentLoaded', () => {
  if (apiKey) startAdventure();
  else {
    setPanel(settingsPanel);
    appendStoryText('أهلًا بك! أدخل مفتاح Gemini API مرة واحدة ثم اضغط «حفظ المفتاح وبدء المغامرة».', 'story-paragraph');
  }
});
