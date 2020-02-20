#!/bin/bash

set -o errexit
set -o nounset
set -euo pipefail

cd /root/auto_deployment_tool
for dir in /opt/ocp-install/*; do
    if [ -d ${dir} ]; then
        ./openshift-install destroy cluster --dir=/opt/ocp-install/$dir --log-level=info
    fi
done

rm -rf /opt/ocp-install/*

wget -q 'https://quay.io/v1/repository/rhibmcollab/common-web-ui/tags/' -O -  | sed -e 's/[][]//g' -e 's/"//g' -e 's/ //g' | tr '}' '\n'  | awk -F: '{print $3}'

|jq '."results"[]["name"]'


https://quay.io/repository/rhibmcollab/common-web-ui