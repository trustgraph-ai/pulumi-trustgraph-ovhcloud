import * as pulumi from "@pulumi/pulumi";

// Set up Pulumi runtime for testing
pulumi.runtime.setConfig("project:name", "trustgraph-ovhcloud");

// Mock console.log to reduce test output noise
global.console.log = jest.fn();

// Global test timeout
jest.setTimeout(10000);