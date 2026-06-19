import * as pulumi from '@pulumi/pulumi';
import * as k8s from '@pulumi/kubernetes';
import * as random from '@pulumi/random';

import { aiEndpointsToken } from './config';
import { cluster, k8sProvider, aiEndpointUrl } from './cluster';
import { appDeploy } from './application';
import { gatewayIp } from './gateway';

const iamBootstrapToken = new random.RandomPassword(
    "iam-bootstrap-token",
    {
        length: 32,
        special: false,
    },
);

const grafanaAdminPassword = new random.RandomPassword(
    "grafana-admin-password",
    {
        length: 16,
        special: true,
        overrideSpecial: "!@#$%^&*",
    },
);

const iamSecret = new k8s.core.v1.Secret(
    "iam-bootstrap-token",
    {
        metadata: {
            name: "iam-bootstrap-token",
            namespace: "trustgraph"
        },
        stringData: {
            "token": pulumi.interpolate`tg_${iamBootstrapToken.result}`,
        },
    },
    { provider: k8sProvider, dependsOn: appDeploy }
);

const grafanaSecret = new k8s.core.v1.Secret(
    "grafana-secret",
    {
        metadata: {
            name: "grafana-secret",
            namespace: "trustgraph"
        },
        stringData: {
            "password": grafanaAdminPassword.result,
        },
    },
    { provider: k8sProvider, dependsOn: appDeploy }
);

const endpointSecret = new k8s.core.v1.Secret(
    "ai-secret",
    {
        metadata: {
            name: "openai-credentials",
            namespace: "trustgraph"
        },
        stringData: {
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

export const iamToken = pulumi.interpolate`tg_${iamBootstrapToken.result}`;

export const grafanaPassword = grafanaAdminPassword.result;

export { gatewayIp };
