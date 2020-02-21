var express = require('express');
var bodyParser = require("body-parser");
var fs = require('fs');
var { spawn }= require('child_process');
var superagent = require('superagent');
var PropertiesReader = require('properties-reader');
var properties = PropertiesReader('/root/auto-deployment-tool/secret.properties');

// Change slack incoming webhook url to the URL provided by your slack admin
var SLACK_WEBHOOK = 'https://hooks.slack.com/services/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';

var SYNERGY_USER = properties.get('synergy.quay.io.user');
var SYNERGY_PASSWD = properties.get('synergy.quay.io.password');
var SYNERGY_CHART_PASSWD = properties.get('synergy.chart.password');

var currentTasks = []; // currently executing tasks
var taskQueue = [];  // queue of tasks to be executed
var completedTasks = []; // recently completed executions

var exitCodeMapping = {};
exitCodeMapping[0] = 'COMPLETED';

var root_dir = '/root/auto-deployment-tool';
var PROVIDER,
    REGION,
    BASE_DNS_DOMAIN,
    CLUSTER_NAME,
    OCP_VERSION,
    CS_VERSION = 'n/a',
    SC_NAME,
    ACM_ENABLED;
var OCP_DIR = '/opt/ocp-install/';

var app = express(); // creates a new server to listen for incoming HTTP request
app.use(bodyParser.json());
app.get('/status', getStatus);  // server GET request for /status end-point to show state of this launcher app.
app.post('/run', queueTask); // server POST request to /run end-point.  Allows someone (or something) to initiate execution.
app.get('/task', getTask); // server GET request for /task end-point.  Allows initiator to know when their task completes.

setInterval(processQueue, 3000); // start main interval that checks queue for task to run.

// information about activity and state of this test launcher.
function getStatus(req, res) {
    var status = '';
	
    status += 'Current Tasks:' + '\n';
    status += JSON.stringify(currentTasks,null,2) + '\n';

    status += 'Task Queue:' + '\n';
    status += JSON.stringify(taskQueue,null,2) + '\n';

    status += 'Completed Tasks:' + '\n';
    status += JSON.stringify(completedTasks,null,2) + '\n';

    res.send(status).end();
}

// return matching task based on runId in queryString.
function getTask(req, res) {
    var runId = req.query['runId'];
    var task;
    if (runId) {
		for (var i = 0; i < currentTasks.length && !task; i++) {
            if(currentTasks[i].runId === runId) {
                task = currentTasks[i];
            }
        }
        for (var i = 0; i < taskQueue.length && !task; i++) {
            if(taskQueue[i].runId === runId) {
                task = taskQueue[i];
            }
        }
        for (var i = 0; i < completedTasks.length && !task; i++) {
            if(completedTasks[i].runId === runId) {
                task = completedTasks[i];
            }
        }
    }
    if (task) {
        res.json(task).end();
    } else {
        res.status(404).end();  // can't find a match.
    }
}

// queues a task to run a test.  return json object containing runId that can be used for initiator get task status.
function queueTask(req, res) {
    var runId = 'run_id_' + new Date().getTime(); // generate a random runId.	
	
	PROVIDER = req.body.provider.name;
	switch(PROVIDER) {
		case 'aws':
			KEY_ID = req.body.provider.keyId;
			KEY_SECRET = req.body.provider.keySecret;
			break;
		case 'azure':
			APP_ID = req.body.provider.appId;
			APP_SECRET = req.body.provider.appSecret;
			SUBS_ID = req.body.provider.subscriptionId;
			TENANT_ID = req.body.provider.tenantId;
			break;
		default:
			break;
	}

    REGION = req.body.region;
    OCP_VERSION = req.body.ocpVersion;
    CLUSTER_NAME = req.body.clusterName;
    BASE_DNS_DOMAIN = req.body.baseDnsDomain;
    ACM_ENABLED = req.body.acmEnabled;
	
    if (ACM_ENABLED === 'true'){	
	CS_VERSION = req.body.acmHub.csVersion;
	SC_NAME = req.body.acmHub.scName;
    }	

    var task = {
		PROVIDER,
		CLUSTER_NAME,
		OCP_VERSION,
		REGION,
		BASE_DNS_DOMAIN,
		ACM_ENABLED,
		CS_VERSION,
		runId: runId,
		exitStatus: 'Pending' // Initiator can use /task to check exitStatus.  When no longer pending the run is complete.
    };
    taskQueue.push(task);
    res.json(task).end();
}

// pull task off queue and execute
function processQueue() {
    if(taskQueue.length === 0) {
        return;
    }
	// pull first task off the queue and run it.
    let task = taskQueue.shift();	
    console.log('Running task.  runId: ' + task.runId + ' - cluster: '+ task.CLUSTER_NAME);
	currentTasks.unshift(task);
	taskExecute(task);
}	

