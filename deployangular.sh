#!/bin/bash

# deploy a sanfour angular package to remote instance.
# check_PubKey : check if pubkey exist and her extension .pem
# angular_package_exist check if package exist and her name is CubaMarket.
# cubamarket_exist check if CubaMarket exist in the remote instance.
# cubamarket_clean remove the old package if exist.
# remoteCopy replace new package. and copy it to the true path.

PUB_KEY=$1
ANGULARZIP=$2
REMOTE_HOST="3.120.191.154"
REMOTE_USER="ubuntu"
RED=`echo -e '\033[1;31m'`
GREEN=`echo -e '\033[7;32m'`
NORMAL=`echo -e '\033[0m'`

function check_PubKey() {
    local key=$1

    if [[ -e ${key} ]]; then
        if [[ ${key} =~ \.pem$ ]];then
            return 0
        else 
            echo -e "${RED}[-] ${key} Not a Public Key${NORMAL}"
            return 1
        fi
    else
        echo -e "${RED}[-] ${key} Not Found.${NORMAL}"
        return 1
    fi
}

function angular_package_exist() {
    local package=$1

    if [ -d ${package} ]; then
        if [[ ${package} =~ CubaMarket ]]; then
            return 0
        else
            return 1
            echo -e "${RED}[-] The Name of package must be CubaMarket${NORMAL}"
        fi
    else
        echo -e "${RED}[-] ${package} Not Found.${NORMAL}"
        return 1
    fi
}

function cubamarket_exist() {
    local pubkey="$1"
    local user="$2"
    local ip="$3"

    if ssh -i ${pubkey} ${user}"@"${ip} '[ -d /var/www/CubaMarket ]' ;then
        return 0
    else 
        return 1
    fi
}

function cubamarket_clean() {
    local pubkey="$1"
    local user="$2"
    local ip="$3"
    ssh -i ${pubkey} ${user}"@"${ip} 'sudo rm -r /var/www/CubaMarket'
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}[+] cleaned root folder of the web server successfully.${NORMAL}"
        return 0
    else
        echo -e "${RED}[-] error when cleaning root folder of the web server.${NORMAL}"
        return 1
    fi
}

function remoteCopy() {
    local publickey="$1"
    local angular="$2"
    local user="$3"
    local ip_host="$4"
    # check if pubkey function return true
    if check_PubKey ${publickey} ; then
        # check if angular package return true
        if angular_package_exist ${angular} ; then
            # check if cuba_market exist return true
            if cubamarket_exist ${publickey} ${user} ${ip_host} ; then
                if cubamarket_clean ${publickey} ${user} ${ip_host};then
                    scp -i ${publickey} -r ${angular} ${user}"@"${ip_host}":/var/www/"
                    if [ $? -eq 0 ]; then
                        echo -e "${GREEN}[+] The package copied successfully.${NORMAL}"
                    else
                        echo -e "${RED}[-] Error when copy the package.${NORMAL}"
                    fi
                else exit
                fi
            else
                scp -i ${publickey} -r ${angular} ${user}"@"${ip_host}":/var/www/"
                if [ $? -eq 0 ]; then
                    echo -e "${GREEN}[+] The package copied successfully.${NORMAL}"
                else
                    echo -e "${RED}[-] Error when copy the package.${NORMAL}"
                fi
            fi
        else exit
        fi
    else exit
    fi
}

# main \ check argument.& call the remote copy function.
if [ $# -ne 2 ];then
    echo -e "argument must be two \n1 − PublicKey\n2 − Angular Projct Directory"
    exit
else
    remoteCopy ${PUB_KEY} ${ANGULARZIP} ${REMOTE_USER} ${REMOTE_HOST}
fi
