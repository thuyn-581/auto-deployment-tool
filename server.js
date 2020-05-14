const express = require('express');
const ecstatic = require('ecstatic');
var bodyParser = require("body-parser");
var fs = require('fs');
var https = require('https');
var { spawn }= require('child_process');
var superagent = require('superagent');
//var PropertiesReader = require('properties-reader');
//var properties = PropertiesReader(process.env['HOME'] + '/auto-deployment-tool/secret.properties');

// Change slack incoming webhook url to the URL provided by your slack admin
var SLACK_WEBHOOK = 'https://hooks.slack.com/services/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';

var currentTasks = []; // currently executing tasks
var taskQueue = [];  // queue of tasks to be executed
var completedTasks = []; // recently completed executions

var exitCodeMapping = {};
exitCodeMapping[0] = 'COMPLETED';

var home_dir = process.env['HOME'] + '/auto-deployment-tool';
var PROVIDER,
	KEY_ID,
	KEY_SECRET,
	APP_ID,
	APP_SECRET,
	SUBS_ID,
	TENANT_ID,
	PROJECT_ID,
	SA_NAME,
	TAG_OWNER,
	TAG_TEAM,
	DESTROY,
    REGION,
    BASE_DNS_DOMAIN,
    CLUSTER_NAME,
    OCP_VERSION,
    ACM_VERSION = 'n/a',
	ACM_REPO = 'upstream',
    ACM_ENABLED;
var OCP_DIR = process.env['HOME'] + '/ocp-install/';

var app = express(); // creates a new server to listen for incoming HTTP request
app.use(bodyParser.json());
app.get('/status', getStatus);  // server GET request for /status end-point to show state of this launcher app.
app.post('/run', queueTask); // server POST request to /run end-point.  Allows someone (or something) to initiate execution.
app.get('/task', getTask); // server GET request for /task end-point.  Allows initiator to know when their task completes.

app.use(ecstatic({
  root: `/root/auto-deployment-tool/logs`,
  showdir: true,
}));

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
	var task;
	
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
	case 'gcp':
		SA_NAME = req.body.provider.saName;
		PROJECT_ID = req.body.provider.projectId;
	break;
	}
	
	TAG_OWNER = req.body.provider.tags.owner;
	TAG_TEAM = req.body.provider.tags.team;

    REGION = req.body.region;
    OCP_VERSION = req.body.ocpVersion;
    CLUSTER_NAME = req.body.clusterName;
    BASE_DNS_DOMAIN = req.body.baseDnsDomain;
    ACM_ENABLED = req.body.acmEnabled;
	
    if (ACM_ENABLED === 'true'){	
		ACM_VERSION = req.body.acmHub.acmVersion;
		ACM_REPO = req.body.acmHub.acmRepo;
    }	
	
	DESTROY = req.body.destroy;
	
	if (DESTROY === 'true') {
		task = {
			PROVIDER,
			CLUSTER_NAME,
			BASE_DNS_DOMAIN,
			DESTROY,
			runId: runId,
			exitStatus: 'Destroying'
		};
	}
    else{
		task = {
			PROVIDER,
			CLUSTER_NAME,
			OCP_VERSION,
			REGION,
			BASE_DNS_DOMAIN,
			ACM_ENABLED,
			ACM_VERSION,
			runId: runId,
			exitStatus: 'Pending' // Initiator can use /task to check exitStatus.  When no longer pending the run is complete.
		};
	}
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
	let cmd ='';
	var child;
	var env = Object.create( process.env );
	
	// create logs folfer if not exists
	if (!fs.existsSync(home_dir +'/logs')){
		cmd = 'mkdir -p '+ home_dir +'/logs';
		require('child_process').execSync(cmd,{stdio:['inherit','pipe','pipe']});
	}	
	let logfile = home_dir +'/logs/'+ currentTask.CLUSTER_NAME +'-'+ currentTask.runId +'.log';
	
	//set provider variables
	switch(PROVIDER) {
	case 'aws':
		env.AWS_ACCESS_KEY_ID = KEY_ID;
		env.AWS_SECRET_ACCESS_KEY = KEY_SECRET;
	break;
	case 'azure':
		env.SUBSCRIPTION_ID = SUBS_ID;
		env.TENANT_ID = TENANT_ID;
		env.APP_ID = APP_ID
		env.SECRET = APP_SECRET;
	break;
	case 'gcp':
		env.sa_name = SA_NAME;
		env.GOOGLE_CLOUD_KEYFILE_JSON = home_dir + '/.sa.json';
		env.PROJECTID = PROJECT_ID;
	break;
	}
	
	// set ocp variables
	env.destroy = DESTROY;
	env.ocp_version = OCP_VERSION;
	env.cluster_name = CLUSTER_NAME;
	env.base_dns_domain = BASE_DNS_DOMAIN;
	env.region = REGION;
	env.provider = PROVIDER;
	env.ocp_installation_dir = OCP_DIR + CLUSTER_NAME;
	env.acm_enabled = ACM_ENABLED
	
	// set acm varriables
	if (ACM_ENABLED === 'true'){
		env.acm_version = ACM_VERSION;
		env.acm_installation_dir = OCP_DIR + CLUSTER_NAME + '/acm-'+ ACM_VERSION +'-' + PROVIDER;
		env.acm_repo = ACM_REPO;
		env.LICENSE = 'accept';
	}	
	
	//console.log(env)
	child = spawn('sh',[home_dir + '/Scripts/install.sh', ' 2>&1 | tee '+ logfile + '; ( exit ${PIPESTATUS[0]} )'],{ env:env, shell:true, stdio:'inherit' });
	child.on('close', function (exitCode) { // Execution Tool exited, so do post-processing (i.e. post result to slack).
        taskCompleted(currentTask, exitCode);
        currentTask = null;
    });	
