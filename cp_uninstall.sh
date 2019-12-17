#!/bin/bash

#set -o errexit
#set -o nounset
set -euo pipefail

systemctl start docker

if [ -d /opt/ibm-cloudpak ]; then
	cd /opt/ibm-cloudpak
    DIR_PATH=$(find /opt/ibm-cloudpak/ -maxdepth 1 -type d -name *_* -print -quit)
	DIR_NM=$(cut -d'/' -f4  <<< "$DIR_PATH")
	echo "$DIR_NM"
    if [ -d "$DIR_PATH"/cluster ]; then
		CURR_CP=$(cut -d"-" -f1  <<< "$DIR_NM")
		CURR_STAGE=$(cut -d"_" -f1  <<< $(cut -d"-" -f2  <<< "$DIR_NM"))
		CURR_VERSION=$(cut -d"_" -f2  <<< "$DIR_NM")
		CURR_MAN=$(cut -d"_" -f3  <<< "$DIR_NM")
		printf '\nUNINSTALLING OLDER VERSION OF IBM CLOUD PAK\n'
		cd "$DIR_PATH"/cluster
		if [ "$CURR_MAN" == 'offline' ]; then
			if [ "$CURR_CP" == 'mcm' ]; then
				docker run -t --net=host -e LICENSE=accept -v $PWD:/installer/cluster:z -v /var/run:/var/run:z -v /etc/docker:/etc/docker:z --security-opt label:disable ibmcom/mcm-inception-amd64:"$CURR_VERSION" uninstall-with-openshift
			else
				docker run -t --net=host -e LICENSE=accept -v $PWD:/installer/cluster:z -v /var/run:/var/run:z -v /etc/docker:/etc/docker:z --security-opt label:disable ibmcom/icp-inception-amd64:"$CURR_VERSION" uninstall-with-openshift
			fi
		else
			if [ "$CURR_CP" == 'mcm' ]; then
				docker run --rm -t -e LICENSE=accept --net=host --security-opt label:disable -v $PWD:/installer/cluster:z -v /var/run:/var/run:z hyc-cloud-private-"$CURR_STAGE"-docker-local.artifactory.swg-devops.com/ibmcom-amd64/mcm-inception:"$CURR_VERSION" uninstall-with-openshift
			else
				docker run --rm -t -e LICENSE=accept --net=host --security-opt label:disable -v $PWD:/installer/cluster:z -v /var/run:/var/run:z hyc-cloud-private-"$CURR_STAGE"-docker-local.artifactory.swg-devops.com/ibmcom-amd64/icp-inception:"$CURR_VERSION" uninstall-with-openshift
			fi
		fi
		systemctl restart docker
		docker system prune 2>/dev/null <<< y >/dev/null
		rm -rf /opt/ibm-cloudpak
		#read -n 1 -r -s -p $'UNINSTALLATION COMPLETED. Press enter to continue...\n'
    fi
fi
