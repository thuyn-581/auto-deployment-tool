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
# set env variables
#source /root/Scripts/cp_setVar.sh

# uninstall existing cloudpak
sh /root/deploy/cp_uninstall.sh

# populate config file
envsubst < /root/deploy/cp_config.yaml.template > /root/deploy/config.yaml

# prepare for installation
echo '1. PREPARING FOR INSTALLATION'
mkdir -p $CP_DIR
cd $CP_DIR


# setup docker registry
sudo docker login -u $ARTIFACTORY_USER -p $ARTIFACTORY_TOKEN hyc-cloud-private-$STAGE-docker-local.artifactory.swg-devops.com
docker pull hyc-cloud-private-$STAGE-docker-local.artifactory.swg-devops.com/ibmcom-amd64/mcm-inception:$VERSION


# generate cluster dir
echo '2. GENERATE CLUSTER DATA'
sudo docker run --rm -v $(pwd):/data:z -e LICENSE=accept --security-opt label:disable hyc-cloud-private-$STAGE-docker-local.artifactory.swg-devops.com/ibmcom-amd64/mcm-inception:$VERSION cp -r cluster /data


# prepare config files
sudo mv -f /root/deploy/config.yaml cluster/config.yaml
sudo cp ~/auth/kubeconfig cluster/kubeconfig
sudo cp ~/.ssh/id_rsa cluster/ssh_key


# deploy
echo '3. DEPLOY'
cd $CP_DIR/cluster
sudo docker run --rm -t -e LICENSE=accept --net=host --security-opt label:disable -v $PWD:/installer/cluster:z -v /var/run:/var/run:z $CP_REPO_IMAGE_AND_TAG install-with-openshift

#---------------------------------
trap : 0

echo >&2 '
************
*** DONE ***
************
'
