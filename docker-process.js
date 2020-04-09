// Import Modules
const {
    spawn
} = require("child_process");
const fs = require("fs");
const events = require('events')
// Import Library
const {
    Cloner
} = require("./executor")
const {
    stdout_save,
    count_tasks,
    count_plays,
    runner_on_events
} = require("./stdout-event")
const {
    setContainerId,
    initVar,
    setName,
    setImage
} = require("./set-variables")
const {
    keyDecrypt
} = require("./aes-crypter")
const {
    regxp
} = require("./utils/regxp")
// Import Models.
const Container = require("../model/container.model")
const SSH = require("../model/ssh.model")
const Job = require("../model/job.model")
const User = require("../model/user.model")
const Image = require("../model/image.model")
const Event = require("../model/event.model");
const ImagePulled = require("../model/imagePulled.model")

// Create an Event Listener.
var stdoutEmit = new events.EventEmitter();

// Update Stdout in RealTime.
stdoutEmit.on('stdout', function (event_id, stdout) {
    stdout_save(event_id, stdout)
    //    console.log('-------EVENT_EMITTER-------')
})
// Writer log stdout Logs.
var jobWriterLogs = (job_id, data) => {
    fs.writeFile('workspace/docker' + '/' + job_id + '.log', data, function (err) {
        if (err) throw err;
    });
}

// set Extra_Vars to Ansible.
async function settingVariables(path, operation, id, image, name) {
    if (id != null) {
        const C = await Container.findById(id)
        console.log(C)
        // setContainerId to set containerId variable to group_vars of ansible.
        if (operation == 'container/status') {
            setContainerId(path, C.container_id)
        }
        if (operation == 'container/remove') {
            setName(path, C.name)
        }
    } else {
        initVar(path, image, name)
    }
}

/* match object of volumes from ansible stdout. { 
    docker inspect containerId | grep mounts [] ...
}*/
function matchVolumes(data) {
    let name_vol = regxp(data, / \\"Name\\": \\"(.+)\\",\\n \\"Source\\": /)
    let src_vol = regxp(data, / \\"Source\\": \\"(.+)\\",\\n \\"Destination\\": /)
    let dest_vol = regxp(data, / \\"Destination\\": \\"(.+)\\",\\n \\"Driver\\": /)
    let volume = {
        Name: name_vol,
        Source: src_vol,
        Destination: dest_vol
    }
    return volume
}

/* create_container this function to running container to mongoose db \
and check if container exist & update it.*/
var create_container = async function (id, status, image_id, port, name, owner_id, job_id, ssh_id) {
    var image = await Image.findById(image_id);
    var owner = await User.findById(owner_id);
    var job = await Job.findById(job_id)

    const containerExist = await Container.findOne({
        container_id: id
    });
    // update container if exist..
    if (containerExist) {
        Container.updateOne({
            container_id: id
        }, {
            $set: {
                image: image,
                state: status,
                port: port
            }
        }, function (err, result) {
            if (err) {
                console.log(err);
            }
        });
    }
    // insert data to container model.
    const container = new Container({
        container_id: id,
        state: status,
        port: port,
        name: name,
        image: image,
        owner: owner,
        job: job,
        ssh_key: ssh_id
    });
    try {
        const savedcontainer = await container.save();
        await Job.updateOne({
            "_id": job_id
        }, {
            "$push": {
                container: savedcontainer
            }
        })
        //        console.log(savedcontainer)
    } catch (err) {
        console.log(err)
    }
}

// this function to update status of container \ when i get request /container/containerId/status.
var update_container = async function (id, status) {
    Container.updateOne({
        container_id: id
    }, {
        $set: {
            state: status
        }
    }, function (err, result) {
        if (err) {
            console.log(err);
        }
    });
}

// when operation remove container \ this function to remove it from mongoose db
var remove_container = async function (id) {
    Container.delete({
        _id: id
    }, function (err, result) {
        if (err) {
            console.log(err);
        }
    });
}

// this function to add Images into mongoose.
var create_pulledImage = async function (ssh_id, image_id, owner_id, job_id) {
    var image = await Image.findById(image_id);
    var owner = await User.findById(owner_id);
    var job = await Job.findById(job_id)
    const image_pulled = new ImagePulled({
        name: image.name,
        version: image.version,
        owner: owner,
        job: job,
        ssh_key: ssh_id,
        image: image
    });
    try {
        const savedimage_pulled = await image_pulled.save();
        //        console.log(savedimage_pulled)
    } catch (err) {
        console.log(err)
    }
}
// when operation remove image \ this function remove image form mongoose db
var remove_image = async function () {}

