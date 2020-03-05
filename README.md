# Introduction:
The tool has been designed for bringing up a new ICP/CP cluster without manual intervention.

The tool is built using Node.js and written in JavaScript to kick start the deployment scripts on the target cluster, which performs:
- Expose URL endpoint for listening to deployment requests
- Generate config.yaml and start deployment on the target cluster using appropriate deployment scripts via SSH
- Post a message on slack once the deployment process exits


# Endpoints:
The server has been deployed on 9.21.51.225 - Please sign in BSO before sending requests.
- http://9.21.51.225:5555/status - server GET request for /status endpoint to show state of this app by returning task queues (Queued, In Progress, Completed)
- http://9.21.51.225:5555/run - server POST request to /run end-point to initiate auto deployment on the target cluster
- http://9.21.51.225:5555/task/<runId> - server GET request for /task end-point.  Allows initiator to know when their task completes


# Usages:
The following deployment scenarios are currently supported by the tool:
1. Deploy OpenShift on 
	- AWS 
	- Azure
	
`curl -i -X POST -H 'Content-Type: application/json' -d @<data_file.json> http://9.21.51.225:5555/run`


# Sample post messages:
{
	"provider": {
		"name": "aws",
		"keyId":"xxx",
		"keySecret":"xxx"
	},
	"ocpVersion": "4.4.0-0.nightly-2020-03-03-065638",
	"baseDnsDomain": "dev01.red-chesterfield.com",
	"region": "us-east-1",
	"clusterName": "thnguyen-ocp44",
    "acmEnabled": "false",
	"acmHub": {
		"csVersion": "3.3.0",
		"scName": "gp2"
	}
}

{
	"provider": {
		"name": "azure",
		"subscriptionId": "da057d84-6570-41ea-83f7-f0f61a70542f",
		"tenantId": "6047c7e9-b2ad-488d-a54e-dc3f6be6a7ee",
		"appId":"xxx",
		"appSecret":"xxx"
	},
	"ocpVersion": "4.3.3",
	"baseDnsDomain": "dev06.az.red-chesterfield.com",
	"region": "eastus2",
	"clusterName": "thnguyen-ocp44-az",
    "acmEnabled": "false",
	"acmHub": {
		"csVersion": "3.2.4",
		"scName": "managed-premium"
	}
}

# Slack channel 
https://coreos.slack.com/archives/GUXNTT64Q
