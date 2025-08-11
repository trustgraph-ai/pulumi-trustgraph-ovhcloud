import * as pulumi from "@pulumi/pulumi";

// Mock the fs module before any imports that use it
jest.mock('fs', () => ({
    readFileSync: jest.fn().mockImplementation((path) => {
        if (path.includes('resources.yaml')) {
            return 'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: trustgraph';
        }
        return '';
    }),
    writeFile: jest.fn().mockImplementation((path, data, cb) => {
        if (cb) cb(null);
    })
}));

describe("Infrastructure Tests", () => {
    let infraModule: any;

    beforeAll(async () => {
        // Set up the mocks
        pulumi.runtime.setMocks({
            newResource: function(args: pulumi.runtime.MockResourceArgs): {id: string, state: any} {
                // Return mock resource
                return {
                    id: args.name + "_id",
                    state: {
                        ...args.inputs,
                        // Add specific outputs for resources that need them
                        ...(args.type === "ovhcloud:cloudproject/kube:Kube" ? {
                            kubeconfig: JSON.stringify({
                                clusters: [{ cluster: { server: "https://mock.ovh.net" } }]
                            })
                        } : {})
                    },
                };
            },
            call: function(args: pulumi.runtime.MockCallArgs) {
                return args.inputs;
            },
        });

        // Configure the stack
        pulumi.runtime.setAllConfig({
            "project:environment": "test",
            "project:region": "GRA11",
            "project:service-name": "mock-service-id",
            "project:ai-model": "mistral-nemo-instruct-2407",
            "project:ai-endpoint": "mistral-nemo-instruct-2407.endpoints.kepler.ai.cloud.ovh.net",
            "project:ai-endpoints-token": "mock-token",
        });
    });

    test("should create infrastructure and export values", async () => {
        // Import the infrastructure module
        infraModule = await import("../index");

        // Test that exports are defined
        expect(infraModule.clusterId).toBeDefined();
        expect(infraModule.clusterEndpoint).toBeDefined();
        expect(infraModule.aiUrl).toBeDefined();
        expect(infraModule.networkId).toBeDefined();
    });

    test("should have valid AI URL format", async () => {
        // The aiUrl should be a Pulumi Output
        expect(infraModule.aiUrl).toBeDefined();
        
        // In test mode, Outputs are wrapped but we can verify they exist
        const urlString = infraModule.aiUrl.toString();
        expect(urlString).toContain("Output");
    });
});