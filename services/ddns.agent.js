"use strict";

const { MoleculerClientError, MoleculerRetryableError } = require("moleculer").Errors;

const Context = require("moleculer").Context

const tld = require('tldjs');

const DbService = require("db-mixin");

const C = require("../constants");
const Lock = require('../lib/lock')


const dns2 = require('dns2');

const { Packet } = dns2;

Packet.TYPEMAP = {}
Object.keys(Packet.TYPE).forEach((key) => {
    Packet.TYPEMAP[Packet.TYPE[key]] = key
})
Packet.CLASSMAP = {}
Object.keys(Packet.CLASS).forEach((key) => {
    Packet.CLASSMAP[Packet.CLASS[key]] = key
})


module.exports = {
    name: "ddns.agent",
    version: 1,
    mixins: [DbService({
        collection: 'ddns.agent',
        nedb: '../data'
    })],

    /**
     * Default settings
     */
    settings: {
        rest: false,
        logging: false,

        fields: {
            id: {
                type: "string",
                primaryKey: true,
                //secure: true,
                columnName: "_id"
            },
            address: {
                type: "string",
                required: true,
                trim: true,
                empty: false,
            },

            proxy: {
                type: "boolean",
                default: false,
                required: false,
            },
            options: { type: "object" },
            ...C.TIMESTAMP_FIELDS
        },

    },
    dependencies: [
        "v1.domains.records",
    ],
    /**
     * Actions
     */
    actions: {
        createRecord: {
            params: {
                fqdn: { type: "string", min: 3, optional: false },
                type: { type: "enum", values: ["A", "AAAA", "CNAME", "SOA", "MX", "NS", "TXT", "CAA"], optional: false },
                data: { type: "string", optional: false },
                replace: { type: "string", optional: true },

                ttl: { type: "number", default: 99, optional: true },
                priority: [
                    { type: "number", default: 5, optional: true },
                    { type: "string", default: 5, optional: true }
                ],

                flag: { type: "number", default: 0, optional: true },
                tag: { type: "string", optional: true },

                admin: { type: "string", optional: true },
                serial: { type: "number", optional: true },
                refresh: { type: "number", optional: true },
                retry: { type: "number", optional: true },
                expiration: { type: "number", optional: true },
                minimum: { type: "number", optional: true },

                nullified: { type: "boolean", default: false, optional: true }
            },
            permissions: ['ddns.create'],
            async handler(ctx) {
                const params = Object.assign({}, ctx.params);

                const map = this.maps[params.type]

                let obj = map.get(params.fqdn)
                if (!obj) {
                    map.set(params.fqdn, obj = {
                        hits: 0,
                        totalHits: 0,
                        Latency: 0,
                        records: [],
                        networks: new Map()
                    })
                }

                if (!params.network || params.network == '')
                    obj.records.push(params);
                else {
                    if (!obj.networks.has(params.network)) {
                        obj.networks.set(params.network, [])
                    }
                    obj.networks.get(params.network).push(params);
                }

                return obj;
            }
        },
        removeRecord: {
            params: {
                id: { type: "string", min: 3, optional: false },
                fqdn: { type: "string", min: 3, optional: false },
                network: { type: "string", optional: true },
                type: { type: "enum", values: ["A", "AAAA", "CNAME", "SOA", "MX", "NS", "TXT", "CAA"], optional: false },
            },
            permissions: ['ddns.create'],
            async handler(ctx) {
                const params = Object.assign({}, ctx.params);



                const map = this.maps[params.type]

                let obj = map.get(params.fqdn)
                if (!obj) {
                    return obj
                }

                if (!params.network || params.network == '') {
                    const index = obj.records.findIndex((record) => record.id == params.id);
                    if (index > -1) {
                        obj.records.splice(index, 1);
                    }
                } else {
                    if (!obj.networks.has(params.network)) {
                        return obj;
                    }
                    const index = obj.networks.get(params.network).findIndex((record) => record.id == params.id);
                    if (index > -1) {
                        obj.networks.get(params.network).splice(index, 1);
                    }
                    if (obj.networks.get(params.network).length == 0) {
                        obj.networks.delete(params.network)
                    }
                }


                if (obj.networks.size == 0 && obj.records.length == 0) {
                    map.delete(params.fqdn)
                }
                return obj;
            }
        },
        sync: {
            params: {

            },
            permissions: ['ddns.create'],
            async handler(ctx) {
                const params = Object.assign({}, ctx.params);

                const records = await ctx.call('v1.domains.records.syncRecords', {})

                const results = [];

                this.maps = {};
                Object.keys(Packet.TYPE).forEach((key) => {
                    this.maps[key] = new Map();
                });

                for (const record of records) {
                    results.push(this.actions.createRecord({
                        ...record
                    }, { parentCtx: ctx }));
                }
                const result = await Promise.all(results)

                this.logger.info(`Synced ${results.length} failed: ${result.filter((a) => a.reason).length}`);

                return this.maps
            }
        },
        maps: {
            cache: false,
            params: {

            },
            permissions: ['teams.create'],
            auth: "required",
            async handler(ctx) {
                const params = Object.assign({}, ctx.params);

                return this.maps

            }
        },
        logging: {
            params: {
                enable: { type: "boolean", default: true, optional: true }
            },
            async handler(ctx) {
                const params = Object.assign({}, ctx.params);

                if (params.enable && !this.settings.logging) {
                    this.logger.info(`Logging enabled`);
                    this.settings.logging = true;
                } else if (!params.enable && this.settings.logging) {
                    this.logger.info(`Logging disabled`);
                    this.settings.logging = false;
                }

                return this.settings.logging
            }
        },
        bind: {
            params: {

            },
            async handler(ctx) {
                const params = Object.assign({}, ctx.params);

                let found = await this.findEntity(ctx, { query: { address: params.addres } });
                console.log(found)
                if (found) {
                    if (params.proxy != found.proxy) {
                        await this.updateEntity(
                            ctx,
                            {
                                id: found.id,
                                proxy: params.proxy
                            },
                            { permissive: true, transform: false }
                        );
                    }
                    return found;
                }

                const entity = {};

                entity.address = params.address;
                entity.proxy = params.proxy;
                entity.updatedAt = Date.now();
                entity.createdAt = Date.now();

                found = await this.createEntity(ctx, entity);

                this.logger.info(`Bind record saved`, found);

                await this.createUDPServer(params.address.split('.').length == 4 ? 'udp4' : 'udp6', 53, params.address, params.proxy);

                return found

            }
        },

    },

    /**
     * Methods
     */
    methods: {
        async recordToAnswer(record, name, type, _class) {
            let recordType = record.type
            let recordIndex = Packet.TYPE[recordType]
            if (!isNaN(record.type)) {
                recordType = Packet.TYPEMAP[record.type]
                recordIndex = record.type
            }
            if (record.fqdn && !record.fqdn.includes('*')) {
                // name = record.fqdn
            }
            switch (recordType) {
                case 'A':
                    return {
                        name: name,
                        type: recordIndex,
                        class: _class,
                        ttl: record.ttl,
                        address: record.data || record.address
                    }
                case 'CNAME':
                    return {
                        name: name,
                        type: recordIndex,
                        class: _class,
                        ttl: record.ttl,
                        domain: record.data
                    }
                case 'TXT':
                    return {
                        name: name,
                        type: recordIndex,
                        class: _class,
                        ttl: record.ttl,
                        data: record.data
                    }
                case 'NS':
                    return {
                        name: name,
                        type: recordIndex,
                        class: _class,
                        ttl: record.ttl,
                        ns: record.data
                    }
                case 'AAAA':
                    return {
                        name: name,
                        type: recordIndex,
                        class: _class,
                        ttl: record.ttl,
                        address: this.expandIPv6Address(record.data || record.address)
                    }
                case 'CAA':
                    return {
                        name: name,
                        type: recordIndex,
                        class: _class,
                        ttl: record.ttl,
                        flags: record.flags,
                        tag: record.tag,
                        value: record.data
                    }
                case 'MX':
                    return {
                        name: name,
                        type: recordIndex,
                        class: _class,
                        ttl: record.ttl,
                        exchange: record.data,
                        priority: record.priority,
                    }
                case 'SOA':

                    const soa = {
                        name: name,
                        type: recordIndex,
                        class: _class,
                        admin: record.admin,
                        serial: record.serial,
                        refresh: record.refresh,
                        retry: record.retry,
                        expiration: record.expiration,
                        ttl: record.ttl,
                        minimum: record.minimum
                    }
                    if (record.primary) {
                        soa.primary = record.primary
                    } else {
                        const [nameserver] = await this.getNameserver(name);
                        soa.primary = nameserver.ns
                    }
                    return soa
                default:

            }
        },
        async getNameserver(name) {
            const domain = tld.getDomain(name.replace('*', ''));
            let obj = this.maps.NS.get(domain)
            const answers = [];
            if (obj) {
                for (let index = 0; index < obj.records.length; index++) {
                    const record = obj.records[index];
                    answers.push(this.recordToAnswer(record, domain, Packet.TYPE['NS'], 1));
                }
            }
            return Promise.all(answers)
        },
        async isAuth(name) {
            const domain = tld.getDomain(name.replace('*', ''));
            const obj = this.maps.SOA.get(domain)
            return !!obj;
        },
        getNetwork(obj, address) {
            if (obj) {
                for (let [key, value] of obj.networks.entries()) {
                    if (this.inSubNet(address, key)) {
                        return value
                    }
                }
            }
            return []
        },
        getRecords(name, type, address) {
            const map = this.maps[type];
            let obj = map.get(name)

            let network = this.getNetwork(obj, address)

            if (network.length) {
                return network
            }

            if (type == 'A' || type == 'AAAA') {

                const cname = this.maps['CNAME'].get(name)

                const cnameNetwork = this.getNetwork(cname, address)
                let records = [];
                if (cnameNetwork.length) {
                    records.push(...cnameNetwork)
                } else if (cname && cname.records && cname.records.length) {

                    records.push(...cname.records)
                }

                if (records.length > 0) {
                    const aRecords = this.getRecords(records[0].data, type, address)
                    records.push(...aRecords)
                    return records
                }
            }

            if (obj && obj.records.length) {
                return obj.records
            }

            return []
        },
        async walkRecords(name, type, address) {

            if (type == 'NS' || type == 'SOA') {
                name = tld.getDomain(name.replace('*', '').replace('_', ''))
            }
            if (!name) {
                return null
            }

            let records = this.getRecords(name, type, address);

            if (records.length > 0) {
                return records
            }

            const parts = this.domainParts(name)
            for (let index = 0; index < parts.length; index++) {
                const part = parts[index];
                records = this.getRecords(part, type, address);
                if (records.length > 0)
                    return records
            }
            return [];
        },

        async onQuery(request, response, rinfo) {

            const [question] = request.questions;
            const name = question.name.toLowerCase().replace('*', '');
            let type = Packet.TYPEMAP[question.type];
            let typeID = question.type

            if (!type) {
                this.logger.error(`No record type found`, request.questions);
                return false;
            } else if (!["A", "AAAA", "CNAME", "SOA", "MX", "NS", "TXT", "CAA"].includes(type)) {
                this.logger.error(`Unsupported record type ${type} ${name} ${rinfo.address}:${rinfo.port} ${rinfo.family}`);
                return false;
            }

            const answers = [];

            const authoritative = await this.isAuth(name)

            let records = await this.walkRecords(name, type, rinfo.address)

            if (records == null) {
                return []
            }

            if (records.length > 0) {

                records = records.filter(record => record.priority !== -1);

                for (let index = 0; index < records.length; index++) {
                    const record = records[index];
                    answers.push(this.recordToAnswer(record, name, Packet.TYPE[record.type], question.class));
                }
                if (authoritative && type == 'SOA') {
                    const nameservers = await this.getNameserver(name);
                    response.authorities.push(...nameservers)
                }

            } else if (!authoritative && (rinfo.proxy || rinfo.address == '127.0.0.1')) {
                return this.broker.call('v1.dohs.query', { fqdn: name, type, cache: false })
                    .then(async (result) => {
                        // return result

                        if (result[0] && result[0].type == 5) {
                            //const record = result.shift()
                            //const answers = [await this.recordToAnswer(record, name, record.type, question.class)]

                            const answers = await Promise.all(result.map((record) => this.recordToAnswer(record, record.name, record.type, question.class)))

                            //response.additionals.push(...additionals);
                            return answers;
                        } else {
                            return Promise.all(result.map((record) => this.recordToAnswer(record, record.name, record.type, question.class)))
                        }
                    })
                    .catch((err) => {
                        this.logger.error(err)
                        return [];
                    });
            }

            if (false && authoritative) {
                const nameservers = await this.getNameserver(domain);
                response.authorities.push(...nameservers)
                if (type == 'NS') {
                    const nsA = []
                    for (let index = 0; index < nameservers.length; index++) {
                        const ns = nameservers[index];
                        let obj = await this.getObj(ns.ns, 'A')
                        nsA.push(...obj.records.map((record) => this.recordToAnswer(record, ns.ns, Packet.TYPE['A'], question.class)))
                    }
                    const aRecords = await Promise.all(nsA)
                    response.additionals.push(...aRecords)

                }
            }



            return Promise.all(answers).then((result) => result.filter((a) => a))
        },

        domainParts(domain) {

            var parts = domain.split('.');
            var result = [parts.join('.')];
            var n;
            // Prevent abusive lookups
            if (parts.length > 10)
                this.logger.warn(`Abusive lookup ${domain}`);
            while (parts.length > 10) {

                parts.shift();
            }
            while (parts.length > 1) {
                parts.shift();
                n = parts.join('.');
                result.push('*.' + n);
            }
            result.push('*');

            return result;
        },
        async createUDPServer(type, port, host, proxy = false) {

            this.logger.info(`Creating on ${type}:${host}:${port} proxy: ${proxy}`);

            const key = `${host}:${port}`;
            const found = this.udpServers.get(key);
            if (found) {
                return found;
            }
            const server = dns2.createServer({
                udp: {
                    reuseAddr: false,
                    type
                },
                handle: (request, send, rinfo) => {
                    const response = Packet.createResponseFromRequest(request);
                    const [question] = request.questions;

                    this.stats.querys++;

                    if (!question) {
                        this.stats.errors++;
                        return;
                    }
                    rinfo.proxy = proxy;
                    const { name } = question;
                    this.onQuery(request, response, rinfo).then((answers) => {
                        if (answers) {
                            response.answers.push(...answers)
                            send(response);
                        } else {
                            this.stats.misses++;
                            send(response);
                        }
                        if (this.settings.logging) {
                            this.logger.info(`${rinfo.address}:${rinfo.port}`, question.name, Packet.TYPEMAP[question.type], Packet.CLASSMAP[question.class], answers.length, response.authorities.length, response.additionals.length);
                        }
                    }).catch((err) => {
                        this.stats.errors++;
                        this.logger.error('onQuery', err)
                    })
                }
            });
            this.udpServers.set(key, server)

            server.on('request', (request, response, rinfo) => {
                //console.log(request.header.id, request.questions[0]);
            });
            server.on('error', (error) => {
                this.logger.error(error);
            });

            server.on('close', () => {
                this.logger.info('server closed');
            });

            return new Promise((resolve, reject) => {

                server.once('listening', () => {
                    this.logger.info(`Server listening on ${type}:${host}:${port} proxy: ${proxy}`);
                    resolve();
                });
                server.servers.udp.listen(port, host)
            })

        },
        ip2long(ip) {
            var components;

            if (components = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)) {
                var iplong = 0;
                var power = 1;
                for (var i = 4; i >= 1; i -= 1) {
                    iplong += power * parseInt(components[i]);
                    power *= 256;
                }
                return iplong;
            }
            else return -1;
        },
        inSubNet(ip, subnet) {
            var mask, base_ip, long_ip = this.ip2long(ip);
            if ((mask = subnet.match(/^(.*?)\/(\d{1,2})$/)) && ((base_ip = this.ip2long(mask[1])) >= 0)) {
                var freedom = Math.pow(2, 32 - parseInt(mask[2]));
                return (long_ip > base_ip) && (long_ip < base_ip + freedom - 1);
            }
            else return false;
        },

        expandIPv6Address(address) {
            var fullAddress = "";
            var expandedAddress = "";
            var validGroupCount = 8;
            var validGroupSize = 4;

            var ipv4 = "";
            var extractIpv4 = /([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})/;
            var validateIpv4 = /((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})/;

            // look for embedded ipv4
            if (validateIpv4.test(address)) {
                groups = address.match(extractIpv4);
                for (var i = 1; i < groups.length; i++) {
                    ipv4 += ("00" + (parseInt(groups[i], 10).toString(16))).slice(-2) + (i == 2 ? ":" : "");
                }
                address = address.replace(extractIpv4, ipv4);
            }

            if (address.indexOf("::") === -1) // All eight groups are present.
                fullAddress = address;
            else // Consecutive groups of zeroes have been collapsed with "::".
            {
                var sides = address.split("::");
                var groupsPresent = 0;
                for (var i = 0; i < sides.length; i++) {
                    groupsPresent += sides[i].split(":").length;
                }
                fullAddress += sides[0] + ":";
                for (var i = 0; i < validGroupCount - groupsPresent; i++) {
                    fullAddress += "0000:";
                }
                fullAddress += sides[1];
            }
            var groups = fullAddress.split(":");
            for (var i = 0; i < validGroupCount; i++) {
                while (groups[i].length < validGroupSize) {
                    groups[i] = "0" + groups[i];
                }
                expandedAddress += (i !== validGroupCount - 1) ? groups[i] + ":" : groups[i];
            }
            return expandedAddress;
        }
    },

    events: {
        "domains.records.created": {
            async handler(ctx) {
                const record = Object.assign({}, ctx.params.data);
                await this.actions.createRecord(record, { parentCtx: ctx }).catch(console.log)
            }
        },
        "domains.records.removed": {
            async handler(ctx) {
                const record = Object.assign({}, ctx.params.data);
                await this.actions.removeRecord({
                    id: record.id,
                    fqdn: record.fqdn,
                    type: record.type,
                    network: record.network
                }, { parentCtx: ctx }).then(console.log).catch(console.log)
            }
        },
    },

    async stopped() {

        this.broker.emit('ddns.agent.offline')

        for (const [key, value] of this.udpServers.entries()) {
            value.close()
        }

        clearInterval(this.timer)
        clearInterval(this.timerStats)
        clearTimeout(this.timeout)
    },

    async started() {

        this.maps = {};
        Packet.TYPEMAP = {}
        Object.keys(Packet.TYPE).forEach((key) => {
            Packet.TYPEMAP[Packet.TYPE[key]] = key
            this.maps[key] = new Map();
        })

        this.udpServers = new Map();
        this.fqdns = new Map();
        this.logs = new Map();

        this.proxyLock = new Lock();
        let parentCtx = new Context(this.broker);

        await this.actions.createRecord({ fqdn: 'dns.google', type: 'A', data: '8.8.8.8' }, { parentCtx })
        await this.actions.createRecord({ fqdn: 'cloudflare-dns.com', type: 'A', data: '104.16.249.249' }, { parentCtx })
        await this.actions.createRecord({ fqdn: 'cloudflare-dns.com', type: 'A', data: '104.16.248.249' }, { parentCtx })

        this.stats = {
            start: Date.now(),

            querys: 0,
            querysTotal: 0,

            errors: 0,
            errorsTotal: 0,

            misses: 0,
            missesTotal: 0,

            proxys: 0,
            proxysTotal: 0,
        }
        
        const interval = 10 * 1000
        
        this.timerStats = setInterval(() => {

            let hits = 0
            let records = 0;
            const types = {};

            for (let [type, map] of Object.entries(this.maps)) {
                if (!types[type]) {
                    types[type] = 0;
                }
                for (var [key, value] of map.entries()) {
                    value.totalHits += value.hits;
                    hits += value.hits;
                    types[type] += value.hits
                    value.hits = 0;
                    records++;
                }
            }


            this.stats.querysTotal += this.stats.querys
            this.stats.errorsTotal += this.stats.errors
            this.stats.missesTotal += this.stats.misses


            this.broker.broadcast('ddns.agent.stats', {
                ...this.stats,
                ...types,
                hits,
                records
            })


            if (this.stats.querys > 0)
                this.logger.info(`Stats: querys: ${this.stats.querys}/10s ${this.stats.querys / 10}/ps Total: ${this.stats.querysTotal}`);
            if (this.stats.errors > 0)
                this.logger.info(`Stats: errors: ${this.stats.errors}/10s ${this.stats.errors / 10}/ps Total: ${this.stats.errorsTotal}`);
            if (this.stats.misses > 0)
                this.logger.info(`Stats: misses: ${this.stats.misses}/10s ${this.stats.misses / 10}/ps Total: ${this.stats.missesTotal}`);

            this.stats.querys = 0;
            this.stats.errors = 0;
            this.stats.misses = 0;
        }, interval);

        this.timeout = setTimeout(async () => {
            const list = await this.findEntities(parentCtx, {});
            console.log(list)
            if (list) {

                for (let index = 0; index < list.length; index++) {
                    const element = list[index];

                    await this.createUDPServer(element.address.split('.').length == 4 ? 'udp4' : 'udp6', 53, element.address, element.proxy);
                }
                await this.createUDPServer('udp4', 53, '127.0.0.1', true);
                await this.createUDPServer('udp6', 53, '::1', true);
            }

            await this.actions.sync({}, { parentCtx });
            parentCtx.emit('ddns.agent.online');
        }, 10);
    }
};

