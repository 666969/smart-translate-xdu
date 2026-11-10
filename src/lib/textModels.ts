const baseUrl = process.env.OPENAI_BASE_URL || "";
const endpoint = URL.canParse(baseUrl) ? new URL(baseUrl) : null;

export const usesDeepSeek = endpoint?.hostname === "api.deepseek.com" ||
  Boolean(endpoint && /\/api\/deepseek-proxy(?:\/|$)/u.test(endpoint.pathname));

const fallbackModel = process.env.OPENAI_MODEL || "gpt-4o";
const deepSeekFlash = "deepseek-flash";

export const textModels = {
  default: usesDeepSeek ? deepSeekFlash : fallbackModel,
  flash: usesDeepSeek ? deepSeekFlash : process.env.OPENAI_MODEL_FLASH || fallbackModel,
  deep: usesDeepSeek ? deepSeekFlash : process.env.OPENAI_MODEL_PRO || fallbackModel,
};
