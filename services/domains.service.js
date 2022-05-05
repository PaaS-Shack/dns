"use strict";



const C = require("../constants");

const DbService = require("db-mixin");
const Cron = require("cron-mixin");
const CacheCleaner = require("cache-cleaner-mixin");
const ConfigLoader = require("config-mixin");

const Membership = require("membership-mixin");

const { MoleculerClientError } = require("moleculer").Errors;

const psl = require('../lib/psl.min.js')

/**
 * Addons service
 */
module.exports = {
	name: "domains",
	version: 1,

	mixins: [
		DbService({
			entityChangedEventMode:'emit',
			cache: {
				additionalKeys: ["#userID"]
			}, collection: 'domains'
		}),
		CacheCleaner([]),
		ConfigLoader(['ddns.domains.**']),

		Membership({
			permissions: 'domains'
		})
	],

	/**
	 * Service dependencies
	 */
	dependencies: [],

	/**
	 * Service settings
	 */
	settings: {
		rest: true,

		fields: {
			id: {
				type: "string",
				primaryKey: true,
				secure: true,
				columnName: "_id"
			},
			default: {
				type: "boolean",
				default: false
			},
			domain: {
				type: "string",
				required: true,
				trim: true,
				empty: false,
				onCreate: ({ ctx, value }) => psl.parse(value.replace('*.', '').replace('_', '')).domain,
				validate: "validateDomain",
			},

			name: {
				type: "string"
			},

			tld: {
				type: "string",
				readonly: true,
				onCreate: ({ ctx, params, value }) => psl.parse(params.domain.replace('*.', '').replace('_', '')).tld
			},
			sld: {
				type: "string",
				readonly: true,
				onCreate: ({ ctx, params, value }) => psl.parse(params.domain.replace('*.', '').replace('_', '')).sld
			},

			description: {
				type: "string",
				required: false,
				trim: true,
			},

			records: {
				type: "array",
				items: { type: "string", empty: false },
				readonly: true,
				populate: {
					action: "v1.domains.records.list",
					params: {
						fields: ["id", "name"]
					}
				}
			},


			...Membership.FIELDS,


			options: { type: "object" },
			...C.ARCHIVED_FIELDS,
			...C.TIMESTAMP_FIELDS
		},
		defaultPopulates: ["records"],

		scopes: {

			// List the non-archived addons
			notArchived: { archived: false },

			// List the not deleted addons
			notDeleted: { deletedAt: null },

			...Membership.SCOPE,

		},

		defaultScopes: ["notArchived", "notDeleted", ...Membership.DSCOPE]
	},

	/**
	 * Actions
	 */
	actions: {
		create: {
			permissions: ['domains.create']
		},
		list: {
			permissions: ['domains.list']
		},
		find: {
			rest: "GET /find",
			permissions: ['domains.find']
		},
		count: {
			rest: "GET /count",
			permissions: ['domains.count']
		},
		get: {
			needEntity: true,
			permissions: ['domains.get']
		},
		update: {
			needEntity: true,
			permissions: ['domains.update']
		},
		replace: false,
		remove: {
			needEntity: true,
			permissions: ['domains.remove']
		},

		domainExists: {
			params: {
				fqdn: "string"
			},
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);

				const parsed = psl.parse(params.fqdn.replace('*.', '').replace('_', ''));

				const domain = await this.findEntity(ctx, {
					query: {
						domain: parsed.domain
					}
				});
				return !!domain
			}
		},
		getDomain: {
			params: {
				owner: { type: "string", optional: true },
				member: { type: "string", optional: true },
				fqdn: { type: "string", optional: true },
				id: { type: "string", optional: true }
			},
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);

				const query = { deletedAt: null }

				if (params.fqdn) {
					const parsed = psl.parse(params.fqdn.replace('*.', '').replace('_', ''));
					query.domain = parsed.domain;
				}

				if (params.id) {
					query.id = this.decodeID(params.id)
				}

				if (params.member) {
					query.members = params.member
				} else if (params.owner) {
					query.owner = params.owner
				}
				console.log(query)
				return this.findEntity(ctx, {
					query: query,
					scope: false
				});
			}
		},
		resolveDomain: {
			params: {
				domain: { type: "string", optional: false },
			},
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);

				const parsed = psl.parse(params.domain.replace('*.', '').replace('_', ''));


				const query = { domain: parsed.domain }

				return this.findEntity(ctx, {
					query,
					scope: false
				});
			}
		},

		records: {
			rest: "GET /records",
			params: {

			},
			permissions: ['domains.records.get'],
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);
				const domainName = this.config["ddns.domains.domain"];

				const domain = await ctx.call('v1.domains.resolveDomain', {
					domain: domainName
				})

				return ctx.call('v1.domains.records.list', { pageSize: 100, domain: domain.id })
			}
		},
		resolveRecord: {
			description: "Archive the addon",
			rest: "GET /records/:record",
			params: {
				record: { type: "string", optional: false },
			},
			permissions: ['domains.records.get'],
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);
				const domainName = this.config["ddns.domains.domain"];

				const domain = await ctx.call('v1.domains.resolveDomain', {
					domain: domainName
				})

				return ctx.call('v1.domains.records.resolve', { id: params.record, domain: domain.id })
			}
		},


		sync: {
			rest: "GET /sync/:record",
			params: {
				target: { type: "string", min: 3, optional: true },
			},
			permissions: ['domains.sync'],
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);
				const list = await ctx.call("$node.list");

				const result = [];
				const promises = [];
				for (let index = 0; index < list.length; index++) {
					const node = list[index];
					promises.push(ctx.call('v1.ddns.agent.sync', {}, { nodeID: node.id }));
				}

				const settled = await Promise.allSettled(promises);
				for (let index = 0; index < list.length; index++) {
					const node = list[index];
					result.push({
						nodeID: node.id,
						status: settled[index].status,
						info: settled[index].value,
						reason: settled[index].reason,
					});
				}


				console.log(result)
				return result
			}
		},
	},

	/**
	 * Events
	 */
	events: {},

	/**
	 * Methods
	 */
	methods: {
		validateDomain({ ctx, params, value }) {
			return this.countEntities(ctx, {
				query: {
					domain: value
				},
			}, { transform: false })
				.then(res =>
					res == 0
						? true
						: `Domain '${value}' already managed.`
				)
		},
		/**
		 * Validate the `owner` property of addon.
		 */
		validateOwner({ ctx, value }) {
			return ctx
				.call("v1.accounts.resolve", {
					id: value,
					throwIfNotExist: true,
					fields: ["status"]
				})
				.then(res =>
					res && res.status == C.STATUS_ACTIVE
						? true
						: `The owner '${value}' is not an active user.`
				)
			//.catch(err => err.message);
		}


	},

	/**
	 * Service created lifecycle event handler
	 */
	created() { },

	/**
	 * Service started lifecycle event handler
	 */
	started() { },

	/**
	 * Service stopped lifecycle event handler
	 */
	stopped() { }
};
