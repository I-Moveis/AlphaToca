import { describe, it, expect, vi } from "vitest";
import { bootstrapLangSmith, resolveLangSmithStatus } from "../src/config/langsmith";

function mockLogger() {
    return {
        log: vi.fn(),
        warn: vi.fn(),
    };
}

describe("resolveLangSmithStatus", () => {
    it("returns disabled when LANGCHAIN_TRACING_V2 is not 'true'", () => {
        expect(resolveLangSmithStatus({})).toEqual({
            enabled: false,
            project: null,
            missingApiKey: false,
        });
        expect(resolveLangSmithStatus({ LANGCHAIN_TRACING_V2: "false" })).toMatchObject({
            enabled: false,
        });
        expect(resolveLangSmithStatus({ LANGCHAIN_TRACING_V2: "1" })).toMatchObject({
            enabled: false,
        });
    });

    it("marks missingApiKey when tracing is on but no key is set", () => {
        expect(
            resolveLangSmithStatus({ LANGCHAIN_TRACING_V2: "true" }),
        ).toMatchObject({
            enabled: true,
            missingApiKey: true,
        });
        expect(
            resolveLangSmithStatus({ LANGCHAIN_TRACING_V2: "true", LANGCHAIN_API_KEY: "   " }),
        ).toMatchObject({ missingApiKey: true });
    });

    it("falls back to 'default' when LANGCHAIN_PROJECT is not set", () => {
        expect(
            resolveLangSmithStatus({
                LANGCHAIN_TRACING_V2: "true",
                LANGCHAIN_API_KEY: "ls-...",
            }),
        ).toEqual({
            enabled: true,
            project: "default",
            missingApiKey: false,
        });
    });

    it("carries the configured project through", () => {
        expect(
            resolveLangSmithStatus({
                LANGCHAIN_TRACING_V2: "true",
                LANGCHAIN_API_KEY: "ls-abc",
                LANGCHAIN_PROJECT: "alphatoca-prod",
            }),
        ).toMatchObject({ enabled: true, project: "alphatoca-prod" });
    });
});

describe("bootstrapLangSmith", () => {
    it("logs an info line when tracing is disabled", () => {
        const logger = mockLogger();
        const status = bootstrapLangSmith(logger, {});
        expect(status.enabled).toBe(false);
        expect(logger.log).toHaveBeenCalledTimes(1);
        expect(String(logger.log.mock.calls[0][0])).toContain("tracing disabled");
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it("warns when tracing is on but API key is missing", () => {
        const logger = mockLogger();
        bootstrapLangSmith(logger, { LANGCHAIN_TRACING_V2: "true" });
        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(String(logger.warn.mock.calls[0][0])).toContain("LANGCHAIN_API_KEY is missing");
    });

    it("logs enabled + project when tracing is fully configured", () => {
        const logger = mockLogger();
        bootstrapLangSmith(logger, {
            LANGCHAIN_TRACING_V2: "true",
            LANGCHAIN_API_KEY: "ls-xyz",
            LANGCHAIN_PROJECT: "alphatoca-staging",
        });
        expect(logger.log).toHaveBeenCalledTimes(1);
        const line = String(logger.log.mock.calls[0][0]);
        expect(line).toContain("tracing enabled");
        expect(line).toContain("alphatoca-staging");
        expect(logger.warn).not.toHaveBeenCalled();
    });
});
