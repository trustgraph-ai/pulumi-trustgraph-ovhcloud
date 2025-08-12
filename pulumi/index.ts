import * as ovh from '@ovhcloud/pulumi-ovh';
import * as pulumi from '@pulumi/pulumi';
import * as k8s from '@pulumi/kubernetes';
import * as fs from 'fs';

import { prefix, region, nodeSize, nodeCount, serviceName, aiModel, aiEndpointsToken, aiEndpoint } from './config';

// OVHcloud provider
const provider = new ovh.Provider(
    "ovhcloud-provider",
    {
        // Provider configuration is done via environment variables:
        // OVH_ENDPOINT, OVH_APPLICATION_KEY, OVH_APPLICATION_SECRET, OVH_CONSUMER_KEY
    }
);

// Create a K8s cluster
// Note: Starting without private network configuration to simplify deployment
// You can add private network configuration later if needed
const cluster = new ovh.cloudproject.Kube(
    "cluster",
    {
        serviceName: serviceName,
        name: prefix + "-cluster",
        region: region,
        // FIXME: 1.33 is recommended
        version: "1.31", // Using a stable version
    },
    { provider: provider }
);

// Create a nodepool for the cluster
const nodePool = new ovh.cloudproject.KubeNodePool(
    "node-pool",
    {
        serviceName: serviceName,
        kubeId: cluster.id,
        name: prefix + "-pool",
        flavorName: nodeSize,
        desiredNodes: nodeCount,
        minNodes: nodeCount,
        maxNodes: nodeCount + 2,
    },
    { provider: provider }
);


// Get the kubeconfig for the cluster
const kubeconfig = pulumi.all([
    cluster.id, nodePool.id, serviceName
]).apply(
    ([clusterId, poolId, service]) => {
        // OVHcloud provides kubeconfig through the cluster resource
        return cluster.kubeconfig;
    }
);

// Create a Kubernetes provider using the cluster's kubeconfig
const k8sProvider = new k8s.Provider(
    "k8sProvider",
    {
        kubeconfig: kubeconfig,
    }
);

/*

// Create S3 credentials for the service account (if needed for AI endpoints)
const s3Credentials = new ovh.cloudproject.UserS3Credential(
    "s3-credentials",
    {
        serviceName: serviceName,
        userId: serviceAccount.id,
    },
    { provider: provider }
);

*/

// OVHcloud AI Endpoints URL construction
// AI Endpoints use OpenAI-compatible API format
// Base URL: https://mistral-nemo-instruct-2407.endpoints.kepler.ai.cloud.ovh.net/api/openai_compat/v1
const aiEndpointUrl = pulumi.interpolate`https://${aiEndpoint}/api/openai_compat/v1`;

// Write the kubeconfig to a file
kubeconfig.apply(
    (config : string) => {
        if (config) {
            fs.writeFile(
                "kube.cfg",
                config,
                err => {
                    if (err) {
                        console.log(err);
                        throw(err);
                    } else {
                        console.log("Wrote kube.cfg.");
                    }
                }
            );
        }
    }
);

// Get application resource definitions
const resourceDefs = fs.readFileSync("../resources.yaml", {encoding: "utf-8"});

// Deploy resources to the K8s cluster
const appDeploy = new k8s.yaml.v2.ConfigGroup(
    "resources",
    {
        yaml: resourceDefs,
        skipAwait: true,
    },
    { provider: k8sProvider }
);

// Generate an (empty) gateway secret - no authentication
const gatewaySecret = new k8s.core.v1.Secret(
    "gateway-secret",
    {
        metadata: {
            name: "gateway-secret",
            namespace: "trustgraph"
        },
        stringData: {
            "gateway-secret": ""
        },
    },
    { provider: k8sProvider, dependsOn: appDeploy }
);

// Generate an (empty) gateway secret - no authentication
const mcpServerSecret = new k8s.core.v1.Secret(
    "mcp-server-secret",
    {
        metadata: {
            name: "mcp-server-secret",
            namespace: "trustgraph"
        },
        stringData: {
            "mcp-server-secret": ""
        },
    },
    { provider: k8sProvider, dependsOn: appDeploy }
);

// Generate an AI endpoint secret - URL plus bearer token
// OVHcloud AI Endpoints uses OpenAI-compatible API with bearer token authentication
const endpointSecret = new k8s.core.v1.Secret(
    "ai-secret",
    {
        metadata: {
            name: "openai-credentials",
            namespace: "trustgraph"
        },
        stringData: {
            // AI Endpoints token from https://endpoints.ai.cloud.ovh.net/
            "openai-token": aiEndpointsToken,
            "openai-url": aiEndpointUrl,
        },
    },
    { provider: k8sProvider, dependsOn: appDeploy }
);

// Export useful information
export const clusterId = cluster.id;
export const clusterEndpoint = cluster.kubeconfig.apply(k => {
    try {
        const parsed = JSON.parse(k);
        return parsed.clusters?.[0]?.cluster?.server || "Not available";
    } catch {
        return "Not available";
    }
});
export const aiUrl = aiEndpointUrl;

