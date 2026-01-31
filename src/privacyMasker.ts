import { PrivacyModeConfig } from "./types";

export interface PrivacyMaskResult {
  maskedContent: string;
  totalMasked: number;
  byType: Record<string, number>;
}

interface ReplaceResult {
  output: string;
  count: number;
}

function replaceAndCount(
  input: string,
  regex: RegExp,
  replacer: string | ((match: string, ...groups: string[]) => string)
): ReplaceResult {
  let count = 0;
  const output = input.replace(regex, (...args) => {
    count += 1;
    if (typeof replacer === "string") return replacer;
    return replacer(args[0], ...args.slice(1));
  });
  return { output, count };
}

export function maskContent(content: string, config: PrivacyModeConfig): PrivacyMaskResult {
  if (!config.enabled) {
    return { maskedContent: content, totalMasked: 0, byType: {} };
  }

  const byType: Record<string, number> = {};
  let totalMasked = 0;
  let output = content;
  const placeholder = config.placeholder || "[REDACTED]";

  if (config.maskEmails) {
    const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
    const result = replaceAndCount(output, emailRegex, `${placeholder}_EMAIL`);
    output = result.output;
    byType.email = (byType.email || 0) + result.count;
    totalMasked += result.count;
  }

  if (config.maskApiKeys) {
    const apiKeyRegex = /\b(api[_-]?key|apikey|access[_-]?key|secret|client[_-]?secret)\b\s*[:=]\s*['"]?([A-Za-z0-9\-_=]{8,})['"]?/gi;
    const result = replaceAndCount(output, apiKeyRegex, (match, _label) => {
      return match.replace(/[:=].*$/, `: ${placeholder}_API_KEY`);
    });
    output = result.output;
    byType.apiKey = (byType.apiKey || 0) + result.count;
    totalMasked += result.count;
  }

  if (config.maskTokens) {
    const jwtRegex = /\beyJ[A-Za-z0-9_-]+?\.[A-Za-z0-9_-]+?\.[A-Za-z0-9_-]+?\b/g;
    const bearerRegex = /\bBearer\s+([A-Za-z0-9\-._~+/]+=*)/g;
    const genericTokenRegex = /\b(?:sk|rk|pk|ak|xoxb|xoxa|xoxp|xoxs|ghp|gho|ghu|ghs)[A-Za-z0-9_-]{8,}\b/gi;

    let result = replaceAndCount(output, jwtRegex, `${placeholder}_TOKEN`);
    output = result.output;
    byType.token = (byType.token || 0) + result.count;
    totalMasked += result.count;

    result = replaceAndCount(output, bearerRegex, (match) => {
      return match.replace(/Bearer\s+.*/, `Bearer ${placeholder}_TOKEN`);
    });
    output = result.output;
    byType.token = (byType.token || 0) + result.count;
    totalMasked += result.count;

    result = replaceAndCount(output, genericTokenRegex, `${placeholder}_TOKEN`);
    output = result.output;
    byType.token = (byType.token || 0) + result.count;
    totalMasked += result.count;
  }

  if (config.customPatterns && config.customPatterns.length > 0) {
    for (const pattern of config.customPatterns) {
      try {
        const regex = new RegExp(pattern, "g");
        const result = replaceAndCount(output, regex, `${placeholder}_CUSTOM`);
        output = result.output;
        if (result.count > 0) {
          byType.custom = (byType.custom || 0) + result.count;
          totalMasked += result.count;
        }
      } catch {
        // Ignore invalid regex patterns
      }
    }
  }

  return { maskedContent: output, totalMasked, byType };
}
