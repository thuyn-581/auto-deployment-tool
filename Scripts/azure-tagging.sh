#!/bin/bash

echo "Logging in to Azure CLI"
az login --service-principal -u "${azure_client_id}" -p "${azure_client_secret}" --tenant "${azure_tenant_id}"
if [[ $? -ne 0 ]]; then
    echo "az login failed, halting terraform because OpenShift cluster can't be tagged."
    exit 1
fi
echo "Login Successful"

echo "Using the Azure CLI to find OpenShift Cluster Resource Group"
resource_group_name=$(az group list | sed -n 's/\s*"name":\s*"\('${cluster_name}'-.*-rg\)",/\1/p')
if [[ -z "$resource_group_name" ]]; then
    echo "Resource group not found for tagging, exiting."
    exit 1
fi
echo "Resource Group found"

echo "Tagging OpenShift Cluster Resource Group"
delete_date=$(date +%Y-%m-%d -d "$DATE + 7 day")
new_tags=$(az group show -n $resource_group_name | jq '.tags + {
"Owner": "thnguyen@redhat.com",
"Team": "RHACM",
"Usage": "Temp",
"Usage_desc": "OCP cluster for SERT",
"Delete_date": "'$delete_date'"
}')
az group update -n $resource_group_name --set tags="$new_tags"
if [[ $? -ne 0 ]]; then
    echo "az update for tagging failed, halting terraform because OpenShift cluster can't be tagged."
    exit 1
fi
echo "Done Tagging OpenShift Cluster Resource Group"