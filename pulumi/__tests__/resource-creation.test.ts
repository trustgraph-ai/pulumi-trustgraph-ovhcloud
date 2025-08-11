import * as pulumi from "@pulumi/pulumi";

// Mock the fs module
jest.mock('fs', () => ({
    readFileSync: jest.fn().mockImplementation((path) => {
        if (path.includes('resources.yaml')) {
            return `
apiVersion: v1
kind: Namespace
metadata:
  name: trustgraph
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: trustgraph-config
  namespace: trustgraph
data:
  config: "test"
`;
        }
        return '';
    }),
    writeFile: jest.fn().mockImplementation((path, data, cb) => {
        if (cb) cb(null);
    })
}));

// Track created resources
interface MockResource {
    type: string;
    name: string;
    inputs: any;
}

let resources: MockResource[] = [];

describe("Resource Creation Tests", () => {
    beforeAll(async () => {
        // Clear resources and module cache
        resources = [];
        jest.resetModules();

        // Set up Pulumi mocks
        pulumi.runtime.setMocks({
            newResource: function(args: pulumi.runtime.MockResourceArgs): {id: string, state: any} {
                resources.push({
                    type: args.type,
                    name: args.name,
                    inputs: args.inputs
                });

                // Return appropriate state based on resource type
                const state: any = {
                    ...args.inputs,
                    id: `${args.name}_id`,
                };

                // Add type-specific outputs
                switch (args.type) {
                    case "ovhcloud:cloudproject/kube:Kube":
                        state.kubeconfig = JSON.stringify({
                            apiVersion: "v1",
                            kind: "Config",
                            clusters: [{
                                cluster: {
                                    server: "https://mock-cluster.ovh.net",
                                    "certificate-authority-data": "mock-cert"
                                },
                                name: "mock-cluster"
                            }],
                            contexts: [{
                                context: { cluster: "mock-cluster", user: "mock-user" },
                                name: "mock-context"
                            }],
                            "current-context": "mock-context",
                            users: [{
                                name: "mock-user",
                                user: { token: "mock-token" }
                            }]
                        });
                        break;
                    case "ovhcloud:cloudproject/user:User":
                        state.username = "mock-user";
                        state.password = "mock-password";
                        break;
                    case "ovhcloud:cloudproject/kubeNodePool:KubeNodePool":
                        state.status = "READY";
                        break;
                }

                return { id: state.id, state };
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

        // Import the module once to trigger resource creation
        await import("../index");
        
        // Wait for async operations
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    test("creates resources", () => {
        console.log(`Total resources created: ${resources.length}`);
        console.log("Resource types:", resources.map(r => r.type));
        expect(resources.length).toBeGreaterThan(0);
    });

    test("creates OVHCloud provider", () => {
        const provider = resources.find(r => r.type === "pulumi:providers:ovhcloud");
        expect(provider).toBeDefined();
        expect(provider?.name).toBe("ovhcloud-provider");
    });

    test("creates private network with correct configuration", () => {
        const network = resources.find(r => r.type === "ovhcloud:cloudproject/networkPrivate:NetworkPrivate");
        expect(network).toBeDefined();
        expect(network?.inputs.name).toBe("trustgraph-test-network");
        expect(network?.inputs.regions).toContain("GRA11");
        expect(network?.inputs.vlanId).toBe(0);
        expect(network?.inputs.serviceName).toBe("mock-service-id");
    });

    test("creates subnet with correct configuration", () => {
        const subnet = resources.find(r => r.type === "ovhcloud:cloudproject/networkPrivateSubnet:NetworkPrivateSubnet");
        expect(subnet).toBeDefined();
        expect(subnet?.inputs.region).toBe("GRA11");
        expect(subnet?.inputs.start).toBe("10.0.0.100");
        expect(subnet?.inputs.end).toBe("10.0.0.200");
        expect(subnet?.inputs.network).toBe("10.0.0.0/24");
        expect(subnet?.inputs.dhcp).toBe(true);
        expect(subnet?.inputs.noGateway).toBe(false);
    });

    test("creates Kubernetes cluster with correct configuration", () => {
        const cluster = resources.find(r => r.type === "ovhcloud:cloudproject/kube:Kube");
        expect(cluster).toBeDefined();
        expect(cluster?.inputs.name).toBe("trustgraph-test-cluster");
        expect(cluster?.inputs.region).toBe("GRA11");
        expect(cluster?.inputs.version).toBe("1.31");
        expect(cluster?.inputs.serviceName).toBe("mock-service-id");
    });

    test("creates node pool with correct configuration", () => {
        const nodePool = resources.find(r => r.type === "ovhcloud:cloudproject/kubeNodePool:KubeNodePool");
        expect(nodePool).toBeDefined();
        expect(nodePool?.inputs.name).toBe("trustgraph-test-pool");
        expect(nodePool?.inputs.flavorName).toBe("b2-15");
        expect(nodePool?.inputs.desiredNodes).toBe(2);
        expect(nodePool?.inputs.minNodes).toBe(2);
        expect(nodePool?.inputs.maxNodes).toBe(4);
        expect(nodePool?.inputs.serviceName).toBe("mock-service-id");
    });

    test("creates service account user", () => {
        const user = resources.find(r => r.type === "ovhcloud:cloudproject/user:User");
        expect(user).toBeDefined();
        expect(user?.inputs.serviceName).toBe("mock-service-id");
        expect(user?.inputs.description).toBe("TrustGraph AI service account");
    });

    test("creates Kubernetes provider", () => {
        const k8sProvider = resources.find(r => r.type === "pulumi:providers:kubernetes");
        expect(k8sProvider).toBeDefined();
        expect(k8sProvider?.name).toBe("k8sProvider");
    });

    test("creates gateway secret", () => {
        const secret = resources.find(r => 
            r.type === "kubernetes:core/v1:Secret" && 
            r.inputs.metadata?.name === "gateway-secret"
        );
        expect(secret).toBeDefined();
        expect(secret?.inputs.metadata.namespace).toBe("trustgraph");
        expect(secret?.inputs.stringData).toBeDefined();
    });

    test("creates AI credentials secret", () => {
        const secret = resources.find(r => 
            r.type === "kubernetes:core/v1:Secret" && 
            r.inputs.metadata?.name === "openai-credentials"
        );
        expect(secret).toBeDefined();
        expect(secret?.inputs.metadata.namespace).toBe("trustgraph");
        
        // Check the structure - Pulumi Outputs are wrapped
        expect(secret?.inputs.stringData).toBeDefined();
        const stringData = secret?.inputs.stringData;
        
        // In test mode, the stringData might be wrapped in Output structure
        if (stringData.value) {
            expect(stringData.value).toHaveProperty("openai-token");
            expect(stringData.value).toHaveProperty("openai-url");
            expect(stringData.value["openai-token"]).toBe("mock-token");
        } else {
            expect(stringData).toHaveProperty("openai-token");
            expect(stringData).toHaveProperty("openai-url");
        }
    });

    test("creates Kubernetes resources from YAML", () => {
        const configGroup = resources.find(r => r.type === "kubernetes:yaml/v2:ConfigGroup");
        expect(configGroup).toBeDefined();
        expect(configGroup?.name).toBe("resources");
        expect(configGroup?.inputs.skipAwait).toBe(true);
    });
});