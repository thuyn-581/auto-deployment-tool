var express = require('express');
var bodyParser = require("body-parser");
var fs = require('fs');
var { spawn } = require('child_process');
var superagent = require('superagent');
var PropertiesReader = require('properties-reader');
var properties = PropertiesReader('/root/auto_deployment_tool/secret.properties');

// Change slack incoming webhook url to the URL provided by your slack admin
var SLACK_WEBHOOK = 'https://hooks.slack.com/services/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';

var SYNERGY_USER = properties.get('synergy.quay.io.user');
var	SYNERGY_PASSWD = properties.get('synergy.quay.io.password');
var	SYNERGY_CHART_PASSWD = properties.get('synergy.chart.password');

console.log(SYNERGY_USER + SYNERGY_PASSWD + SYNERGY_CHART_PASSWD);

var currentTasks = []; // currently executing tasks
var taskQueue = [];  // queue of tasks to be executed
var completedTasks = []; // recently completed executions

var exitCodeMapping = {};
exitCodeMapping[0] = 'COMPLETED';

var PROVIDER,
	REGION,
	BASE_DNS_DOMAIN,
	CLUSTER_NAME,
	OCP_VERSION,
	CS_VERSION,
	SC_NAME;
var	OCP_DIR = '/opt/ocp-install/';

var app = express(); // creates a new server to listen for incoming HTTP request
app.use(bodyParser.json());
app.get('/status', getStatus);  // server GET request for /status end-point to show state of this launcher app.
app.post('/run', queueTask); // server POST request to /run end-point.  Allows someone (or something) to initiate execution.
app.get('/task', getTask); // server GET request for /task end-point.  Allows initiator to know when their task completes.
//app.put('/kill',cancelTask); // server PUT request for /task end-point.  Allows initiator to cancel when their executing task.

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
    if(task) {
        res.json(task).end();
    } else {
        res.status(404).end();  // can't find a match.
    }
}

// queues a task to run a test.  return json object containing runId that can be used for initiator get task status.
function queueTask(req, res) {
    var runId = 'run_id_' + new Date().getTime(); // generate a random runId.	

	PROVIDER = req.body.provider;
	REGION = req.body.region;
	OCP_VERSION = req.body.ocpVersion;
	CLUSTER_NAME = req.body.clusterName;
	BASE_DNS_DOMAIN = req.body.baseDnsDomain;

	CS_VERSION = req.body.acmHub.csVersion;
	SC_NAME = req.body.acmHub.scName;	
	
	var task = {
		PROVIDER,
		CLUSTER_NAME,
		OCP_VERSION,
		REGION,
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
	setUser(currentTask);	
	let dir = '~/auto_deployment_tool';
	let cmd ='';
	
	// create logs folfer if not exists
	if (!fs.existsSync(dir +'/logs')){
		cmd = 'mkdir -p '+ dir +'/logs';
		require('child_process').execSync(cmd,{stdio:['inherit','pipe','pipe']});
	}	
	let logfile = fs.createWriteStream(dir +'/logs/'+ currentTask.CLUSTER_NAME +'-'+ currentTask.runId +'.log')
						
	// execute 
	let env_var = ' env ocp_version='+ OCP_VERSION + 
					' cluster_name=' + CLUSTER_NAME +
					' base_dns_domain=' + BASE_DNS_DOMAIN +
					' region=' + REGION +
					' ocp_pull_secret=`cat /root/tmp/ocp-install/pull-secret.txt`' + //`cat '+ dir +'/pull-secret.txt`'
					' public_key=`cat /root/tmp/ocp-install/id_rsa.pub`' + //`cat '+ dir +'/id_rsa.pub`'
					' provider='+ PROVIDER +
					' ocp_installation_dir=' + OCP_DIR + CLUSTER_NAME +
					' cs_version=' + CS_VERSION +
					' acm_installation_dir=' + OCP_DIR + CLUSTER_NAME + '/acm-'+ CS_VERSION +'-' + PROVIDER +
					' DEFAULT_STORAGE_CLASS=' + SC_NAME +
					' DEFAULT_ADMIN_USERNAME=admin' +
					' DEFAULT_ADMIN_PASSWORD=admin' +
					' PASSWORD_RULES=\'(.*)\'' + 
					' DOCKER_USERNAME=' + SYNERGY_USER +
					' DOCKER_PASSWORD=' + SYNERGY_PASSWD +
					' CHART_PASSWORD=' + SYNERGY_CHART_PASSWD +
					' LICENSE=accept'
	
	const exec = require('child_process').execSync;
	const myShellScript = exec(env_var + ' && sh /root/tmp/ocp-install/install.sh');
	myShellScript.stdout.on('data', (data)=>{
		console.log(data); 
		logfile.write(data)  // log to file
	});
	myShellScript.stderr.on('data', (data)=>{
		console.error(data);
	});
	myShellScript.on('close', function (exitCode) { // Execution Tool exited, so do post-processing (i.e. post result to slack).
        taskCompleted(currentTask, exitCode);
        currentTask = null;
    });
}

function taskCompleted(task,exitCode){
	var exitStatus = task.exitStatus;
	if ( exitStatus !== 'Cancelled'){
	    exitStatus = 'ERROR: Unknown Exit Status (' + exitCode + ')';	
		const execSync = require('child_process').execSync;
		const cmd = 'tac /root/auto_deployment_tool/logs/'+ task.CLUSTER_NAME +'-'+ task.runId +'.log';
	
		if (exitCodeMapping[exitCode]) {        
			const stdout = execSync(cmd +' | grep "Dashboard URL" | head -1');
			exitStatus = exitCodeMapping[exitCode]+': '+ `${stdout}`;
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
	var cloudpak = (task.CP === 'cs')? 'Common services': task.CP.toUpperCase();
    var message = 'Cluster: *'+ task.CLUSTER_NAME +'* -- Installed Cloud Pak: *'+ cloudpak +' v'+ task.VERSION +'*\n```' +task.exitStatus + '```';
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

function setUser(task) {
	switch(task.PROVIDER){
		case '':
			user = 'root';
			break;
		default:
			user = 'root';
			break;
	}
}
	
app.listen(8888);
console.log("server starting on port: " + 8888);
