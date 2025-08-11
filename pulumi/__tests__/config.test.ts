import * as pulumi from "@pulumi/pulumi";

pulumi.runtime.setMocks({
    newResource: function(args: pulumi.runtime.MockResourceArgs): {id: string, state: any} {
        return {
            id: args.inputs.name + "_id",
            state: args.inputs,
        };
    },
    call: function(args: pulumi.runtime.MockCallArgs) {
        return args.inputs;
    },
});

describe("Configuration Loading", () => {
    beforeEach(() => {
        pulumi.runtime.setAllConfig({
            "project:environment": "test",
            "project:region": "GRA11",
            "project:service-name": "mock-service-id",
            "project:ai-model": "mistral-nemo-instruct-2407",
            "project:ai-endpoint": "mistral-nemo-instruct-2407.endpoints.kepler.ai.cloud.ovh.net",
            "project:ai-endpoints-token": "mock-token",
        });
    });

    afterEach(() => {
        jest.resetModules();
    });

    test("should load required configuration values", async () => {
        const config = await import("../config");
        
        expect(config.environment).toBe("test");
        expect(config.region).toBe("GRA11");
        expect(config.serviceName).toBe("mock-service-id");
        expect(config.aiModel).toBe("mistral-nemo-instruct-2407");
        expect(config.aiEndpoint).toBe("mistral-nemo-instruct-2407.endpoints.kepler.ai.cloud.ovh.net");
    });

    test("should generate correct prefix based on environment", async () => {
        const config = await import("../config");
        
        expect(config.prefix).toBe("trustgraph-test");
    });

    test("should have correct node configuration", async () => {
        const config = await import("../config");
        
        expect(config.nodeSize).toBe("b2-15");
        expect(config.nodeCount).toBe(2);
    });

    test("should generate correct tags", async () => {
        const config = await import("../config");
        
        expect(config.tags).toEqual({
            environment: "test",
            project: "trustgraph"
        });
        expect(config.tagsSep).toBe("environment=test,project=trustgraph");
    });

    test("should handle missing environment configuration", async () => {
        pulumi.runtime.setAllConfig({
            "project:region": "GRA11",
            "project:service-name": "mock-service-id",
            "project:ai-model": "mistral-nemo-instruct-2407",
            "project:ai-endpoint": "mistral-nemo-instruct-2407.endpoints.kepler.ai.cloud.ovh.net",
        });

        await expect(import("../config")).rejects.toThrow();
    });

    test("should handle missing region configuration", async () => {
        pulumi.runtime.setAllConfig({
            "project:environment": "test",
            "project:service-name": "mock-service-id",
            "project:ai-model": "mistral-nemo-instruct-2407",
            "project:ai-endpoint": "mistral-nemo-instruct-2407.endpoints.kepler.ai.cloud.ovh.net",
        });

        await expect(import("../config")).rejects.toThrow();
    });

    test("should handle missing service-name configuration", async () => {
        pulumi.runtime.setAllConfig({
            "project:environment": "test",
            "project:region": "GRA11",
            "project:ai-model": "mistral-nemo-instruct-2407",
            "project:ai-endpoint": "mistral-nemo-instruct-2407.endpoints.kepler.ai.cloud.ovh.net",
        });

        await expect(import("../config")).rejects.toThrow();
    });

    test("should handle missing ai-model configuration", async () => {
        pulumi.runtime.setAllConfig({
            "project:environment": "test",
            "project:region": "GRA11",
            "project:service-name": "mock-service-id",
            "project:ai-endpoint": "mistral-nemo-instruct-2407.endpoints.kepler.ai.cloud.ovh.net",
        });

        await expect(import("../config")).rejects.toThrow();
    });

    test("should handle missing ai-endpoint configuration", async () => {
        pulumi.runtime.setAllConfig({
            "project:environment": "test",
            "project:region": "GRA11",
            "project:service-name": "mock-service-id",
            "project:ai-model": "mistral-nemo-instruct-2407",
        });

        await expect(import("../config")).rejects.toThrow();
    });

    test("should use default values for optional configuration", async () => {
        pulumi.runtime.setAllConfig({
            "project:environment": "test",
            "project:region": "GRA11",
            "project:service-name": "mock-service-id",
            "project:ai-model": "mistral-nemo-instruct-2407",
            "project:ai-endpoint": "mistral-nemo-instruct-2407.endpoints.kepler.ai.cloud.ovh.net",
        });

        const config = await import("../config");
        
        // Default node configuration
        expect(config.nodeSize).toBe("b2-15");
        expect(config.nodeCount).toBe(2);
        
        // AI endpoints token should have a default
        expect(config.aiEndpointsToken).toBeDefined();
    });

    test("should override default values when provided", async () => {
        pulumi.runtime.setAllConfig({
            "project:environment": "test",
            "project:region": "GRA11",
            "project:service-name": "mock-service-id",
            "project:ai-model": "mistral-nemo-instruct-2407",
            "project:ai-endpoint": "mistral-nemo-instruct-2407.endpoints.kepler.ai.cloud.ovh.net",
            "project:node-size": "b2-30",
            "project:node-count": "3",
        });

        const config = await import("../config");
        
        expect(config.nodeSize).toBe("b2-30");
        expect(config.nodeCount).toBe(3);
    });
});