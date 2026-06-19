import * as ovh from '@ovhcloud/pulumi-ovh';
import * as pulumi from '@pulumi/pulumi';
import * as k8s from '@pulumi/kubernetes';
import * as fs from 'fs';

import { prefix, region, nodeSize, nodeCount, serviceName, aiEndpoint } from './config';

// OVHcloud provider
export const provider = new ovh.Provider(
    "ovhcloud-provider",
    {}
);

// Create a K8s cluster
export const cluster = new ovh.cloudproject.Kube(
    "cluster",
    {
        serviceName: serviceName,
        name: prefix + "-cluster",
        region: region,
        version: "1.35",
    },
    { provider: provider }
);

// Create a nodepool for the cluster
export const nodePool = new ovh.cloudproject.KubeNodePool(
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
        return cluster.kubeconfig;
    }
);

// Create a Kubernetes provider using the cluster's kubeconfig
export const k8sProvider = new k8s.Provider(
    "k8sProvider",
    {
        kubeconfig: kubeconfig,
    }
);

// OVHcloud AI Endpoints URL construction
export const aiEndpointUrl = pulumi.interpolate`https://${aiEndpoint}/api/openai_compat/v1`;

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
