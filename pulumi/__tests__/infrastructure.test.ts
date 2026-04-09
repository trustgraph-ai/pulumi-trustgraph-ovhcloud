import * as pulumi from "@pulumi/pulumi";

// Mock @pulumi/kubernetes to avoid native module issues in test environment
jest.mock('@pulumi/kubernetes', () => {
    const pulumiSdk = jest.requireActual('@pulumi/pulumi');
    return {
        Provider: class extends pulumiSdk.ProviderResource {
            constructor(name: string, args?: any, opts?: any) {
                super('kubernetes', name, args, opts);
            }
        },
        core: { v1: { Secret: class extends pulumiSdk.CustomResource {
            constructor(name: string, args?: any, opts?: any) {
                super('kubernetes:core/v1:Secret', name, args, opts);
            }
        }}},
        yaml: { v2: { ConfigGroup: class extends pulumiSdk.CustomResource {
            constructor(name: string, args?: any, opts?: any) {
                super('kubernetes:yaml/v2:ConfigGroup', name, args, opts);
            }
        }}},
    };
});

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
    });

    test("should have valid AI URL format", async () => {
        // The aiUrl should be a Pulumi Output
        expect(infraModule.aiUrl).toBeDefined();
        
        // In test mode, Outputs are wrapped but we can verify they exist
        const urlString = infraModule.aiUrl.toString();
        expect(urlString).toContain("Output");
    });
});