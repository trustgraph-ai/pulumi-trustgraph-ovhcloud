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
        core: { v1: {
            Namespace: class extends pulumiSdk.CustomResource {
                constructor(name: string, args?: any, opts?: any) {
                    super('kubernetes:core/v1:Namespace', name, args, opts);
                }
            },
            Secret: class extends pulumiSdk.CustomResource {
                constructor(name: string, args?: any, opts?: any) {
                    super('kubernetes:core/v1:Secret', name, args, opts);
                }
            },
            Service: {
                get: (name: string, id: any, opts?: any) => {
                    const res = new (class extends pulumiSdk.CustomResource {
                        public readonly status: any;
                        constructor() {
                            super('kubernetes:core/v1:Service', name, {}, opts);
                            this.status = pulumiSdk.output({
                                loadBalancer: { ingress: [{ ip: "1.2.3.4" }] }
                            });
                        }
                    })();
                    return res;
                },
            },
        }},
        yaml: { v2: { ConfigGroup: class extends pulumiSdk.CustomResource {
            constructor(name: string, args?: any, opts?: any) {
                super('kubernetes:yaml/v2:ConfigGroup', name, args, opts);
            }
        }}},
        helm: { v4: { Chart: class extends pulumiSdk.ComponentResource {
            public readonly resources: any;
            constructor(name: string, args?: any, opts?: any) {
                super('kubernetes:helm.sh/v4:Chart', name, {}, opts);
                this.resources = pulumiSdk.output([]);
                this.registerOutputs({ resources: this.resources });
            }
        }}},
        apiextensions: { CustomResource: class extends pulumiSdk.CustomResource {
            constructor(name: string, args?: any, opts?: any) {
                const apiVersion = args?.apiVersion || '';
                const kind = args?.kind || '';
                const type = apiVersion && kind
                    ? `kubernetes:${apiVersion.replace('/', '.')}:${kind}`
                    : 'kubernetes:apiextensions:CustomResource';
                super(type, name, args, opts);
            }
        }},
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
    writeFile: jest.fn()
}));

describe("Infrastructure Tests", () => {
    let infraModule: any;

    beforeAll(async () => {
        // Set up the mocks
        pulumi.runtime.setMocks({
            newResource: function(args: pulumi.runtime.MockResourceArgs): {id: string, state: any} {
                return {
                    id: args.name + "_id",
                    state: {
                        ...args.inputs,
                        ...(args.type === "ovhcloud:cloudproject/kube:Kube" || args.type === "ovh:CloudProject/kube:Kube" ? {
                            kubeconfig: JSON.stringify({
                                clusters: [{ cluster: { server: "https://mock.ovh.net" } }]
                            })
                        } : {}),
                        ...(args.type === "kubernetes:core/v1:Service" ? {
                            status: { loadBalancer: { ingress: [{ ip: "1.2.3.4" }] } }
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
            "project:domain": "ovh1.dev.trustgraph.ai",
            "project:grafana-domain": "grafana.ovh1.dev.trustgraph.ai",
            "project:letsencrypt-email": "admin@trustgraph.ai",
        });
    });

    test("should create infrastructure and export values", async () => {
        infraModule = await import("../index");

        expect(infraModule.clusterId).toBeDefined();
        expect(infraModule.clusterEndpoint).toBeDefined();
        expect(infraModule.aiUrl).toBeDefined();
    });

    test("should have valid AI URL format", async () => {
        expect(infraModule.aiUrl).toBeDefined();

        const urlString = infraModule.aiUrl.toString();
        expect(urlString).toContain("Output");
    });
});