function taskExecute(currentTask){
	let dir = '/root/auto-deployment-tool';
	let cmd ='';
	
	//generateCredentialFiles
	generateCredentialFiles(PROVIDER);
	
	// create logs folfer if not exists
	if (!fs.existsSync(dir +'/logs')){
		cmd = 'mkdir -p '+ dir +'/logs';
		require('child_process').execSync(cmd,{stdio:['inherit','pipe','pipe']});
	}	
	let logfile = fs.createWriteStream(dir +'/logs/'+ currentTask.CLUSTER_NAME +'-'+ currentTask.runId +'.log')
						
	// set ocp variables
	var env = Object.create( process.env );
	env.ocp_version = OCP_VERSION;
	env.cluster_name = CLUSTER_NAME;
	env.base_dns_domain = BASE_DNS_DOMAIN;
	env.region = REGION;
	env.provider = PROVIDER;
	env.ocp_installation_dir = OCP_DIR + CLUSTER_NAME;
	env.acm_enabled = ACM_ENABLED
	
	// set azure ids
	if (PROVIDER === 'azure'){
		env.azure_client_id = APP_ID;
		env.azure_client_secret = APP_SECRET;
		env.azure_tenant_id = TENANT_ID;
	}
	
	// set acm varriables
	if (ACM_ENABLED === 'true'){
		env.COMMON_SERVICE_VERSION=CS_VERSION;
		env.acm_installation_dir=OCP_DIR + CLUSTER_NAME + '/acm-'+ CS_VERSION +'-' + PROVIDER;
		env.DEFAULT_STORAGE_CLASS=SC_NAME;
		env.DEFAULT_ADMIN_USERNAME='admin';
		env.DEFAULT_ADMIN_PASSWORD='admin';
		env.PASSWORD_RULES='(.*)';
		env.DOCKER_USERNAME=SYNERGY_USER;
		env.DOCKER_PASSWORD=SYNERGY_PASSWD;
		env.CHART_PASSWORD=SYNERGY_CHART_PASSWD;
		env.LICENSE='accept';
	}	
	
	//console.log(env)
	var child = spawn('sh',['/root/auto-deployment-tool/Scripts/install.sh'],{ env:env, shell:true, stdio:'pipe' });
	child.stdout.on('data', (data) => {
		//process.stdout.write(`${data}`)  // log to console
		logfile.write(data)  // log to file
	})	
	child.on('close', function (exitCode) { // Execution Tool exited, so do post-processing (i.e. post result to slack).
	        taskCompleted(currentTask, exitCode);
	        currentTask = null;
        });	
}

function taskCompleted(task,exitCode){
	let exitStatus = task.exitStatus;
	if ( exitStatus !== 'Cancelled'){
	    exitStatus = 'ERROR: Unknown Exit Status (' + exitCode + ')';	
		const execSync = require('child_process').execSync;
		const cmd = 'tac /root/auto-deployment-tool/logs/'+ task.CLUSTER_NAME +'-'+ task.runId +'.log';
	
		if (exitCodeMapping[exitCode]) {        
			if (ACM_ENABLED === 'true'){
				const stdout = execSync(cmd +' | grep "Connect to MCM at" | head -1');
				exitStatus = exitCodeMapping[exitCode]+': '+ `${stdout}`;
			}
			else{
				exitStatus = 'Access the OpenShift web-console: https://console-openshift-console.apps.'+ task.CLUSTER_NAME + '.' + task.BASE_DNS_DOMAIN
							+ '\nLogin to the console with user: ocpadmin, password: Test4ACM';
			}
		}
		else {
			const stdout = execSync(cmd +' | grep TASK | head -1');
			if (`${stdout}`.length > 0){
				exitStatus = 'FAILED: ' + `${stdout}`;
			}
		};
		
		// remove ANSI escape codes
		task.exitStatus = exitStatus.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
	}
	
    console.log('Task completed on '+ task.CLUSTER_NAME +'.  runId: ' + task.runId + ' exitStatus: ' + exitStatus);    
    sendSlackMessage(task);
	
    // Remove task from executing queue
	currentTasks.splice(currentTasks.indexOf(task),1);
	
	// Adds task to the completed task queue and prevent queue from growing unbound.
    completedTasks.unshift(task); 
    if (completedTasks.length > 10) {
        completedTasks.pop();
    }		
}

function sendSlackMessage(task) {
	var message = '';
	if (ACM_ENABLED === 'true'){
	    message = 'Cluster: *'+ task.PROVIDER + '/' + task.CLUSTER_NAME +'* -- Installed MCM *'+ ' v'+ task.CS_VERSION +'*\n```' +task.exitStatus + '```';
	}
	else {
	    message = 'Cluster: *'+ task.PROVIDER + '/' + task.CLUSTER_NAME +'* -- OpenShift version *'+ ' v'+ task.OCP_VERSION +'*\n```' +task.exitStatus + '```';
	}
    var body = {text: message}; // Slack requires message to be in a JSON object using text attribute.

    //console.log('Posting message to slack: ', message);
    superagent.post(SLACK_WEBHOOK)
        .type('application/json')
        .send(body)
        .end(function (err, res) {
            if (err) {
                console.log('Error posting to slack.  err:', err);
            } else if (res.ok) {
                //console.log('Successfully posted message to slack.  runId: ' + task.runId + ' exitStatus: ' + task.exitStatus);
            } else {
                console.log('Unexpected response from slack.  status: ' + res.status + ' body: ', res.body);
            }
        });
}

function generateCredentialFiles(provider){ 
	let content = '';
	switch(provider) {
	case 'aws':
		content = '[default]\n'+
					'aws_access_key_id=' + KEY_ID + '\n' +
					'aws_secret_access_key=' + KEY_SECRET + '\n'
		fs.writeFileSync('/root/.aws/credentials',content)
		break;
	case 'azure':
		content = '{"subscriptionId":"' + SUBS_ID + '",' +
					'"clientId":"' + APP_ID + '",' +
					'"clientSecret":"' + APP_SECRET + '",' +
					'"tenantId":"' + TENANT_ID + '"}'
		fs.writeFileSync('/root/.azure/osServicePrincipal.json',content)
		break;
	default:
		break;
	}
	

}
	
app.listen(5555);
console.log("server starting on port: " + 5555);
