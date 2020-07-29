#!/bin/bash

abort()
{
    echo >&2 '
***************
*** ABORTED ***
***************
'
    echo "An error occurred. Exiting..." >&2
    exit 1
}

trap 'abort' 0

set -o errexit
set -o nounset
set -euo pipefail

#---------------------------
echo >&2 '
*************
*** START ***
*************
'

cd $HOME/auto-deployment-tool
if [ ! -d ./install-client/$ocp_version ]; then
	mkdir -p ./install-client/$ocp_version
	# download install client	
	cd ./install-client/$ocp_version
	if [[ $ocp_version == *"nightly"* ]]; then	
		curl https://mirror.openshift.com/pub/openshift-v4/clients/ocp-dev-preview/$ocp_version/openshift-install-linux-$ocp_version.tar.gz --output openshift-install-$ocp_version.tar.gz
	else
		curl https://mirror.openshift.com/pub/openshift-v4/clients/ocp/$ocp_version/openshift-install-linux-$ocp_version.tar.gz --output openshift-install-$ocp_version.tar.gz
	fi
	# extract the file
	tar xvf openshift-install-$ocp_version.tar.gz
fi

# adding ssh key
if ! ps -C ssh-agent > /dev/null
then 
	eval "$(ssh-agent -s)"
	ssh-add $HOME/.ssh/id_rsa
fi

# get gcp service account key
rm -f $HOME/auto-deployment-tool/.sa.json 
if [[ $provider = "gcp" ]]; then
	account=$sa_name@$PROJECTID.iam.gserviceaccount.com
	list=`gcloud iam service-accounts keys list --iam-account ${account} | sort -k3n | awk '{ if(NR>1) print $1 }'`
	count=`wc -w <<< "$list"`
	if [ $count -gt 5 ]; then	
		list=`gcloud iam service-accounts keys list --iam-account ${account} | sort -k3n | awk '{ if(NR>6) print $1 }'`
		for i in $list; do
			gcloud iam service-accounts keys delete $i --iam-account $account --quiet
		done
	fi
	gcloud iam service-accounts keys create $HOME/auto-deployment-tool/.sa.json --iam-account $account
	sleep 1
fi
export GOOGLE_CLOUD_KEYFILE_JSON=$HOME/auto-deployment-tool/.sa.json

# uninstall existing ocp if any
cd $HOME/auto-deployment-tool/install-client/$ocp_version
if [ -s $ocp_installation_dir/metadata.json ]; then
	printf "\nDESTROY EXISTING CLUSTER - $cluster_name \n"		
	./openshift-install destroy cluster --dir=$ocp_installation_dir --log-level=info
fi
rm -rf $ocp_installation_dir

if [[ $destroy = "false" ]]; 
then
	# export public key
	export ocp_pull_secret=`cat ${HOME}/auto-deployment-tool/pull-secret.txt`
	export public_key=`cat ${HOME}/.ssh/id_rsa.pub`

	# create installation directory
	mkdir -p $ocp_installation_dir

	# populate config file
	envsubst < $HOME/auto-deployment-tool/Templates/install-config-$provider.yaml.template > $ocp_installation_dir/install-config.yaml

	# deploy
	printf "\nDEPLOY OCP CLUSTER - $cluster_name \n"	
	./openshift-install create cluster --dir=$ocp_installation_dir --log-level=info

	# export config
	export KUBECONFIG=$ocp_installation_dir/auth/kubeconfig
	
	# add user admin
	printf "\nADD ocpadmin USER\n"
	oc create user ocpadmin
	oc create clusterrolebinding permissive-binding --clusterrole=cluster-admin --user=ocpadmin --group=system:serviceaccounts
	htpasswd -c -B -b $ocp_installation_dir/users.htpasswd ocpadmin Test4ACM
	oc create secret generic htpass-secret --from-file=htpasswd=$ocp_installation_dir/users.htpasswd -n openshift-config
	oc apply -f $HOME/auto-deployment-tool/Templates/htpasswd-cr.yaml

	# azure tagging
	if [[ $provider = "azure" ]]; then
		sh $HOME/auto-deployment-tool/Scripts/azure-tagging.sh
	fi
	
	#wait for ocp pods up and runnning
	sleep 30
	until [ `oc get pods --all-namespaces --no-headers | grep -v Running | grep -v Completed | wc -l` -eq 0 ]; do
		sleep 10
	done
	
	# install acm
	if [[ $acm_enabled = "true" ]]; then
		printf "\nINSTALL ACM - VERSION $acm_version \n"			
		# clone deploy repo
		cd $ocp_installation_dir
		git clone git@github.com:open-cluster-management/deploy.git
		cd deploy
		
		# create pull secret
		echo "Writing .prereqs/pull-secret.yaml"
cat <<EOF > ./prereqs/pull-secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: multiclusterhub-operator-pull-secret
  namespace: open-cluster-management
data:
  .dockerconfigjson: `cat $HOME/auto-deployment-tool/pull-secret.txt|base64 -w 0`
type: kubernetes.io/dockerconfigjson
EOF
		
		# set snapshot
		sed -i "s/^1.0.0[^ ]*/$acm_version/" snapshot.ver
		
		# set multiclusterhub cr api version	
		sed -i "s/v1/v1beta1/" ./multiclusterhub/example-multiclusterhub-cr.yaml
		
		# override image repo
		if [[ ! $acm_repo = "upstream" ]]; then
			printf "set downstream custom registry\n"
			export COMPOSITE_BUNDLE=true
			export CUSTOM_REGISTRY_REPO="quay.io/acm-d"
		fi
		
		# start deploy
		echo "Start deploying..."
		sh start.sh --silent
		
		# wait for deploy complete
		wait_time=0
		wait_duration=300		
		until [ `oc get pods -n open-cluster-management --no-headers | grep Running | wc -l` -eq 36 ]; do
			sleep 10
			((wait_time=wait_time+10))
			echo "Waited $wait_time/$wait_duration seconds for all pods"
			if [[ $wait_time -gt $wait_duration ]]; then
				echo "Waited $wait_duration seconds for 36 pods but it never came up!  Exiting with a failure."
				exit 1
			fi
		done
	fi
fi


#---------------------------------
trap : 0

echo >&2 '
************
*** DONE ***
************
'
