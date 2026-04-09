// Configuration stuff, largely loading stuff from the configuration file

import * as pulumi from "@pulumi/pulumi";

const cfg = new pulumi.Config();

// Get 'environment', should be something like live, dev, ref etc.
export const environment = cfg.require("environment");

// Get 'region', OVHcloud regions like GRA11, BHS5, WAW1, etc.
export const region = cfg.require("region");

// Get the service name (OVHcloud project ID)
export const serviceName = cfg.require("service-name");

// Default tags
export const tags : { [key : string] : string } = {
    environment: environment,
    project: "trustgraph"
};

export const tagsSep = Object.entries(tags).map(
    (x : string[]) => (x[0] + "=" + x[1])
).join(",");

// Make up a cluster name
export const prefix = "trustgraph-" + environment;

// Node configuration
// OVHcloud flavor names: b2-7, b2-15, b2-30, b2-60, b2-120, etc.
export const nodeSize = cfg.get("node-size") || "b2-15";
export const nodeCount = cfg.getNumber("node-count") || 2;

// AI stuff
// OVHcloud AI models: e.g. mistral-nemo-instruct-2407.endpoints.kepler.ai.cloud.ovh.net
export const aiEndpoint = cfg.require("ai-endpoint");

// AI Endpoints access token - get this from https://endpoints.ai.cloud.ovh.net/
export const aiEndpointsToken = cfg.getSecret("ai-endpoints-token") || "YOUR_AI_ENDPOINTS_TOKEN";