/*
this function call it into the jobWorker server and run ansible command 
it, make all containers features.
*/
module.exports.container_process = async function (ssh_id, job_id, user_id, container_id, image_id, name, operation, callback) {

    const ssh_object = await SSH.findById(ssh_id)
    const decrypted_ssh_pass = keyDecrypt(ssh_object.secret_key)

    var inventory = ssh_object.host + ",";
    var playbook = 'workspace/docker/' + operation + '/' + job_id + '/playbook.yml';
    var path = "workspace/docker/" + operation + "/" + job_id + "/group_vars/all"
    var output = "";

    // create an empty event
    const event = new Event({
        stdout: "",
        job: job_id,
        owner: user_id
    });
    var savedEvent = await event.save();

    await Job.updateOne({
        "_id": job_id
    }, {
        "$push": {
            event: savedEvent
        }
    })

    // this function to clone ansible template and clone it to clients workspace.

    await Cloner(job_id, operation, "docker", async data => {
        if (operation == 'container/run') {
            const image_obj = await Image.findById(image_id)
            var imagev = image_obj.name + ":" + image_obj.version
        }
        if (!data.failed) {
            settingVariables(path, operation, container_id, imagev, name)
        }
    })

    // ansible playbook command running

    const ANSIBLE_PLAYBOOK_RUNNER = spawn("ansible-playbook", [
        "-u", ssh_object.user, "-i", inventory, playbook, "--extra-vars", "ansible_ssh_pass=" + decrypted_ssh_pass
    ]);

    ANSIBLE_PLAYBOOK_RUNNER.stdout.on("data", data => {

        // this stdout of ansible-playbook command \ and send it to write logs.
        output += data.toString();
        if (savedEvent._id != null && savedEvent._id !== undefined) {
            stdoutEmit.emit('stdout', savedEvent._id, output)

        } else {
            console.log("event not created")
        }
    });

    ANSIBLE_PLAYBOOK_RUNNER.stderr.on("data", data => {
        // stderr \handle errors of ansible command.
        output += data.toString();
    });

    ANSIBLE_PLAYBOOK_RUNNER.on("close", async function (code) {
        // update events !
        runner_on_events(savedEvent._id, output)
        count_tasks(savedEvent._id, output)
        count_plays(savedEvent._id, output)
        // this code of return if 0 \ command running sucessfully if 1 error.
        if (code == 0) {
            // call matches functions.
            var container_id = await regxp(output, /CONTAINER_ID: \/(.+)\//)
            var container_status = await regxp(output, /CONTAINER_STATUS: \\"(.+)\\"/)
            var container_image = await regxp(output, /CONTAINER_IMAGE: \\"(.+)\\"/)
            var container_host_port = await regxp(output, /\\"(.+)\/tcp\\"/)

            if (operation == 'container/run') {
                callback({
                    status: true,
                    container: {
                        Id: container_id,
                        State: container_status,
                        Image: container_image,
                        HostPort: container_host_port,
                        name: name
                    }
                });
                await create_container(container_id, container_status, image_id, container_host_port, name, user_id, job_id, ssh_id)
            }
            if (operation == 'container/status') {
                callback({
                    status: true,
                    State: container_status
                })
                await update_container(container_id, container_status)
            }
            if (operation == 'container/remove') {
                callback({
                    status: true,
                })
                await remove_container(container_id._id)
            }

        } else {
            console.log(output)
            var msgerr = regxp(output, /"msg": "(.+)"/)
            callback({
                status: false,
                message: msgerr
            });
        }
    });
};

//same of container_process but it works with images.

module.exports.image_process = async function (ssh_id, job_id, user_id, image_id, operation, callback) {
    const ssh_object = await SSH.findById(ssh_id)
    const decrypted_ssh_pass = keyDecrypt(ssh_object.secret_key)
    var inventory = ssh_object.host + ",";
    var playbook = 'workspace/docker/' + operation + '/' + job_id + '/playbook.yml';
    var path = "workspace/docker/" + operation + "/" + job_id + "/group_vars/all"
    var output = "";

    // create an empty event
    const event = new Event({
        stdout: "",
        job: job_id,
        owner: user_id
    });
    var savedEvent = await event.save();

    await Cloner(job_id, operation, "docker", async data => {
        const image_obj = await Image.findById(image_id)
        var imagev = image_obj.name + ":" + image_obj.version
        if (!data.failed) {
            setImage(path, imagev)
        }
    })
    const ANSIBLE_PLAYBOOK_RUNNER = spawn("ansible-playbook", [
        "-u", ssh_object.user, "-i", inventory, playbook, "--extra-vars", "ansible_ssh_pass=" + decrypted_ssh_pass
    ]);

    ANSIBLE_PLAYBOOK_RUNNER.stdout.on("data", data => {
        // this stdout of ansible-playbook command \ and send it to write logs.
        output += data.toString();
        if (savedEvent._id != null && savedEvent._id !== undefined) {
            stdoutEmit.emit('stdout', savedEvent._id, output)
        } else {
            console.log("event not created.")
        }
    });

    ANSIBLE_PLAYBOOK_RUNNER.stderr.on("data", data => {
        // stderr \handle errors of ansible command.
        output += data.toString();
    });

    ANSIBLE_PLAYBOOK_RUNNER.on("close", async function (code) {
        runner_on_events(savedEvent._id, output)
        count_tasks(savedEvent._id, output)
        count_plays(savedEvent._id, output)
        if (code == 0) {
            callback({
                status: true
            })
            if (operation == 'image/pull') {
                create_pulledImage(ssh_id, image_id, user_id, job_id)
            }
        } else {
            var msgerr = regxp(output, /"msg": "(.+)"/)
            callback({
                status: false,
                message: msgerr
            });
        }
    });
};