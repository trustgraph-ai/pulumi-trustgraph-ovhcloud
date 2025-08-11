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
        mockedFs.readFileSync.mockReturnValue(`
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
        `);
        
        // Set up configuration
        pulumi.runtime.setAllConfig({
            "project:environment": "test",
            "project:region": "fr-par", 
            "project:ai-model": "llama-3.1-8b-instruct",
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
                if (args.type === "scaleway:kubernetes/cluster:Cluster") {
                    state.kubeconfigs = [{
                        configFile: "mock-kubeconfig-content",
                        clusterId: mockId,
                    }];
                }
                
                if (args.type === "scaleway:iam/apiKey:ApiKey") {
                    state.secretKey = "mock-secret-key-value";
                }
                
                return { id: mockId, state };
            },
            call: function(args: pulumi.runtime.MockCallArgs) {
                if (args.token === "scaleway:account/getProject:getProject") {
                    return {
                        id: "mock-project-id-12345",
                        name: "mock-project",
                    };
                }
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
        
        // Check for essential Scaleway resources
        const provider = createdResources.find(r => r.type === "pulumi:providers:scaleway");
        const network = createdResources.find(r => r.type === "scaleway:network/privateNetwork:PrivateNetwork");
        const cluster = createdResources.find(r => r.type === "scaleway:kubernetes/cluster:Cluster");
        const nodePool = createdResources.find(r => r.type === "scaleway:kubernetes/pool:Pool");
        const iamApp = createdResources.find(r => r.type === "scaleway:iam/application:Application");
        const policy = createdResources.find(r => r.type === "scaleway:iam/policy:Policy");
        const apiKey = createdResources.find(r => r.type === "scaleway:iam/apiKey:ApiKey");
        
        // Test resource existence
        expect(provider).toBeDefined();
        expect(network).toBeDefined();
        expect(cluster).toBeDefined();
        expect(nodePool).toBeDefined();
        expect(iamApp).toBeDefined();
        expect(policy).toBeDefined();
        expect(apiKey).toBeDefined();
        
        // Test resource naming
        expect(cluster?.inputs.name).toBe("trustgraph-test-cluster");
        expect(nodePool?.inputs.name).toBe("trustgraph-test-pool");
        expect(iamApp?.inputs.name).toBe("TrustGraph");
        expect(apiKey?.inputs.description).toBe("TrustGraph AI key");
        
        // Test cluster configuration
        expect(cluster?.inputs.version).toBe("1.32.3");
        expect(cluster?.inputs.cni).toBe("cilium");
        expect(cluster?.inputs.deleteAdditionalResources).toBe(false);
        
        // Test node pool configuration
        expect(nodePool?.inputs.nodeType).toBe("DEV1-L");
        expect(nodePool?.inputs.size).toBe(2);
        
        // Test Kubernetes secrets
        const secrets = createdResources.filter(r => r.type === "kubernetes:core/v1:Secret");
        const gatewaySecret = secrets.find(s => s.inputs.metadata?.name === "gateway-secret");
        const aiSecret = secrets.find(s => s.inputs.metadata?.name === "openai-credentials");
        
        expect(gatewaySecret).toBeDefined();
        expect(aiSecret).toBeDefined();
        expect(gatewaySecret?.inputs.metadata?.namespace).toBe("trustgraph");
        expect(aiSecret?.inputs.metadata?.namespace).toBe("trustgraph");
        
        // console.log(`Created ${createdResources.length} resources:`, createdResources.map(r => r.type));
    });
});
