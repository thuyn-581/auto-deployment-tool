var express = require('express');
var bodyParser = require("body-parser");
var fs = require('fs');
var { spawn } = require('child_process');
var superagent = require('superagent');

// Change slack incoming webhook url to the URL provided by your slack admin
var SLACK_WEBHOOK = 'https://hooks.slack.com/services/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';

var ARTIFACTORY_USER='thuy.n.nguyen@ibm.com'
var ARTIFACTORY_TOKEN='AKCp5e2qc4xtgwVcJwvdHm5Ed1vEaurYp8dpj32iYPJq6SjMvK8LCkq97VYSK4RszY71xetZL'

var currentTasks = []; // currently executing tasks
var taskQueue = [];  // queue of tasks to be executed
var completedTasks = []; // recently completed executions

var exitCodeMapping = {};
exitCodeMapping[0] = 'COMPLETED';

var ARCH;
var PROVIDER;
var pwd;
var infNode; 
var CLUSTER_NAME;
var VERSION;
var URL;
var CP_DIR;
var PROXY_NODE;
var MGMT_NODE;
var SC_NAME='';
var CP;
var INCEPTION='';
var IMAGE='';
var STAGE='release';
var MANIFEST='offline';
var MASTER_NODE;
var WORKER_NODE='';


var CP_REPO_IMAGE_AND_TAG = 'https://na.artifactory.swg-devops.com/artifactory';
var SCRIPT_NAME;
var user='root';

var app = express(); // creates a new server to listen for incoming HTTP request
app.use(bodyParser.json());
app.get('/status', getStatus);  // server GET request for /status end-point to show state of this launcher app.
app.post('/run', queueTask); // server POST request to /run end-point.  Allows someone (or something) to initiate execution.
app.get('/task', getTask); // server GET request for /task end-point.  Allows initiator to know when their task completes.
app.put('/kill',cancelTask); // server PUT request for /task end-point.  Allows initiator to cancel when their executing task.

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

function cancelTask(req, res) {
	var runId = req.query['runId'];
    var task;	

    if (runId) {
		for (var i = 0; i < currentTasks.length && !task; i++) {
           if(currentTasks[i].runId === runId) {
                task = currentTasks[i];
            }
        }
		if(task) {
			// send kill signal
			setUser(task);
			let cmd = 'sshpass -p'+ pwd +
				' ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no '+ user +'@' + task.infNode +
				' \"ps -ef | grep -v grep | grep _deploy_ | awk \'{print $2}\' |xargs kill\"';
			require('child_process').execSync(cmd,{stdio:['inherit','pipe','pipe']});
			task.exitStatus = 'Cancelled';
			res.json(task).end();
			
			// Remove task from executing queue
			currentTasks.splice(currentTasks.indexOf(task),1);
			taskCompleted(task);
		} else {
			res.status(404).end();  // can't find a match.
		}
	}	
}

