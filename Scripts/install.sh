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
eval "$(ssh-agent -s)"
ssh-add $HOME/.ssh/id_rsa

# uninstall existing ocp if any
cd $HOME/auto-deployment-tool/install-client/$ocp_version
#if [ -d $ocp_installation_dir ]; then
if [ -s $ocp_installation_dir/metadata.json ]; then
	printf "\nDESTROY EXISTING CLUSTER - $cluster_name \n"		
	./openshift-install destroy cluster --dir=$ocp_installation_dir --log-level=info
	#rm -rf $ocp_installation_dir
fi
rm -rf $ocp_installation_dir

# export publick key
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
	#sh $HOME/auto-deployment-tool/Scripts/azure-tagging.sh
fi

# install mcm manifest
if [[ $acm_enabled = "true" ]]; then
	printf "\nINSTALL ACM - VERSION $COMMON_SERVICE_VERSION \n"	
	
	# clone manifest repo
	mkdir $acm_installation_dir
	cd $acm_installation_dir
	git clone git@github.com:open-cluster-management/deploy.git
	cd deploy
	sed -i "s/^1.0.0[^ ]*/$acm_version/" snapshot.ver
	
	# start deploy
	sh start.sh
fi

#---------------------------------
trap : 0

echo >&2 '
************
*** DONE ***
************
'
