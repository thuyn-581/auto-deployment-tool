# Introduction:
The tool has been designed for bringing up a new OCP cluster without manual intervention.

The tool is built using Node.js and written in JavaScript to kick start the deployment scripts on the target cluster, which performs:
- Expose URL endpoint for listening to deployment requests
- Generate install-config.yaml and start deployment on the target cluster using appropriate deployment scripts via SSH
- Post a message on slack once the deployment process exits


# Endpoints:
The server has been deployed on vSphere (public ip 147.75.104.202 - subject to changes) 
- https://147.75.104.202:5555/status - server GET request for /status endpoint to show state of this app by returning task queues (Queued, In Progress, Completed)
- https://147.75.104.202:5555/run - server POST request to /run end-point to initiate auto deployment on the target cluster
- https://147.75.104.202:5555/task/<runId> - server GET request for /task end-point.  Allows initiator to know when their task completes


# Usages:
The following deployment scenarios are currently supported by the tool:
1. Deploy Openshift + ACM cluster
	- on AWS
	- on Azure
	- on Google

Using `curl` command to send a request
`curl -i -X POST -H 'Content-Type: application/json' -d @<data_file.json> https://147.75.104.202:5555/run`


# Sample post messages:
1. AWS 
```json
{
	"provider": {
		"name": "aws",
		"keyId":"xxx",
		"keySecret":"xxx"
		"tags": {
			"owner": "thnguyen@redhat.com",
			"team": "RHACM"
		}		
	},
	"ocpVersion": "4.4.3",
	"baseDnsDomain": "dev01.red-chesterfield.com",
	"region": "us-east-1",
	"clusterName": "thnguyen-ocp44",
	"destroy": "true",	
    	"acmEnabled": "false",
	"acmHub": {
		"acmVersion": "1.0.0-SNAPSHOT-2020-05-12-13-24-55",
		"acmRepo": "upstream"
	}
}
```

2. Azure 
```json
{
	"provider": {
		"name": "azure",
		"subscriptionId": "da057d84-6570-41ea-83f7-f0f61a70542f",
		"tenantId": "6047c7e9-b2ad-488d-a54e-dc3f6be6a7ee",
		"appId":"xxx",
		"appSecret":"xxx"
		"tags": {
			"owner": "thnguyen@redhat.com",
			"team": "RHACM"
		}		
	},
	"ocpVersion": "4.3.3",
	"baseDnsDomain": "dev06.az.red-chesterfield.com",
	"region": "eastus2",
	"clusterName": "thnguyen-ocp43-az",
	"destroy": "false",
    	"acmEnabled": "true",
	"acmHub": {
		"acmVersion": "1.0.0-RC2",
		"acmRepo": "quay.io/acm-d"
	}
}
```

3. Google:
```json
{
	"provider": {
		"name": "gcp",
		"projectId": "gc-acm-test",
		"saName":"openshift-terraform",
		"tags": {
			"owner": "thnguyen@redhat.com",
			"team": "RHACM"
		}
	},
	"ocpVersion": "4.3.3",
	"baseDnsDomain": "dev06.az.red-chesterfield.com",
	"region": "eastus2",
	"clusterName": "thnguyen-ocp43-az",
	"destroy": "false",
    	"acmEnabled": "true",
	"acmHub": {
		"acmVersion": "1.0.0-RC2",
		"acmRepo": "quay.io/acm-d"
	}
}
```

# Slack channel 
https://coreos.slack.com/archives/GUXNTT64Q
