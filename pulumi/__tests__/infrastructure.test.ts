import * as pulumi from "@pulumi/pulumi";

// Global arrays to capture resources
let createdResources: Array<{type: string, name: string, inputs: any}> = [];
let resourceCount = 0;

describe("Infrastructure Creation", () => {
    beforeAll(() => {
        // Set up Pulumi mocks before any imports
        pulumi.runtime.setMocks({
            newResource: function(args: pulumi.runtime.MockResourceArgs): {id: string, state: any} {
                resourceCount++;
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

        // Set up configuration
        pulumi.runtime.setAllConfig({
            "project:environment": "test",
            "project:region": "GRA11", 
            "project:service-name": "mock-service-id",
            "project:ai-model": "mistral-nemo-instruct-2407",
            "project:ai-endpoint": "mistral-nemo-instruct-2407.endpoints.kepler.ai.cloud.ovh.net",
            "project:ai-endpoints-token": "mock-token",
        });

        // Mock fs module
        jest.mock('fs', () => ({
            readFileSync: jest.fn((filePath: any) => {
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
                return '';
            }),
            writeFile: jest.fn((path: any, data: any, callback: any) => {
                if (typeof callback === 'function') {
                    callback(null);
                }
            })
        }));
    });

    test("infrastructure creates all expected resources correctly", async () => {
        // Import the module - this triggers resource creation
        const index = await import("../index");
        
        // Wait a bit for async resource creation to complete
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Log for debugging
        console.log(`Created ${createdResources.length} resources:`, createdResources.map(r => ({ type: r.type, name: r.name })));
        
        // Basic check that some resources were created
        expect(createdResources.length).toBeGreaterThan(0);
        
        // Check for some key OVHCloud resources
        const hasProvider = createdResources.some(r => r.type.includes("ovhcloud"));
        const hasCluster = createdResources.some(r => r.type.includes("kube") || r.type.includes("Kube"));
        const hasSecrets = createdResources.some(r => r.type.includes("Secret"));
        
        expect(hasProvider).toBe(true);
        expect(hasCluster).toBe(true);
        expect(hasSecrets).toBe(true);
    });

    test("exports are defined", async () => {
        const index = await import("../index");
        
        expect(index.clusterId).toBeDefined();
        expect(index.clusterEndpoint).toBeDefined();
        expect(index.aiUrl).toBeDefined();
        expect(index.networkId).toBeDefined();
    });
});