// queues a task to run a test.  return json object containing runId that can be used for initiator get task status.
function queueTask(req, res) {
    var runId = 'run_id_' + new Date().getTime(); // generate a random runId.	
	CP_REPO_IMAGE_AND_TAG = 'https://na.artifactory.swg-devops.com/artifactory/';
	
	ARCH = req.body.arch;
	PROVIDER = req.body.provider;
	pwd = req.body.shellPwd;
	CP = req.body.cloudpak;		
	URL = req.body.url;	
	VERSION = req.body.version;

	CLUSTER_NAME = req.body.cluster.name;
	infNode = req.body.cluster.infNode;	
	PROXY_NODE = req.body.cluster.proxyNode;
	MGMT_NODE = req.body.cluster.managementNode;
	
	var arr = URL.split('-');	
	if (CP !== 'icp'){
		SC_NAME = req.body.cluster.scName;
		MASTER_NODE = req.body.cluster.masterNode;
		STAGE = arr[3];
		MANIFEST = req.body.manifest;
		SCRIPT_NAME = 'cp_deploy_'+ MANIFEST +'-'+ ARCH +'.sh';
		if (MANIFEST === 'offline'){
			IMAGE = (CP === 'mcm')?'ibm-cp4mcm-core-'+ arr[6] +'-'+ ARCH +'.tar.gz':
									'common-services-'+ arr[6] +'-'+ ARCH +'.tar.gz';
			CP_REPO_IMAGE_AND_TAG += URL + '/' + IMAGE;			
		}
		else{
			arr = URL.split('/');
			INCEPTION = arr[2];
			CP_REPO_IMAGE_AND_TAG = arr[0]+'.artifactory.swg-devops.com/'+arr[1]+'/'+arr[2]+':'+VERSION;
		}
	}
	else {
		MASTER_NODE = infNode;
		WORKER_NODE = req.body.cluster.workerNode;
		SCRIPT_NAME = 'icp_deploy.sh';
		IMAGE = 'ibm-cloud-private-x86_64-' + VERSION +'.tar.gz';
		CP_REPO_IMAGE_AND_TAG += URL + '/' + IMAGE;
	}
    
	var task = {
		PROVIDER,
		CP,
		SCRIPT_NAME,
		CP_REPO_IMAGE_AND_TAG,
		CLUSTER_NAME,
		STAGE,
		infNode,
		VERSION,
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
	
	CP_DIR = '/opt/ibm-cloudpak/' + CP + '-' + STAGE + '_' + VERSION +'_' + MANIFEST
		
	// pull first task off the queue and run it.
    let task = taskQueue.shift();	
    console.log('Running task.  runId: ' + task.runId + ' - cluster: '+ task.CLUSTER_NAME);
	
	currentTasks.unshift(task);
	taskExecute(task);
}	

function taskExecute(currentTask){
	setUser(currentTask);
	let logfile = fs.createWriteStream('/root/Scripts/logs/'+ currentTask.CLUSTER_NAME +'-'+ currentTask.runId +'.log')
	
	// copy executitng scripts to target node
	let cmd ='';
	let prefix = (CP === 'icp')? 'icp':'cp';		
	cmd = 'sshpass -p'+ pwd +
			' ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no '+ user +'@' + currentTask.infNode +
			' mkdir -p ~/deploy';
	require('child_process').execSync(cmd,{stdio:['inherit','pipe','pipe']});
				
	cmd = 'sshpass -p'+ pwd +
			'  scp -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no /root/Scripts/'+ prefix +'_* '+ user +'@'+ currentTask.infNode +':~/deploy';
	require('child_process').execSync(cmd,{stdio:['inherit','pipe','pipe']});
	
	// add exec permission
	cmd = 'sshpass -p'+ pwd +
				' ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no '+ user +'@' + currentTask.infNode + 
				' chmod +x ~/deploy/'+ currentTask.SCRIPT_NAME;
	require('child_process').execSync(cmd,{stdio:['inherit','pipe','pipe']});
								
	// execute scripts at target node
	let env_var = ' env CP='+ CP + 
					' IMAGE=' + IMAGE +
					' VERSION=' + VERSION +
					' STAGE=' + STAGE +
					' MANIFEST=' + MANIFEST +
					' INCEPTION=' + INCEPTION +
					' CP_DIR='+ CP_DIR +
					' ARTIFACTORY_USER=' + ARTIFACTORY_USER +
					' ARTIFACTORY_TOKEN=' + ARTIFACTORY_TOKEN +
					' MASTER_NODE=' + MASTER_NODE +
					' WORKER_NODE=' + WORKER_NODE +
					' PROXY_NODE=' + PROXY_NODE +
					' MGMT_NODE=' + MGMT_NODE + 
					' SC_NAME=' + SC_NAME +
					' CP_REPO_IMAGE_AND_TAG=' + CP_REPO_IMAGE_AND_TAG
	cmd = 'sshpass -p'+ pwd +' ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no '+ user +'@' +
				infNode + env_var +' ~/deploy/'+ SCRIPT_NAME;
	//console.log(cmd);
	logfile.write('Executing command' + cmd);
	let arr = cmd.split(" ");
	var child = spawn(arr.shift(),arr);
	
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
	var exitStatus = task.exitStatus;
	if ( exitStatus !== 'Cancelled'){
	    exitStatus = 'ERROR: Unknown Exit Status (' + exitCode + ')';	
		const execSync = require('child_process').execSync;
		const cmd = 'tac /root/Scripts/logs/'+ task.CLUSTER_NAME +'-'+ task.runId +'.log';
	
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
		task.exitStatus = exitStatus;
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
    var message = 'Cluster: *'+ CLUSTER_NAME +'* -- '+ infNode +'\n ```\n' +task.exitStatus + '```';
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
		case 'fyre':
			user = 'root';
			break;
	}
}
	
app.listen(5555);
console.log("server starting on port: " + 5555);
