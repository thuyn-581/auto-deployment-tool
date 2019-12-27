#!/bin/bash

#set -o errexit
#set -o nounset
set -euo pipefail

systemctl start docker

if [ -d /opt/ibm-cloudpak ]
then
	cd /opt/ibm-cloudpak
  	DIR_PATH=$(find /opt/ibm-cloudpak/ -maxdepth 1 -type d -name *icp* -print -quit)
	DIR_NM=$(cut -d'/' -f4  <<< "$DIR_PATH")
	echo "$DIR_NM"
        if [ -d "$DIR_PATH"/cluster ]
        then
		CURR_VERSION=$(cut -d"_" -f2  <<< "$DIR_NM")
		printf '\nUNINSTALLING OLDER VERSION OF IBM CLOUD PAK\n'
		cd "$DIR_PATH"/cluster
		docker run -e LICENSE=accept --net=host -t -v "$(pwd)":/installer/cluster ibmcom/icp-inception-amd64:"$CURR_VERSION"-ee uninstall
		systemctl restart docker
		docker system prune 2>/dev/null <<< y >/dev/null
		rm -rf /opt/ibm-cloudpak
        	#read -n 1 -r -s -p $'UNINSTALLATION COMPLETED. Press enter to continue...\n'
        fi
fi
