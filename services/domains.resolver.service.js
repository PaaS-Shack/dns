"use strict";

const { Resolver } = require('dns').promises;

const providers = [
    { "name": "google", "ip": "8.8.8.8" },
    { "name": "quad", "ip": "9.9.9.9" },
    { "name": "opendns", "ip": "208.67.222.220" },
    { "name": "verizon_fios_business", "ip": "98.113.146.9" },
    { "name": "att_services", "ip": "12.121.117.201" },
    { "name": "corporate_west_computer_systems", "ip": "66.206.166.2" },
    { "name": "quad", "ip": "149.112.112.112" },
    { "name": "cogecodata", "ip": "66.199.45.225" },
    { "name": "ionica_llc", "ip": "176.103.130.130" },
    { "name": "liquid_telecommunications_ltd", "ip": "5.11.11.5" },
    { "name": "nforce_entertainment_bv", "ip": "185.107.80.84" },
    { "name": "association_gitoyen", "ip": "80.67.169.12" },
    { "name": "prioritytelecom_spain_sa", "ip": "212.230.255.1" },
    { "name": "oskar_emmenegger", "ip": "194.209.157.109" },
    { "name": "nemoxnet", "ip": "83.137.41.9" },
    { "name": "docklands_data_centre_ltd", "ip": "81.24.196.76" },
    { "name": "mentor_it_as", "ip": "176.62.205.201" },
    { "name": "deutsche_telekom_ag", "ip": "195.243.214.4" },
    { "name": "gestion_de_direccionamiento_uninet", "ip": "201.144.135.211" },
    { "name": "claro_sa", "ip": "200.248.178.54" },
    { "name": "ohana_communications_sdn_bhd", "ip": "103.26.250.4" },
    { "name": "cloudflare_inc", "ip": "1.1.1.1" },
    { "name": "pacific_internet", "ip": "61.8.0.113" },
    { "name": "iconz_ltd", "ip": "210.48.77.68" },
    { "name": "tefincom_sa", "ip": "103.86.99.100" },
    { "name": "lg_dacom_corporation", "ip": "164.124.101.2" },
    { "name": "shenzhen_sunrise_technology_co", "ip": "202.46.32.187" },
    { "name": "teknet_yazlim", "ip": "31.7.37.37" },
    { "name": "mahanagar_telephone_nigam_limited", "ip": "203.94.227.70" },
    { "name": "multinet_pakistan_pvt_ltd", "ip": "125.209.116.22" },
    { "name": "cloudity_network", "ip": "185.83.212.30" },
    { "name": "daniel_cid", "ip": "185.228.168.9" },
    { "name": "pabna_cable_vision", "ip": "103.153.154.2" }
]
module.exports = {
    name: "domains.resolver",
    version: 1,

    /**
     * Default settings
     */
    settings: {
        
    },

    /**
     * Actions
     */
    actions: {
        resolve: {
            params: {
                fqdn: { type: "string", optional: false },
                type: { type: "enum", values: ["A", "AAAA", "CNAME", "SOA", "MX", "NS", "TXT"], default: 'A', optional: true },
                provider: { type: "enum", values: providers.map((provider) => provider.name), default: 'google', optional: true },
                cache: { type: "boolean", default: true, optional: true },
            },
            async handler(ctx) {
                const params = Object.assign({}, ctx.params);

                const nodeID = ctx.nodeID.split('-').shift()

                const start = Date.now();

                const provider = this.providers[params.provider];

                return provider.resolve(params.fqdn, params.type);
            }
        },
        reverse: {
            params: {
                ip: { type: "string", optional: false },
                provider: { type: "enum", values: providers.map((provider) => provider.name), default: 'google', optional: true },
            },
            async handler(ctx) {
                const params = Object.assign({}, ctx.params);

                const provider = this.providers[params.provider];

                return provider.reverse(params.ip);
            }
        },
        propagation: {
            params: {
                fqdn: { type: "string", optional: false },
                type: { type: "enum", values: ["A", "AAAA", "CNAME", "SOA", "MX", "NS", "TXT"], default: 'A', optional: true },
            },
            async handler(ctx) {
                const params = Object.assign({}, ctx.params);

                const promises = []


                for (const [key, provider] of Object.entries(this.providers)) {
                    promises.push(this.actions.resolve({
                        fqdn: params.fqdn,
                        type: params.type,
                        provider: key,
                        cache: false,
                    }, { parentCtx: ctx }))
                }


                return Promise.allSettled(promises)
                    .then((res) => res.map((result, i) => {
                        return {
                            ...providers[i],
                            ...result
                        }
                    }))
            }
        },
    },

    /**
     * Methods
     */
    methods: {

    },

    events: {

    },
    async stopped() {

        clearInterval(this.interval)
    },
    async started() {
        this.providers = {}
        for (let index = 0; index < providers.length; index++) {
            const provider = providers[index];
            const resolver = new Resolver({
                timeout: 500,
                tries: 1
            });
            resolver.setServers([provider.ip]);
            this.providers[provider.name] = resolver;
        }


        this.interval = setInterval(() => {

        }, 5000);
    }
};