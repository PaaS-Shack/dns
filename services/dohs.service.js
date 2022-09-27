"use strict";

const C = require("../constants");
const Lock = require('../lib/lock')


const DbService = require("db-mixin");
const Cron = require("cron-mixin");

const { MoleculerClientError } = require("moleculer").Errors;

const https = require('https');

const Packet = require('native-dns-packet');
/**
 * attachments of addons service
 */
module.exports = {
	name: "dohs",
	version: 1,

	mixins: [
		DbService({ collection: 'dohs' }),
		Cron
	],

	/**
	 * Service dependencies
	 */
	dependencies: [

	],

	/**
	 * Service settings
	 */
	settings: {

		fields: {
			id: {
				type: "string",
				primaryKey: true,
				secure: true,
				columnName: "_id"
			},

			key: {
				type: "string",
				required: true,
				immutable: true,
				lowercase: true,
				trim: true,
				empty: false,
			},
			fqdn: {
				type: "string",
				required: true,
				immutable: true,
				lowercase: true,
				trim: true,
				empty: false,
			},
			name: {
				type: "string",
				required: true,
				immutable: true,
				lowercase: true,
				trim: true,
				empty: false,
			},

			typeStr: {
				type: "enum",
				values: ["A", "AAAA", "CNAME", "SOA", "MX", "NS", "TXT", "CAA", "SRV"],
				immutable: true,
				required: true,
			},
			type: {
				type: "number",
				required: true,
			},
			class: {
				type: "number",
				required: true,
			},
			provider: {
				type: "string",
				required: true,
			},
			data: {
				type: "string",
				required: true,
			},

			replace: {
				type: "string",
				required: false,
			},

			ttl: {
				type: "number",
				default: 99,
				set: ({ params }) => {
					return params.ttl > 2500 ? 2500 : params.ttl
				},
				required: false,
			},
			expires: {
				type: "number",
				set: ({ params }) => {
					return Date.now() + (params.ttl * 1000)
				},
				required: false,
			},
			priority: {
				type: "number",
				default: 5,
				required: false,
			},

			weight: {
				type: "number",
				required: false,
			},
			port: {
				type: "number",
				required: false,
			},
			target: {
				type: "string",
				required: false,
			},

			flag: {
				type: "number",
				default: 0,
				required: false,
			},
			tag: {
				type: "string",
				required: false,
			},

			admin: {
				type: "string",
				required: false,
			},
			serial: {
				type: "number",
				required: false,
			},
			refresh: {
				type: "number",
				required: false,
			},
			retry: {
				type: "number",
				required: false,
			},
			expiration: {
				type: "number",
				required: false,
			},
			minimum: {
				type: "number",
				required: false,
			},

			...C.TIMESTAMP_FIELDS
		},

		scopes: {

		},

		defaultScopes: [],


		providers: {
			'google': {
				ip: '8.8.8.8',
				path: '/dns-query',
				domain: 'dns.google'
			},
			'cloudflare': {
				ip: '104.16.249.249',
				path: '/dns-query',
				domain: 'cloudflare-dns.com'
			},
			'cleanbrowsing': {
				ip: '185.228.168.10',
				path: '/doh/family-filter',
				domain: 'doh.cleanbrowsing.org'
			}
		}
	},


	crons: [
		{
			name: "ClearExpiredRecords",
			cronTime: "* * * * *",
			onTick: {
				action: "v1.dohs.clearExpired"
			}
		}
	],
	/**
	 * Actions
	 */

	actions: {
		create: {
			rest: false,
		},
		list: {
			permissions: [C.ROLE_USER],
			params: {
				//domain: { type: "string" }
			}
		},

		find: {
			rest: "GET /find",
			permissions: [C.ROLE_USER],
			params: {
				//domain: { type: "string" }
			}
		},

		count: {
			rest: "GET /count",
			permissions: [C.ROLE_USER],
			params: {
				//domain: { type: "string" }
			}
		},

		get: {
			needEntity: true,
			permissions: []
		},

		update: {
			needEntity: true,
		},

		replace: false,

		remove: {
			needEntity: true,

		},
		clearExpired: {
			params: {

			},
			async handler(ctx) {
				return this.clearExpired(ctx)
			}
		},
		resolveProvider: {
			params: {
				fqdn: { type: "string", optional: false },
				type: { type: "enum", values: ["A", "AAAA", "CNAME", "SOA", "MX", "NS", "TXT", "SRV"], default: 'A', optional: true },
				provider: { type: "enum", values: ["google", "cloudflare"], default: 'cloudflare', optional: true },
				cache: { type: "boolean", default: true, optional: true },
			},
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);
				return this.resolve(params.fqdn, params.type, params.provider).then((res) => res.map((r) => ({ ...r, data: r.data || r.address })));
			}
		},
		findQuery: {
			params: {

			},
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);
				return this.findEntities(null, {
					query: {
						queryStr: params.queryStr
					}
				});
			}
		},
		query: {
			params: {
				fqdn: { type: "string", optional: false },
				type: { type: "enum", values: ["A", "AAAA", "CNAME", "SOA", "MX", "NS", "TXT", "SRV"], default: 'A', optional: true },
				provider: { type: "enum", values: ["google", "cloudflare"], default: 'cloudflare', optional: true },
				cache: { type: "boolean", default: true, optional: true },
			},
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);

				const nodeID = ctx.nodeID.split('-').shift()

				const start = Date.now();
				const key = `${params.fqdn}.${params.type}`

				if (!params.cache) {
					const results = await this.actions.resolveProvider({ ...params }, { parentCtx: ctx });
					//console.log(results)
					return results
				}

				await this.lock.acquire(key);

				const results = await this.findEntities(ctx, {
					query: {
						fqdn: params.fqdn,
						typeStr: params.type,
						provider: params.provider,
					}
				});
				if (results.length > 0) {

					this.lock.release(key)
					this.log(nodeID, key, start, true, results);

					return this.mapRecords(results);
				}


				const query = await this.actions.resolveProvider({ ...params }, { parentCtx: ctx });

				for (let index = 0; index < query.length; index++) {
					const element = query[index];
					results.push(await this.actions.create({
						...element,
						fqdn: params.fqdn,
						typeStr: params.type,
						provider: params.provider,
						key: key
					}, { parentCtx: ctx }));
				}

				this.lock.release(key);

				this.log(nodeID, key, start, false, results)


				return this.mapRecords(results);
			}
		}
	},

	/**
	 * Events
	 */
	events: {

	},

	/**
	 * Methods
	 */
	methods: {

		log(nodeID, key, start, hitOrMiss, results) {
			this.logger.info(`${nodeID} ${key} ${(Date.now() - start)}ms ${hitOrMiss ? 'HIT' : 'MISS'}`, results.map((a) => a.address || a.data));
		},

		mapRecords(records) {
			return records.map((record) => {
				record.ttl = Math.ceil((record.expires - Date.now()) / 1000)
				if (record.ttl < 0) record.ttl = 0
				return record;
			})
		},
		getDomainType(domainType) {
			let type = 0
			switch (domainType.toUpperCase()) {
				case 'A':
					type = 1
					break
				case 'AAAA':
					type = 28
					break
				case 'CAA':
					type = 257
					break
				case 'CNAME':
					type = 5
					break
				case 'DS':
					type = 43
					break
				case 'DNSKEY':
					type = 48
					break
				case 'MX':
					type = 15
					break
				case 'NS':
					type = 2
					break
				case 'NSEC':
					type = 47
					break
				case 'NSEC3':
					type = 50
					break
				case 'RRSIG':
					type = 46
					break
				case 'SOA':
					type = 6
					break
				case 'TXT':
					type = 16
					break
				case 'SRV':
					type = 0x21
					break
				default:
					// A
					type = 1
					break
			}
			return type
		},
		newBuffer(length) {
			let buf
			if (Buffer.alloc) {
				buf = Buffer.alloc(length)
			} else {
				buf = new Buffer(length)
			}
			return buf
		},
		resolve(name, domainType, provider) {

			let type = this.getDomainType(domainType);
			let dnsPacket = new Packet();
			let dnsBuf = this.newBuffer(128);

			dnsPacket.question.push({
				name, type,
				class: 1
			})
			Packet.write(dnsBuf, dnsPacket)

			const providerPath = this.settings.providers[provider].path;
			const providerIP = this.settings.providers[provider].ip;
			const providerDomain = this.settings.providers[provider].domain;

			const path = `${providerPath}?dns=${dnsBuf.toString('base64').replace(/=+/, '')}`

			const options = {
				hostname: providerIP,
				port: 443,
				path,
				method: 'GET',
				headers: {
					'Accept': 'application/dns-message',
					'Content-type': 'application/dns-message',
					'Host': providerDomain
				}
			};

			return new Promise(function (resolve, reject) {
				const req = https.request(options, (res) => {

					const chunks = []

					res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));

					res.on('error', (err) => reject(err));

					res.on('end', () => {
						const response = Buffer.concat(chunks)
						if (res.statusCode === 200) {
							try {
								let dnsResult = Buffer.from(response)
								let result = Packet.parse(dnsResult)
								return resolve(result.answer)
							} catch (err) {
								this.logger.error(`Failed to parse dns packet, provider: ${provider}, xhr status: ${res.statusCode}.`, err);
							}
						} else {
							this.logger.error(`Cannot find the domain, provider: ${provider}, status: ${res.statusCode}.`);
						}
						resolve([])
					});
				});

				req.on('error', (err) => resolve([]));
				req.end();
			})
		},
		async clearExpired(ctx) {
			const adapter = await this.getAdapter(ctx);
			const removed = await adapter.removeMany({
				expires: { $lte: Date.now() }
			});
			if (removed > 0) {
				const count = await this.countEntities(ctx);
				this.logger.info(`Expired records. Removed ${removed} of ${count + removed}`);
			}
		}
	},

	/**
	 * Service created lifecycle event handler
	 */
	created() {

		this.lock = new Lock();
	},

	/**
	 * Service started lifecycle event handler
	 */
	started() { },

	/**
	 * Service stopped lifecycle event handler
	 */
	stopped() { }
};
