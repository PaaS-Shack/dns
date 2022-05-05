const path = require("path");

const { ServiceBroker } = require("moleculer");

const config = {
    namespace: "dns",

    hotReload: true,
    //nodeID: 'console',
    middlewares: [

    ],
    logger: {
        type: "Console",
        options: {
            level: "info",
            colors: true,
            moduleColors: true,
            formatter: "short",
            objectPrinter: null,
            autoPadding: false
        }
    },

    transporter: process.env.REDIS,

    tracking: {
        enabled: true,
        stackTrace: true,
        shutdownTimeout: 5000,
    },


    registry: {
        discoverer: process.env.REDIS,
        preferLocal: true
    },


    cacher: false && {
        type: "Memory",
        options: {
            maxParamsLength: 60
        }
    },

    validator: true,

    metrics: {
        enabled: false,
        reporter: [
            "Console"
        ]
    },

    tracing: {
        enabled: true,
        exporter: "Console",
        events: true,
        stackTrace: true
    },

    replCommands: [],

    metadata: {

    },


    created(broker) { },

    started(broker) { },

    stopped(broker) { }
}

// Create broker
const broker = new ServiceBroker(config);

broker.loadService("./services/dohs.service");

broker.loadService("./services/domains.dohs.service");
broker.loadService("./services/domains.records.service");
broker.loadService("./services/domains.resolver.service");
broker.loadService("./services/domains.service");



// Start server
broker.start().then(() => broker.repl());
module.exports = broker

