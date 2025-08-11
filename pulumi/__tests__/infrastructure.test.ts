import * as pulumi from "@pulumi/pulumi";

// Mock fs module at the top level
jest.mock('fs', () => ({
    readFileSync: jest.fn((filePath: any) => {
        if (filePath && filePath.toString().includes('resources.yaml')) {
            return `
apiVersion: v1
kind: Namespace
metadata:
  name: trustgraph
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

// Global arrays to capture resources
let createdResources: Array<{type: string, name: string, inputs: any}> = [];
let resourceCount = 0;

// Mock console.log to capture output
const originalConsoleLog = console.log;
let consoleOutput: string[] = [];

describe("Infrastructure Creation", () => {
    beforeAll(() => {
        // Capture console output
        console.log = jest.fn((...args) => {
            consoleOutput.push(args.join(' '));
            originalConsoleLog(...args);
        });

        // Set up Pulumi mocks before any imports
        pulumi.runtime.setMocks({
            newResource: function(args: pulumi.runtime.MockResourceArgs): {id: string, state: any} {
                console.log(`Creating resource: ${args.type} - ${args.name}`);
                resourceCount++;
                createdResources.push({
                    type: args.type,
                    name: args.name,
                    inputs: args.inputs
                });
                
                const mockId = `mock-${args.name}-${resourceCount}`;
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
                
                return { id: mockId, state };
            },
            call: function(args: pulumi.runtime.MockCallArgs) {
                console.log(`Calling: ${args.token}`);
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
    });

    afterAll(() => {
        console.log = originalConsoleLog;
    });

    test("infrastructure creates resources", async () => {
        try {
            // Import the module - this triggers resource creation
            const index = await import("../index");
            
            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            console.log(`Total resources created: ${createdResources.length}`);
            console.log('Resource types:', createdResources.map(r => r.type));
            
            // If no resources were created, check console output for errors
            if (createdResources.length === 0) {
                console.log('Console output:', consoleOutput);
            }
            
            // Basic checks
            expect(createdResources.length).toBeGreaterThan(0);
            
            // Check exports are defined
            expect(index.clusterId).toBeDefined();
            expect(index.networkId).toBeDefined();
            
        } catch (error) {
            console.log('Error during test:', error);
            throw error;
        }
    });
});