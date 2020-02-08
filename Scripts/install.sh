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
# adding ssh key
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_rsa

# uninstall existing ocp if any
if [ -d $ocp_installation_dir ]; then
	printf '\nUNINSTALL CLUSTER ' + $cluster_name + '\n'	
	cd $HOME/auto_deployment_tool
	./openshift-install destroy cluster --dir=$ocp_installation_dir --log-level=info
	rm -rf $ocp_installation_dir
fi

# export publick key
export public_key=`cat ~/.ssh/id_rsa.pub`

# create installation directory
mkdir -p $ocp_installation_dir/$cluster_name

# populate config file
envsubst < /root/tmp/ocp-install/templates/install-config-$provider.yaml.template > $ocp_installation_dir/install-config.yaml

# download install client
cd $HOME/auto_deployment_tool
curl https://mirror.openshift.com/pub/openshift-v4/clients/ocp/latest/openshift-install-linux-$ocp_version.tar.gz --output openshift-install-$ocp_version.tar.gz

# extract the file
tar xvf openshift-install.tar.gz

# deploy
printf '\nDEPLOY OCP CLUSTER - ' + $cluster_name + '\n'	
./openshift-install create cluster --dir=$ocp_installation_dir --log-level=info

# install mcm manifest
printf '\nINSTALL ACM MANIFEST\n'	
sh $HOME/auto_deployment_tool/Scripts/manifest.sh


#---------------------------------
trap : 0

echo >&2 '
************
*** DONE ***
************
'
