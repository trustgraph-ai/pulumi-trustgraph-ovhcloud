import * as pulumi from '@pulumi/pulumi';
import * as k8s from '@pulumi/kubernetes';

import { k8sProvider } from './cluster';
import { domain, grafanaDomain } from './config';
import { letsEncryptIssuer } from './cert-manager';
import { appDeploy } from './application';

// ---------- Gateway API CRDs ----------

const gatewayCrds = new k8s.yaml.v2.ConfigGroup(
    "gateway-api-crds",
    {
        files: [
            "https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.1/standard-install.yaml",
        ],
    },
    { provider: k8sProvider }
);

// ---------- Nginx Gateway Fabric ----------

const ngfNamespace = new k8s.core.v1.Namespace(
    "nginx-gateway",
    {
        metadata: { name: "nginx-gateway" },
    },
    { provider: k8sProvider }
);

const nginxGatewayFabric = new k8s.helm.v4.Chart(
    "nginx-gateway-fabric",
    {
        chart: "oci://ghcr.io/nginx/charts/nginx-gateway-fabric",
        version: "1.6.2",
        namespace: "nginx-gateway",
        values: {
            nginxGateway: {
                gatewayClassName: "nginx",
            },
        },
    },
    { provider: k8sProvider, dependsOn: [ngfNamespace, gatewayCrds] }
);

const ngfServiceId = nginxGatewayFabric.resources.apply(
    () => "nginx-gateway/nginx-gateway-fabric"
);

const ngfService = k8s.core.v1.Service.get("ngf-service", ngfServiceId,
    { provider: k8sProvider });

export const gatewayIp = ngfService.status.apply(
    s => s?.loadBalancer?.ingress?.[0]?.ip || s?.loadBalancer?.ingress?.[0]?.hostname || "pending"
);

// ---------- Gateway + TLS + Routes ----------

const gateway = new k8s.apiextensions.CustomResource(
    "trustgraph-gateway",
    {
        apiVersion: "gateway.networking.k8s.io/v1",
        kind: "Gateway",
        metadata: {
            name: "trustgraph-gateway",
            namespace: "trustgraph",
        },
        spec: {
            gatewayClassName: "nginx",
            listeners: [
                {
                    name: "http",
                    protocol: "HTTP",
                    port: 80,
                    allowedRoutes: {
                        namespaces: { from: "Same" },
                    },
                },
                {
                    name: "https-ui",
                    protocol: "HTTPS",
                    port: 443,
                    hostname: domain,
                    tls: {
                        certificateRefs: [{
                            name: "ui-tls",
                        }],
                    },
                    allowedRoutes: {
                        namespaces: { from: "Same" },
                    },
                },
                {
                    name: "https-grafana",
                    protocol: "HTTPS",
                    port: 443,
                    hostname: grafanaDomain,
                    tls: {
                        certificateRefs: [{
                            name: "grafana-tls",
                        }],
                    },
                    allowedRoutes: {
                        namespaces: { from: "Same" },
                    },
                },
            ],
        },
    },
    { provider: k8sProvider, dependsOn: [nginxGatewayFabric, appDeploy] }
);

const uiCertificate = new k8s.apiextensions.CustomResource(
    "ui-cert",
    {
        apiVersion: "cert-manager.io/v1",
        kind: "Certificate",
        metadata: {
            name: "ui-cert",
            namespace: "trustgraph",
        },
        spec: {
            secretName: "ui-tls",
            issuerRef: {
                name: "letsencrypt-prod",
                kind: "ClusterIssuer",
            },
            dnsNames: [domain],
        },
    },
    { provider: k8sProvider, dependsOn: [letsEncryptIssuer, gateway] }
);

const grafanaCertificate = new k8s.apiextensions.CustomResource(
    "grafana-cert",
    {
        apiVersion: "cert-manager.io/v1",
        kind: "Certificate",
        metadata: {
            name: "grafana-cert",
            namespace: "trustgraph",
        },
        spec: {
            secretName: "grafana-tls",
            issuerRef: {
                name: "letsencrypt-prod",
                kind: "ClusterIssuer",
            },
            dnsNames: [grafanaDomain],
        },
    },
    { provider: k8sProvider, dependsOn: [letsEncryptIssuer, gateway] }
);

const uiRoute = new k8s.apiextensions.CustomResource(
    "ui-route",
    {
        apiVersion: "gateway.networking.k8s.io/v1",
        kind: "HTTPRoute",
        metadata: {
            name: "ui-route",
            namespace: "trustgraph",
        },
        spec: {
            parentRefs: [
                {
                    name: "trustgraph-gateway",
                    sectionName: "https-ui",
                },
                {
                    name: "trustgraph-gateway",
                    sectionName: "http",
                },
            ],
            hostnames: [domain],
            rules: [{
                backendRefs: [{
                    name: "trustgraph-ui",
                    port: 8888,
                }],
            }],
        },
    },
    { provider: k8sProvider, dependsOn: [gateway] }
);

const grafanaRoute = new k8s.apiextensions.CustomResource(
    "grafana-route",
    {
        apiVersion: "gateway.networking.k8s.io/v1",
        kind: "HTTPRoute",
        metadata: {
            name: "grafana-route",
            namespace: "trustgraph",
        },
        spec: {
            parentRefs: [
                {
                    name: "trustgraph-gateway",
                    sectionName: "https-grafana",
                },
                {
                    name: "trustgraph-gateway",
                    sectionName: "http",
                },
            ],
            hostnames: [grafanaDomain],
            rules: [{
                backendRefs: [{
                    name: "grafana",
                    port: 3000,
                }],
            }],
        },
    },
    { provider: k8sProvider, dependsOn: [gateway] }
);
