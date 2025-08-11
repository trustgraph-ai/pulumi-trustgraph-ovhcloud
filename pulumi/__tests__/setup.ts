import * as pulumi from "@pulumi/pulumi";

// Set test mode
process.env.PULUMI_TEST_MODE = "true";

// Set up Pulumi runtime for testing
pulumi.runtime.setConfig("project:name", "trustgraph-ovhcloud");

// Global test timeout
jest.setTimeout(10000);

// Increase max listeners to avoid warnings
process.setMaxListeners(20);