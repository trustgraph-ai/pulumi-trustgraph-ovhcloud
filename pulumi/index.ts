import * as ovh from '@ovh/pulumi-ovh';
import * as pulumi from '@pulumi/pulumi';
import * as k8s from '@pulumi/kubernetes';
import * as fs from 'fs';

import { prefix, region, nodeSize, nodeCount, serviceName, aiModel } from './config';

// OVHcloud provider
const provider = new ovh.Provider(
    "ovhcloud-provider",
    {
        // Provider configuration is done via environment variables:
        // OVH_ENDPOINT, OVH_APPLICATION_KEY, OVH_APPLICATION_SECRET, OVH_CONSUMER_KEY
    }
);

// Create a private network for the cluster
const privateNetwork = new ovh.cloudproject.NetworkPrivate(
    "private-network",
    {
        serviceName: serviceName,
        name: prefix + "-network",
        regions: [region],
        vlanId: 0,
    },
    { provider: provider }
);

// Create a subnet for the private network
const subnet = new ovh.cloudproject.NetworkPrivateSubnet(
    "subnet",
    {
        serviceName: serviceName,
        networkId: privateNetwork.id,
        region: region,
        start: "10.0.0.100",
        end: "10.0.0.200",
        network: "10.0.0.0/24",
        dhcp: true,
        noGateway: false,
    },
    { provider: provider }
);

// Create a K8s cluster
const cluster = new ovh.cloudproject.Kube(
    "cluster",
    {
        serviceName: serviceName,
        name: prefix + "-cluster",
        region: region,
        version: "1.32", // Check OVHcloud for latest supported versions
        privateNetworkId: privateNetwork.id,
        privateNetworkConfiguration: {
            defaultVrackGateway: "10.0.0.1",
            privateNetworkRoutingAsDefault: true,
        },
    },
    { provider: provider, dependsOn: [subnet] }
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

// Create a service account for AI access
const serviceAccount = new ovh.cloudproject.User(
    "ai-user",
    {
        serviceName: serviceName,
        description: "TrustGraph AI service account",
    },
    { provider: provider, dependsOn: [ nodePool ] }
);

// Create S3 credentials for the service account (if needed for AI endpoints)
const s3Credentials = new ovh.cloudproject.UserS3Credential(
    "s3-credentials",
    {
        serviceName: serviceName,
        userId: serviceAccount.id,
    },
    { provider: provider }
);

// OVHcloud AI Endpoints URL construction
// The AI Endpoints URL is typically: https://[model-name].endpoints.kepler.ai.cloud.ovh.net
const aiEndpointUrl = pulumi.interpolate`https://${aiModel}.endpoints.kepler.ai.cloud.ovh.net`;

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

// Generate an AI endpoint secret - URL plus bearer token
// For OVHcloud AI Endpoints, you typically need a bearer token
const endpointSecret = new k8s.core.v1.Secret(
    "ai-secret",
    {
        metadata: {
            name: "openai-credentials",
            namespace: "trustgraph"
        },
        stringData: {
            // OVHcloud AI Endpoints uses bearer tokens for authentication
            // The token would be generated through OVHcloud console or API
            "openai-token": serviceAccount.password || "YOUR_AI_ENDPOINT_TOKEN",
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
export const networkId = privateNetwork.id;