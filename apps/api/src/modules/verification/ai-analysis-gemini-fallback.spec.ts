import 'reflect-metadata';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { Logger } from '@nestjs/common';
import { AiAnalysisService, AI_UNAVAILABLE } from './ai-analysis.service.js';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const GEMINI_TEXT = JSON.stringify({
  issues: [
    {
      rule: 'bank_detail_change',
      severity: 'critical',
      message: 'Bank account changed compared to prior invoices.',
      source: 'Invoice INV-1, payment details',
      recommended_action: 'Verify the new bank details with the vendor by phone before paying.',
    },
  ],
  ai_summary: 'Critical bank detail change detected.',
  risk_assessment: 'high',
});

const ANTHROPIC_TEXT = JSON.stringify({
  issues: [
    {
      rule: 'missing_po',
      severity: 'warning',
      message: 'Large invoice has no PO number.',
      source: 'Invoice INV-2, po_number',
      recommended_action: 'Obtain a PO number or written approval before paying.',
    },
  ],
  ai_summary: 'One warning: missing purchase order.',
  risk_assessment: 'medium',
});

function geminiOk(text: string) {
  return {
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  };
}

function anthropicOk(text: string) {
  return {
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => ({ content: [{ type: 'text', text }] }),
  };
}

function httpError(status: number) {
  return {
    ok: false,
    status,
    text: async () => 'provider error ' + status,
    json: async () => ({}),
  };
}

describe('AiAnalysisService Gemini-primary with Anthropic fallback', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function setKeys(gemini: string | undefined, anthropic: string | undefined) {
    if (gemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = gemini;
    if (anthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = anthropic;
    delete process.env.ANTHROPIC_WORKSPACE_ID;
  }

  it('(a) Gemini success → Anthropic never called, validated result returned', async () => {
    setKeys('test-gemini-key', 'sk-ant-test-key');
    const fetchMock = vi.fn().mockResolvedValue(geminiOk(GEMINI_TEXT));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new AiAnalysisService().analyze('document', { a: 1 });

    expect(result.llm_unavailable).toBeUndefined();
    expect(result.risk_assessment).toBe('high');
    expect(result.ai_summary).toBe('Critical bank detail change detected.');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toEqual({
      rule: 'bank_detail_change',
      severity: 'critical',
      message: 'Bank account changed compared to prior invoices.',
      source: 'Invoice INV-1, payment details',
      recommended_action: 'Verify the new bank details with the vendor by phone before paying.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(GEMINI_URL);
    const headers = (init as { headers: Record<string, string> }).headers;
    expect(headers['x-goog-api-key']).toBe('test-gemini-key');
    const body = JSON.parse((init as { body: string }).body) as {
      generationConfig: { maxOutputTokens: number; responseMimeType: string };
      system_instruction: { parts: Array<{ text: string }> };
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.maxOutputTokens).toBe(1200);
    expect(body.system_instruction.parts[0]!.text).toContain('verification analyst');
    expect(body.contents[0]!.parts[0]!.text).toContain('"a": 1');
  });

  it('(b) Gemini 429 → Anthropic success, fallback warning logged', async () => {
    setKeys('test-gemini-key', 'sk-ant-test-key');
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const fetchMock = vi.fn(async (url: unknown) =>
      String(url).includes('generativelanguage') ? httpError(429) : anthropicOk(ANTHROPIC_TEXT),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new AiAnalysisService().analyze('document', { a: 1 });

    expect(result.llm_unavailable).toBeUndefined();
    expect(result.risk_assessment).toBe('medium');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(GEMINI_URL);
    expect(String(fetchMock.mock.calls[1]![0])).toBe(ANTHROPIC_URL);
    expect(warnSpy.mock.calls.some((args) => String(args[0]).includes('falling back to Anthropic'))).toBe(true);
    expect(warnSpy.mock.calls.some((args) => String(args[0]).includes('http-429'))).toBe(true);
  });

  it('(c) Gemini network error → Anthropic success', async () => {
    setKeys('test-gemini-key', 'sk-ant-test-key');
    const fetchMock = vi.fn(async (url: unknown) => {
      if (String(url).includes('generativelanguage')) throw new TypeError('fetch failed');
      return anthropicOk(ANTHROPIC_TEXT);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await new AiAnalysisService().analyze('document', { a: 1 });

    expect(result.llm_unavailable).toBeUndefined();
    expect(result.risk_assessment).toBe('medium');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]![0])).toBe(ANTHROPIC_URL);
  });

  it('(d) GEMINI_API_KEY unset + ANTHROPIC_API_KEY set → Anthropic called', async () => {
    setKeys(undefined, 'sk-ant-test-key');
    const fetchMock = vi.fn().mockResolvedValue(anthropicOk(ANTHROPIC_TEXT));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new AiAnalysisService().analyze('document', { a: 1 });

    expect(result.llm_unavailable).toBeUndefined();
    expect(result.risk_assessment).toBe('medium');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(ANTHROPIC_URL);
  });

  it('(e) both providers fail → AI_UNAVAILABLE', async () => {
    setKeys('test-gemini-key', 'sk-ant-test-key');
    const fetchMock = vi.fn(async (url: unknown) =>
      String(url).includes('generativelanguage') ? httpError(429) : httpError(500),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new AiAnalysisService().analyze('document', { a: 1 });

    expect(result).toBe(AI_UNAVAILABLE);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('(f) ANTHROPIC_API_KEY unset + Gemini fails → AI_UNAVAILABLE, Anthropic never called', async () => {
    setKeys('test-gemini-key', undefined);
    const fetchMock = vi.fn().mockResolvedValue(httpError(500));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new AiAnalysisService().analyze('document', { a: 1 });

    expect(result).toBe(AI_UNAVAILABLE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(GEMINI_URL);
  });

  it('(g) Anthropic returns invalid JSON after Gemini failed → AI_UNAVAILABLE', async () => {
    setKeys('test-gemini-key', 'sk-ant-test-key');
    const fetchMock = vi.fn(async (url: unknown) =>
      String(url).includes('generativelanguage') ? httpError(429) : anthropicOk('not-json{'),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new AiAnalysisService().analyze('document', { a: 1 });

    expect(result).toBe(AI_UNAVAILABLE);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('(h) Anthropic response text parsed into the same validated shape', async () => {
    setKeys('test-gemini-key', 'sk-ant-test-key');
    const fetchMock = vi.fn(async (url: unknown) =>
      String(url).includes('generativelanguage') ? httpError(429) : anthropicOk(ANTHROPIC_TEXT),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new AiAnalysisService().analyze('document', { a: 1 });

    expect(result.llm_unavailable).toBeUndefined();
    expect(result.risk_assessment).toBe('medium');
    expect(result.ai_summary).toBe('One warning: missing purchase order.');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toEqual({
      rule: 'missing_po',
      severity: 'warning',
      message: 'Large invoice has no PO number.',
      source: 'Invoice INV-2, po_number',
      recommended_action: 'Obtain a PO number or written approval before paying.',
    });
  });
});
