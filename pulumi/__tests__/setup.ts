import * as fs from 'fs';
import * as path from 'path';

// Mock fs.readFileSync for resources.yaml
jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

mockedFs.readFileSync.mockImplementation((filePath: any, options: any) => {
    if (filePath.includes('resources.yaml')) {
        return `
apiVersion: v1
kind: Namespace
metadata:
  name: trustgraph
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: test-config
  namespace: trustgraph
data:
  test: "value"
`;
    }
    // Call the original implementation for other files
    return jest.requireActual('fs').readFileSync(filePath, options);
});