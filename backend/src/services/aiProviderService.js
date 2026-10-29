const callOpenAI = async (prompt, apiKey) => {
  if (!apiKey) throw new Error('API key missing');
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'system', content: prompt }],
      temperature: 0.7
    }),
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) {
      throw Object.assign(new Error(`OpenAI Error: ${response.status}`), { isRetryable: true });
    }
    throw new Error(`OpenAI Error: ${response.status}`);
  }
  
  const data = await response.json();
  let text = data.choices?.[0]?.message?.content || "[]";
  return parseJson(text);
};

const callGemini = async (prompt, apiKey) => {
  if (!apiKey) throw new Error('API key missing');
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7 }
    }),
    signal: AbortSignal.timeout(10000)
  });
  
  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) {
      throw Object.assign(new Error(`Gemini Error: ${response.status}`), { isRetryable: true });
    }
    throw new Error(`Gemini Error: ${response.status}`);
  }
  
  const data = await response.json();
  let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
  return parseJson(text);
};

const callGroq = async (prompt, apiKey) => {
  if (!apiKey) throw new Error('API key missing');
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'system', content: prompt }],
      temperature: 0.7
    }),
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) {
      throw Object.assign(new Error(`Groq Error: ${response.status}`), { isRetryable: true });
    }
    throw new Error(`Groq Error: ${response.status}`);
  }
  
  const data = await response.json();
  let text = data.choices?.[0]?.message?.content || "[]";
  return parseJson(text);
};

const parseJson = (text) => {
  let cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch (e) {
    throw Object.assign(new Error('AI returned invalid JSON'), { isRetryable: true });
  }
};

const getApiKey = (provider) => {
  if (provider === 'openai') return process.env.OPENAI_API_KEY;
  if (provider === 'gemini') return process.env.GEMINI_API_KEY;
  if (provider === 'groq') return process.env.GROQ_API_KEY;
  return null;
};

export const getAIRecommendationsMultiProvider = async (prompt) => {
  const primary = process.env.AI_PROVIDER || 'openai';
  const fallbacksStr = process.env.AI_FALLBACK_PROVIDERS || 'gemini,groq';
  const fallbacks = fallbacksStr.split(',').map(s => s.trim()).filter(Boolean);
  
  const providersToTry = [primary, ...fallbacks.filter(p => p !== primary)];
  
  for (const provider of providersToTry) {
    try {
      const apiKey = getApiKey(provider);
      if (!apiKey) continue;

      if (provider === 'openai') {
        const ids = await callOpenAI(prompt, apiKey);
        return { ids, source: 'ai', provider: 'openai' };
      } else if (provider === 'gemini') {
        const ids = await callGemini(prompt, apiKey);
        return { ids, source: 'ai', provider: 'gemini' };
      } else if (provider === 'groq') {
        const ids = await callGroq(prompt, apiKey);
        return { ids, source: 'ai', provider: 'groq' };
      }
    } catch (err) {
      console.error(`Provider ${provider} failed: ${err.message}`);
      if (!err.isRetryable && err.name !== 'TimeoutError') {
        // Log non-retryable error but try fallback providers anyway to ensure high availability
        console.warn(`Non-retryable error from ${provider}, skipping to next fallback.`);
      }
    }
  }
  
  throw new Error('All configured AI providers failed or missing API keys.');
};

const parseAnyJson = (text) => {
  let cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch (err) {}
    }
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        return JSON.parse(arrMatch[0]);
      } catch (err) {}
    }
    throw Object.assign(new Error('AI returned invalid JSON'), { isRetryable: true });
  }
};

const callOpenAIJson = async (prompt, systemInstruction, apiKey) => {
  if (!apiKey) throw new Error('API key missing');
  const messages = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages,
      temperature: 0.7
    }),
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) {
      throw Object.assign(new Error(`OpenAI Error: ${response.status}`), { isRetryable: true });
    }
    throw new Error(`OpenAI Error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '{}';
  return parseAnyJson(text);
};

const callGeminiJson = async (prompt, systemInstruction, apiKey) => {
  if (!apiKey) throw new Error('API key missing');
  const fullPrompt = systemInstruction ? `${systemInstruction}\n\n${prompt}` : prompt;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: { temperature: 0.7 }
    }),
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) {
      throw Object.assign(new Error(`Gemini Error: ${response.status}`), { isRetryable: true });
    }
    throw new Error(`Gemini Error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  return parseAnyJson(text);
};

const callGroqJson = async (prompt, systemInstruction, apiKey) => {
  if (!apiKey) throw new Error('API key missing');
  const messages = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-20b',
      messages,
      temperature: 0.7
    }),
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) {
      throw Object.assign(new Error(`Groq Error: ${response.status}`), { isRetryable: true });
    }
    throw new Error(`Groq Error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '{}';
  return parseAnyJson(text);
};

export const callAIJson = async (prompt, systemInstruction = '') => {
  const primary = process.env.AI_PROVIDER || 'openai';
  const fallbacksStr = process.env.AI_FALLBACK_PROVIDERS || 'gemini,groq';
  const fallbacks = fallbacksStr.split(',').map(s => s.trim()).filter(Boolean);

  const providersToTry = [primary, ...fallbacks.filter(p => p !== primary)];

  for (const provider of providersToTry) {
    try {
      const apiKey = getApiKey(provider);
      if (!apiKey) continue;

      if (provider === 'openai') {
        const result = await callOpenAIJson(prompt, systemInstruction, apiKey);
        return { data: result, provider: 'openai' };
      } else if (provider === 'gemini') {
        const result = await callGeminiJson(prompt, systemInstruction, apiKey);
        return { data: result, provider: 'gemini' };
      } else if (provider === 'groq') {
        const result = await callGroqJson(prompt, systemInstruction, apiKey);
        return { data: result, provider: 'groq' };
      }
    } catch (err) {
      console.warn(`Provider ${provider} failed for callAIJson: ${err.message}`);
    }
  }

  return null;
};

