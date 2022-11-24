const { ServiceBroker } = require("moleculer");

const nodeID = require("os").hostname()
const middlewares = require("middlewares");

const config = {
    namespace: "broker",
    hotReload: false,
    nodeID,
    transporter: process.env.TRANSPORT,
    middlewares,
}

// Create broker
const broker = new ServiceBroker(config);

const loadService = (path) => {
    try {
        broker.loadService(path);
    } catch (e) {
        console.log(e)
    }
}






if(process.env.AGENT=='yes'){
    loadService("./services/ddns.agent");
}else{
    loadService("./services/dohs.service");
    loadService("./services/domains.records.service");
    loadService("./services/domains.resolver.service");
    loadService("./services/domains.service");
}


// Start server
broker.start()
module.exports = broker