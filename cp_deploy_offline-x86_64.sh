bort()
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

# uninstall existing cloudpak
sh /root/deploy/cp_uninstall.sh

# populate config file
envsubst < /root/deploy/cp_config_$CP.yaml.template > /root/deploy/config.yaml

# prepare for installation
printf '\nPREPARING FOR INSTALLATION\n'
mkdir -p $CP_DIR
cd $CP_DIR


# Download offline pkg
printf '\nDOWNLOAD OFFLINE PACKAGE\n'
wget -qc --tries=0 --read-timeout=20 --user $ARTIFACTORY_USER --password $ARTIFACTORY_TOKEN $CP_REPO_IMAGE_AND_TAG

# Unzip
printf '\nEXTRACT AND LOAD DOCKER IMAGES\n'
tar xf $IMAGE -O | docker load

# generate cluster dir
printf '\nGENERATE CLUSTER DATA\n'
sudo docker run --rm -v $(pwd):/data:z -e LICENSE=accept --security-opt label:disable ibmcom/$INCEPTION-amd64:$VERSION cp -r cluster /data


# prepare config files
printf '\nPREPARE CONFIG FILES\n'
sudo mv -f /root/deploy/config.yaml cluster/config.yaml
sudo cp ~/auth/kubeconfig cluster/kubeconfig
sudo cp ~/.ssh/id_rsa cluster/ssh_key

# Deploy
printf '\nDEPLOY\n'
cd $CP_DIR/cluster
docker run -t --net=host -e LICENSE=accept -v $(pwd):/installer/cluster:z -v /var/run:/var/run:z -v /etc/docker:/etc/docker:z --security-opt label:disable ibmcom/$INCEPTION-amd64:$VERSION install-with-openshift

#---------------------------------
trap : 0

echo >&2 '
************
*** DONE ***
************
'
