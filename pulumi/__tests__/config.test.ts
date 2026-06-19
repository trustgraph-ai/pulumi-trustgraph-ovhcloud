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
            "project:ai-endpoint": "mistral-nemo-instruct-2407.endpoints.kepler.ai.cloud.ovh.net",
            "project:ai-endpoints-token": "mock-token",
            "project:domain": "ovh1.dev.trustgraph.ai",
            "project:grafana-domain": "grafana.ovh1.dev.trustgraph.ai",
            "project:letsencrypt-email": "admin@trustgraph.ai",
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
        expect(config.aiEndpoint).toBe("mistral-nemo-instruct-2407.endpoints.kepler.ai.cloud.ovh.net");
    });

    test("should load gateway configuration values", async () => {
        const config = await import("../config");

        expect(config.domain).toBe("ovh1.dev.trustgraph.ai");
        expect(config.grafanaDomain).toBe("grafana.ovh1.dev.trustgraph.ai");
        expect(config.letsencryptEmail).toBe("admin@trustgraph.ai");
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
            "project:ai-endpoint": "mistral-nemo-instruct-2407.endpoints.kepler.ai.cloud.ovh.net",
            "project:domain": "ovh1.dev.trustgraph.ai",
            "project:grafana-domain": "grafana.ovh1.dev.trustgraph.ai",
            "project:letsencrypt-email": "admin@trustgraph.ai",
        });

        await expect(import("../config")).rejects.toThrow();
    });

    test("should handle missing region configuration", async () => {
        pulumi.runtime.setAllConfig({
            "project:environment": "test",
            "project:service-name": "mock-service-id",
            "project:ai-endpoint": "mistral-nemo-instruct-2407.endpoints.kepler.ai.cloud.ovh.net",
            "project:domain": "ovh1.dev.trustgraph.ai",
            "project:grafana-domain": "grafana.ovh1.dev.trustgraph.ai",
            "project:letsencrypt-email": "admin@trustgraph.ai",
        });

        await expect(import("../config")).rejects.toThrow();
    });

    test("should handle missing service-name configuration", async () => {
        pulumi.runtime.setAllConfig({
            "project:environment": "test",
            "project:region": "GRA11",
            "project:ai-endpoint": "mistral-nemo-instruct-2407.endpoints.kepler.ai.cloud.ovh.net",
            "project:domain": "ovh1.dev.trustgraph.ai",
            "project:grafana-domain": "grafana.ovh1.dev.trustgraph.ai",
            "project:letsencrypt-email": "admin@trustgraph.ai",
        });

        await expect(import("../config")).rejects.toThrow();
    });

    test("should handle missing ai-endpoint configuration", async () => {
        pulumi.runtime.setAllConfig({
            "project:environment": "test",
            "project:region": "GRA11",
            "project:service-name": "mock-service-id",
            "project:domain": "ovh1.dev.trustgraph.ai",
            "project:grafana-domain": "grafana.ovh1.dev.trustgraph.ai",
            "project:letsencrypt-email": "admin@trustgraph.ai",
        });

        await expect(import("../config")).rejects.toThrow();
    });

    test("should handle missing domain configuration", async () => {
        pulumi.runtime.setAllConfig({
            "project:environment": "test",
            "project:region": "GRA11",
            "project:service-name": "mock-service-id",
            "project:ai-endpoint": "mistral-nemo-instruct-2407.endpoints.kepler.ai.cloud.ovh.net",
            "project:grafana-domain": "grafana.ovh1.dev.trustgraph.ai",
            "project:letsencrypt-email": "admin@trustgraph.ai",
        });

        await expect(import("../config")).rejects.toThrow();
    });

    test("should handle missing grafana-domain configuration", async () => {
        pulumi.runtime.setAllConfig({
            "project:environment": "test",
            "project:region": "GRA11",
            "project:service-name": "mock-service-id",
            "project:ai-endpoint": "mistral-nemo-instruct-2407.endpoints.kepler.ai.cloud.ovh.net",
            "project:domain": "ovh1.dev.trustgraph.ai",
            "project:letsencrypt-email": "admin@trustgraph.ai",
        });

        await expect(import("../config")).rejects.toThrow();
    });

    test("should handle missing letsencrypt-email configuration", async () => {
        pulumi.runtime.setAllConfig({
            "project:environment": "test",
            "project:region": "GRA11",
            "project:service-name": "mock-service-id",
            "project:ai-endpoint": "mistral-nemo-instruct-2407.endpoints.kepler.ai.cloud.ovh.net",
            "project:domain": "ovh1.dev.trustgraph.ai",
            "project:grafana-domain": "grafana.ovh1.dev.trustgraph.ai",
        });

        await expect(import("../config")).rejects.toThrow();
    });

    test("should use default values for optional configuration", async () => {
        const config = await import("../config");

        expect(config.nodeSize).toBe("b2-15");
        expect(config.nodeCount).toBe(2);
        expect(config.aiEndpointsToken).toBeDefined();
    });

    test("should override default values when provided", async () => {
        pulumi.runtime.setAllConfig({
            "project:environment": "test",
            "project:region": "GRA11",
            "project:service-name": "mock-service-id",
            "project:ai-endpoint": "mistral-nemo-instruct-2407.endpoints.kepler.ai.cloud.ovh.net",
            "project:node-size": "b2-30",
            "project:node-count": "3",
            "project:domain": "ovh1.dev.trustgraph.ai",
            "project:grafana-domain": "grafana.ovh1.dev.trustgraph.ai",
            "project:letsencrypt-email": "admin@trustgraph.ai",
        });

        const config = await import("../config");

        expect(config.nodeSize).toBe("b2-30");
        expect(config.nodeCount).toBe(3);
    });
});
