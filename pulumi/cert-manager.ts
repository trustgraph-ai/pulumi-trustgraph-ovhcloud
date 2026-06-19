import * as k8s from '@pulumi/kubernetes';

import { k8sProvider } from './cluster';
import { letsencryptEmail } from './config';

const certManagerNamespace = new k8s.core.v1.Namespace(
    "cert-manager",
    {
        metadata: { name: "cert-manager" },
    },
    { provider: k8sProvider }
);

export const certManager = new k8s.helm.v4.Chart(
    "cert-manager",
    {
        chart: "oci://quay.io/jetstack/charts/cert-manager",
        version: "v1.17.2",
        namespace: "cert-manager",
        values: {
            crds: { enabled: true },
            config: { enableGatewayAPI: true },
        },
    },
    { provider: k8sProvider, dependsOn: [certManagerNamespace] }
);

export const letsEncryptIssuer = new k8s.apiextensions.CustomResource(
    "letsencrypt-issuer",
    {
        apiVersion: "cert-manager.io/v1",
        kind: "ClusterIssuer",
        metadata: { name: "letsencrypt-prod" },
        spec: {
            acme: {
                server: "https://acme-v02.api.letsencrypt.org/directory",
                email: letsencryptEmail,
                privateKeySecretRef: {
                    name: "letsencrypt-private-key",
                },
                solvers: [{
                    http01: {
                        gatewayHTTPRoute: {
                            parentRefs: [{
                                name: "trustgraph-gateway",
                                namespace: "trustgraph",
                                kind: "Gateway",
                            }],
                        },
                    },
                }],
            },
        },
    },
    { provider: k8sProvider, dependsOn: [certManager] }
);
