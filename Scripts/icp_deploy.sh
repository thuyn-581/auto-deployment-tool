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

set -euo pipefail

#---------------------------------
echo >&2 '
************
*** START ***
************
'

# Uninstallation
sh /root/deploy/icp_uninstall.sh

# Create installation directory
printf "\nCREATE INSTALLATION DIRECTORY\n"
if [ -d $CP_DIR ]; then
  rm -rf $CP_DIR
fi
mkdir -p $CP_DIR/images
cd $CP_DIR/images


# Donwload image if not exists
printf "\nDOWNLOAD OFFLINE PACKAGE\n"
wget -qc --tries=0 --read-timeout=20 --user $ARTIFACTORY_USER --password $ARTIFACTORY_TOKEN $CP_REPO_IMAGE_AND_TAG


# Extract and load installation packages
printf "\nEXTRACT AND LOAD DOCKER IMAGES\n"
tar xf $CP_DIR/images/$IMAGE -O | sudo docker load


# Generate cluster directory
printf "\nGENERATE CLUSTER DIRECTORY\n"
cd $CP_DIR/
docker run -v $(pwd):/data -e LICENSE=accept ibmcom/icp-inception-amd64:$VERSION-ee cp -r cluster /data


# Copy offline image
printf "\nCOPY OFFLINE IMAGE\n"
mv $CP_DIR/images/ $CP_DIR/cluster/images


# Replace config files
printf "\nREPLACE CONFIG FILES\n"
rm -f $CP_DIR/cluster/{hosts,config.yaml}
envsubst < /root/deploy/icp_hosts.template > $CP_DIR/cluster/hosts
sudo cp -r /root/deploy/icp_config.yaml $CP_DIR/cluster/config.yaml


# Share SSH key
printf "\nSHARE SSH KEY\n"
ssh-keygen -b 4096 -f ~/.ssh/id_rsa -N "" 2>/dev/null <<< y >/dev/null
sudo cat $CP_DIR/cluster/hosts | grep 9.21.51 > /root/test/tmp
input=/root/test/tmp
while read -r line
do
  echo "$line"
  sshpass -p 'Letmein123Letmein123' ssh-copy-id -i ~/.ssh/id_rsa.pub root@"$line"
done < "$input"
rm -f "$input"
sudo cp ~/.ssh/id_rsa $CP_DIR/cluster/ssh_key

# Deploy
printf "\nDEPLOY\n"
cd $CP_DIR/cluster
docker run --net=host -t -e LICENSE=accept -v $(pwd):/installer/cluster ibmcom/icp-inception-amd64:$VERSION-ee install
#------------------------------------------

trap : 0

echo >&2 '
************
*** DONE *** 
************
'
