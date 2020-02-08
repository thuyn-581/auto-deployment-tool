#!/bin/bash
set -euo pipefail

# install mcm manifest
# export config
export KUBECONFIG=$ocp_installation_dir/auth/kubeconfig

# get worker nodes
export nodes=[$(kubectl get nodes | awk '{if($3 == "worker") print $1;}')]
#export nodes=($(kubectl get nodes | awk '{if($3 == "worker") print $1;}'))
#export node_1="${nodes[0]}"


# clone manifest repo
mkdir $acm_installation_dir
cd $acm_installation_dir
git clone git@github.com:rh-ibm-synergy/cp4mcm-manifest.git
cd cp4mcm-manifest
make use-synergy

# populate cr.yaml file
envsubst < /root/tmp/ocp-install/templates/cr.yaml.template > $acm_installation_dir/cp4mcm-manifest/overlays/active/cr.yaml

# start deploy
sh start.sh
