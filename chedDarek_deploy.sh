PUB_KEY=$1
CHED_DAREK_BACKEND=$2
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

function ched_darek_package_exist() {
    local package=$1

    if [ -d ${package} ]; then
        if [[ ${package} =~ ched_darek_api ]]; then
            return 0
        else
            return 1
            echo -e "${RED}[-] The Name of package must be ched_darek_api${NORMAL}"
        fi
    else
        echo -e "${RED}[-] ${package} Not Found.${NORMAL}"
        return 1
    fi
}

function ched_darek_exist() {
    local pubkey="$1"
    local user="$2"
    local ip="$3"

    if ssh -i ${pubkey} ${user}"@"${ip} '[ -d /home/ubuntu/ched_darek_api ]' ;then
        return 0
    else 
        return 1
    fi
}

function ched_darek_clean() {
    local pubkey="$1"
    local user="$2"
    local ip="$3"
    ssh -i ${pubkey} ${user}"@"${ip} 'mv /home/ubuntu/ched_darek_api /home/ubuntu/old_backends/$(date +%s)_cheddarek'
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}[+] moved backend to the old backend Cleaned.${NORMAL}"
        return 0
    else
        echo -e "${RED}[-] error when moving backend folder.${NORMAL}"
        return 1
    fi
}

function remoteCopy() {
    local publickey="$1"
    local ched_darek_api="$2"
    local user="$3"
    local ip_host="$4"
    # check if pubkey function return true
    
    if check_PubKey ${publickey} ; then

        if ched_darek_package_exist ${ched_darek_api} ; then
            # check if cuba_market exist return true
            if ched_darek_exist ${publickey} ${user} ${ip_host} ; then
                kill $(lsof -t -i:3000)
                
                if [ $? -eq 0 ]; then
                    echo -e "${GREEN}[+] The package copied successfully.${NORMAL}"
                else
                    echo -e "${RED}[-] Error when copy the package.${NORMAL}"
                fi
                if ched_darek_clean ${publickey} ${user} ${ip_host};then
                    scp -i ${publickey} -r ${ched_darek_api} ${user}"@"${ip_host}":/home/ubuntu/"
                    if [ $? -eq 0 ]; then
                        echo -e "${GREEN}[+] The package copied successfully.${NORMAL}"
                    else
                        echo -e "${RED}[-] Error when copy the package.${NORMAL}"
                    fi
                    ssh -i ${publickey} ${user}"@"${ip_host} 'pm2 start /home/ubuntu/ched_darek_api/index.js'
                else 
                    exit
                fi


            else
                scp -i ${publickey} -r ${ched_darek_api} ${user}"@"${ip_host}":/home/ubuntu/"
                if [ $? -eq 0 ]; then
                    echo -e "${GREEN}[+] The package copied successfully.${NORMAL}"
                else
                    echo -e "${RED}[-] Error when copy the package.${NORMAL}"
                fi
                ssh -i ${publickey} ${user}"@"${ip_host} 'pm2 start /home/ubuntu/ched_darek_api/index.js'
            fi

        else exit
        fi
    else exit
    fi
}

if [ $# -ne 2 ];then
    echo -e "argument must be two \n1 − PublicKey\n2 − Ched Darek Projct Directory"
    exit
else
    remoteCopy ${PUB_KEY} ${CHED_DAREK_BACKEND} ${REMOTE_USER} ${REMOTE_HOST}
fi