//	taskCompleted(currentTask,child.status);
//	currentTask = null;
}

function taskCompleted(task,exitCode){
	var logfile = home_dir +'/logs/'+ task.CLUSTER_NAME +'-'+ task.runId +'.log';
	const execSync = require('child_process').execSync;
	//const cmd = 'tac '+ logfile;
	var exitStatus = '\n>:warning: ERROR: An error occurred. Exiting...Please check <https://147.75.104.202:5555/'+ task.CLUSTER_NAME +'-'+ task.runId +'.log' + '|_detailed logs_> for more info';
	
	if (exitCodeMapping[exitCode]) {   
		if (task.DESTROY === 'true'){
			exitStatus = '\n>:checkyes: Destroy completed';
		}
		else {
			if (task.ACM_ENABLED === 'true'){
				exitStatus = ':checkyes: \n>Red Hat ACM URL: https://multicloud-console.apps.' + task.CLUSTER_NAME + '.' + task.BASE_DNS_DOMAIN + '\n>Login to the console with user: ocp/ocpadmin, password: Test4ACM';
			}
			else{
				exitStatus = ':checkyes: \n>OpenShift web-console: https://console-openshift-console.apps.'+ task.CLUSTER_NAME + '.' + task.BASE_DNS_DOMAIN + '\n>Login to the console with user: ocp/ocpadmin, password: Test4ACM';
			}
		}
		execSync('rm -f ' + logfile); //remove log file if successfull	
	}
		
	// remove ANSI escape codes
	task.exitStatus = exitStatus.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
	
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
	if (task.DESTROY === 'true'){
		message = 'Cluster: *'+ task.PROVIDER + '/' + task.CLUSTER_NAME +'*'+ task.exitStatus; 
	}
	else{
		if (task.ACM_ENABLED === 'true'){
			message = 'Cluster: *'+ task.PROVIDER + '/' + task.CLUSTER_NAME +'* -- ACM version *`'+ task.ACM_VERSION +'`* ' +task.exitStatus;
		}
		else {
			message = 'Cluster: *'+ task.PROVIDER + '/' + task.CLUSTER_NAME +'* -- OpenShift version *`'+ task.OCP_VERSION +'`* ' +task.exitStatus;
		}		
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
		
var httpsServer = https.createServer({
  key: fs.readFileSync(process.env['HOME'] + '/auto-deployment-tool/server.key','utf8'),
  cert: fs.readFileSync(process.env['HOME'] + '/auto-deployment-tool/server.cert','utf8')
}, app);

httpsServer.listen(5555);
console.log("server starting on port: " + 5555);