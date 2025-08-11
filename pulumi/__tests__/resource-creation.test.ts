import * as pulumi from "@pulumi/pulumi";

// Track created resources
interface MockResource {
    type: string;
    name: string;
    inputs: any;
}

const resources: MockResource[] = [];

// Mock fs at the module level to avoid issues
jest.mock('fs', () => ({
    readFileSync: jest.fn().mockImplementation((path) => {
        if (path && path.toString().includes('resources.yaml')) {
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

describe("Resource Creation Tests", () => {
    beforeAll(() => {
        // Clear resources array
        resources.length = 0;

        // Set up Pulumi mocks to capture resource creation
        pulumi.runtime.setMocks({
            newResource: function(args: pulumi.runtime.MockResourceArgs): {id: string, state: any} {
                // Capture the resource
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
                if (args.type === "ovh:CloudProject/kube:Kube") {
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
                } else if (args.type === "ovh:CloudProject/user:User") {
                    state.username = "mock-user";
                    state.password = "mock-password";
                } else if (args.type === "ovh:CloudProject/kubeNodePool:KubeNodePool") {
                    state.status = "READY";
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
    });

    test("infrastructure creates expected OVHCloud resources", async () => {
        // Import the infrastructure module
        // Note: We can't use jest.resetModules() due to gRPC issues, 
        // so this test suite should run in isolation
        await import("../index");
        
        // Wait for async operations to complete
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Log what was created for debugging
        console.log(`Total resources created: ${resources.length}`);
        const resourceTypes = resources.map(r => r.type);
        console.log("Resource types:", resourceTypes);
        
        // Verify resources were created
        expect(resources.length).toBeGreaterThan(0);
        
        // Check for all expected OVHCloud resources
        // Note: Using actual types from the console output
        const expectedResources = [
            "pulumi:providers:ovh",
            "ovh:CloudProject/networkPrivate:NetworkPrivate",
            "ovh:CloudProject/networkPrivateSubnet:NetworkPrivateSubnet",
            "ovh:CloudProject/kube:Kube",
            "ovh:CloudProject/kubeNodePool:KubeNodePool",
            "ovh:CloudProject/user:User",
            "pulumi:providers:kubernetes",
            "kubernetes:core/v1:Secret",
            "kubernetes:yaml/v2:ConfigGroup"
        ];
        
        for (const expectedType of expectedResources) {
            const found = resources.some(r => r.type === expectedType);
            expect(found).toBe(true);
        }
    });

    test("OVHCloud resources have correct configuration", () => {
        // Test provider
        const provider = resources.find(r => r.type === "pulumi:providers:ovh");
        expect(provider).toBeDefined();
        expect(provider?.name).toBe("ovhcloud-provider");
        
        // Test network
        const network = resources.find(r => r.type === "ovh:CloudProject/networkPrivate:NetworkPrivate");
        expect(network).toBeDefined();
        expect(network?.inputs.name).toBe("trustgraph-test-network");
        expect(network?.inputs.regions).toContain("GRA11");
        expect(network?.inputs.vlanId).toBe(0);
        expect(network?.inputs.serviceName).toBe("mock-service-id");
        
        // Test subnet
        const subnet = resources.find(r => r.type === "ovh:CloudProject/networkPrivateSubnet:NetworkPrivateSubnet");
        expect(subnet).toBeDefined();
        expect(subnet?.inputs.region).toBe("GRA11");
        expect(subnet?.inputs.start).toBe("10.0.0.100");
        expect(subnet?.inputs.end).toBe("10.0.0.200");
        expect(subnet?.inputs.network).toBe("10.0.0.0/24");
        expect(subnet?.inputs.dhcp).toBe(true);
        expect(subnet?.inputs.noGateway).toBe(false);
    });

    test("Kubernetes cluster and node pool configuration", () => {
        // Test cluster
        const cluster = resources.find(r => r.type === "ovh:CloudProject/kube:Kube");
        expect(cluster).toBeDefined();
        expect(cluster?.inputs.name).toBe("trustgraph-test-cluster");
        expect(cluster?.inputs.region).toBe("GRA11");
        expect(cluster?.inputs.version).toBe("1.31");
        expect(cluster?.inputs.serviceName).toBe("mock-service-id");
        
        // Test node pool
        const nodePool = resources.find(r => r.type === "ovh:CloudProject/kubeNodePool:KubeNodePool");
        expect(nodePool).toBeDefined();
        expect(nodePool?.inputs.name).toBe("trustgraph-test-pool");
        expect(nodePool?.inputs.flavorName).toBe("b2-15");
        expect(nodePool?.inputs.desiredNodes).toBe(2);
        expect(nodePool?.inputs.minNodes).toBe(2);
        expect(nodePool?.inputs.maxNodes).toBe(4);
        expect(nodePool?.inputs.serviceName).toBe("mock-service-id");
    });

    test("service account and Kubernetes resources", () => {
        // Test service account
        const user = resources.find(r => r.type === "ovh:CloudProject/user:User");
        expect(user).toBeDefined();
        expect(user?.inputs.serviceName).toBe("mock-service-id");
        expect(user?.inputs.description).toBe("TrustGraph AI service account");
        
        // Test K8s provider
        const k8sProvider = resources.find(r => r.type === "pulumi:providers:kubernetes");
        expect(k8sProvider).toBeDefined();
        expect(k8sProvider?.name).toBe("k8sProvider");
        
        // Test secrets
        const secrets = resources.filter(r => r.type === "kubernetes:core/v1:Secret");
        expect(secrets.length).toBeGreaterThanOrEqual(2);
        
        const gatewaySecret = secrets.find(s => s.inputs.metadata?.name === "gateway-secret");
        expect(gatewaySecret).toBeDefined();
        expect(gatewaySecret?.inputs.metadata.namespace).toBe("trustgraph");
        
        const aiSecret = secrets.find(s => s.inputs.metadata?.name === "openai-credentials");
        expect(aiSecret).toBeDefined();
        expect(aiSecret?.inputs.metadata.namespace).toBe("trustgraph");
        
        // Test ConfigGroup
        const configGroup = resources.find(r => r.type === "kubernetes:yaml/v2:ConfigGroup");
        expect(configGroup).toBeDefined();
        expect(configGroup?.name).toBe("resources");
        expect(configGroup?.inputs.skipAwait).toBe(true);
    });
});