# Introduction:
The tool has been designed for bringing up a new ICP/CP cluster without manual intervention.

The tool is built using Node.js and written in JavaScript to kick start the deployment scripts on the target cluster, which performs:
- Expose URL endpoint for listening to deployment requests
- Generate config.yaml and start deployment on the target cluster using appropriate deployment scripts via SSH
- Post a message on slack once the deployment process exits


# Endpoints:
- http://9.21.51.225:5555/status - server GET request for /status endpoint to show state of this app by returning task queues (Queued, In Progress, Completed)
- http://9.21.51.225:5555/run - server POST request to /run end-point to initiate auto deployment on the target cluster
- http://9.21.51.225:5555/task/<runId> - server GET request for /task end-point.  Allows initiator to know when their task completes


# Usages:
The following deployment scenarios are currently supported by the tool:
1. Deploy cloud paks on OpenShift on Fyre (CP4MCM and Common Services) 
	- Manifest: online/offline
	- Stage: edge/stash/release
2. Deploy stand-alone ICP cluster in Spectrum lab (9.21.51.x) 
	- Manifest: offline
	- Stage: release
	
`curl -i -X POST -H 'Content-Type: application/json' -d @<data_file.json> http://9.21.51.225:5555/run`


# Sample post messages:
1. CP4MCM online
JSON
----

```json
{
  "arch": "x86_64",
  "shellPwd":"<shell_pwd>",
  "cloudpak": "mcm",
  "version":"3.2.3",
  "manifest": "online",
  "url":"hyc-cloud-private-edge-docker-local/ibmcom-amd64/mcm-inception",
  "cluster": {
    	"name":"<cluster_name>",
    	"scName":"rook-ceph-cephfs-internal",
	"infNode": "<cluster_name>.fyre.ibm.com",
	"masterNode": "worker0.<cluster_name>.os.fyre.ibm.com",
    	"proxyNode": "worker1.<cluster_name>.os.fyre.ibm.com",
    	"managementNode": "worker2.<cluster_name>.os.fyre.ibm.com"
	}
}
```

2. Common Services offline
JSON
----

```json
{
  "arch": "x86_64",
  "shellPwd":"<shell_pwd>",
  "cloudpak": "cs",
  "version":"3.2.3",
  "manifest": "offline",
  "url":"hyc-cloud-private-release-generic-local/offline/CS-boeblingen",
  "cluster": {
    	"name":"<cluster_name>",
    	"scName":"rook-ceph-cephfs-internal",
	"infNode": "<cluster_name>-inf.fyre.ibm.com",
	"masterNode": "worker0.<cluster_name>.os.fyre.ibm.com",
    	"proxyNode": "worker1.<cluster_name>.os.fyre.ibm.com",
    	"managementNode": "worker2.<cluster_name>.os.fyre.ibm.com"
	}
}
```

3. Stand-alone ICP
JSON
----

```json
{
  "arch": "x86_64",
  "shellPwd":"<shell_pwd>",
  "cloudpak": "icp",
  "version":"3.2.1",
  "manifest": "offline",
  "url":"hyc-cloud-private-release-generic-local/offline/3.2.1",
  "cluster": {
    	"name":"<cluster_name>",
	"infNode": "9.21.51.x",
	"masterNode": "9.21.51.x",
	"workerNode": "9.21.51.x",
    	"proxyNode": "9.21.51.x",
    	"managementNode": "9.21.51.x"
	}
}
```
