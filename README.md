# Deploy TrustGraph in an OVHcloud Kubernetes cluster using Pulumi

## Overview

This is an installation of TrustGraph on OVHcloud using the Managed Kubernetes Service (MKS).

The full stack includes:

- A managed Kubernetes cluster in OVHcloud
- Node pool containing 2 nodes (configurable)
- Private network with subnet configuration
- Service account and credentials for AI access
- Deploys a complete TrustGraph stack of resources in MKS
- Integration with OVHcloud AI Endpoints

Keys and other configuration for the AI components are configured into
TrustGraph using Kubernetes secrets.

The Pulumi configuration uses OVHcloud AI Endpoints with Mistral Nemo Instruct model by default.

This project uses the https://github.com/ovh/pulumi-ovh project which at the
time of writing does not support provisioning keys for AI endpoints, so
you have to create this key yourself using the console.

## How it works

This uses Pulumi which is a deployment framework, similar to Terraform but:
- Pulumi has an open source licence
- Pulumi uses general-purpose programming languages, particularly useful
  because you can use test frameworks to test the infrastructure.

Roadmap to deploy:
- Install Pulumi
- Setup Pulumi
- Configure your environment with OVHcloud credentials
- Modify the local configuration to do what you want
- Deploy
- Use the system

## Prerequisites

### Create OVHcloud API Credentials

1. Go to https://www.ovh.com/auth/api/createToken
2. Create API keys with the following rights:
   - GET /cloud/project/*
   - POST /cloud/project/*
   - PUT /cloud/project/*
   - DELETE /cloud/project/*
3. Note down your credentials:
   - Application Key
   - Application Secret
   - Consumer Key

### Set Environment Variables

```bash
export OVH_ENDPOINT=ovh-eu  # or ovh-ca, ovh-us
export OVH_APPLICATION_KEY=your_application_key
export OVH_APPLICATION_SECRET=your_application_secret
export OVH_CONSUMER_KEY=your_consumer_key
export PULUMI_CONFIG_PASSPHRASE=
```
### Get Your Project ID

You'll need your OVHcloud project ID (service name). You can find this in the OVHcloud Control Panel under Public Cloud. It's the hex string
in the top LHS of the screen.

### Create AI Endpoints Token

1. Go to https://endpoints.ai.cloud.ovh.net/
2. Click on "Get your free token"
3. Follow the process to create your AI Endpoints access token
4. Keep this token safe - you'll need it for the deployment

## Deploy

### Install Dependencies

```bash
cd pulumi
npm install
```

### Setup Pulumi

You need to tell Pulumi which state to use. You can store this in an S3
bucket, but for experimentation, you can just use local state:

```bash
pulumi login --local
```

Pulumi operates in stacks, each stack is a separate deployment. To create
a new stack for OVHcloud:

```bash
pulumi stack init ovhcloud
```

This will use the configuration in `Pulumi.ovhcloud.yaml`.

### Configure Your Stack

Edit `Pulumi.ovhcloud.yaml` and update the following values:

- `trustgraph-ovhcloud:service-name` - Your OVHcloud project ID
- `trustgraph-ovhcloud:region` - OVHcloud region (e.g., GRA11, BHS5, WAW1, SBG5, UK1, DE1)
- `trustgraph-ovhcloud:environment` - Environment name (dev, prod, etc.)
- `trustgraph-ovhcloud:ai-model` - AI model to use (default: mistral-nemo-instruct-2407)
- `trustgraph-ovhcloud:node-size` - Node flavor (default: b2-15)
- `trustgraph-ovhcloud:node-count` - Number of nodes (default: 2)
- `trustgraph-ovhcloud:ai-endpoints-token` - Your AI Endpoints access token (encrypted)

Available AI models in OVHcloud AI Endpoints include:
- `mistral-nemo-instruct-2407`
- `mixtral-8x7b-instruct-0123`
- `llama-3-8b-instruct`
- `codestral-2405`

Available node flavors:
- `b2-7` - 2 vCPUs, 7GB RAM
- `b2-15` - 4 vCPUs, 15GB RAM
- `b2-30` - 8 vCPUs, 30GB RAM
- `b2-60` - 16 vCPUs, 60GB RAM
- `b2-120` - 32 vCPUs, 120GB RAM

### Customize Resources

You can edit `resources.yaml` to customize what gets deployed to the cluster.
The resources.yaml file was created using the TrustGraph config portal,
so you can re-generate your own.

### Set AI Endpoints Token

Before deploying, set your AI Endpoints token:

```bash
pulumi config set --secret trustgraph-ovhcloud:ai-endpoints-token YOUR_AI_ENDPOINTS_TOKEN
```

### Deploy the Infrastructure

```bash
pulumi up
```

Review the planned changes and confirm by typing "yes".

If everything works:
- A file `kube.cfg` will be created which provides access to the Kubernetes cluster
- The TrustGraph application will be deployed to the cluster
- AI credentials will be configured automatically

To connect to the Kubernetes cluster:

```bash
kubectl --kubeconfig kube.cfg -n trustgraph get pods
```

If something goes wrong while deploying, retry before giving up.
`pulumi up` is a retryable command and will continue from where it left off.

## Use the System

To access TrustGraph services, set up port-forwarding. You'll need multiple
terminal windows to run each of these commands:

```bash
kubectl --kubeconfig kube.cfg -n trustgraph port-forward service/api-gateway 8088:8088
kubectl --kubeconfig kube.cfg -n trustgraph port-forward service/workbench-ui 8888:8888
kubectl --kubeconfig kube.cfg -n trustgraph port-forward service/grafana 3000:3000
```

This will allow you to access:
- API Gateway: http://localhost:8088
- Workbench UI: http://localhost:8888
- Grafana: http://localhost:3000

## AI Endpoints Configuration

The deployment automatically configures access to OVHcloud AI Endpoints. The AI
endpoint URL and authentication token are stored as Kubernetes secrets.

To use a different AI model, update the `ai-model` configuration in your
Pulumi stack configuration.

For production use, you should generate a proper AI Endpoints token through
the OVHcloud Control Panel instead of using the automatically generated
service account credentials.

## Destroy

To tear down all the infrastructure:

```bash
pulumi destroy
```

Type "yes" to confirm the destruction of all resources.

## Troubleshooting

### Authentication Issues

If you get authentication errors, verify:
1. All four environment variables are set correctly
2. Your API credentials have the necessary permissions
3. The endpoint matches your account region (ovh-eu, ovh-ca, ovh-us)

### Cluster Creation Fails

If cluster creation fails:
1. Check that your project has sufficient quota
2. Verify the region is available for Kubernetes
3. Ensure the node flavor is available in your selected region

### AI Endpoints Issues

If AI features aren't working:
1. Check that the AI model name is correct
2. Verify AI Endpoints are available in your region
3. Consider generating a dedicated AI token in the OVHcloud Control Panel

## How the config was built

```
python3 -m venv env
. env/bin/activate
pip install git+https://github.com/trustgraph-ai/trustgraph-templates@master
tg-configurator -t 1.3 -v 1.3.18 --platform ovh-k8s -R > resources.yaml
```

## Additional Resources

- [OVHcloud Managed Kubernetes Documentation](https://docs.ovh.com/gb/en/kubernetes/)
- [OVHcloud AI Endpoints Documentation](https://help.ovhcloud.com/csm/en-documentation-ai-endpoints)
- [Pulumi OVH Provider Documentation](https://www.pulumi.com/registry/packages/ovh/)
- [TrustGraph Documentation](https://trustgraph.ai/)
