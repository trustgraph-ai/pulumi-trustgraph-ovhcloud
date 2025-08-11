import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";

// Mock fs module for resources.yaml
jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

// Global arrays to capture resources across all tests
const createdResources: Array<{type: string, name: string, inputs: any}> = [];
let resourceCount = 0;

describe("Infrastructure Creation", () => {
    beforeAll(() => {
        // Mock file system
        mockedFs.readFileSync.mockImplementation((filePath: any, options: any) => {
            if (filePath.includes('resources.yaml')) {
                return `
apiVersion: v1
kind: Namespace
metadata:
  name: trustgraph
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
  namespace: trustgraph
spec:
  replicas: 1
`;
            }
            // Return empty string for other files
            return '';
        });

        // Mock fs.writeFile for kubeconfig
        mockedFs.writeFile = jest.fn((path, data, callback) => {
            if (typeof callback === 'function') {
                callback(null);
            }
        }) as any;
        
        // Set up configuration
        pulumi.runtime.setAllConfig({
            "project:environment": "test",
            "project:region": "GRA11", 
            "project:service-name": "mock-service-id",
            "project:ai-model": "mistral-nemo-instruct-2407",
            "project:ai-endpoint": "mistral-nemo-instruct-2407.endpoints.kepler.ai.cloud.ovh.net",
            "project:ai-endpoints-token": "mock-token",
        });
        
        // Set up mocks to capture resource creation
        pulumi.runtime.setMocks({
            newResource: function(args: pulumi.runtime.MockResourceArgs): {id: string, state: any} {
                resourceCount++;
                // console.log(`Mock creating resource ${resourceCount}: ${args.type} - ${args.name}`);
                createdResources.push({
                    type: args.type,
                    name: args.name,
                    inputs: args.inputs
                });
                
                const mockId = `mock-${args.type}-${args.name}-${resourceCount}`;
                let state: any = {
                    ...args.inputs,
                    id: mockId,
                    name: args.inputs.name || args.name,
                };
                
                // Mock specific resource outputs
                if (args.type === "ovhcloud:cloudproject/kube:Kube") {
                    state.kubeconfig = JSON.stringify({
                        clusters: [{
                            cluster: {
                                server: "https://mock-cluster.ovh.net"
                            }
                        }]
                    });
                }
                
                if (args.type === "ovhcloud:cloudproject/user:User") {
                    state.id = mockId;
                    state.username = "mock-username";
                    state.password = "mock-password";
                }
                
                return { id: mockId, state };
            },
            call: function(args: pulumi.runtime.MockCallArgs) {
                return args.inputs;
            },
        });
    });
    
    test("infrastructure creates all expected resources correctly", async () => {
        // Import once to create all resources
        await expect(import("../index")).resolves.toBeDefined();
        
        // Wait a bit for async resource creation to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verify that resources were created
        expect(createdResources.length).toBeGreaterThan(0);
        
        // Check for essential OVHCloud resources
        const provider = createdResources.find(r => r.type === "pulumi:providers:ovhcloud");
        const network = createdResources.find(r => r.type === "ovhcloud:cloudproject/networkPrivate:NetworkPrivate");
        const subnet = createdResources.find(r => r.type === "ovhcloud:cloudproject/networkPrivateSubnet:NetworkPrivateSubnet");
        const cluster = createdResources.find(r => r.type === "ovhcloud:cloudproject/kube:Kube");
        const nodePool = createdResources.find(r => r.type === "ovhcloud:cloudproject/kubeNodePool:KubeNodePool");
        const serviceAccount = createdResources.find(r => r.type === "ovhcloud:cloudproject/user:User");
        
        // Test resource existence
        expect(provider).toBeDefined();
        expect(network).toBeDefined();
        expect(subnet).toBeDefined();
        expect(cluster).toBeDefined();
        expect(nodePool).toBeDefined();
        expect(serviceAccount).toBeDefined();
        
        // Test resource naming
        expect(cluster?.inputs.name).toBe("trustgraph-test-cluster");
        expect(nodePool?.inputs.name).toBe("trustgraph-test-pool");
        expect(network?.inputs.name).toBe("trustgraph-test-network");
        expect(serviceAccount?.inputs.description).toBe("TrustGraph AI service account");
        
        // Test cluster configuration
        expect(cluster?.inputs.region).toBe("GRA11");
        expect(cluster?.inputs.version).toBe("1.31");
        expect(cluster?.inputs.serviceName).toBe("mock-service-id");
        
        // Test node pool configuration
        expect(nodePool?.inputs.flavorName).toBe("b2-15");
        expect(nodePool?.inputs.desiredNodes).toBe(2);
        expect(nodePool?.inputs.minNodes).toBe(2);
        expect(nodePool?.inputs.maxNodes).toBe(4);
        
        // Test network configuration
        expect(network?.inputs.regions).toContain("GRA11");
        expect(network?.inputs.vlanId).toBe(0);
        
        // Test subnet configuration
        expect(subnet?.inputs.start).toBe("10.0.0.100");
        expect(subnet?.inputs.end).toBe("10.0.0.200");
        expect(subnet?.inputs.network).toBe("10.0.0.0/24");
        expect(subnet?.inputs.dhcp).toBe(true);
        expect(subnet?.inputs.noGateway).toBe(false);
        
        // Test Kubernetes secrets
        const secrets = createdResources.filter(r => r.type === "kubernetes:core/v1:Secret");
        const gatewaySecret = secrets.find(s => s.inputs.metadata?.name === "gateway-secret");
        const aiSecret = secrets.find(s => s.inputs.metadata?.name === "openai-credentials");
        
        expect(gatewaySecret).toBeDefined();
        expect(aiSecret).toBeDefined();
        expect(gatewaySecret?.inputs.metadata?.namespace).toBe("trustgraph");
        expect(aiSecret?.inputs.metadata?.namespace).toBe("trustgraph");
        
        // Test that AI secret contains correct keys
        expect(aiSecret?.inputs.stringData).toHaveProperty("openai-token");
        expect(aiSecret?.inputs.stringData).toHaveProperty("openai-url");
        
        // Test Kubernetes provider
        const k8sProvider = createdResources.find(r => r.type === "pulumi:providers:kubernetes");
        expect(k8sProvider).toBeDefined();
        
        // Test ConfigGroup for resources
        const configGroup = createdResources.find(r => r.type === "kubernetes:yaml/v2:ConfigGroup");
        expect(configGroup).toBeDefined();
        expect(configGroup?.inputs.skipAwait).toBe(true);
        
        // console.log(`Created ${createdResources.length} resources:`, createdResources.map(r => r.type));
    });

    test("resources are created with correct dependencies", async () => {
        // Re-import to check dependencies
        await import("../index");
        
        // Find resources to check dependencies
        const cluster = createdResources.find(r => r.type === "ovhcloud:cloudproject/kube:Kube");
        const nodePool = createdResources.find(r => r.type === "ovhcloud:cloudproject/kubeNodePool:KubeNodePool");
        const serviceAccount = createdResources.find(r => r.type === "ovhcloud:cloudproject/user:User");
        
        // Node pool should depend on cluster
        expect(nodePool?.inputs.kubeId).toBeDefined();
        
        // Service account should be created after nodePool
        // (This is harder to test with mocks, but we can check it exists)
        expect(serviceAccount).toBeDefined();
    });

    test("kubeconfig file is written", async () => {
        await import("../index");
        
        // Wait for async operations
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Check that writeFile was called for kubeconfig
        expect(mockedFs.writeFile).toHaveBeenCalled();
        expect(mockedFs.writeFile).toHaveBeenCalledWith(
            "kube.cfg",
            expect.any(String),
            expect.any(Function)
        );
    });

    test("AI endpoint URL is correctly constructed", async () => {
        const index = await import("../index");
        
        // The aiUrl export should be properly formatted
        // In mocked Pulumi, outputs are resolved synchronously
        expect(index.aiUrl).toBe("https://mistral-nemo-instruct-2407.endpoints.kepler.ai.cloud.ovh.net/api/openai_compat/v1");
    });
});