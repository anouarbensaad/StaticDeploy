#!/bin/bash
PUB_KEY=$1
ANGULARZIP=$2
REMOTE_HOST="3.120.191.154"
REMOTE_USER="ubuntu"

function check_PubKey() {
    local key=$1
    if [[ -e ${key} ]]; then
        if [[ ${key} =~ \.pem$ ]];then
            return 0
        else 
            echo "${key} Not a Public Key"
            return 1
            exit
        fi
    else
        echo "${key} Not Found."
        return 1
    fi
}

function checkAngularZip() {
    local package=$1
    if [ -d ${package} ]; then
        return 0
    else
        echo "${package} Not Found."
        return 1
        exit
    fi
}

function remoteCopy() {
    local publickey="$1"
    local angular="$2"
    local user="$3"
    local ip_host="$4"
    if check_PubKey ${publickey} ; then
        if checkAngularZip ${angular} ; then
            ssh -i ${publickey} ${user}"@"${ip_host} 'sudo rm -r /var/www/CubaMarket/'
            if [ $? -eq 0 ]; then
                echo "/var/www/CubaMarket/ cleaned successfully to remote host"
                scp -i ${publickey} -r ${angular} ${user}"@"${ip_host}":/var/www/CubaMarket/"
            else
                echo "failed to connect to remote host and remove path."
                return 1
                exit
            fi
        else
            exit
        fi
    else
        exit
    fi
}
if [ $# -ne 2 ];then
    echo -e "argument must be two \n1 − PublicKey\n2 − Angular Projct Directory"
    return 1
else
    remoteCopy ${PUB_KEY} ${ANGULARZIP} ${REMOTE_USER} ${REMOTE_HOST}
    return 0
fi
